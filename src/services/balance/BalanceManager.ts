/**
 * Balance Manager Service
 * Tracks balances across multiple exchanges in real-time
 */

import { IExchange } from '../../exchanges/IExchange';
import { Balance, ExchangeName } from '../../types';
import { exchangeLogger, logError } from '../../utils/logger';
import { redisClient } from '../../database/redis';
import { REDIS_KEYS, CACHE_TTL } from '../../config/constants';
import { EventEmitter } from 'events';
import Decimal from 'decimal.js';

export interface ExchangeBalances {
  exchange: ExchangeName;
  balances: Balance[];
  lastUpdate: number;
}

export interface BalanceAlert {
  exchange: ExchangeName;
  asset: string;
  currentBalance: string;
  threshold: string;
  timestamp: number;
}

export class BalanceManager extends EventEmitter {
  private exchanges: Map<ExchangeName, IExchange> = new Map();
  private balanceCache: Map<string, ExchangeBalances> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL_MS = 5000; // 5 seconds
  private balanceThresholds: Map<string, Decimal> = new Map();

  constructor() {
    super();
  }

  /**
   * Register an exchange for balance tracking
   */
  public registerExchange(exchange: IExchange): void {
    this.exchanges.set(exchange.name as ExchangeName, exchange);
    exchangeLogger.info(`Registered exchange for balance tracking: ${exchange.name}`);
  }

  /**
   * Unregister an exchange
   */
  public unregisterExchange(exchangeName: ExchangeName): void {
    this.exchanges.delete(exchangeName);
    this.balanceCache.delete(exchangeName);
    exchangeLogger.info(`Unregistered exchange from balance tracking: ${exchangeName}`);
  }

  /**
   * Start balance monitoring
   */
  public start(): void {
    if (this.updateInterval) {
      return;
    }

    exchangeLogger.info('Starting Balance Manager...');

    // Initial update
    this.updateAllBalances().catch((error) => {
      logError(error, { category: 'BALANCE_MANAGER', operation: 'initialUpdate' });
    });

    // Set up periodic updates
    this.updateInterval = setInterval(() => {
      this.updateAllBalances().catch((error) => {
        logError(error, { category: 'BALANCE_MANAGER', operation: 'updateAllBalances' });
      });
    }, this.UPDATE_INTERVAL_MS);

    exchangeLogger.info('Balance Manager started');
  }

