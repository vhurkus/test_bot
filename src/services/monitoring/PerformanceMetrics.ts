/**
 * Performance Metrics Service
 * Tracks and calculates trading performance metrics
 */

import { EventEmitter } from 'events';
import Decimal from 'decimal.js';
import { tradingLogger } from '../../utils/logger';

export interface TradeMetric {
  timestamp: number;
  symbol: string;
  profit: Decimal;
  profitPercentage: Decimal;
  duration: number; // milliseconds
}

export interface DailyMetrics {
  date: string;
  totalTrades: number;
  profitableTrades: number;
  losingTrades: number;
  totalProfit: Decimal;
  totalLoss: Decimal;
  netProfit: Decimal;
  grossProfit: Decimal;
  totalFees: Decimal;
  averageProfit: Decimal;
  averageLoss: Decimal;
  largestWin: Decimal;
  largestLoss: Decimal;
  winRate: number;
  profitFactor: number;
  averageDuration: number;
}

export interface PerformanceSummary {
  totalTrades: number;
  profitableTrades: number;
  losingTrades: number;
  winRate: number;
  totalProfit: string;
  totalLoss: string;
  netProfit: string;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: string;
  maxDrawdownPercentage: number;
  currentDrawdown: string;
  averageProfit: string;
  averageLoss: string;
  largestWin: string;
  largestLoss: string;
  averageTradeDuration: number;
  tradesPerDay: number;
  roi: number;
}

export class PerformanceMetrics extends EventEmitter {
  private trades: TradeMetric[] = [];
  private dailyMetrics: Map<string, DailyMetrics> = new Map();
  private peakEquity = new Decimal(0);
  private currentEquity = new Decimal(0);
  private maxDrawdown = new Decimal(0);
  private startTime: number;

  constructor(initialEquity = 0) {
    super();
    this.currentEquity = new Decimal(initialEquity);
    this.peakEquity = new Decimal(initialEquity);
    this.startTime = Date.now();

    tradingLogger.info('Performance Metrics initialized', {
      initialEquity: initialEquity.toString(),
    });
  }

  /**
   * Record a trade
   */
  public recordTrade(
    symbol: string,
    profit: string,
    profitPercentage: string,
    duration: number,
  ): void {
    const profitDecimal = new Decimal(profit);
    const profitPctDecimal = new Decimal(profitPercentage);

    const trade: TradeMetric = {
      timestamp: Date.now(),
      symbol,
      profit: profitDecimal,
      profitPercentage: profitPctDecimal,
      duration,
    };

    this.trades.push(trade);

    // Update equity
    this.currentEquity = this.currentEquity.plus(profitDecimal);

    // Update peak equity and drawdown
    if (this.currentEquity.greaterThan(this.peakEquity)) {
      this.peakEquity = this.currentEquity;
    }

    const currentDrawdown = this.peakEquity.minus(this.currentEquity);
    if (currentDrawdown.greaterThan(this.maxDrawdown)) {
      this.maxDrawdown = currentDrawdown;
    }

    // Update daily metrics
    this.updateDailyMetrics(trade);

    tradingLogger.info('Trade recorded in performance metrics', {
      symbol,
      profit: profit,
      profitPercentage: profitPercentage,
      equity: this.currentEquity.toFixed(2),
    });

    this.emit('tradeRecorded', trade);
  }

  /**
   * Update daily metrics
   */
  private updateDailyMetrics(trade: TradeMetric): void {
    const date = new Date(trade.timestamp).toISOString().split('T')[0];

    if (!this.dailyMetrics.has(date)) {
      this.dailyMetrics.set(date, {
        date,
        totalTrades: 0,
        profitableTrades: 0,
        losingTrades: 0,
        totalProfit: new Decimal(0),
        totalLoss: new Decimal(0),
        netProfit: new Decimal(0),
        grossProfit: new Decimal(0),
        totalFees: new Decimal(0),
        averageProfit: new Decimal(0),
        averageLoss: new Decimal(0),
        largestWin: new Decimal(0),
        largestLoss: new Decimal(0),
        winRate: 0,
        profitFactor: 0,
        averageDuration: 0,
      });
    }

    const daily = this.dailyMetrics.get(date)!;
    daily.totalTrades++;

    if (trade.profit.greaterThan(0)) {
      daily.profitableTrades++;
      daily.totalProfit = daily.totalProfit.plus(trade.profit);
      if (trade.profit.greaterThan(daily.largestWin)) {
        daily.largestWin = trade.profit;
      }
    } else {
      daily.losingTrades++;
      daily.totalLoss = daily.totalLoss.plus(trade.profit.abs());
      if (trade.profit.abs().greaterThan(daily.largestLoss)) {
        daily.largestLoss = trade.profit.abs();
      }
    }

    daily.netProfit = daily.totalProfit.minus(daily.totalLoss);
    daily.winRate = (daily.profitableTrades / daily.totalTrades) * 100;

    // Calculate profit factor
    if (daily.totalLoss.greaterThan(0)) {
      daily.profitFactor = daily.totalProfit.dividedBy(daily.totalLoss).toNumber();
    } else {
      daily.profitFactor = daily.totalProfit.greaterThan(0) ? Infinity : 0;
    }

    // Calculate averages
    if (daily.profitableTrades > 0) {
      daily.averageProfit = daily.totalProfit.dividedBy(daily.profitableTrades);
    }
    if (daily.losingTrades > 0) {
      daily.averageLoss = daily.totalLoss.dividedBy(daily.losingTrades);
    }

    // Calculate average duration
    const todayTrades = this.trades.filter(
      (t) => new Date(t.timestamp).toISOString().split('T')[0] === date,
    );
    const totalDuration = todayTrades.reduce((sum, t) => sum + t.duration, 0);
    daily.averageDuration = totalDuration / todayTrades.length;
  }

