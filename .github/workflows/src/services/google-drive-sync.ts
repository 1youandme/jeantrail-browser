import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

interface GoogleDriveSyncConfig {
  credentialsPath: string;
  tokenPath: string;
  folderId: string;
  localPath: string;
  syncInterval: number; // milliseconds
}

class GoogleDriveSync {
  private auth: any;
  private drive: any;
  private config: GoogleDriveSyncConfig;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(config: GoogleDriveSyncConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const credentials = JSON.parse(
      fs.readFileSync(this.config.credentialsPath, 'utf8')
    );

    this.auth = new google.auth.OAuth2(
      credentials.installed.client_id,
      credentials.installed.client_secret,
      credentials.installed.redirect_uris[0]
    );

    // Load or create token
    if (fs.existsSync(this.config.tokenPath)) {
      const token = JSON.parse(
        fs.readFileSync(this.config.tokenPath, 'utf8')
      );
      this.auth.setCredentials(token);
    } else {
      throw new Error('No token found. Please run getAuthUrl() first.');
    }

    this.drive = google.drive({ version: 'v3', auth: this.auth });
    console.log('✅ Google Drive initialized');
  }

  async uploadFile(localFilePath: string): Promise<string> {
    const fileName = path.basename(localFilePath);
    const fileMetadata = {
      name: fileName,
      parents: [this.config.folderId],
    };

    const media = {
      mimeType: 'application/json',
      body: fs.createReadStream(localFilePath),
    };

    try {
      const res = await this.drive.files.create({
        resource: fileMetadata,
        media,
        fields: 'id, webViewLink',
      });

      console.log(`✅ Uploaded: ${fileName} (${res.data.id})`);
      return res.data.id;
    } catch (error) {
      console.error(`❌ Upload failed: ${error}`);
      throw error;
    }
  }

  async downloadFile(fileId: string, localPath: string): Promise<void> {
    try {
      const res = await this.drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      return new Promise((resolve, reject) => {
        const dest = fs.createWriteStream(localPath);
        res.data
          .on('end', () => {
            console.log(`✅ Downloaded to: ${localPath}`);
            resolve();
          })
          .on('error', reject)
          .pipe(dest);
      });
    } catch (error) {
      console.error(`❌ Download failed: ${error}`);
      throw error;
    }
  }

  startAutoSync(): void {
    if (this.syncInterval) {
      console.warn('Sync already running');
      return;
    }

    this.syncInterval = setInterval(async () => {
      try {
        const files = fs.readdirSync(this.config.localPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            await this.uploadFile(path.join(this.config.localPath, file));
          }
        }
        console.log('✅ Sync completed');
      } catch (error) {
        console.error('❌ Sync error:', error);
      }
    }, this.config.syncInterval);

    console.log(`🔄 Auto-sync started (every ${this.config.syncInterval}ms)`);
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('⏹️ Auto-sync stopped');
    }
  }
}

export default GoogleDriveSync;
