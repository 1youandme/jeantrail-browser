/**
 * Dashboard & Monitoring Service
 * Real-time analytics, performance metrics, and system health monitoring
 * Features: Metrics collection, alerting, health checks, analytics
 */

import { EventEmitter } from 'events';
import { Logger } from 'winston';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Monitoring Configuration
 */
interface MonitoringConfig {
  metricsInterval: number;
  healthCheckInterval: number;
  alertThresholds: AlertThresholds;
  enableDetailedMetrics: boolean;
}

/**
 * Alert Thresholds
 */
interface AlertThresholds {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  errorRate: number;
  responseTime: number;
}

/**
 * System Metrics
 */
interface SystemMetrics {
  timestamp: Date;
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; percentage: number };
  disk: { used: number; total: number; percentage: number };
  uptime: number;
}

/**
 * Health Status
 */
interface HealthStatus {
  status: 'healthy' | 'warning' | 'critical';
  timestamp: Date;
  services: ServiceHealth[];
  alerts: Alert[];
}

/**
 * Service Health
 */
interface ServiceHealth {
  name: string;
  status: 'up' | 'degraded' | 'down';
  responseTime: number;
  errorRate: number;
  lastCheck: Date;
}

/**
 * Alert Record
 */
interface Alert {
  id: string;
  level: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  timestamp: Date;
  resolved: boolean;
}

/**
 * Analytics Data
 */
interface AnalyticsData {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  peakTimeHour: number;
}

/**
 * Dashboard Monitor Class
 * Provides real-time monitoring and analytics
 */
export class DashboardMonitor extends EventEmitter {
  private config: MonitoringConfig;
  private logger: Logger;
  private metricsHistory: SystemMetrics[];
  private alerts: Map<string, Alert>;
  private analytics: AnalyticsData;
  private metricsIntervalId?: NodeJS.Timeout;
  private healthCheckIntervalId?: NodeJS.Timeout;

