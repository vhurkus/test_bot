/**
 * Maker-Taker Arbitrage Strategy
 * Places maker orders on BTCTurk, taker orders on Binance
 */

import { EventEmitter } from 'events';
import { IExchange } from '../exchanges/IExchange';
import { OrderManager } from '../services/order/OrderManager';
import { BalanceManager } from '../services/balance/BalanceManager';
import { OrderbookAnalyzer } from '../services/orderbook/OrderbookAnalyzer';
import { ArbitrageCalculator } from '../services/arbitrage/ArbitrageCalculator';
import {
  Orderbook,
  Order,
  OrderSide,
  OrderType,
  OrderStatus,
  ExchangeName,
  ArbitrageOpportunity,
} from '../types';
import { config } from '../config';
import { tradingLogger, logTrade } from '../utils/logger';
import Decimal from 'decimal.js';

export enum StrategyState {
  IDLE = 'IDLE',
  SCANNING = 'SCANNING',
  PLACING_MAKER = 'PLACING_MAKER',
  WAITING_MAKER_FILL = 'WAITING_MAKER_FILL',
  EXECUTING_TAKER = 'EXECUTING_TAKER',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface StrategyConfig {
  symbol: string;
  makerExchange: IExchange;
  takerExchange: IExchange;
  orderManager: OrderManager;
  balanceManager: BalanceManager;
  minProfitPercentage: number;
  maxPositionSize: number;
  maxSlippagePercentage: number;
  makerOrderTimeout: number; // milliseconds to wait for maker fill
}

export interface TradeExecution {
  id: string;
  symbol: string;
  makerOrder: Order | null;
  takerOrder: Order | null;
  opportunity: ArbitrageOpportunity;
  state: StrategyState;
  startTime: number;
  endTime: number | null;
  profit: string | null;
  error: string | null;
}

export class MakerTakerStrategy extends EventEmitter {
  private config: StrategyConfig;
  private orderbookAnalyzer: OrderbookAnalyzer;
  private arbitrageCalculator: ArbitrageCalculator;

  private makerOrderbook: Orderbook | null = null;
  private takerOrderbook: Orderbook | null = null;

  private currentExecution: TradeExecution | null = null;
  private state: StrategyState = StrategyState.IDLE;

  private scanInterval: NodeJS.Timeout | null = null;
  private makerFillCheckInterval: NodeJS.Timeout | null = null;

  private executionHistory: TradeExecution[] = [];
  private isRunning = false;

  constructor(config: StrategyConfig) {
    super();
    this.config = config;
    this.orderbookAnalyzer = new OrderbookAnalyzer();
    this.arbitrageCalculator = new ArbitrageCalculator();
  }

  /**
   * Start the strategy
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      tradingLogger.warn('Strategy is already running');
      return;
    }

    tradingLogger.info('Starting Maker-Taker Strategy', {
      symbol: this.config.symbol,
      makerExchange: this.config.makerExchange.name,
      takerExchange: this.config.takerExchange.name,
    });

    // Subscribe to orderbooks
    await this.subscribeOrderbooks();

    // Start scanning for opportunities
    this.startScanning();

    this.isRunning = true;
    this.setState(StrategyState.SCANNING);

    tradingLogger.info('Maker-Taker Strategy started');
  }

  /**
   * Stop the strategy
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    tradingLogger.info('Stopping Maker-Taker Strategy');

    // Stop scanning
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    if (this.makerFillCheckInterval) {
      clearInterval(this.makerFillCheckInterval);
      this.makerFillCheckInterval = null;
    }

    // Unsubscribe from orderbooks
    await this.unsubscribeOrderbooks();

    // Cancel any pending maker orders
    if (this.currentExecution?.makerOrder?.status === OrderStatus.OPEN) {
      try {
        await this.config.orderManager.cancelOrder(
          this.config.makerExchange,
          this.currentExecution.makerOrder.symbol,
          this.currentExecution.makerOrder.id,
        );
      } catch (error) {
        tradingLogger.error('Error cancelling maker order during stop:', error);
      }
    }

    this.isRunning = false;
    this.setState(StrategyState.IDLE);

    tradingLogger.info('Maker-Taker Strategy stopped');
  }

  /**
   * Subscribe to orderbooks
   */
  private async subscribeOrderbooks(): Promise<void> {
    await this.config.makerExchange.subscribeOrderbook(
      this.config.symbol,
      (orderbook) => {
        this.makerOrderbook = orderbook;
      },
    );

    await this.config.takerExchange.subscribeOrderbook(
      this.config.symbol,
      (orderbook) => {
        this.takerOrderbook = orderbook;
      },
    );

    tradingLogger.info('Subscribed to orderbooks', {
      symbol: this.config.symbol,
    });
  }