  /**
   * Stop balance monitoring
   */
  public stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      exchangeLogger.info('Balance Manager stopped');
    }
  }

  /**
   * Update balances for all registered exchanges
   */
  private async updateAllBalances(): Promise<void> {
    const updatePromises = Array.from(this.exchanges.entries()).map(
      async ([exchangeName, exchange]) => {
        try {
          await this.updateExchangeBalances(exchangeName, exchange);
        } catch (error) {
          logError(error as Error, {
            category: 'BALANCE_MANAGER',
            operation: 'updateExchangeBalances',
            exchange: exchangeName,
          });
        }
      },
    );

    await Promise.all(updatePromises);
  }

  /**
   * Update balances for a specific exchange
   */
  private async updateExchangeBalances(
    exchangeName: ExchangeName,
    exchange: IExchange,
  ): Promise<void> {
    const balances = await exchange.getBalances();
    const now = Date.now();

    const exchangeBalances: ExchangeBalances = {
      exchange: exchangeName,
      balances,
      lastUpdate: now,
    };

    // Update cache
    this.balanceCache.set(exchangeName, exchangeBalances);

    // Update Redis cache
    await this.cacheBalances(exchangeName, balances);

    // Check for balance alerts
    this.checkBalanceThresholds(exchangeName, balances);

    // Emit update event
    this.emit('balancesUpdated', exchangeBalances);

    exchangeLogger.debug(`Updated balances for ${exchangeName}`, {
      balanceCount: balances.length,
    });
  }

  /**
   * Get balances for a specific exchange
   */
  public async getExchangeBalances(exchangeName: ExchangeName): Promise<Balance[]> {
    // Try cache first
    const cached = this.balanceCache.get(exchangeName);
    if (cached && Date.now() - cached.lastUpdate < this.UPDATE_INTERVAL_MS) {
      return cached.balances;
    }

    // Fetch from exchange
    const exchange = this.exchanges.get(exchangeName);
    if (!exchange) {
      throw new Error(`Exchange ${exchangeName} not registered`);
    }

    const balances = await exchange.getBalances();

    // Update cache
    this.balanceCache.set(exchangeName, {
      exchange: exchangeName,
      balances,
      lastUpdate: Date.now(),
    });

    return balances;
  }

  /**
   * Get balance for a specific asset on an exchange
   */
  public async getBalance(
    exchangeName: ExchangeName,
    asset: string,
  ): Promise<Balance> {
    const balances = await this.getExchangeBalances(exchangeName);
    const balance = balances.find((b) => b.asset === asset);

    if (!balance) {
      return {
        asset,
        free: '0',
        locked: '0',
        total: '0',
      };
    }

    return balance;
  }

  /**
   * Get all balances across all exchanges
   */
  public getAllBalances(): ExchangeBalances[] {
    return Array.from(this.balanceCache.values());
  }

  /**
   * Get total balance for an asset across all exchanges
   */
  public async getTotalBalance(asset: string): Promise<Decimal> {
    let total = new Decimal(0);

    for (const exchange of this.exchanges.keys()) {
      const balance = await this.getBalance(exchange, asset);
      total = total.plus(balance.total);
    }

    return total;
  }

  /**
   * Get available (free) balance for trading
   */
  public async getAvailableBalance(
    exchangeName: ExchangeName,
    asset: string,
  ): Promise<Decimal> {
    const balance = await this.getBalance(exchangeName, asset);
    return new Decimal(balance.free);
  }

  /**
   * Check if sufficient balance is available
   */
  public async hasSufficientBalance(
    exchangeName: ExchangeName,
    asset: string,
    requiredAmount: string,
  ): Promise<boolean> {
    const available = await this.getAvailableBalance(exchangeName, asset);
    return available.greaterThanOrEqualTo(requiredAmount);
  }

  /**
   * Set balance threshold for alerts
   */
  public setBalanceThreshold(
    exchangeName: ExchangeName,
    asset: string,
    threshold: string,
  ): void {
    const key = `${exchangeName}:${asset}`;
    this.balanceThresholds.set(key, new Decimal(threshold));
    exchangeLogger.info(`Set balance threshold for ${key}: ${threshold}`);
  }

  /**
   * Check balance thresholds and emit alerts
   */
  private checkBalanceThresholds(
    exchangeName: ExchangeName,
    balances: Balance[],
  ): void {
    for (const balance of balances) {
      const key = `${exchangeName}:${balance.asset}`;
      const threshold = this.balanceThresholds.get(key);

      if (threshold && new Decimal(balance.free).lessThan(threshold)) {
        const alert: BalanceAlert = {
          exchange: exchangeName,
          asset: balance.asset,
          currentBalance: balance.free,
          threshold: threshold.toString(),
          timestamp: Date.now(),
        };

        exchangeLogger.warn('Low balance alert:', alert);
        this.emit('lowBalance', alert);
      }
    }
  }

  /**
   * Cache balances in Redis
   */
  private async cacheBalances(
    exchangeName: ExchangeName,
    balances: Balance[],
  ): Promise<void> {
    try {
      if (!redisClient.isReady()) {
        return;
      }

      for (const balance of balances) {
        const key = `${REDIS_KEYS.BALANCE_PREFIX}${exchangeName}:${balance.asset}`;
        await redisClient.set(
          key,
          JSON.stringify(balance),
          CACHE_TTL.BALANCE,
        );
      }
    } catch (error) {
      exchangeLogger.error('Failed to cache balances in Redis:', error);
    }
  }

  /**
   * Get cached balance from Redis
   */
  private async getCachedBalance(
    exchangeName: ExchangeName,
    asset: string,
  ): Promise<Balance | null> {
    try {
      if (!redisClient.isReady()) {
        return null;
      }

      const key = `${REDIS_KEYS.BALANCE_PREFIX}${exchangeName}:${asset}`;
      const cached = await redisClient.get(key);

      if (cached) {
        return JSON.parse(cached) as Balance;
      }
    } catch (error) {
      exchangeLogger.error('Failed to get cached balance from Redis:', error);
    }

    return null;
  }

  /**
   * Get balance summary across all exchanges
   */
  public getBalanceSummary(): Record<string, { total: string; byExchange: Record<string, string> }> {
    const summary: Record<string, { total: string; byExchange: Record<string, string> }> = {};

    for (const exchangeBalances of this.balanceCache.values()) {
      for (const balance of exchangeBalances.balances) {
        if (!summary[balance.asset]) {
          summary[balance.asset] = {
            total: '0',
            byExchange: {},
          };
        }

        summary[balance.asset].byExchange[exchangeBalances.exchange] = balance.total;
        summary[balance.asset].total = new Decimal(summary[balance.asset].total)
          .plus(balance.total)
          .toString();
      }
    }

    return summary;
  }

  /**
   * Force refresh balances for an exchange
   */
  public async refreshBalances(exchangeName: ExchangeName): Promise<Balance[]> {
    const exchange = this.exchanges.get(exchangeName);
    if (!exchange) {
      throw new Error(`Exchange ${exchangeName} not registered`);
    }

    await this.updateExchangeBalances(exchangeName, exchange);
    return this.balanceCache.get(exchangeName)?.balances || [];
  }

  /**
   * Get statistics
   */
  public getStats() {
    const allBalances = this.getAllBalances();
    const totalAssets = new Set<string>();

    for (const exchangeBalances of allBalances) {
      for (const balance of exchangeBalances.balances) {
        totalAssets.add(balance.asset);
      }
    }

    return {
      registeredExchanges: this.exchanges.size,
      totalAssets: totalAssets.size,
      lastUpdate: Math.max(...allBalances.map((b) => b.lastUpdate), 0),
      thresholdCount: this.balanceThresholds.size,
    };
  }
}