  /**
   * Calculate Sharpe Ratio
   */
  public calculateSharpeRatio(riskFreeRate = 0.02): number {
    if (this.trades.length < 2) {
      return 0;
    }

    // Calculate returns
    const returns = this.trades.map((t) => t.profitPercentage.dividedBy(100).toNumber());

    // Calculate average return
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Calculate standard deviation
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
      return 0;
    }

    // Annualized Sharpe Ratio (assuming 365 trading days)
    const excessReturn = avgReturn - riskFreeRate / 365;
    const sharpeRatio = (excessReturn / stdDev) * Math.sqrt(365);

    return sharpeRatio;
  }

  /**
   * Calculate Maximum Drawdown
   */
  public getMaxDrawdown(): { amount: string; percentage: number } {
    const percentage = this.peakEquity.greaterThan(0)
      ? this.maxDrawdown.dividedBy(this.peakEquity).times(100).toNumber()
      : 0;

    return {
      amount: this.maxDrawdown.toFixed(2),
      percentage,
    };
  }

  /**
   * Calculate Current Drawdown
   */
  public getCurrentDrawdown(): { amount: string; percentage: number } {
    const currentDrawdown = this.peakEquity.minus(this.currentEquity);
    const percentage = this.peakEquity.greaterThan(0)
      ? currentDrawdown.dividedBy(this.peakEquity).times(100).toNumber()
      : 0;

    return {
      amount: currentDrawdown.toFixed(2),
      percentage,
    };
  }

  /**
   * Get win rate
   */
  public getWinRate(): number {
    if (this.trades.length === 0) {
      return 0;
    }

    const profitableTrades = this.trades.filter((t) => t.profit.greaterThan(0)).length;
    return (profitableTrades / this.trades.length) * 100;
  }

  /**
   * Calculate Profit Factor
   */
  public getProfitFactor(): number {
    const totalProfit = this.trades
      .filter((t) => t.profit.greaterThan(0))
      .reduce((sum, t) => sum.plus(t.profit), new Decimal(0));

    const totalLoss = this.trades
      .filter((t) => t.profit.lessThan(0))
      .reduce((sum, t) => sum.plus(t.profit.abs()), new Decimal(0));

    if (totalLoss.equals(0)) {
      return totalProfit.greaterThan(0) ? Infinity : 0;
    }

    return totalProfit.dividedBy(totalLoss).toNumber();
  }

  /**
   * Get average trade duration
   */
  public getAverageTradeDuration(): number {
    if (this.trades.length === 0) {
      return 0;
    }

    const totalDuration = this.trades.reduce((sum, t) => sum + t.duration, 0);
    return totalDuration / this.trades.length;
  }

  /**
   * Get trades per day
   */
  public getTradesPerDay(): number {
    if (this.trades.length === 0) {
      return 0;
    }

    const daysRunning = (Date.now() - this.startTime) / (1000 * 60 * 60 * 24);
    return this.trades.length / Math.max(daysRunning, 1);
  }

  /**
   * Get ROI (Return on Investment)
   */
  public getROI(initialInvestment: number): number {
    if (initialInvestment === 0) {
      return 0;
    }

    const netProfit = this.getTotalProfit();
    return (parseFloat(netProfit) / initialInvestment) * 100;
  }

  /**
   * Get total profit
   */
  public getTotalProfit(): string {
    const profit = this.trades.reduce((sum, t) => sum.plus(t.profit), new Decimal(0));
    return profit.toFixed(2);
  }

  /**
   * Get total loss
   */
  public getTotalLoss(): string {
    const loss = this.trades
      .filter((t) => t.profit.lessThan(0))
      .reduce((sum, t) => sum.plus(t.profit.abs()), new Decimal(0));
    return loss.toFixed(2);
  }

  /**
   * Get net profit
   */
  public getNetProfit(): string {
    const totalProfit = new Decimal(this.getTotalProfit());
    const totalLoss = new Decimal(this.getTotalLoss());
    return totalProfit.minus(totalLoss).toFixed(2);
  }

  /**
   * Get average profit
   */
  public getAverageProfit(): string {
    const profitableTrades = this.trades.filter((t) => t.profit.greaterThan(0));

    if (profitableTrades.length === 0) {
      return '0.00';
    }

    const totalProfit = profitableTrades.reduce((sum, t) => sum.plus(t.profit), new Decimal(0));
    return totalProfit.dividedBy(profitableTrades.length).toFixed(2);
  }

  /**
   * Get average loss
   */
  public getAverageLoss(): string {
    const losingTrades = this.trades.filter((t) => t.profit.lessThan(0));

    if (losingTrades.length === 0) {
      return '0.00';
    }

    const totalLoss = losingTrades.reduce((sum, t) => sum.plus(t.profit.abs()), new Decimal(0));
    return totalLoss.dividedBy(losingTrades.length).toFixed(2);
  }

  /**
   * Get largest win
   */
  public getLargestWin(): string {
    if (this.trades.length === 0) {
      return '0.00';
    }

    const largestWin = this.trades
      .filter((t) => t.profit.greaterThan(0))
      .reduce((max, t) => (t.profit.greaterThan(max) ? t.profit : max), new Decimal(0));

    return largestWin.toFixed(2);
  }

  /**
   * Get largest loss
   */
  public getLargestLoss(): string {
    if (this.trades.length === 0) {
      return '0.00';
    }

    const largestLoss = this.trades
      .filter((t) => t.profit.lessThan(0))
      .reduce((max, t) => (t.profit.abs().greaterThan(max) ? t.profit.abs() : max), new Decimal(0));

    return largestLoss.toFixed(2);
  }

  /**
   * Get performance summary
   */
  public getSummary(initialInvestment = 0): PerformanceSummary {
    const profitableTrades = this.trades.filter((t) => t.profit.greaterThan(0)).length;
    const losingTrades = this.trades.filter((t) => t.profit.lessThan(0)).length;
    const maxDrawdown = this.getMaxDrawdown();
    const currentDrawdown = this.getCurrentDrawdown();

    return {
      totalTrades: this.trades.length,
      profitableTrades,
      losingTrades,
      winRate: this.getWinRate(),
      totalProfit: this.getTotalProfit(),
      totalLoss: this.getTotalLoss(),
      netProfit: this.getNetProfit(),
      profitFactor: this.getProfitFactor(),
      sharpeRatio: this.calculateSharpeRatio(),
      maxDrawdown: maxDrawdown.amount,
      maxDrawdownPercentage: maxDrawdown.percentage,
      currentDrawdown: currentDrawdown.amount,
      averageProfit: this.getAverageProfit(),
      averageLoss: this.getAverageLoss(),
      largestWin: this.getLargestWin(),
      largestLoss: this.getLargestLoss(),
      averageTradeDuration: this.getAverageTradeDuration(),
      tradesPerDay: this.getTradesPerDay(),
      roi: this.getROI(initialInvestment),
    };
  }

  /**
   * Get daily metrics
   */
  public getDailyMetrics(date?: string): DailyMetrics | null {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.dailyMetrics.get(targetDate) || null;
  }

  /**
   * Get all daily metrics
   */
  public getAllDailyMetrics(): DailyMetrics[] {
    return Array.from(this.dailyMetrics.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }

  /**
   * Get recent trades
   */
  public getRecentTrades(limit = 10): TradeMetric[] {
    return this.trades.slice(-limit);
  }

  /**
   * Get trades by symbol
   */
  public getTradesBySymbol(symbol: string): TradeMetric[] {
    return this.trades.filter((t) => t.symbol === symbol);
  }

  /**
   * Get trades in date range
   */
  public getTradesInRange(startDate: Date, endDate: Date): TradeMetric[] {
    return this.trades.filter(
      (t) => t.timestamp >= startDate.getTime() && t.timestamp <= endDate.getTime(),
    );
  }

  /**
   * Reset metrics
   */
  public reset(initialEquity = 0): void {
    this.trades = [];
    this.dailyMetrics.clear();
    this.currentEquity = new Decimal(initialEquity);
    this.peakEquity = new Decimal(initialEquity);
    this.maxDrawdown = new Decimal(0);
    this.startTime = Date.now();

    tradingLogger.info('Performance metrics reset', {
      initialEquity: initialEquity.toString(),
    });

    this.emit('metricsReset');
  }

  /**
   * Get current equity
   */
  public getCurrentEquity(): string {
    return this.currentEquity.toFixed(2);
  }

  /**
   * Get peak equity
   */
  public getPeakEquity(): string {
    return this.peakEquity.toFixed(2);
  }
}