  /**
   * Unsubscribe from orderbooks
   */
  private async unsubscribeOrderbooks(): Promise<void> {
    await this.config.makerExchange.unsubscribeOrderbook(this.config.symbol);
    await this.config.takerExchange.unsubscribeOrderbook(this.config.symbol);

    tradingLogger.info('Unsubscribed from orderbooks');
  }

  /**
   * Start scanning for opportunities
   */
  private startScanning(): void {
    this.scanInterval = setInterval(() => {
      this.scanForOpportunities().catch((error) => {
        tradingLogger.error('Error scanning for opportunities:', error);
      });
    }, config.performance.profitCalculationInterval);
  }

  /**
   * Scan for arbitrage opportunities
   */
  private async scanForOpportunities(): Promise<void> {
    // Only scan if idle
    if (this.state !== StrategyState.SCANNING) {
      return;
    }

    if (!this.makerOrderbook || !this.takerOrderbook) {
      return;
    }

    // Find opportunity
    const opportunity = this.arbitrageCalculator.findOpportunity(
      this.takerOrderbook,
      this.makerOrderbook,
      this.config.maxPositionSize.toString(),
      this.config.maxSlippagePercentage.toString(),
    );

    if (!opportunity) {
      return;
    }

    // Validate opportunity
    if (!this.arbitrageCalculator.validateOpportunity(opportunity)) {
      return;
    }

    // Score opportunity
    const scored = this.arbitrageCalculator.scoreOpportunity(
      opportunity,
      this.takerOrderbook,
      this.makerOrderbook,
    );

    tradingLogger.info('Arbitrage opportunity found', {
      opportunity,
      score: scored.score,
      reasons: scored.reasons,
    });

    // Execute if score is high enough
    if (scored.score >= 60) {
      await this.executeOpportunity(opportunity);
    }
  }

  /**
   * Execute arbitrage opportunity
   */
  private async executeOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    // Check if paper trading mode
    if (config.trading.enablePaperTrading && !config.trading.enableTrading) {
      tradingLogger.info('Paper trading mode: Would execute opportunity', opportunity);
      this.emit('paperTrade', opportunity);
      return;
    }

    // Check if trading is enabled
    if (!config.trading.enableTrading) {
      tradingLogger.warn('Trading is disabled');
      return;
    }

    // Create execution record
    this.currentExecution = {
      id: `${Date.now()}-${opportunity.symbol}`,
      symbol: opportunity.symbol,
      makerOrder: null,
      takerOrder: null,
      opportunity,
      state: StrategyState.PLACING_MAKER,
      startTime: Date.now(),
      endTime: null,
      profit: null,
      error: null,
    };

    this.setState(StrategyState.PLACING_MAKER);

    try {
      // Step 1: Place maker order on maker exchange
      await this.placeMakerOrder(opportunity);

      // Step 2: Wait for maker order to fill (or timeout)
      await this.waitForMakerFill();

      // Step 3: Execute taker order on taker exchange
      await this.executeTakerOrder();

      // Step 4: Complete execution
      await this.completeExecution();
    } catch (error) {
      await this.handleExecutionError(error as Error);
    }
  }