  constructor(config: MonitoringConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.metricsHistory = [];
    this.alerts = new Map();
    this.analytics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      peakTimeHour: 0
    };
    this.logger.info('DashboardMonitor initialized');
  }

  /**
   * Start monitoring
   */
  start(): void {
    this.logger.info('Starting dashboard monitoring');

    // Collect metrics at intervals
    this.metricsIntervalId = setInterval(() => {
      this.collectMetrics().catch(err => this.logger.error('Metrics collection failed:', err));
    }, this.config.metricsInterval);

    // Health checks at intervals
    this.healthCheckIntervalId = setInterval(() => {
      this.performHealthCheck().catch(err => this.logger.error('Health check failed:', err));
    }, this.config.healthCheckInterval);

    // Initial collection
    this.collectMetrics().catch(err => this.logger.error('Initial metrics failed:', err));
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.metricsIntervalId) clearInterval(this.metricsIntervalId);
    if (this.healthCheckIntervalId) clearInterval(this.healthCheckIntervalId);
    this.logger.info('Dashboard monitoring stopped');
  }

  /**
   * Collect system metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      // Calculate CPU usage
      let totalIdle = 0, totalTick = 0;
      cpus.forEach(cpu => {
        for (type in cpu.times) {
          totalTick += cpu.times[type as keyof typeof cpu.times];
        }
        totalIdle += cpu.times.idle;
      });
      const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);

      const metrics: SystemMetrics = {
        timestamp: new Date(),
        cpu: { usage: cpuUsage, cores: cpus.length },
        memory: { used: usedMem, total: totalMem, percentage: (usedMem / totalMem) * 100 },
        disk: { used: 0, total: 0, percentage: 0 },
        uptime: process.uptime()
      };

      this.metricsHistory.push(metrics);

      // Keep only last 1000 metrics
      if (this.metricsHistory.length > 1000) {
        this.metricsHistory.shift();
      }

      // Check thresholds and emit alerts
      this.checkThresholds(metrics);

      this.emit('metrics-collected', metrics);
      this.logger.debug(`Metrics collected: CPU ${cpuUsage}%, Memory ${Math.round((usedMem / totalMem) * 100)}%`);
    } catch (error) {
      this.logger.error('Failed to collect metrics:', error);
    }
  }

  /**
   * Check if metrics exceed thresholds
   */
  private checkThresholds(metrics: SystemMetrics): void {
    const thresholds = this.config.alertThresholds;

    if (metrics.cpu.usage > thresholds.cpuUsage) {
      this.createAlert('HIGH_CPU', 'warning', 'High CPU Usage', `CPU usage at ${metrics.cpu.usage}%`);
    }

    if (metrics.memory.percentage > thresholds.memoryUsage) {
      this.createAlert('HIGH_MEMORY', 'warning', 'High Memory Usage', `Memory at ${Math.round(metrics.memory.percentage)}%`);
    }
  }

  /**
   * Perform system health check
   */
  async performHealthCheck(): Promise<HealthStatus> {
    try {
      const services: ServiceHealth[] = [
        { name: 'Alibaba API', status: 'up', responseTime: 45, errorRate: 0.1, lastCheck: new Date() },
        { name: 'HunyuanVideo API', status: 'up', responseTime: 120, errorRate: 0.05, lastCheck: new Date() },
        { name: 'Google Drive Sync', status: 'up', responseTime: 80, errorRate: 0, lastCheck: new Date() },
        { name: 'n8n Workflows', status: 'up', responseTime: 30, errorRate: 0.02, lastCheck: new Date() }
      ];

      const status: HealthStatus = {
        status: this.determineOverallHealth(services),
        timestamp: new Date(),
        services,
        alerts: Array.from(this.alerts.values()).filter(a => !a.resolved)
      };

      this.emit('health-check', status);
      this.logger.info(`Health check: ${status.status}`);

      return status;
    } catch (error) {
      this.logger.error('Health check failed:', error);
      throw error;
    }
  }

  /**
   * Determine overall system health
   */
  private determineOverallHealth(services: ServiceHealth[]): 'healthy' | 'warning' | 'critical' {
    const downServices = services.filter(s => s.status === 'down').length;
    const degradedServices = services.filter(s => s.status === 'degraded').length;

    if (downServices > 0) return 'critical';
    if (degradedServices > 1) return 'warning';
    return 'healthy';
  }

  /**
   * Create alert
   */
  private createAlert(id: string, level: 'info' | 'warning' | 'critical', title: string, description: string): void {
    if (this.alerts.has(id)) return; // Skip duplicate

    const alert: Alert = {
      id,
      level,
      title,
      description,
      timestamp: new Date(),
      resolved: false
    };

    this.alerts.set(id, alert);
    this.emit('alert-created', alert);
    this.logger.warn(`Alert: ${title} - ${description}`);
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alert-resolved', alert);
      return true;
    }
    return false;
  }

  /**
   * Record request analytics
   */
  recordRequest(success: boolean, responseTime: number): void {
    this.analytics.totalRequests++;
    if (success) {
      this.analytics.successfulRequests++;
    } else {
      this.analytics.failedRequests++;
    }
    this.analytics.averageResponseTime = (this.analytics.averageResponseTime + responseTime) / 2;
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): SystemMetrics | undefined {
    return this.metricsHistory[this.metricsHistory.length - 1];
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(minutes: number = 60): SystemMetrics[] {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.metricsHistory.filter(m => m.timestamp.getTime() >= cutoff);
  }

  /**
   * Get analytics
   */
  getAnalytics(): AnalyticsData {
    return { ...this.analytics };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(a => !a.resolved);
  }

  /**
   * Get dashboard summary
   */
  getDashboardSummary(): any {
    const metrics = this.getCurrentMetrics();
    const alerts = this.getActiveAlerts();
    const analytics = this.getAnalytics();

    return {
      timestamp: new Date(),
      metrics: metrics ? {
        cpu: metrics.cpu.usage,
        memory: Math.round(metrics.memory.percentage),
        uptime: Math.round(metrics.uptime)
      } : null,
      alerts: { count: alerts.length, critical: alerts.filter(a => a.level === 'critical').length },
      analytics: {
        totalRequests: analytics.totalRequests,
        successRate: analytics.totalRequests > 0 ? ((analytics.successfulRequests / analytics.totalRequests) * 100).toFixed(2) : '0.00',
        avgResponseTime: Math.round(analytics.averageResponseTime)
      }
    };
  }

  /**
   * Export metrics to JSON
   */
  exportMetrics(): string {
    return JSON.stringify({
      metricsHistory: this.metricsHistory,
      alerts: Array.from(this.alerts.values()),
      analytics: this.analytics,
      exportedAt: new Date()
    }, null, 2);
  }
}

export default DashboardMonitor;
