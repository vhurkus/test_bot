/**
 * Graceful Shutdown Handler
 * Ensures clean shutdown of all services
 */

import { logger, systemLogger } from './logger';

type ShutdownHandler = () => Promise<void>;

class GracefulShutdown {
  private static instance: GracefulShutdown;
  private shutdownHandlers: Map<string, ShutdownHandler> = new Map();
  private isShuttingDown = false;
  private shutdownTimeout = 30000; // 30 seconds

  private constructor() {
    this.setupSignalHandlers();
  }

  public static getInstance(): GracefulShutdown {
    if (!GracefulShutdown.instance) {
      GracefulShutdown.instance = new GracefulShutdown();
    }
    return GracefulShutdown.instance;
  }

  public registerHandler(name: string, handler: ShutdownHandler): void {
    this.shutdownHandlers.set(name, handler);
    systemLogger.debug(`Registered shutdown handler: ${name}`);
  }

  public unregisterHandler(name: string): void {
    this.shutdownHandlers.delete(name);
    systemLogger.debug(`Unregistered shutdown handler: ${name}`);
  }

  private setupSignalHandlers(): void {
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      systemLogger.error('Uncaught Exception:', error);
      this.handleShutdown('uncaughtException', 1);
    });
    process.on('unhandledRejection', (reason, promise) => {
      systemLogger.error('Unhandled Rejection at:', { promise, reason });
      this.handleShutdown('unhandledRejection', 1);
    });
  }

  private async handleShutdown(signal: string, exitCode = 0): Promise<void> {
    if (this.isShuttingDown) {
      systemLogger.warn('Shutdown already in progress, forcing exit...');
      process.exit(1);
      return;
    }

    this.isShuttingDown = true;
    systemLogger.info(`Received ${signal}, starting graceful shutdown...`);

    // Set timeout for forced shutdown
    const forceShutdownTimer = setTimeout(() => {
      systemLogger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, this.shutdownTimeout);

    try {
      // Execute all shutdown handlers
      const handlerPromises = Array.from(this.shutdownHandlers.entries()).map(
        async ([name, handler]) => {
          try {
            systemLogger.info(`Executing shutdown handler: ${name}`);
            await handler();
            systemLogger.info(`Completed shutdown handler: ${name}`);
          } catch (error) {
            systemLogger.error(`Error in shutdown handler ${name}:`, error);
          }
        },
      );

      await Promise.all(handlerPromises);

      clearTimeout(forceShutdownTimer);
      systemLogger.info('Graceful shutdown completed successfully');
      process.exit(exitCode);
    } catch (error) {
      clearTimeout(forceShutdownTimer);
      systemLogger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  public async shutdown(): Promise<void> {
    await this.handleShutdown('manual', 0);
  }
}

export const gracefulShutdown = GracefulShutdown.getInstance();
export default gracefulShutdown;