  /**
   * Place maker order
   */
  private async placeMakerOrder(opportunity: ArbitrageOpportunity): Promise<void> {
    tradingLogger.info('Placing maker order', {
      exchange: this.config.makerExchange.name,
      symbol: opportunity.symbol,
      side: opportunity.buyExchange === this.config.makerExchange.name ? OrderSide.BUY : OrderSide.SELL,
      price: opportunity.buyExchange === this.config.makerExchange.name ? opportunity.buyPrice : opportunity.sellPrice,
      quantity: opportunity.quantity,
    });

    const side = opportunity.buyExchange === this.config.makerExchange.name ? OrderSide.BUY : OrderSide.SELL;
    const price = opportunity.buyExchange === this.config.makerExchange.name ? opportunity.buyPrice : opportunity.sellPrice;

    // Adjust price to be slightly more competitive
    const adjustedPrice = this.adjustMakerPrice(price, side);

    const order = await this.config.orderManager.placeOrder(this.config.makerExchange, {
      symbol: opportunity.symbol,
      side,
      type: OrderType.LIMIT,
      quantity: opportunity.quantity,
      price: adjustedPrice,
      timeInForce: 'GTC',
    });

    if (this.currentExecution) {
      this.currentExecution.makerOrder = order;
    }

    tradingLogger.info('Maker order placed', {
      orderId: order.id,
      price: adjustedPrice,
    });

    this.emit('makerOrderPlaced', order);
  }

  /**
   * Adjust maker price to be more competitive
   */
  private adjustMakerPrice(price: string, side: OrderSide): string {
    const priceDecimal = new Decimal(price);
    const adjustment = new Decimal(0.0001); // 0.01% adjustment

    if (side === OrderSide.BUY) {
      // Slightly higher buy price for faster fill
      return priceDecimal.times(new Decimal(1).plus(adjustment)).toFixed(8);
    } else {
      // Slightly lower sell price for faster fill
      return priceDecimal.times(new Decimal(1).minus(adjustment)).toFixed(8);
    }
  }

