/**
 * Exchange Interface
 * Defines the contract that all exchange implementations must follow
 */

import { Order, Balance, Orderbook, OrderSide, OrderType, TradingPair } from '../types';

export interface PlaceOrderParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: string;
  price?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
}

export interface IExchange {
  readonly name: string;

  /**
   * Initialize exchange connection (WebSocket, authentication, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Close all connections gracefully
   */
  close(): Promise<void>;

  /**
   * Get current account balances
   */
  getBalances(): Promise<Balance[]>;

  /**
   * Get balance for specific asset
   */
  getBalance(asset: string): Promise<Balance>;

  /**
   * Get current orderbook for a symbol
   */
  getOrderbook(symbol: string, depth?: number): Promise<Orderbook>;

  /**
   * Place a new order
   */
  placeOrder(params: PlaceOrderParams): Promise<Order>;

  /**
   * Cancel an existing order
   */
  cancelOrder(symbol: string, orderId: string): Promise<void>;

  /**
   * Get order status
   */
  getOrder(symbol: string, orderId: string): Promise<Order>;

  /**
   * Get all open orders
   */
  getOpenOrders(symbol?: string): Promise<Order[]>;

  /**
   * Get trading pair information
   */
  getTradingPair(symbol: string): Promise<TradingPair>;

  /**
   * Get all available trading pairs
   */
  getTradingPairs(): Promise<TradingPair[]>;

  /**
   * Subscribe to orderbook updates via WebSocket
   */
  subscribeOrderbook(symbol: string, callback: (orderbook: Orderbook) => void): Promise<void>;

  /**
   * Unsubscribe from orderbook updates
   */
  unsubscribeOrderbook(symbol: string): Promise<void>;

  /**
   * Check if exchange is ready for trading
   */
  isReady(): boolean;

  /**
   * Get exchange timestamp
   */
  getServerTime(): Promise<number>;
}
