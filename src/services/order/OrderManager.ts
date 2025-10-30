/**
 * Order Manager Service
 * Manages the complete lifecycle of orders across exchanges
 */

import { IExchange, PlaceOrderParams } from '../../exchanges/IExchange';
import { Order, OrderStatus, ExchangeName } from '../../types';
import { tradingLogger, logError } from '../../utils/logger';
import { OrderError, ErrorCode } from '../../utils/errors';
import { EventEmitter } from 'events';
import Decimal from 'decimal.js';

export interface OrderTrackingInfo {
  order: Order;
  exchange: IExchange;
  startTime: number;
  lastUpdateTime: number;
  checkCount: number;
}

export class OrderManager extends EventEmitter {
  private activeOrders: Map<string, OrderTrackingInfo> = new Map();
  private orderHistory: Order[] = [];
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 1000; // 1 second
  private readonly MAX_ORDER_AGE_MS = 300000; // 5 minutes

  constructor() {
    super();
  }

  /**
   * Start order monitoring
   */
  public start(): void {
    if (this.checkInterval) {
      return;
    }

    tradingLogger.info('Starting Order Manager...');

    this.checkInterval = setInterval(() => {
      this.checkActiveOrders().catch((error) => {
        logError(error, { category: 'ORDER_MANAGER', operation: 'checkActiveOrders' });
      });
    }, this.CHECK_INTERVAL_MS);

    tradingLogger.info('Order Manager started');
  }

