/**
 * Execution Engine
 * High-performance trade execution coordination
 */

import { EventEmitter } from 'events';
import { IExchange } from '../../exchanges/IExchange';
import { OrderManager } from '../order/OrderManager';
import { BalanceManager } from '../balance/BalanceManager';
import { RiskManager } from '../risk/RiskManager';
import { MakerTakerStrategy, StrategyConfig } from '../../strategies/MakerTakerStrategy';
import { ExchangeFactory } from '../../exchanges';
import { ExchangeName } from '../../types';
import { config } from '../../config';
import { TRADING_PAIRS } from '../../config/constants';
import { tradingLogger, systemLogger } from '../../utils/logger';

export interface ExecutionEngineConfig {
  symbols: string[];
  makerExchange: ExchangeName;
  takerExchange: ExchangeName;
  enableTrading: boolean;
  enablePaperTrading: boolean;
}

export interface EngineStats {
  isRunning: boolean;
  activeStrategies: number;
  totalStrategies: number;
  performance: {
    totalTrades: number;
    totalProfit: string;
    winRate: string;
  };
  risk: any;
}

export class ExecutionEngine extends EventEmitter {
  private orderManager: OrderManager;
  private balanceManager: BalanceManager;
  private riskManager: RiskManager;

  private strategies: Map<string, MakerTakerStrategy> = new Map();
  private isRunning = false;

  private engineConfig: ExecutionEngineConfig;

  constructor(
    orderManager: OrderManager,
    balanceManager: BalanceManager,
    riskManager: RiskManager,
  ) {
    super();

    this.orderManager = orderManager;
    this.balanceManager = balanceManager;
    this.riskManager = riskManager;

    // Default engine configuration
    this.engineConfig = {
      symbols: Array.from(new Set([
        ...TRADING_PAIRS.BINANCE,
        ...TRADING_PAIRS.BTCTURK,
      ])).filter(symbol =>
        TRADING_PAIRS.BINANCE.includes(symbol) &&
        TRADING_PAIRS.BTCTURK.includes(symbol)
      ),
      makerExchange: ExchangeName.BTCTURK,
      takerExchange: ExchangeName.BINANCE,
      enableTrading: config.trading.enableTrading,
      enablePaperTrading: config.trading.enablePaperTrading,
    };

    systemLogger.info('Execution Engine initialized', {
      symbols: this.engineConfig.symbols,
      makerExchange: this.engineConfig.makerExchange,
      takerExchange: this.engineConfig.takerExchange,
    });

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for risk and strategy events
   */
  private setupEventHandlers(): void {
    // Handle emergency stop
    this.riskManager.on('emergencyStop', (reason: string) => {
      systemLogger.error('Emergency stop triggered, halting all strategies', { reason });
      this.stopAll().catch(error => {
        systemLogger.error('Error stopping strategies on emergency stop:', error);
      });
      this.emit('emergencyStop', reason);
    });

    // Handle risk level changes
    this.riskManager.on('limitsUpdated', (limits: any) => {
      systemLogger.info('Risk limits updated', limits);
      this.emit('riskLimitsUpdated', limits);
    });

    // Handle trade recordings
    this.riskManager.on('tradeRecorded', (data: any) => {
      this.emit('tradeRecorded', data);
    });
  }

  /**
   * Start the execution engine
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      systemLogger.warn('Execution Engine is already running');
      return;
    }

    systemLogger.info('Starting Execution Engine...');

    // Check if trading is allowed
    const tradeCheck = this.riskManager.canTrade();
    if (!tradeCheck.allowed) {
      throw new Error(`Cannot start engine: ${tradeCheck.reason}`);
    }

    // Get exchange instances
    const makerExchange = ExchangeFactory.getExchange(this.engineConfig.makerExchange);
    const takerExchange = ExchangeFactory.getExchange(this.engineConfig.takerExchange);

    if (!makerExchange || !takerExchange) {
      throw new Error('Required exchanges not initialized');
    }

    // Create strategies for each symbol
    for (const symbol of this.engineConfig.symbols) {
      await this.createStrategy(symbol, makerExchange, takerExchange);
    }

    this.isRunning = true;

    systemLogger.info('Execution Engine started', {
      strategiesCount: this.strategies.size,
      symbols: this.engineConfig.symbols,
    });

    this.emit('engineStarted');
  }

  /**
   * Stop the execution engine
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    systemLogger.info('Stopping Execution Engine...');

    await this.stopAll();

    this.isRunning = false;

    systemLogger.info('Execution Engine stopped');

    this.emit('engineStopped');
  }

  /**
   * Stop all strategies
   */
  private async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.strategies.values()).map(strategy =>
      strategy.stop().catch(error => {
        systemLogger.error('Error stopping strategy:', error);
      })
    );

