/**
 * Risk Manager Service
 * Manages trading risks and enforces limits
 */

import { EventEmitter } from 'events';
import { BalanceManager } from '../balance/BalanceManager';
import { ExchangeName, ArbitrageOpportunity } from '../../types';
import { config } from '../../config';
import { riskLogger } from '../../utils/logger';
import { RiskManagementError, ErrorCode } from '../../utils/errors';
import Decimal from 'decimal.js';

export interface RiskLimits {
  maxPositionSizeUsdt: Decimal;
  maxDailyLossUsdt: Decimal;
  maxOpenOrders: number;
  maxSlippagePercentage: Decimal;
  stopLossPercentage: Decimal;
  minProfitPercentage: Decimal;
}

export interface DailyRiskMetrics {
  date: string;
  totalTrades: number;
  profitableTrades: number;
  losingTrades: number;
  totalProfit: Decimal;
  totalLoss: Decimal;
  netProfit: Decimal;
  largestWin: Decimal;
  largestLoss: Decimal;
  currentDrawdown: Decimal;
  maxDrawdown: Decimal;
}

export interface PositionRisk {
  symbol: string;
  exchange: ExchangeName;
  currentExposure: Decimal;
  maxExposure: Decimal;
  utilizationPercentage: number;
  isWithinLimit: boolean;
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export class RiskManager extends EventEmitter {
  private balanceManager: BalanceManager;
  private limits: RiskLimits;
  private dailyMetrics: Map<string, DailyRiskMetrics> = new Map();
  private currentPositions: Map<string, Decimal> = new Map();
  private openOrdersCount = 0;
  private emergencyStop = false;

  constructor(balanceManager: BalanceManager) {
    super();
    this.balanceManager = balanceManager;

    // Initialize risk limits from config
    this.limits = {
      maxPositionSizeUsdt: new Decimal(config.trading.maxPositionSizeUsdt),
      maxDailyLossUsdt: new Decimal(config.trading.maxDailyLossUsdt),
      maxOpenOrders: config.trading.maxOpenOrders,
      maxSlippagePercentage: new Decimal(config.trading.maxSlippagePercentage),
      stopLossPercentage: new Decimal(config.trading.stopLossPercentage),
      minProfitPercentage: new Decimal(config.trading.minProfitPercentage),
    };

    riskLogger.info('Risk Manager initialized', {
      limits: {
        maxPositionSizeUsdt: this.limits.maxPositionSizeUsdt.toString(),
        maxDailyLossUsdt: this.limits.maxDailyLossUsdt.toString(),
        maxOpenOrders: this.limits.maxOpenOrders,
      },
    });

    // Initialize today's metrics
    this.initializeDailyMetrics();
  }

  /**
   * Initialize daily metrics
   */
  private initializeDailyMetrics(): void {
    const today = new Date().toISOString().split('T')[0];

    if (!this.dailyMetrics.has(today)) {
      this.dailyMetrics.set(today, {
        date: today,
        totalTrades: 0,
        profitableTrades: 0,
        losingTrades: 0,
        totalProfit: new Decimal(0),
        totalLoss: new Decimal(0),
        netProfit: new Decimal(0),
        largestWin: new Decimal(0),
        largestLoss: new Decimal(0),
        currentDrawdown: new Decimal(0),
        maxDrawdown: new Decimal(0),
      });
    }
  }

  /**
   * Check if trading is allowed
   */
  public canTrade(): { allowed: boolean; reason?: string } {
    // Check emergency stop
    if (this.emergencyStop) {
      return { allowed: false, reason: 'Emergency stop is active' };
    }

    // Check daily loss limit
    const today = this.getTodayMetrics();
    if (today.netProfit.lessThan(this.limits.maxDailyLossUsdt.negated())) {
      riskLogger.error('Daily loss limit exceeded', {
        netProfit: today.netProfit.toString(),
        limit: this.limits.maxDailyLossUsdt.toString(),
      });
      this.activateEmergencyStop('Daily loss limit exceeded');
      return { allowed: false, reason: 'Daily loss limit exceeded' };
    }

    // Check max open orders
    if (this.openOrdersCount >= this.limits.maxOpenOrders) {
      return { allowed: false, reason: 'Max open orders limit reached' };
    }

    return { allowed: true };
  }

  /**
   * Validate arbitrage opportunity
   */
  public async validateOpportunity(
    opportunity: ArbitrageOpportunity,
  ): Promise<{ valid: boolean; reason?: string }> {
    // Check if trading is allowed
    const tradeCheck = this.canTrade();
    if (!tradeCheck.allowed) {
      return tradeCheck;
    }

    // Check profit threshold
    const profitPct = new Decimal(opportunity.estimatedProfitPercentage);
    if (profitPct.lessThan(this.limits.minProfitPercentage)) {
      return {
        valid: false,
        reason: `Profit below minimum threshold: ${profitPct.toString()}% < ${this.limits.minProfitPercentage.toString()}%`,
      };
    }

    // Check position size
    const positionSize = new Decimal(opportunity.buyPrice).times(opportunity.quantity);
    if (positionSize.greaterThan(this.limits.maxPositionSizeUsdt)) {
      return {
        valid: false,
        reason: `Position size exceeds limit: ${positionSize.toString()} > ${this.limits.maxPositionSizeUsdt.toString()}`,
      };
    }

    // Check balance availability
    const buyExchange = opportunity.buyExchange;
    const buyAsset = this.getQuoteAsset(opportunity.symbol);
    const requiredBalance = positionSize;

    const hasBalance = await this.balanceManager.hasSufficientBalance(
      buyExchange,
      buyAsset,
      requiredBalance.toString(),
    );

    if (!hasBalance) {
      return {
        valid: false,
        reason: `Insufficient balance on ${buyExchange} for ${buyAsset}`,
      };
    }

    // Check sell side balance
    const sellExchange = opportunity.sellExchange;
    const sellAsset = this.getBaseAsset(opportunity.symbol);

    const hasSellBalance = await this.balanceManager.hasSufficientBalance(
      sellExchange,
      sellAsset,
      opportunity.quantity,
    );

    if (!hasSellBalance) {
      return {
        valid: false,
        reason: `Insufficient balance on ${sellExchange} for ${sellAsset}`,
      };
    }

    return { valid: true };
  }

  /**
   * Record trade result
   */
  public recordTrade(profit: string): void {
    const today = this.getTodayMetrics();
    const profitDecimal = new Decimal(profit);

    today.totalTrades++;

    if (profitDecimal.greaterThan(0)) {
      today.profitableTrades++;
      today.totalProfit = today.totalProfit.plus(profitDecimal);

      if (profitDecimal.greaterThan(today.largestWin)) {
        today.largestWin = profitDecimal;
      }

      // Reset drawdown on profit
      today.currentDrawdown = new Decimal(0);
    } else {
      today.losingTrades++;
      today.totalLoss = today.totalLoss.plus(profitDecimal.abs());

      if (profitDecimal.abs().greaterThan(today.largestLoss)) {
        today.largestLoss = profitDecimal.abs();
      }

      // Update drawdown
      today.currentDrawdown = today.currentDrawdown.plus(profitDecimal.abs());
      if (today.currentDrawdown.greaterThan(today.maxDrawdown)) {
        today.maxDrawdown = today.currentDrawdown;
      }
    }

    today.netProfit = today.totalProfit.minus(today.totalLoss);

    riskLogger.info('Trade recorded', {
      profit: profit,
      netProfitToday: today.netProfit.toString(),
      winRate: this.getWinRate().toFixed(2),
    });

    this.emit('tradeRecorded', { profit, metrics: today });

    // Check if we hit daily loss limit
    if (today.netProfit.lessThan(this.limits.maxDailyLossUsdt.negated())) {
      this.activateEmergencyStop('Daily loss limit exceeded');
    }
  }

  /**
   * Increment open orders count
   */
  public incrementOpenOrders(): void {
    this.openOrdersCount++;
    riskLogger.debug('Open orders incremented', { count: this.openOrdersCount });
  }

  /**
   * Decrement open orders count
   */
  public decrementOpenOrders(): void {
    this.openOrdersCount = Math.max(0, this.openOrdersCount - 1);
    riskLogger.debug('Open orders decremented', { count: this.openOrdersCount });
  }

  /**
   * Update position exposure
   */
  public updatePosition(symbol: string, exchange: ExchangeName, amount: Decimal): void {
    const key = `${exchange}:${symbol}`;
    this.currentPositions.set(key, amount);
  }

  /**
   * Get position risk
   */
  public getPositionRisk(symbol: string, exchange: ExchangeName): PositionRisk {
    const key = `${exchange}:${symbol}`;
    const currentExposure = this.currentPositions.get(key) || new Decimal(0);
    const maxExposure = this.limits.maxPositionSizeUsdt;
    const utilizationPercentage = currentExposure.dividedBy(maxExposure).times(100).toNumber();
    const isWithinLimit = currentExposure.lessThanOrEqualTo(maxExposure);

    return {
      symbol,
      exchange,
      currentExposure,
      maxExposure,
      utilizationPercentage,
      isWithinLimit,
    };
  }

  /**
   * Calculate current risk level
   */
  public getRiskLevel(): RiskLevel {
    const today = this.getTodayMetrics();

    // Check daily loss
    const lossRatio = today.netProfit.abs().dividedBy(this.limits.maxDailyLossUsdt);

    if (lossRatio.greaterThanOrEqualTo(1)) {
      return RiskLevel.CRITICAL;
    } else if (lossRatio.greaterThanOrEqualTo(0.75)) {
      return RiskLevel.HIGH;
    } else if (lossRatio.greaterThanOrEqualTo(0.5)) {
      return RiskLevel.MEDIUM;
    }

    return RiskLevel.LOW;
  }

  /**
   * Get win rate
   */
  public getWinRate(): number {
    const today = this.getTodayMetrics();

    if (today.totalTrades === 0) {
      return 0;
    }

    return (today.profitableTrades / today.totalTrades) * 100;
  }

  /**
   * Get today's metrics
   */
  public getTodayMetrics(): DailyRiskMetrics {
    this.initializeDailyMetrics();
    const today = new Date().toISOString().split('T')[0];
    return this.dailyMetrics.get(today)!;
  }

  /**
   * Get all daily metrics
   */
  public getAllMetrics(): DailyRiskMetrics[] {
    return Array.from(this.dailyMetrics.values());
  }

  /**
   * Activate emergency stop
   */
  public activateEmergencyStop(reason: string): void {
    this.emergencyStop = true;

    riskLogger.error('EMERGENCY STOP ACTIVATED', { reason });

    this.emit('emergencyStop', reason);
  }

  /**
   * Deactivate emergency stop
   */
  public deactivateEmergencyStop(): void {
    this.emergencyStop = false;

    riskLogger.warn('Emergency stop deactivated');

    this.emit('emergencyStopDeactivated');
  }

  /**
   * Check if emergency stop is active
   */
  public isEmergencyStopActive(): boolean {
    return this.emergencyStop;
  }

  /**
   * Update risk limits
   */
  public updateLimits(limits: Partial<RiskLimits>): void {
    if (limits.maxPositionSizeUsdt) {
      this.limits.maxPositionSizeUsdt = new Decimal(limits.maxPositionSizeUsdt);
    }
    if (limits.maxDailyLossUsdt) {
      this.limits.maxDailyLossUsdt = new Decimal(limits.maxDailyLossUsdt);
    }
    if (limits.maxOpenOrders !== undefined) {
      this.limits.maxOpenOrders = limits.maxOpenOrders;
    }
    if (limits.maxSlippagePercentage) {
      this.limits.maxSlippagePercentage = new Decimal(limits.maxSlippagePercentage);
    }

    riskLogger.info('Risk limits updated', {
      maxPositionSizeUsdt: this.limits.maxPositionSizeUsdt.toString(),
      maxDailyLossUsdt: this.limits.maxDailyLossUsdt.toString(),
      maxOpenOrders: this.limits.maxOpenOrders,
    });

    this.emit('limitsUpdated', this.limits);
  }

  /**
   * Get current risk limits
   */
  public getLimits(): RiskLimits {
    return { ...this.limits };
  }

  /**
   * Get risk statistics
   */
  public getStats() {
    const today = this.getTodayMetrics();
    const riskLevel = this.getRiskLevel();
    const winRate = this.getWinRate();

    return {
      emergencyStop: this.emergencyStop,
      riskLevel,
      openOrders: this.openOrdersCount,
      maxOpenOrders: this.limits.maxOpenOrders,
      today: {
        totalTrades: today.totalTrades,
        profitableTrades: today.profitableTrades,
        losingTrades: today.losingTrades,
        netProfit: today.netProfit.toFixed(2),
        winRate: winRate.toFixed(2),
        maxDrawdown: today.maxDrawdown.toFixed(2),
        currentDrawdown: today.currentDrawdown.toFixed(2),
      },
      limits: {
        maxPositionSizeUsdt: this.limits.maxPositionSizeUsdt.toString(),
        maxDailyLossUsdt: this.limits.maxDailyLossUsdt.toString(),
        maxOpenOrders: this.limits.maxOpenOrders,
      },
    };
  }

  /**
   * Helper to get base asset from symbol
   */
  private getBaseAsset(symbol: string): string {
    // Assuming symbols are in format BTCUSDT, ETHUSDT, etc.
    return symbol.replace('USDT', '').replace('TRY', '');
  }

  /**
   * Helper to get quote asset from symbol
   */
  private getQuoteAsset(symbol: string): string {
    // Assuming symbols are in format BTCUSDT, ETHUSDT, etc.
    if (symbol.includes('USDT')) return 'USDT';
    if (symbol.includes('TRY')) return 'TRY';
    return 'USDT';
  }

  /**
   * Reset daily metrics (for testing or new day)
   */
  public resetDailyMetrics(): void {
    const today = new Date().toISOString().split('T')[0];
    this.dailyMetrics.delete(today);
    this.initializeDailyMetrics();

    riskLogger.info('Daily metrics reset');
  }
}