  /**
   * Wait for maker order to fill
   */
  private async waitForMakerFill(): Promise<void> {
    this.setState(StrategyState.WAITING_MAKER_FILL);

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timeout = this.config.makerOrderTimeout;

      this.makerFillCheckInterval = setInterval(async () => {
        if (!this.currentExecution?.makerOrder) {
          clearInterval(this.makerFillCheckInterval!);
          reject(new Error('No maker order found'));
          return;
        }

        try {
          const order = await this.config.orderManager.getOrderStatus(
            this.config.makerExchange,
            this.currentExecution.makerOrder.symbol,
            this.currentExecution.makerOrder.id,
          );

          if (order.status === OrderStatus.FILLED) {
            clearInterval(this.makerFillCheckInterval!);
            this.currentExecution.makerOrder = order;
            tradingLogger.info('Maker order filled', {
              orderId: order.id,
              filledQuantity: order.filledQuantity,
            });
            this.emit('makerOrderFilled', order);
            resolve();
          } else if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REJECTED) {
            clearInterval(this.makerFillCheckInterval!);
            reject(new Error(`Maker order ${order.status}`));
          } else if (Date.now() - startTime > timeout) {
            clearInterval(this.makerFillCheckInterval!);
            tradingLogger.warn('Maker order timeout, cancelling', {
              orderId: order.id,
            });
            await this.config.orderManager.cancelOrder(
              this.config.makerExchange,
              order.symbol,
              order.id,
            );
            reject(new Error('Maker order timeout'));
          }
        } catch (error) {
          clearInterval(this.makerFillCheckInterval!);
          reject(error);
        }
      }, 500); // Check every 500ms
    });
  }

  /**
   * Execute taker order
   */
  private async executeTakerOrder(): Promise<void> {
    this.setState(StrategyState.EXECUTING_TAKER);

    if (!this.currentExecution?.makerOrder || !this.currentExecution.opportunity) {
      throw new Error('No maker order or opportunity found');
    }

    const opportunity = this.currentExecution.opportunity;
    const side = opportunity.buyExchange === this.config.takerExchange.name ? OrderSide.BUY : OrderSide.SELL;
    const quantity = this.currentExecution.makerOrder.filledQuantity;

    tradingLogger.info('Executing taker order', {
      exchange: this.config.takerExchange.name,
      symbol: opportunity.symbol,
      side,
      quantity,
    });

    const order = await this.config.orderManager.placeOrder(this.config.takerExchange, {
      symbol: opportunity.symbol,
      side,
      type: OrderType.MARKET,
      quantity,
    });

    if (this.currentExecution) {
      this.currentExecution.takerOrder = order;
    }

    tradingLogger.info('Taker order executed', {
      orderId: order.id,
      filledQuantity: order.filledQuantity,
    });

    this.emit('takerOrderExecuted', order);
  }

  /**
   * Complete execution
   */
  private async completeExecution(): Promise<void> {
    this.setState(StrategyState.COMPLETED);

    if (!this.currentExecution) {
      return;
    }

    this.currentExecution.endTime = Date.now();

    // Calculate actual profit
    if (this.currentExecution.makerOrder && this.currentExecution.takerOrder) {
      const profitCalc = this.arbitrageCalculator.calculateProfit(
        this.currentExecution.opportunity.buyExchange,
        this.currentExecution.opportunity.sellExchange,
        this.currentExecution.makerOrder.price,
        this.currentExecution.takerOrder.price,
        this.currentExecution.makerOrder.filledQuantity,
        true, // maker order
        false, // taker order
      );

      this.currentExecution.profit = profitCalc.netProfit;

      tradingLogger.info('Trade execution completed', {
        executionId: this.currentExecution.id,
        profit: profitCalc.netProfit,
        profitPercentage: profitCalc.profitPercentage,
        duration: this.currentExecution.endTime - this.currentExecution.startTime,
      });

      logTrade({
        type: 'ARBITRAGE',
        exchange: 'MULTI',
        symbol: this.currentExecution.symbol,
        price: this.currentExecution.makerOrder.price,
        quantity: this.currentExecution.makerOrder.filledQuantity,
        profit: profitCalc.netProfit,
        profitPercentage: profitCalc.profitPercentage,
        buyExchange: this.currentExecution.opportunity.buyExchange,
        sellExchange: this.currentExecution.opportunity.sellExchange,
      });

      this.emit('tradeCompleted', this.currentExecution);
    }

    // Move to history
    this.executionHistory.push(this.currentExecution);
    this.currentExecution = null;

    // Back to scanning
    this.setState(StrategyState.SCANNING);
  }

  /**
   * Handle execution error
   */
  private async handleExecutionError(error: Error): Promise<void> {
    this.setState(StrategyState.ERROR);

    tradingLogger.error('Execution error:', error);

    if (this.currentExecution) {
      this.currentExecution.error = error.message;
      this.currentExecution.endTime = Date.now();
      this.executionHistory.push(this.currentExecution);
    }

    this.emit('executionError', error);

    // Clean up
    this.currentExecution = null;

    // Back to scanning
    this.setState(StrategyState.SCANNING);
  }

  /**
   * Set strategy state
   */
  private setState(state: StrategyState): void {
    const oldState = this.state;
    this.state = state;

    tradingLogger.debug('Strategy state changed', {
      from: oldState,
      to: state,
    });

    this.emit('stateChanged', state, oldState);
  }

  /**
   * Get strategy statistics
   */
  public getStats() {
    const completedTrades = this.executionHistory.filter(
      (e) => e.state === StrategyState.COMPLETED && e.profit,
    );

    const totalProfit = completedTrades.reduce(
      (sum, e) => sum.plus(e.profit || '0'),
      new Decimal(0),
    );

    const avgProfit = completedTrades.length > 0
      ? totalProfit.dividedBy(completedTrades.length)
      : new Decimal(0);

    const winningTrades = completedTrades.filter((e) =>
      new Decimal(e.profit || '0').greaterThan(0),
    );

    const winRate = completedTrades.length > 0
      ? (winningTrades.length / completedTrades.length) * 100
      : 0;

    return {
      state: this.state,
      isRunning: this.isRunning,
      totalTrades: this.executionHistory.length,
      completedTrades: completedTrades.length,
      totalProfit: totalProfit.toFixed(2),
      avgProfit: avgProfit.toFixed(2),
      winRate: winRate.toFixed(2),
      currentExecution: this.currentExecution,
    };
  }
}