    await Promise.all(stopPromises);
    this.strategies.clear();
  }

  /**
   * Create and start a strategy for a symbol
   */
  private async createStrategy(
    symbol: string,
    makerExchange: IExchange,
    takerExchange: IExchange,
  ): Promise<void> {
    const strategyConfig: StrategyConfig = {
      symbol,
      makerExchange,
      takerExchange,
      orderManager: this.orderManager,
      balanceManager: this.balanceManager,
      minProfitPercentage: config.trading.minProfitPercentage,
      maxPositionSize: config.trading.maxPositionSizeUsdt,
      maxSlippagePercentage: config.trading.maxSlippagePercentage,
      makerOrderTimeout: 60000, // 60 seconds
    };

    const strategy = new MakerTakerStrategy(strategyConfig);

    // Setup strategy event handlers
    this.setupStrategyHandlers(strategy, symbol);

    // Start strategy
    await strategy.start();

    this.strategies.set(symbol, strategy);

    tradingLogger.info(`Strategy started for ${symbol}`);
  }

  /**
   * Setup event handlers for a strategy
   */
  private setupStrategyHandlers(strategy: MakerTakerStrategy, symbol: string): void {
    strategy.on('makerOrderPlaced', (order) => {
      tradingLogger.info(`Maker order placed for ${symbol}`, { orderId: order.id });
      this.riskManager.incrementOpenOrders();
      this.emit('makerOrderPlaced', { symbol, order });
    });

    strategy.on('makerOrderFilled', (order) => {
      tradingLogger.info(`Maker order filled for ${symbol}`, { orderId: order.id });
      this.emit('makerOrderFilled', { symbol, order });
    });

    strategy.on('takerOrderExecuted', (order) => {
      tradingLogger.info(`Taker order executed for ${symbol}`, { orderId: order.id });
      this.riskManager.decrementOpenOrders();
      this.emit('takerOrderExecuted', { symbol, order });
    });

    strategy.on('tradeCompleted', (execution) => {
      tradingLogger.info(`Trade completed for ${symbol}`, {
        profit: execution.profit,
        duration: execution.endTime! - execution.startTime,
      });

      // Record trade in risk manager
      if (execution.profit) {
        this.riskManager.recordTrade(execution.profit);
      }

      this.emit('tradeCompleted', { symbol, execution });
    });

    strategy.on('executionError', (error) => {
      tradingLogger.error(`Execution error for ${symbol}:`, error);
      this.riskManager.decrementOpenOrders();
      this.emit('executionError', { symbol, error });
    });

    strategy.on('paperTrade', (opportunity) => {
      tradingLogger.info(`Paper trade for ${symbol}`, opportunity);
      this.emit('paperTrade', { symbol, opportunity });
    });

    strategy.on('stateChanged', (newState, oldState) => {
      tradingLogger.debug(`Strategy state changed for ${symbol}`, {
        from: oldState,
        to: newState,
      });
      this.emit('strategyStateChanged', { symbol, newState, oldState });
    });
  }

  /**
   * Add a new symbol to trade
   */
  public async addSymbol(symbol: string): Promise<void> {
    if (this.strategies.has(symbol)) {
      throw new Error(`Strategy for ${symbol} already exists`);
    }

    const makerExchange = ExchangeFactory.getExchange(this.engineConfig.makerExchange);
    const takerExchange = ExchangeFactory.getExchange(this.engineConfig.takerExchange);

    if (!makerExchange || !takerExchange) {
      throw new Error('Required exchanges not initialized');
    }

    await this.createStrategy(symbol, makerExchange, takerExchange);

    systemLogger.info(`Added new symbol: ${symbol}`);

    this.emit('symbolAdded', symbol);
  }

  /**
   * Remove a symbol from trading
   */
  public async removeSymbol(symbol: string): Promise<void> {
    const strategy = this.strategies.get(symbol);

    if (!strategy) {
      throw new Error(`Strategy for ${symbol} not found`);
    }

    await strategy.stop();
    this.strategies.delete(symbol);

    systemLogger.info(`Removed symbol: ${symbol}`);

    this.emit('symbolRemoved', symbol);
  }

  /**
   * Get strategy for a symbol
   */
  public getStrategy(symbol: string): MakerTakerStrategy | undefined {
    return this.strategies.get(symbol);
  }

  /**
   * Get all active symbols
   */
  public getActiveSymbols(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get engine statistics
   */
  public getStats(): EngineStats {
    const strategies = Array.from(this.strategies.values());
    const activeStrategies = strategies.filter(s => s.getStats().isRunning).length;

    // Aggregate performance metrics
    let totalTrades = 0;
    let totalProfit = 0;
    let totalWinRate = 0;

    for (const strategy of strategies) {
      const stats = strategy.getStats();
      totalTrades += stats.totalTrades;
      totalProfit += parseFloat(stats.totalProfit);
      totalWinRate += parseFloat(stats.winRate);
    }

    const avgWinRate = strategies.length > 0 ? totalWinRate / strategies.length : 0;

    return {
      isRunning: this.isRunning,
      activeStrategies,
      totalStrategies: this.strategies.size,
      performance: {
        totalTrades,
        totalProfit: totalProfit.toFixed(2),
        winRate: avgWinRate.toFixed(2),
      },
      risk: this.riskManager.getStats(),
    };
  }

  /**
   * Get detailed statistics for all strategies
   */
  public getAllStrategyStats() {
    const stats: Record<string, any> = {};

    for (const [symbol, strategy] of this.strategies.entries()) {
      stats[symbol] = strategy.getStats();
    }

    return stats;
  }

  /**
   * Update engine configuration
   */
  public updateConfig(config: Partial<ExecutionEngineConfig>): void {
    this.engineConfig = {
      ...this.engineConfig,
      ...config,
    };

    systemLogger.info('Engine configuration updated', this.engineConfig);

    this.emit('configUpdated', this.engineConfig);
  }

  /**
   * Get current configuration
   */
  public getConfig(): ExecutionEngineConfig {
    return { ...this.engineConfig };
  }

  /**
   * Check if engine is running
   */
  public isEngineRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Pause trading (stop all strategies but keep engine running)
   */
  public async pause(): Promise<void> {
    systemLogger.info('Pausing trading...');

    for (const strategy of this.strategies.values()) {
      await strategy.stop();
    }

    systemLogger.info('Trading paused');

    this.emit('tradingPaused');
  }

  /**
   * Resume trading (restart all strategies)
   */
  public async resume(): Promise<void> {
    systemLogger.info('Resuming trading...');

    const makerExchange = ExchangeFactory.getExchange(this.engineConfig.makerExchange);
    const takerExchange = ExchangeFactory.getExchange(this.engineConfig.takerExchange);

    if (!makerExchange || !takerExchange) {
      throw new Error('Required exchanges not initialized');
    }

    for (const [symbol, strategy] of this.strategies.entries()) {
      await strategy.start();
    }

    systemLogger.info('Trading resumed');

    this.emit('tradingResumed');
  }
}
