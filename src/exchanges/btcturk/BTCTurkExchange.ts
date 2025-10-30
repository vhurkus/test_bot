/**
 * BTCTurk Exchange Implementation
 * REST API and WebSocket integration for BTCTurk
 */

import * as WebSocket from 'ws';
import * as crypto from 'crypto';
import { BaseExchange, BaseExchangeConfig } from '../BaseExchange';
import { PlaceOrderParams } from '../IExchange';
import {
  Order,
  Balance,
  Orderbook,
  OrderSide,
  OrderType,
  OrderStatus,
  ExchangeName,
  TradingPair,
} from '../../types';
import { config } from '../../config';
import { exchangeLogger, websocketLogger } from '../../utils/logger';
import { ExchangeApiError, WebSocketError } from '../../utils/errors';
import Decimal from 'decimal.js';

interface BTCTurkBalance {
  asset: string;
  assetname: string;
  balance: string;
  locked: string;
  free: string;
}

interface BTCTurkOrder {
  id: number;
  price: number;
  amount: number;
  quantity: number;
  pairsymbol: string;
  type: string;
  method: number;
  orderClientId: string;
  time: number;
  updateTime: number;
  status: string;
}

interface BTCTurkOrderbookResponse {
  timestamp: number;
  bids: [string, string][];
  asks: [string, string][];
}

export class BTCTurkExchange extends BaseExchange {
  private ws: WebSocket | null = null;
  private orderbookSubscriptions: Map<string, (orderbook: Orderbook) => void> = new Map();
  private orderbookCache: Map<string, Orderbook> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private messageId = 151;

  constructor() {
    const exchangeConfig: BaseExchangeConfig = {
      name: ExchangeName.BTCTURK,
      apiKey: config.btcturk.apiKey,
      secretKey: config.btcturk.secretKey,
      baseUrl: config.btcturk.baseUrl,
      wsUrl: config.btcturk.wsUrl,
      rateLimit: config.btcturk.rateLimit,
    };

    super(exchangeConfig);
  }

  protected getAuthHeaders(
    method: string,
    endpoint: string,
    params?: any,
    data?: any,
  ): Record<string, string> {
    const nonce = Date.now().toString();

    // BTCTurk uses base64(HMAC-SHA256(apiKey + nonce, privateKey))
    const message = this.config.apiKey + nonce;
    const signature = this.generateBase64Signature(message, this.config.secretKey);

    return {
      'X-PCK': this.config.apiKey,
      'X-Stamp': nonce,
      'X-Signature': signature,
    };
  }

  async initialize(): Promise<void> {
    try {
      exchangeLogger.info('Initializing BTCTurk exchange...');

      // Test API connection
      const serverTime = await this.getServerTime();
      exchangeLogger.info(`BTCTurk server time: ${new Date(serverTime).toISOString()}`);

      // Test authentication
      const balances = await this.getBalances();
      exchangeLogger.info(`Successfully authenticated. Found ${balances.length} balances`);

      // Initialize WebSocket
      await this.connectWebSocket();

      this.ready = true;
      exchangeLogger.info('BTCTurk exchange initialized successfully');
    } catch (error) {
      exchangeLogger.error('Failed to initialize BTCTurk exchange:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      exchangeLogger.info('Closing BTCTurk exchange connections...');

      // Clear intervals
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }

      // Close WebSocket
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      this.ready = false;
      exchangeLogger.info('BTCTurk exchange closed');
    } catch (error) {
      exchangeLogger.error('Error closing BTCTurk exchange:', error);
      throw error;
    }
  }

  async getServerTime(): Promise<number> {
    try {
      const response = await this.makeRequest<{ serverTime: number; serverTime2: string }>(
        'GET',
        '/api/v2/server/time',
      );
      return response.serverTime;
    } catch (error) {
      throw new ExchangeApiError('Failed to get BTCTurk server time', this.name, { error });
    }
  }

  async getBalances(): Promise<Balance[]> {
    try {
      const response = await this.makeRequest<{ data: BTCTurkBalance[] }>(
        'GET',
        '/api/v1/users/balances',
      );

      return response.data
        .filter((b) => new Decimal(b.balance).greaterThan(0))
        .map((b) => ({
          asset: b.asset,
          free: b.free,
          locked: b.locked,
          total: b.balance,
        }));
    } catch (error) {
      throw new ExchangeApiError('Failed to get BTCTurk balances', this.name, { error });
    }
  }

