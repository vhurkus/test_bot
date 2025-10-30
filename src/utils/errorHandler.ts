/**
 * Global Error Handler
 * Centralized error handling and logging
 */

import { BaseError, isOperationalError } from './errors';
import { logger, logError } from './logger';

class ErrorHandler {
  private static instance: ErrorHandler;

  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  public handleError(error: Error | BaseError, context?: Record<string, any>): void {
    // Log the error
    this.logError(error, context);

    // Store error in database if critical
    if (!isOperationalError(error)) {
      this.saveCriticalError(error, context);
    }

    // Send alert if configured
    if (this.shouldAlert(error)) {
      this.sendAlert(error, context);
    }
  }

  private logError(error: Error | BaseError, context?: Record<string, any>): void {
    const errorContext = {
      ...context,
      ...(error instanceof BaseError ? error.context : {}),
    };

    logError(error, errorContext);
  }

  private async saveCriticalError(
    error: Error | BaseError,
    context?: Record<string, any>,
  ): Promise<void> {
    try {
      // TODO: Save to error_logs table
      logger.debug('Critical error saved to database');
    } catch (dbError) {
      logger.error('Failed to save critical error to database:', dbError);
    }
  }

  private shouldAlert(error: Error | BaseError): boolean {
    // Alert on non-operational errors
    if (!isOperationalError(error)) {
      return true;
    }

    // Alert on specific error types
    if (error instanceof BaseError) {
      const alertCodes = [
        'DAILY_LOSS_LIMIT_EXCEEDED',
        'EXCHANGE_AUTHENTICATION_ERROR',
        'DATABASE_CONNECTION_ERROR',
      ];
      return alertCodes.includes(error.code);
    }

    return false;
  }

  private async sendAlert(error: Error | BaseError, context?: Record<string, any>): Promise<void> {
    try {
      // TODO: Implement Telegram alert
      logger.warn('Alert notification would be sent:', {
        error: error.message,
        context,
      });
    } catch (alertError) {
      logger.error('Failed to send alert:', alertError);
    }
  }

  public isTrustedError(error: Error): boolean {
    return isOperationalError(error);
  }
}

export const errorHandler = ErrorHandler.getInstance();
export default errorHandler;
