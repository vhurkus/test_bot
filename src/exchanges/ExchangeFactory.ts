/**
 * Exchange Factory
 * Creates and manages exchange instances
 */

import { IExchange } from './IExchange';
import { BinanceExchange } from './binance/BinanceExchange';
import { BTCTurkExchange } from './btcturk/BTCTurkExchange';
import { ExchangeName } from '../types';
import { exchangeLogger } from '../utils/logger';

export class ExchangeFactory {
  private static exchanges: Map<ExchangeName, IExchange> = new Map();

  /**
   * Create an exchange instance
   */
  public static createExchange(exchangeName: ExchangeName): IExchange {
    // Return existing instance if already created
    if (this.exchanges.has(exchangeName)) {
      return this.exchanges.get(exchangeName)!;
    }

    let exchange: IExchange;

    switch (exchangeName) {
      case ExchangeName.BINANCE:
        exchange = new BinanceExchange();
        break;

      case ExchangeName.BTCTURK:
        exchange = new BTCTurkExchange();
        break;

      default:
        throw new Error(`Unsupported exchange: ${exchangeName}`);
    }

    this.exchanges.set(exchangeName, exchange);
    exchangeLogger.info(`Created exchange instance: ${exchangeName}`);

    return exchange;
  }

  /**
   * Get an existing exchange instance
   */
  public static getExchange(exchangeName: ExchangeName): IExchange | undefined {
    return this.exchanges.get(exchangeName);
  }

  /**
   * Get all exchange instances
   */
  public static getAllExchanges(): IExchange[] {
    return Array.from(this.exchanges.values());
  }

  /**
   * Initialize all exchanges
   */
  public static async initializeAll(): Promise<void> {
    exchangeLogger.info('Initializing all exchanges...');

    const exchanges = [
      ExchangeName.BINANCE,
      ExchangeName.BTCTURK,
    ];

    for (const exchangeName of exchanges) {
      try {
        const exchange = this.createExchange(exchangeName);
        await exchange.initialize();
        exchangeLogger.info(`${exchangeName} initialized successfully`);
      } catch (error) {
        exchangeLogger.error(`Failed to initialize ${exchangeName}:`, error);
        throw error;
      }
    }

    exchangeLogger.info('All exchanges initialized');
  }

  /**
   * Close all exchanges
   */
  public static async closeAll(): Promise<void> {
    exchangeLogger.info('Closing all exchanges...');

    const closePromises = Array.from(this.exchanges.values()).map(
      async (exchange) => {
        try {
          await exchange.close();
          exchangeLogger.info(`${exchange.name} closed successfully`);
        } catch (error) {
          exchangeLogger.error(`Error closing ${exchange.name}:`, error);
        }
      },
    );

    await Promise.all(closePromises);

    this.exchanges.clear();
    exchangeLogger.info('All exchanges closed');
  }

  /**
   * Test connection to all exchanges
   */
  public static async testAllConnections(): Promise<Record<ExchangeName, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [exchangeName, exchange] of this.exchanges.entries()) {
      try {
        const result = await exchange.testConnection();
        results[exchangeName] = result;
      } catch (error) {
        exchangeLogger.error(`Connection test failed for ${exchangeName}:`, error);
        results[exchangeName] = false;
      }
    }

    return results as Record<ExchangeName, boolean>;
  }

  /**
   * Get exchange statistics
   */
  public static getStats() {
    const stats: Record<string, any> = {};

    for (const [exchangeName, exchange] of this.exchanges.entries()) {
      stats[exchangeName] = {
        ready: exchange.isReady(),
        circuitBreaker: exchange.getCircuitBreakerStats(),
        rateLimiter: exchange.getRateLimiterStats(),
      };
    }

    return stats;
  }
}