  async getBalance(asset: string): Promise<Balance> {
    const balances = await this.getBalances();
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

  async getOrderbook(symbol: string, depth = 20): Promise<Orderbook> {
    try {
      const response = await this.makeRequest<BTCTurkOrderbookResponse>(
        'GET',
        '/api/v2/orderbook',
        { pairSymbol: symbol, limit: depth },
      );

      return {
        exchange: ExchangeName.BTCTURK,
        symbol,
        bids: response.bids.map(([price, quantity]) => ({ price, quantity })),
        asks: response.asks.map(([price, quantity]) => ({ price, quantity })),
        timestamp: response.timestamp,
      };
    } catch (error) {
      throw new ExchangeApiError(`Failed to get BTCTurk orderbook for ${symbol}`, this.name, {
        error,
        symbol,
      });
    }
  }

  async placeOrder(params: PlaceOrderParams): Promise<Order> {
    try {
      // BTCTurk order types: buy (0), sell (1)
      const orderMethod = params.side === OrderSide.BUY ? 0 : 1;

      // Order types: limit (0), market (1), stop limit (2), stop market (3)
      const orderTypeMap: Record<OrderType, number> = {
        [OrderType.LIMIT]: 0,
        [OrderType.MARKET]: 1,
      };

      const orderData: any = {
        pairSymbol: params.symbol,
        orderMethod,
        orderType: orderTypeMap[params.type],
        quantity: params.quantity,
      };

      if (params.type === OrderType.LIMIT && params.price) {
        orderData.price = params.price;
      }

      const response = await this.makeRequest<{ data: BTCTurkOrder }>(
        'POST',
        '/api/v1/order',
        undefined,
        orderData,
      );

      return this.mapBTCTurkOrder(response.data);
    } catch (error) {
      throw new ExchangeApiError('Failed to place BTCTurk order', this.name, {
        error,
        params,
      });
    }
  }

  async cancelOrder(symbol: string, orderId: string): Promise<void> {
    try {
      await this.makeRequest('DELETE', `/api/v1/order?id=${orderId}`);
      exchangeLogger.info(`BTCTurk order cancelled: ${orderId}`);
    } catch (error) {
      throw new ExchangeApiError('Failed to cancel BTCTurk order', this.name, {
        error,
        symbol,
        orderId,
      });
    }
  }

  async getOrder(symbol: string, orderId: string): Promise<Order> {
    try {
      const response = await this.makeRequest<{ data: BTCTurkOrder }>(
        'GET',
        `/api/v1/order?id=${orderId}`,
      );

      return this.mapBTCTurkOrder(response.data);
    } catch (error) {
      throw new ExchangeApiError('Failed to get BTCTurk order', this.name, {
        error,
        symbol,
        orderId,
      });
    }
  }

  async getOpenOrders(symbol?: string): Promise<Order[]> {
    try {
      const endpoint = symbol
        ? `/api/v1/openOrders?pairSymbol=${symbol}`
        : '/api/v1/openOrders';

      const response = await this.makeRequest<{ data: { asks: BTCTurkOrder[]; bids: BTCTurkOrder[] } }>(
        'GET',
        endpoint,
      );

      const allOrders = [...response.data.asks, ...response.data.bids];
      return allOrders.map((order) => this.mapBTCTurkOrder(order));
    } catch (error) {
      throw new ExchangeApiError('Failed to get BTCTurk open orders', this.name, {
        error,
        symbol,
      });
    }
  }

  async getTradingPair(symbol: string): Promise<TradingPair> {
    const pairs = await this.getTradingPairs();
    const pair = pairs.find((p) => p.symbol === symbol);

    if (!pair) {
      throw new ExchangeApiError(`Trading pair ${symbol} not found on BTCTurk`, this.name, {
        symbol,
      });
    }

    return pair;
  }

  async getTradingPairs(): Promise<TradingPair[]> {
    try {
      const response = await this.makeRequest<{
        data: Array<{
          pair: string;
          pairNormalized: string;
          numerator: string;
          denominator: string;
          numeratorScale: number;
          denominatorScale: number;
          minimumOrderAmount: string;
          maximumOrderAmount: string;
        }>;
      }>('GET', '/api/v2/server/exchangeinfo');

      return response.data.map((pair) => ({
        symbol: pair.pairNormalized,
        baseAsset: pair.numerator,
        quoteAsset: pair.denominator,
        minQuantity: pair.minimumOrderAmount,
        maxQuantity: pair.maximumOrderAmount,
        quantityPrecision: pair.numeratorScale,
        pricePrecision: pair.denominatorScale,
      }));
    } catch (error) {
      throw new ExchangeApiError('Failed to get BTCTurk trading pairs', this.name, { error });
    }
  }

  async subscribeOrderbook(
    symbol: string,
    callback: (orderbook: Orderbook) => void,
  ): Promise<void> {
    this.orderbookSubscriptions.set(symbol, callback);
    websocketLogger.info(`Subscribed to BTCTurk orderbook: ${symbol}`);

    // Get initial snapshot
    const snapshot = await this.getOrderbook(symbol);
    this.orderbookCache.set(symbol, snapshot);
    callback(snapshot);

    // Subscribe via WebSocket if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendWebSocketSubscribe(symbol);
    }
  }