  /**
   * Stop order monitoring
   */
  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      tradingLogger.info('Order Manager stopped');
    }
  }

  /**
   * Place a new order and start tracking it
   */
  public async placeOrder(
    exchange: IExchange,
    params: PlaceOrderParams,
  ): Promise<Order> {
    try {
      tradingLogger.info('Placing order:', {
        exchange: exchange.name,
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        quantity: params.quantity,
        price: params.price,
      });

      const order = await exchange.placeOrder(params);

      // Track the order
      this.trackOrder(order, exchange);

      tradingLogger.info('Order placed successfully:', {
        orderId: order.id,
        exchange: exchange.name,
        symbol: order.symbol,
      });

      this.emit('orderPlaced', order);

      return order;
    } catch (error) {
      logError(error as Error, {
        category: 'ORDER_MANAGER',
        operation: 'placeOrder',
        exchange: exchange.name,
        params,
      });
      throw error;
    }
  }

  /**
   * Cancel an order
   */
  public async cancelOrder(
    exchange: IExchange,
    symbol: string,
    orderId: string,
  ): Promise<void> {
    try {
      tradingLogger.info('Cancelling order:', {
        exchange: exchange.name,
        symbol,
        orderId,
      });

      await exchange.cancelOrder(symbol, orderId);

      // Update tracking info
      const trackingKey = this.getTrackingKey(exchange.name, orderId);
      const trackingInfo = this.activeOrders.get(trackingKey);

      if (trackingInfo) {
        trackingInfo.order.status = OrderStatus.CANCELLED;
        this.moveToHistory(trackingKey, trackingInfo.order);
      }

      tradingLogger.info('Order cancelled successfully:', {
        orderId,
        exchange: exchange.name,
      });

      this.emit('orderCancelled', orderId, exchange.name);
    } catch (error) {
      logError(error as Error, {
        category: 'ORDER_MANAGER',
        operation: 'cancelOrder',
        exchange: exchange.name,
        symbol,
        orderId,
      });
      throw error;
    }
  }

  /**
   * Get order status
   */
  public async getOrderStatus(
    exchange: IExchange,
    symbol: string,
    orderId: string,
  ): Promise<Order> {
    try {
      const order = await exchange.getOrder(symbol, orderId);

      // Update tracking info if exists
      const trackingKey = this.getTrackingKey(exchange.name, orderId);
      const trackingInfo = this.activeOrders.get(trackingKey);

      if (trackingInfo) {
        trackingInfo.order = order;
        trackingInfo.lastUpdateTime = Date.now();
        trackingInfo.checkCount++;

        // Check if order is complete
        if (this.isOrderComplete(order)) {
          this.moveToHistory(trackingKey, order);
        }
      }

      return order;
    } catch (error) {
      logError(error as Error, {
        category: 'ORDER_MANAGER',
        operation: 'getOrderStatus',
        exchange: exchange.name,
        symbol,
        orderId,
      });
      throw error;
    }
  }

  /**
   * Track an order
   */
  private trackOrder(order: Order, exchange: IExchange): void {
    const trackingKey = this.getTrackingKey(exchange.name, order.id);

    const trackingInfo: OrderTrackingInfo = {
      order,
      exchange,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      checkCount: 0,
    };

    this.activeOrders.set(trackingKey, trackingInfo);

    tradingLogger.debug('Tracking order:', {
      orderId: order.id,
      exchange: exchange.name,
      symbol: order.symbol,
    });
  }

  /**
   * Check all active orders
   */
  private async checkActiveOrders(): Promise<void> {
    const now = Date.now();

    for (const [trackingKey, trackingInfo] of this.activeOrders.entries()) {
      try {
        // Check if order is too old
        if (now - trackingInfo.startTime > this.MAX_ORDER_AGE_MS) {
          tradingLogger.warn('Order exceeded maximum age:', {
            orderId: trackingInfo.order.id,
            exchange: trackingInfo.exchange.name,
            ageMs: now - trackingInfo.startTime,
          });

          this.emit('orderTimeout', trackingInfo.order);
          this.moveToHistory(trackingKey, trackingInfo.order);
          continue;
        }

        // Update order status
        const updatedOrder = await trackingInfo.exchange.getOrder(
          trackingInfo.order.symbol,
          trackingInfo.order.id,
        );

        // Check for status changes
        if (updatedOrder.status !== trackingInfo.order.status) {
          tradingLogger.info('Order status changed:', {
            orderId: updatedOrder.id,
            oldStatus: trackingInfo.order.status,
            newStatus: updatedOrder.status,
            exchange: trackingInfo.exchange.name,
          });

          this.emit('orderStatusChanged', updatedOrder, trackingInfo.order.status);
        }

        // Check for partial fills
        const oldFilled = new Decimal(trackingInfo.order.filledQuantity);
        const newFilled = new Decimal(updatedOrder.filledQuantity);

        if (newFilled.greaterThan(oldFilled)) {
          const filledAmount = newFilled.minus(oldFilled).toString();

          tradingLogger.info('Order partially filled:', {
            orderId: updatedOrder.id,
            filledAmount,
            totalFilled: updatedOrder.filledQuantity,
            totalQuantity: updatedOrder.quantity,
            exchange: trackingInfo.exchange.name,
          });

          this.emit('orderPartiallyFilled', updatedOrder, filledAmount);
        }

        // Update tracking info
        trackingInfo.order = updatedOrder;
        trackingInfo.lastUpdateTime = now;
        trackingInfo.checkCount++;

        // Move to history if complete
        if (this.isOrderComplete(updatedOrder)) {
          tradingLogger.info('Order completed:', {
            orderId: updatedOrder.id,
            status: updatedOrder.status,
            filledQuantity: updatedOrder.filledQuantity,
            exchange: trackingInfo.exchange.name,
          });

          this.emit('orderCompleted', updatedOrder);
          this.moveToHistory(trackingKey, updatedOrder);
        }
      } catch (error) {
        logError(error as Error, {
          category: 'ORDER_MANAGER',
          operation: 'checkActiveOrders',
          orderId: trackingInfo.order.id,
          exchange: trackingInfo.exchange.name,
        });

        // Increment check count even on error
        trackingInfo.checkCount++;

        // If too many errors, stop tracking
        if (trackingInfo.checkCount > 10) {
          tradingLogger.error('Too many errors checking order, removing from tracking:', {
            orderId: trackingInfo.order.id,
            exchange: trackingInfo.exchange.name,
          });
          this.moveToHistory(trackingKey, trackingInfo.order);
        }
      }
    }
  }

  /**
   * Check if order is complete
   */
  private isOrderComplete(order: Order): boolean {
    return (
      order.status === OrderStatus.FILLED ||
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REJECTED
    );
  }

  /**
   * Move order to history
   */
  private moveToHistory(trackingKey: string, order: Order): void {
    this.activeOrders.delete(trackingKey);
    this.orderHistory.push(order);

    // Keep only last 1000 orders in history
    if (this.orderHistory.length > 1000) {
      this.orderHistory.shift();
    }
  }

  /**
   * Get tracking key
   */
  private getTrackingKey(exchangeName: string, orderId: string): string {
    return `${exchangeName}:${orderId}`;
  }

  /**
   * Get all active orders
   */
  public getActiveOrders(): Order[] {
    return Array.from(this.activeOrders.values()).map((info) => info.order);
  }

  /**
   * Get active orders for specific exchange
   */
  public getActiveOrdersForExchange(exchangeName: ExchangeName): Order[] {
    return this.getActiveOrders().filter((order) => order.exchange === exchangeName);
  }

  /**
   * Get order history
   */
  public getOrderHistory(limit = 100): Order[] {
    return this.orderHistory.slice(-limit);
  }

  /**
   * Get statistics
   */
  public getStats() {
    const activeOrders = this.getActiveOrders();

    return {
      activeOrdersCount: activeOrders.length,
      historyCount: this.orderHistory.length,
      openOrders: activeOrders.filter((o) => o.status === OrderStatus.OPEN).length,
      partiallyFilledOrders: activeOrders.filter((o) => o.status === OrderStatus.PARTIALLY_FILLED)
        .length,
    };
  }

  /**
   * Clear history
   */
  public clearHistory(): void {
    this.orderHistory = [];
    tradingLogger.info('Order history cleared');
  }
}
