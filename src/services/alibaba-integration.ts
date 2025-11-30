/**
 * Alibaba E-Commerce Integration Service
 * High-performance API integration with caching and rate limiting
 * Supports product scraping, pricing, inventory management
 */

import axios, { AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import * as logger from './logger';

interface AlibabaConfig {
  appId: string;
  appSecret: string;
  accessToken?: string;
  rateLimitPerSecond?: number;
  cacheTTL?: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  currency: string;
  category: string;
  inventory: number;
  images: string[];
  description: string;
  isNew: boolean;
}

interface PricingStrategy {
  basePrice: number;
  markup: number;
  currency: string;
  discountRate?: number;
}

class AlibabaIntegrationService {
  private client: AxiosInstance;
  private cache: NodeCache;
  private config: Required<AlibabaConfig>;
  private requestQueue: Promise<any> = Promise.resolve();
  private lastRequestTime: number = 0;
  private requestInterval: number;

  constructor(config: AlibabaConfig) {
    this.config = {
      appId: config.appId,
      appSecret: config.appSecret,
      accessToken: config.accessToken || '',
      rateLimitPerSecond: config.rateLimitPerSecond || 10,
      cacheTTL: config.cacheTTL || 3600,
    };

    this.requestInterval = 1000 / this.config.rateLimitPerSecond;

    this.cache = new NodeCache({ stdTTL: this.config.cacheTTL });

    this.client = axios.create({
      baseURL: 'https://api.1688.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
    });

    this.setupInterceptors();
  }

  /**
   * Setup axios interceptors for logging and error handling
   */
  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error(`Request setup error: ${error.message}`);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error(`API Error: ${error.response?.status} - ${error.message}`);
        if (error.response?.status === 401) {
          logger.warn('Authentication failed, token may be expired');
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Rate limiting wrapper for API calls
   */
  private async enqueueRequest<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue = this.requestQueue
        .then(() => {
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;

          if (timeSinceLastRequest < this.requestInterval) {
            return new Promise((res) =>
              setTimeout(res, this.requestInterval - timeSinceLastRequest)
            );
          }
        })
        .then(() => {
          this.lastRequestTime = Date.now();
          return fn();
        })
        .then(resolve)
        .catch(reject);
    });
  }

  /**
   * Search for products on Alibaba
   */
  async searchProducts(query: string, pageSize: number = 50, pageNo: number = 1): Promise<Product[]> {
    const cacheKey = `search:${query}:${pageNo}`;
    const cached = this.cache.get<Product[]>(cacheKey);

    if (cached) {
      logger.debug(`Cache hit for search: ${query}`);
      return cached;
    }

    return this.enqueueRequest(async () => {
      try {
        const response = await this.client.get('/openapi/product/search', {
          params: {
            keywords: query,
            pageSize,
            pageNo,
          },
        });

        const products: Product[] = response.data.data?.items?.map((item: any) => ({
          id: item.productId,
          name: item.subject,
          price: item.minPrice || 0,
          currency: 'CNY',
          category: item.categoryId,
          inventory: item.stock || 0,
          images: item.images || [],
          description: item.detail || '',
          isNew: item.isNew || false,
        })) || [];

        this.cache.set(cacheKey, products);
        logger.info(`Successfully fetched ${products.length} products for query: ${query}`);

        return products;
      } catch (error) {
        logger.error(`Product search failed: ${error.message}`);
        throw error;
      }
    });
  }

  /**
   * Get detailed product information
   */
  async getProductDetails(productId: string): Promise<Product | null> {
    const cacheKey = `product:${productId}`;
    const cached = this.cache.get<Product>(cacheKey);

    if (cached) {
      return cached;
    }

    return this.enqueueRequest(async () => {
      try {
        const response = await this.client.get(`/openapi/product/${productId}`);
        const item = response.data.data;

        const product: Product = {
          id: item.productId,
          name: item.subject,
          price: item.minPrice || 0,
          currency: 'CNY',
          category: item.categoryId,
          inventory: item.stock || 0,
          images: item.images || [],
          description: item.detail || '',
          isNew: item.isNew || false,
        };

        this.cache.set(cacheKey, product);
        return product;
      } catch (error) {
        logger.error(`Failed to get product details: ${error.message}`);
        return null;
      }
    });
  }

  /**
   * Calculate intelligent pricing based on strategy
   */
  calculateDynamicPrice(basePrices: number[], strategy: PricingStrategy): number[] {
    return basePrices.map((basePrice) => {
      const withMarkup = basePrice * (1 + strategy.markup);
      if (strategy.discountRate) {
        return withMarkup * (1 - strategy.discountRate);
      }
      return withMarkup;
    });
  }

  /**
   * Submit bulk order to Alibaba
   */
  async submitBulkOrder(products: Product[], quantities: number[], companyInfo: any): Promise<string | null> {
    return this.enqueueRequest(async () => {
      try {
        const orderItems = products.map((product, index) => ({
          productId: product.id,
          quantity: quantities[index],
          unitPrice: product.price,
        }));

        const response = await this.client.post('/openapi/order/create', {
          items: orderItems,
          company: companyInfo,
        });

        const orderId = response.data.data?.orderId;
        logger.info(`Order submitted successfully: ${orderId}`);
        return orderId;
      } catch (error) {
        logger.error(`Order submission failed: ${error.message}`);
        return null;
      }
    });
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string): Promise<any> {
    const cacheKey = `order:${orderId}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    return this.enqueueRequest(async () => {
      try {
        const response = await this.client.get(`/openapi/order/${orderId}`);
        this.cache.set(cacheKey, response.data.data, 300); // Cache for 5 minutes
        return response.data.data;
      } catch (error) {
        logger.error(`Failed to get order status: ${error.message}`);
        return null;
      }
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.flushAll();
    logger.debug('Cache cleared');
  }
}

export default AlibabaIntegrationService;
export { AlibabaConfig, Product, PricingStrategy };