  async unsubscribeOrderbook(symbol: string): Promise<void> {
    this.orderbookSubscriptions.delete(symbol);
    this.orderbookCache.delete(symbol);
    websocketLogger.info(`Unsubscribed from BTCTurk orderbook: ${symbol}`);

    // Unsubscribe via WebSocket if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendWebSocketUnsubscribe(symbol);
    }
  }

  private async connectWebSocket(): Promise<void> {
    try {
      this.ws = new WebSocket(this.config.wsUrl);

      this.ws.on('open', () => {
        websocketLogger.info('BTCTurk WebSocket connected');

        // Subscribe to all active orderbooks
        for (const symbol of this.orderbookSubscriptions.keys()) {
          this.sendWebSocketSubscribe(symbol);
        }

        this.setupPingPong();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          websocketLogger.error('Error parsing BTCTurk WebSocket message:', error);
        }
      });

      this.ws.on('error', (error) => {
        websocketLogger.error('BTCTurk WebSocket error:', error);
      });

      this.ws.on('close', () => {
        websocketLogger.warn('BTCTurk WebSocket disconnected');
        this.scheduleReconnect();
      });
    } catch (error) {
      throw new WebSocketError('Failed to connect BTCTurk WebSocket', this.name, { error });
    }
  }

  private sendWebSocketSubscribe(symbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const subscribeMessage = {
      type: 114,
      channel: `orderbook_${symbol}`,
      event: `orderbook_${symbol}`,
      join: true,
    };

    this.ws.send(JSON.stringify(subscribeMessage));
    websocketLogger.debug(`Sent BTCTurk WebSocket subscribe for ${symbol}`);
  }

  private sendWebSocketUnsubscribe(symbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const unsubscribeMessage = {
      type: 114,
      channel: `orderbook_${symbol}`,
      event: `orderbook_${symbol}`,
      join: false,
    };

    this.ws.send(JSON.stringify(unsubscribeMessage));
    websocketLogger.debug(`Sent BTCTurk WebSocket unsubscribe for ${symbol}`);
  }

  private handleWebSocketMessage(message: any): void {
    // BTCTurk orderbook update format
    if (message.type === 431 && message.items) {
      const symbol = message.PS; // Pair symbol
      const callback = this.orderbookSubscriptions.get(symbol);

      if (callback) {
        const orderbook: Orderbook = {
          exchange: ExchangeName.BTCTURK,
          symbol,
          bids: message.items.bids?.map((b: any) => ({
            price: b.price?.toString() || '0',
            quantity: b.amount?.toString() || '0',
          })) || [],
          asks: message.items.asks?.map((a: any) => ({
            price: a.price?.toString() || '0',
            quantity: a.amount?.toString() || '0',
          })) || [],
          timestamp: Date.now(),
        };

        this.orderbookCache.set(symbol, orderbook);
        callback(orderbook);
      }
    }
  }

  private setupPingPong(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // BTCTurk ping message
        this.ws.send(JSON.stringify({ type: 151 }));
      }
    }, config.websocket.pingInterval);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      websocketLogger.info('Attempting to reconnect BTCTurk WebSocket...');
      this.connectWebSocket().catch((error) => {
        websocketLogger.error('BTCTurk WebSocket reconnection failed:', error);
      });
    }, config.websocket.reconnectDelay);
  }

  private mapBTCTurkOrder(order: BTCTurkOrder): Order {
    return {
      id: order.id.toString(),
      exchange: ExchangeName.BTCTURK,
      symbol: order.pairsymbol,
      side: order.method === 0 ? OrderSide.BUY : OrderSide.SELL,
      type: order.type === 'limit' ? OrderType.LIMIT : OrderType.MARKET,
      price: order.price.toString(),
      quantity: order.quantity.toString(),
      filledQuantity: order.amount.toString(),
      status: this.mapBTCTurkOrderStatus(order.status),
      timestamp: order.time,
    };
  }

  private mapBTCTurkOrderStatus(status: string): OrderStatus {
    const statusMap: Record<string, OrderStatus> = {
      Untouched: OrderStatus.OPEN,
      Partial: OrderStatus.PARTIALLY_FILLED,
      Closed: OrderStatus.FILLED,
      Canceled: OrderStatus.CANCELLED,
    };

    return statusMap[status] || OrderStatus.PENDING;
  }
}
