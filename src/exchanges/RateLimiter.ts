/**
 * Rate Limiter Implementation
 * Token bucket algorithm for API rate limiting
 */

import { logger } from '../utils/logger';

export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  private lastRefill: number;
  private readonly queue: Array<() => void> = [];
  private requestCount = 0;
  private rejectedCount = 0;

  constructor(tokensPerSecond: number) {
    this.maxTokens = tokensPerSecond;
    this.tokens = tokensPerSecond;
    this.refillRate = tokensPerSecond;
    this.lastRefill = Date.now();
  }

  /**
   * Wait for a token to become available
   */
  public async waitForToken(): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.requestCount++;
      return;
    }

    // Wait in queue
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  /**
   * Try to get a token immediately without waiting
   */
  public tryGetToken(): boolean {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.requestCount++;
      return true;
    }

    this.rejectedCount++;
    return false;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Process queued requests
   */
  private processQueue(): void {
    setImmediate(() => {
      this.refillTokens();

      while (this.queue.length > 0 && this.tokens >= 1) {
        this.tokens -= 1;
        this.requestCount++;
        const resolve = this.queue.shift();
        if (resolve) {
          resolve();
        }
      }

      if (this.queue.length > 0) {
        // Schedule next check after minimum wait time
        const waitTime = (1 / this.refillRate) * 1000;
        setTimeout(() => this.processQueue(), waitTime);
      }
    });
  }

  /**
   * Get current rate limiter statistics
   */
  public getStats() {
    this.refillTokens();
    return {
      availableTokens: Math.floor(this.tokens),
      maxTokens: this.maxTokens,
      queueLength: this.queue.length,
      totalRequests: this.requestCount,
      rejectedRequests: this.rejectedCount,
      refillRate: this.refillRate,
    };
  }

  /**
   * Reset rate limiter
   */
  public reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.requestCount = 0;
    this.rejectedCount = 0;

    // Reject all queued requests
    while (this.queue.length > 0) {
      const resolve = this.queue.shift();
      if (resolve) {
        resolve();
      }
    }
  }
}
