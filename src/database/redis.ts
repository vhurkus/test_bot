/**
 * Redis client configuration and connection
 */

import Redis from 'ioredis';
import { config } from '../config';
import { databaseLogger } from '../utils/logger';

class RedisClient {
  private client: Redis | null = null;
  private isConnected = false;

  async connect(): Promise<Redis> {
    if (this.client && this.isConnected) {
      return this.client;
    }

    try {
      databaseLogger.info('Connecting to Redis...');

      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        db: config.redis.db,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          databaseLogger.warn(`Redis connection retry attempt ${times}, delay: ${delay}ms`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      });

      // Event handlers
      this.client.on('connect', () => {
        databaseLogger.info('Redis client connected');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        databaseLogger.info('Redis client ready');
      });

      this.client.on('error', (error) => {
        databaseLogger.error('Redis client error:', error);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        databaseLogger.warn('Redis connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        databaseLogger.info('Redis client reconnecting...');
      });

      // Wait for connection
      await this.client.ping();
      databaseLogger.info('Redis connection established successfully');

      return this.client;
    } catch (error) {
      databaseLogger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        this.client = null;
        this.isConnected = false;
        databaseLogger.info('Redis connection closed');
      }
    } catch (error) {
      databaseLogger.error('Error closing Redis connection:', error);
      throw error;
    }
  }

  getClient(): Redis {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client is not connected');
    }
    return this.client;
  }

  isReady(): boolean {
    return this.isConnected;
  }

  // Helper methods for common operations
  async get(key: string): Promise<string | null> {
    return this.getClient().get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.getClient().setex(key, ttl, value);
    } else {
      await this.getClient().set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.getClient().del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.getClient().exists(key);
    return result === 1;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.getClient().hget(key, field);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.getClient().hset(key, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.getClient().hgetall(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.getClient().expire(key, seconds);
  }

  async flushdb(): Promise<void> {
    await this.getClient().flushdb();
    databaseLogger.warn('Redis database flushed');
  }
}

// Export singleton instance
export const redisClient = new RedisClient();
export default redisClient;
