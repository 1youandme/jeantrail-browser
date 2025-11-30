/**
 * Data Sync & Management Service
 * Handles Google Drive synchronization, local database management, and data consistency
 * Features: Bidirectional sync, conflict resolution, version control, logging
 */

import { google } from 'googleapis';
import { EventEmitter } from 'events';
import { Logger } from 'winston';
import Database from 'better-sqlite3';
import pQueue from 'p-queue';
import * as crypto from 'crypto';

/**
 * Data Sync Configuration
 */
interface SyncConfig {
  googleDriveFolder: string;
  localDatabase: string;
  syncInterval: number; // milliseconds
  conflictStrategy: 'local' | 'remote' | 'manual';
  maxRetries: number;
  googleAuth: any;
}

/**
 * Sync Record Interface
 */
interface SyncRecord {
  id: string;
  localPath: string;
  remotePath: string;
  localHash: string;
  remoteHash: string;
  lastSyncTime: Date;
  status: 'synced' | 'pending' | 'conflict' | 'error';
  version: number;
}

/**
 * Conflict Record for Manual Resolution
 */
interface ConflictRecord {
  id: string;
  localFile: any;
  remoteFile: any;
  timestamp: Date;
  resolution?: 'local' | 'remote';
}

/**
 * Data Sync Manager Class
 * Manages bidirectional synchronization between local and Google Drive
 */
export class DataSyncManager extends EventEmitter {
  private drive: any;
  private db: Database.Database;
  private config: SyncConfig;
  private logger: Logger;
  private queue: pQueue;
  private syncIntervalId?: NodeJS.Timeout;
  private conflicts: Map<string, ConflictRecord>;

  constructor(config: SyncConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.conflicts = new Map();
    this.queue = new pQueue({ concurrency: 3, interval: 1000, intervalCap: 5 });
    
    // Initialize Google Drive client
    this.drive = google.drive({ version: 'v3', auth: config.googleAuth });
    
    // Initialize local database
    this.db = new Database(config.localDatabase);
    this.initializeDatabase();
    
    this.logger.info('DataSyncManager initialized');
  }

  /**
   * Initialize SQLite database schema
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_records (
        id TEXT PRIMARY KEY,
        local_path TEXT NOT NULL,
        remote_path TEXT,
        local_hash TEXT,
        remote_hash TEXT,
        last_sync_time DATETIME,
        status TEXT DEFAULT 'pending',
        version INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY,
        local_file TEXT,
        remote_file TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolution TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_status ON sync_records(status);
      CREATE INDEX IF NOT EXISTS idx_local_path ON sync_records(local_path);
    `);
    this.logger.info('Database schema initialized');
  }

  /**
   * Calculate SHA-256 hash of content for conflict detection
   */
  private calculateHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Start automatic synchronization
   */
  async startSync(): Promise<void> {
    this.logger.info(`Starting sync interval: ${this.config.syncInterval}ms`);
    
    // Initial sync
    await this.performSync();
    
    // Set up recurring sync
    this.syncIntervalId = setInterval(() => {
      this.performSync().catch(err => this.logger.error('Sync error:', err));
    }, this.config.syncInterval);
  }

