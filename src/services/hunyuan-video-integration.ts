/**
 * HunyuanVideo API Integration Service
 * Handles video generation, processing, and management via Alibaba HunyuanVideo API
 * Features: Video generation, caching, error handling, rate limiting, logging
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import NodeCache from 'node-cache';
import { Logger } from 'winston';
import pQueue from 'p-queue';

/**
 * Configuration interface for HunyuanVideo API
 */
interface HunyuanConfig {
  apiKey: string;
  apiSecret: string;
  endpoint: string;
  region: string;
  timeout: number;
  maxRetries: number;
  cacheTTL: number;
}

/**
 * Video generation parameters interface
 */
interface VideoGenerationParams {
  prompt: string;
  duration: number;
  resolution: '720p' | '1080p' | '2k';
  fps: number;
  format: 'mp4' | 'webm' | 'mov';
  style: string;
  seed?: number;
  negativePrompt?: string;
}

/**
 * Video processing result interface
 */
interface VideoProcessingResult {
  videoId: string;
  status: 'generating' | 'completed' | 'failed';
  videoUrl?: string;
  duration: number;
  resolution: string;
  fileSize: number;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * HunyuanVideo Integration Service Class
 * Manages all interactions with Alibaba HunyuanVideo API
 */
export class HunyuanVideoService {
  private client: AxiosInstance;
  private cache: NodeCache;
  private queue: pQueue;
  private logger: Logger;
  private config: HunyuanConfig;

  constructor(config: HunyuanConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.cache = new NodeCache({ stdTTL: config.cacheTTL, checkperiod: 600 });
    this.queue = new pQueue({ concurrency: 5, interval: 1000, intervalCap: 10 });
    
    this.client = axios.create({
      baseURL: config.endpoint,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'X-API-Secret': config.apiSecret,
        'X-Region': config.region
      }
    });

    this.setupInterceptors();
  }

  /**
   * Setup axios interceptors for logging and error handling
   */
  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        this.logger.info(`HunyuanVideo API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        this.logger.info(`HunyuanVideo API Response: ${response.status} ${response.statusText}`);
        return response;
      },
      (error: AxiosError) => {
        this.logger.error('HunyuanVideo API Error:', {
          status: error.response?.status,
          message: error.message,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Enqueue API request with rate limiting
   * @param fn Async function to execute
   * @returns Promise with result
   */
  private async enqueueRequest<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.add(() => fn());
  }

  /**
   * Generate video from text prompt using HunyuanVideo API
   * @param params Video generation parameters
   * @returns Video processing result with ID and status
   */
  async generateVideo(params: VideoGenerationParams): Promise<VideoProcessingResult> {
    try {
      const cacheKey = `video_${params.prompt.slice(0, 50)}_${params.resolution}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached) {
        this.logger.info(`Cache hit for video generation: ${cacheKey}`);
        return cached as VideoProcessingResult;
      }

      const result = await this.enqueueRequest(async () => {
        const response = await this.client.post('/video/generate', {
          prompt: params.prompt,
          duration: params.duration,
          resolution: params.resolution,
          fps: params.fps,
          format: params.format,
          style: params.style,
          seed: params.seed || Math.floor(Math.random() * 10000),
          negative_prompt: params.negativePrompt
        });

        const videoData: VideoProcessingResult = {
          videoId: response.data.video_id,
          status: response.data.status || 'generating',
          duration: params.duration,
          resolution: params.resolution,
          fileSize: 0,
          createdAt: new Date()
        };

        this.cache.set(cacheKey, videoData);
        this.logger.info(`Video generation initiated: ${videoData.videoId}`);
        
        return videoData;
      });

      return result;
    } catch (error) {
      this.logger.error('Video generation failed:', error);
      throw error;
    }
  }

  /**
   * Get video processing status
   * @param videoId ID of the video
   * @returns Current status and details
   */
  async getVideoStatus(videoId: string): Promise<VideoProcessingResult> {
    try {
      const cacheKey = `status_${videoId}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached) {
        return cached as VideoProcessingResult;
      }

      const result = await this.enqueueRequest(async () => {
        const response = await this.client.get(`/video/status/${videoId}`);
        
        const statusData: VideoProcessingResult = {
          videoId: videoId,
          status: response.data.status,
          videoUrl: response.data.video_url,
          duration: response.data.duration,
          resolution: response.data.resolution,
          fileSize: response.data.file_size || 0,
          createdAt: new Date(response.data.created_at),
          completedAt: response.data.completed_at ? new Date(response.data.completed_at) : undefined
        };

        this.cache.set(cacheKey, statusData, 300);
        this.logger.info(`Video status retrieved: ${videoId} - ${statusData.status}`);
        
        return statusData;
      });

      return result;
    } catch (error) {
      this.logger.error(`Failed to get video status for ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Download and process generated video
   * @param videoId ID of the video to download
   * @param outputPath Path to save the video
   * @returns Download result with file information
   */
  async downloadVideo(videoId: string, outputPath: string): Promise<{ success: boolean; filePath: string; fileSize: number }> {
    try {
      const result = await this.enqueueRequest(async () => {
        const response = await this.client.get(`/video/download/${videoId}`, {
          responseType: 'stream'
        });

        const fs = require('fs');
        const path = require('path');
        const fullPath = path.join(outputPath, `${videoId}.mp4`);
        
        const writer = fs.createWriteStream(fullPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
          writer.on('finish', () => {
            const fileSize = fs.statSync(fullPath).size;
            this.logger.info(`Video downloaded successfully: ${videoId} - ${fileSize} bytes`);
            resolve({ success: true, filePath: fullPath, fileSize });
          });
          writer.on('error', reject);
        });
      });

      return result as { success: boolean; filePath: string; fileSize: number };
    } catch (error) {
      this.logger.error(`Failed to download video ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Batch generate multiple videos
   * @param paramsList Array of video generation parameters
   * @returns Array of video processing results
   */
  async batchGenerateVideos(paramsList: VideoGenerationParams[]): Promise<VideoProcessingResult[]> {
    try {
      const results: VideoProcessingResult[] = [];
      
      for (const params of paramsList) {
        const result = await this.generateVideo(params);
        results.push(result);
      }

      this.logger.info(`Batch video generation completed: ${results.length} videos`);
      return results;
    } catch (error) {
      this.logger.error('Batch video generation failed:', error);
      throw error;
    }
  }

  /**
   * Delete processed video from system
   * @param videoId ID of the video to delete
   * @returns Deletion confirmation
   */
  async deleteVideo(videoId: string): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.enqueueRequest(async () => {
        await this.client.delete(`/video/delete/${videoId}`);
        
        const cacheKey1 = `status_${videoId}`;
        const cacheKey2 = `video_${videoId}`;
        this.cache.del([cacheKey1, cacheKey2]);
        
        this.logger.info(`Video deleted: ${videoId}`);
        return { success: true, message: `Video ${videoId} deleted successfully` };
      });

      return result;
    } catch (error) {
      this.logger.error(`Failed to delete video ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.flushAll();
    this.logger.info('HunyuanVideo cache cleared');
  }

  /**
   * Get cache statistics
   * @returns Cache key count and memory usage
   */
  getCacheStats(): { keys: number; memory: number } {
    const keys = this.cache.keys().length;
    const stats = (this.cache as any).getStats();
    return { keys, memory: stats?.memoryUsage || 0 };
  }
}

export default HunyuanVideoService;
