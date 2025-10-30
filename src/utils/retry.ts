/**
 * Retry Mechanism with Exponential Backoff
 */

import { logger } from './logger';
import { RETRY_CONFIG } from '../config/constants';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = RETRY_CONFIG.MAX_RETRIES,
    initialDelay = RETRY_CONFIG.INITIAL_DELAY,
    maxDelay = RETRY_CONFIG.MAX_DELAY,
    backoffMultiplier = RETRY_CONFIG.BACKOFF_MULTIPLIER,
    onRetry,
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt > maxRetries) {
        logger.error(`Max retries (${maxRetries}) exceeded`, {
          error: lastError.message,
        });
        throw lastError;
      }

      logger.warn(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms`, {
        error: lastError.message,
      });

      if (onRetry) {
        onRetry(lastError, attempt);
      }

      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError!;
}

export async function retryWithCondition<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: Error) => boolean,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = RETRY_CONFIG.MAX_RETRIES,
    initialDelay = RETRY_CONFIG.INITIAL_DELAY,
    maxDelay = RETRY_CONFIG.MAX_DELAY,
    backoffMultiplier = RETRY_CONFIG.BACKOFF_MULTIPLIER,
    onRetry,
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt > maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      logger.warn(`Conditional retry attempt ${attempt}/${maxRetries} after ${delay}ms`, {
        error: lastError.message,
      });

      if (onRetry) {
        onRetry(lastError, attempt);
      }

      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to check if error is retryable
export function isRetryableError(error: Error): boolean {
  const retryableMessages = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN',
    'timeout',
    'network',
  ];

  const errorMessage = error.message.toLowerCase();
  return retryableMessages.some((msg) => errorMessage.includes(msg));
}

// Helper for rate limit errors
export function isRateLimitError(error: Error): boolean {
  const rateLimitIndicators = ['rate limit', 'too many requests', '429'];
  const errorMessage = error.message.toLowerCase();
  return rateLimitIndicators.some((indicator) => errorMessage.includes(indicator));
}