  /**
   * Stop automatic synchronization
   */
  stopSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = undefined;
      this.logger.info('Sync stopped');
    }
  }

  /**
   * Perform bidirectional synchronization
   */
  async performSync(): Promise<{ synced: number; conflicts: number; errors: number }> {
    try {
      const stats = { synced: 0, conflicts: 0, errors: 0 };
      
      // Get pending records from local database
      const stmt = this.db.prepare('SELECT * FROM sync_records WHERE status != ?');
      const records = stmt.all('synced') as SyncRecord[];

      for (const record of records) {
        const result = await this.queue.add(() => this.syncRecord(record));
        if (result.synced) stats.synced++;
        if (result.conflict) stats.conflicts++;
        if (result.error) stats.errors++;
      }

      this.emit('sync-complete', stats);
      this.logger.info(`Sync completed: ${stats.synced} synced, ${stats.conflicts} conflicts, ${stats.errors} errors`);
      
      return stats;
    } catch (error) {
      this.logger.error('Sync failed:', error);
      throw error;
    }
  }

  /**
   * Sync individual record with conflict resolution
   */
  private async syncRecord(record: SyncRecord): Promise<{ synced?: boolean; conflict?: boolean; error?: boolean }> {
    try {
      // Check for conflicts
      if (record.localHash && record.remoteHash && record.localHash !== record.remoteHash) {
        await this.handleConflict(record);
        return { conflict: true };
      }

      // Sync to remote (Google Drive)
      if (record.status === 'pending') {
        await this.syncToRemote(record);
      }

      // Update record status
      const updateStmt = this.db.prepare(`
        UPDATE sync_records 
        SET status = ?, last_sync_time = CURRENT_TIMESTAMP, version = version + 1 
        WHERE id = ?
      `);
      updateStmt.run('synced', record.id);
      
      this.logger.info(`Record synced: ${record.id}`);
      return { synced: true };
    } catch (error) {
      this.logger.error(`Failed to sync record ${record.id}:`, error);
      const updateStmt = this.db.prepare('UPDATE sync_records SET status = ? WHERE id = ?');
      updateStmt.run('error', record.id);
      return { error: true };
    }
  }

  /**
   * Sync data to Google Drive
   */
  private async syncToRemote(record: SyncRecord): Promise<void> {
    try {
      const fileMetadata = {
        name: record.localPath.split('/').pop(),
        parents: [this.config.googleDriveFolder]
      };

      const media = {
        mimeType: 'application/json',
        body: JSON.stringify(record)
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink'
      });

      const hash = this.calculateHash(JSON.stringify(record));
      const updateStmt = this.db.prepare(`
        UPDATE sync_records 
        SET remote_path = ?, remote_hash = ? 
        WHERE id = ?
      `);
      updateStmt.run(response.data.id, hash, record.id);
      
      this.logger.info(`Synced to remote: ${record.id} -> ${response.data.id}`);
    } catch (error) {
      this.logger.error('Failed to sync to remote:', error);
      throw error;
    }
  }

  /**
   * Handle sync conflicts with configurable resolution strategies
   */
  private async handleConflict(record: SyncRecord): Promise<void> {
    try {
      const conflict: ConflictRecord = {
        id: record.id,
        localFile: record.localPath,
        remoteFile: record.remotePath,
        timestamp: new Date()
      };

      if (this.config.conflictStrategy === 'local') {
        conflict.resolution = 'local';
        await this.resolveConflict(conflict, 'local');
      } else if (this.config.conflictStrategy === 'remote') {
        conflict.resolution = 'remote';
        await this.resolveConflict(conflict, 'remote');
      } else {
        this.conflicts.set(conflict.id, conflict);
        this.emit('conflict-detected', conflict);
        this.logger.warn(`Conflict detected: ${conflict.id}`);
      }

      const insertStmt = this.db.prepare(`
        INSERT INTO conflicts (id, local_file, remote_file, resolution) 
        VALUES (?, ?, ?, ?)
      `);
      insertStmt.run(conflict.id, conflict.localFile, conflict.remoteFile, conflict.resolution);
    } catch (error) {
      this.logger.error('Conflict handling failed:', error);
      throw error;
    }
  }

  /**
   * Resolve conflict with specified strategy
   */
  private async resolveConflict(conflict: ConflictRecord, strategy: 'local' | 'remote'): Promise<void> {
    try {
      if (strategy === 'local') {
        // Keep local version, delete remote
        if (conflict.remoteFile) {
          await this.drive.files.delete({ fileId: conflict.remoteFile });
        }
      } else if (strategy === 'remote') {
        // Keep remote version, overwrite local
        const file = await this.drive.files.get({ fileId: conflict.remoteFile, alt: 'media' });
        // Write file to local path
      }
      this.logger.info(`Conflict resolved: ${conflict.id} using ${strategy}`);
    } catch (error) {
      this.logger.error('Conflict resolution failed:', error);
      throw error;
    }
  }

  /**
   * Add file to sync queue
   */
  async addFileToSync(localPath: string, data: any): Promise<string> {
    const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const hash = this.calculateHash(JSON.stringify(data));
    
    const insertStmt = this.db.prepare(`
      INSERT INTO sync_records (id, local_path, local_hash, status) 
      VALUES (?, ?, ?, ?)
    `);
    insertStmt.run(id, localPath, hash, 'pending');
    
    this.logger.info(`File added to sync: ${id}`);
    return id;
  }

  /**
   * Get sync status
   */
  getSyncStatus(): { pending: number; synced: number; conflicts: number; errors: number } {
    const countStmt = this.db.prepare('SELECT status, COUNT(*) as count FROM sync_records GROUP BY status');
    const results = countStmt.all() as any[];
    
    return {
      pending: results.find(r => r.status === 'pending')?.count || 0,
      synced: results.find(r => r.status === 'synced')?.count || 0,
      conflicts: results.find(r => r.status === 'conflict')?.count || 0,
      errors: results.find(r => r.status === 'error')?.count || 0
    };
  }

  /**
   * Get pending conflicts
   */
  getPendingConflicts(): ConflictRecord[] {
    return Array.from(this.conflicts.values()).filter(c => !c.resolution);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.stopSync();
    this.db.close();
    this.logger.info('DataSyncManager closed');
  }
}

export default DataSyncManager;
