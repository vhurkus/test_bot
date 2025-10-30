/**
 * Base Exchange Implementation
 * Abstract class with common functionality for all exchanges
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as crypto from 'crypto';
import { IExchange, PlaceOrderParams } from './IExchange';
import { Order, Balance, Orderbook, ExchangeName, TradingPair } from '../types';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { withRetry, isRetryableError } from '../utils/retry';
import { RateLimiter } from './RateLimiter';
import { ExchangeApiError, ExchangeConnectionError, AuthenticationError } from '../utils/errors';
import { exchangeLogger } from '../utils/logger';
import { TIMEOUTS } from '../config/constants';

export interface BaseExchangeConfig {
  name: ExchangeName;
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  wsUrl: string;
  rateLimit: number;
}

export abstract class BaseExchange implements IExchange {
  protected config: BaseExchangeConfig;
  protected httpClient: AxiosInstance;
  protected circuitBreaker: CircuitBreaker;
  protected rateLimiter: RateLimiter;
  protected ready = false;

  public readonly name: string;

  constructor(config: BaseExchangeConfig) {
    this.config = config;
    this.name = config.name;

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: TIMEOUTS.API_REQUEST,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ArbitrageBot/1.0',
      },
    });

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      name: `${config.name}_API`,
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
    });

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter(config.rateLimit);

    // Setup request/response interceptors
    this.setupInterceptors();

    exchangeLogger.info(`${this.name} exchange initialized`);
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.httpClient.interceptors.request.use(
      (config) => {
        exchangeLogger.debug(`${this.name} API Request:`, {
          method: config.method,
          url: config.url,
          params: config.params,
        });
        return config;
      },
      (error) => {
        exchangeLogger.error(`${this.name} Request error:`, error);
        return Promise.reject(error);
      },
    );

    // Response interceptor for logging and error handling
    this.httpClient.interceptors.response.use(
      (response) => {
        exchangeLogger.debug(`${this.name} API Response:`, {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        const errorMessage = error.response?.data?.msg || error.message;
        exchangeLogger.error(`${this.name} Response error:`, {
          status: error.response?.status,
          message: errorMessage,
          url: error.config?.url,
        });

        // Transform to custom error
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw new AuthenticationError(
            `Authentication failed: ${errorMessage}`,
            this.name,
            { status: error.response.status },
          );
        }

        throw new ExchangeApiError(errorMessage, this.name, {
          status: error.response?.status,
          url: error.config?.url,
        });
      },
    );
  }

  /**
   * Make authenticated API request with rate limiting and retry
   */
  protected async makeRequest<T>(
    method: string,
    endpoint: string,
    params?: any,
    data?: any,
  ): Promise<T> {
    // Wait for rate limiter
    await this.rateLimiter.waitForToken();

    // Execute with circuit breaker and retry
    return await this.circuitBreaker.execute(async () => {
      return await withRetry(
        async () => {
          const config: AxiosRequestConfig = {
            method,
            url: endpoint,
            params,
            data,
            headers: this.getAuthHeaders(method, endpoint, params, data),
          };

          const response = await this.httpClient.request<T>(config);
          return response.data;
        },
        {
          maxRetries: 3,
          onRetry: (error, attempt) => {
            exchangeLogger.warn(`${this.name} request retry attempt ${attempt}:`, {
              error: error.message,
              endpoint,
            });
          },
        },
      );
    });
  }

  /**
   * Generate authentication headers (to be implemented by each exchange)
   */
  protected abstract getAuthHeaders(
    method: string,
    endpoint: string,
    params?: any,
    data?: any,
  ): Record<string, string>;

  /**
   * Generate HMAC signature
   */
  protected generateSignature(message: string, secret: string, algorithm = 'sha256'): string {
    return crypto.createHmac(algorithm, secret).update(message).digest('hex');
  }

  /**
   * Generate base64 HMAC signature
   */
  protected generateBase64Signature(message: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(message).digest('base64');
  }

  // Abstract methods to be implemented by specific exchanges
  abstract initialize(): Promise<void>;
  abstract close(): Promise<void>;
  abstract getBalances(): Promise<Balance[]>;
  abstract getBalance(asset: string): Promise<Balance>;
  abstract getOrderbook(symbol: string, depth?: number): Promise<Orderbook>;
  abstract placeOrder(params: PlaceOrderParams): Promise<Order>;
  abstract cancelOrder(symbol: string, orderId: string): Promise<void>;
  abstract getOrder(symbol: string, orderId: string): Promise<Order>;
  abstract getOpenOrders(symbol?: string): Promise<Order[]>;
  abstract getTradingPair(symbol: string): Promise<TradingPair>;
  abstract getTradingPairs(): Promise<TradingPair[]>;
  abstract subscribeOrderbook(symbol: string, callback: (orderbook: Orderbook) => void): Promise<void>;
  abstract unsubscribeOrderbook(symbol: string): Promise<void>;
  abstract getServerTime(): Promise<number>;

  public isReady(): boolean {
    return this.ready;
  }

  /**
   * Test connection to exchange
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this.getServerTime();
      return true;
    } catch (error) {
      exchangeLogger.error(`${this.name} connection test failed:`, error);
      return false;
    }
  }

  /**
   * Get circuit breaker stats
   */
  public getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Get rate limiter stats
   */
  public getRateLimiterStats() {
    return this.rateLimiter.getStats();
  }
}
