/**
 * Binance Exchange Implementation
 * REST API and WebSocket integration for Binance
 */

import * as WebSocket from 'ws';
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
  OrderbookLevel,
} from '../../types';
import { config } from '../../config';
import { exchangeLogger, websocketLogger } from '../../utils/logger';
import { ExchangeApiError, WebSocketError } from '../../utils/errors';
import Decimal from 'decimal.js';

interface BinanceOrderbookSnapshot {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

interface BinanceOrderbookUpdate {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
  U: number; // First update ID
  u: number; // Final update ID
  b: [string, string][]; // Bids
  a: [string, string][]; // Asks
}

interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

interface BinanceOrder {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  type: string;
  side: string;
  time: number;
  updateTime: number;
}

export class BinanceExchange extends BaseExchange {
  private ws: WebSocket | null = null;
  private orderbookSubscriptions: Map<string, (orderbook: Orderbook) => void> = new Map();
  private orderbookCache: Map<string, Orderbook> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    const exchangeConfig: BaseExchangeConfig = {
      name: ExchangeName.BINANCE,
      apiKey: config.binance.apiKey,
      secretKey: config.binance.secretKey,
      baseUrl: config.binance.baseUrl,
      wsUrl: config.binance.wsUrl,
      rateLimit: config.binance.rateLimit,
    };

    super(exchangeConfig);
  }

  protected getAuthHeaders(
    method: string,
    endpoint: string,
    params?: any,
    data?: any,
  ): Record<string, string> {
    const timestamp = Date.now();
    const queryString = params
      ? Object.keys(params)
          .sort()
          .map((key) => `${key}=${params[key]}`)
          .join('&')
      : '';

    const signaturePayload = queryString ? `${queryString}&timestamp=${timestamp}` : `timestamp=${timestamp}`;
    const signature = this.generateSignature(signaturePayload, this.config.secretKey);

    return {
      'X-MBX-APIKEY': this.config.apiKey,
    };
  }

  async initialize(): Promise<void> {
    try {
      exchangeLogger.info('Initializing Binance exchange...');

      // Test API connection
      const serverTime = await this.getServerTime();
      exchangeLogger.info(`Binance server time: ${new Date(serverTime).toISOString()}`);

      // Test authentication
      const balances = await this.getBalances();
      exchangeLogger.info(`Successfully authenticated. Found ${balances.length} balances`);

      // Initialize WebSocket
      await this.connectWebSocket();

      this.ready = true;
      exchangeLogger.info('Binance exchange initialized successfully');
    } catch (error) {
      exchangeLogger.error('Failed to initialize Binance exchange:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      exchangeLogger.info('Closing Binance exchange connections...');

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
      exchangeLogger.info('Binance exchange closed');
    } catch (error) {
      exchangeLogger.error('Error closing Binance exchange:', error);
      throw error;
    }
  }

  async getServerTime(): Promise<number> {
    try {
      const response = await this.makeRequest<{ serverTime: number }>('GET', '/api/v3/time');
      return response.serverTime;
    } catch (error) {
      throw new ExchangeApiError('Failed to get Binance server time', this.name, { error });
    }
  }

  async getBalances(): Promise<Balance[]> {
    try {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = this.generateSignature(queryString, this.config.secretKey);

      const response = await this.makeRequest<{ balances: BinanceBalance[] }>(
        'GET',
        `/api/v3/account?${queryString}&signature=${signature}`,
      );

      return response.balances
        .filter((b) => new Decimal(b.free).plus(b.locked).greaterThan(0))
        .map((b) => ({
          asset: b.asset,
          free: b.free,
          locked: b.locked,
          total: new Decimal(b.free).plus(b.locked).toString(),
        }));
    } catch (error) {
      throw new ExchangeApiError('Failed to get Binance balances', this.name, { error });
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
      const response = await this.makeRequest<BinanceOrderbookSnapshot>(
        'GET',
        '/api/v3/depth',
        { symbol, limit: depth },
      );

      return {
        exchange: ExchangeName.BINANCE,
        symbol,
        bids: response.bids.map(([price, quantity]) => ({ price, quantity })),
        asks: response.asks.map(([price, quantity]) => ({ price, quantity })),
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new ExchangeApiError(`Failed to get Binance orderbook for ${symbol}`, this.name, {
        error,
        symbol,
      });
    }
  }

  async placeOrder(params: PlaceOrderParams): Promise<Order> {
    try {
      const timestamp = Date.now();
      const orderParams: any = {
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        quantity: params.quantity,
        timestamp,
      };

      if (params.type === OrderType.LIMIT) {
        orderParams.price = params.price;
        orderParams.timeInForce = params.timeInForce || 'GTC';
      }

      const queryString = Object.keys(orderParams)
        .sort()
        .map((key) => `${key}=${orderParams[key]}`)
        .join('&');
      const signature = this.generateSignature(queryString, this.config.secretKey);

      const response = await this.makeRequest<BinanceOrder>(
        'POST',
        `/api/v3/order?${queryString}&signature=${signature}`,
      );

      return this.mapBinanceOrder(response);
    } catch (error) {
      throw new ExchangeApiError('Failed to place Binance order', this.name, {
        error,
        params,
      });
    }
  }

  async cancelOrder(symbol: string, orderId: string): Promise<void> {
    try {
      const timestamp = Date.now();
      const queryString = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
      const signature = this.generateSignature(queryString, this.config.secretKey);

      await this.makeRequest('DELETE', `/api/v3/order?${queryString}&signature=${signature}`);

      exchangeLogger.info(`Binance order cancelled: ${orderId}`);
    } catch (error) {
      throw new ExchangeApiError('Failed to cancel Binance order', this.name, {
        error,
        symbol,
        orderId,
      });
    }
  }

  async getOrder(symbol: string, orderId: string): Promise<Order> {
    try {
      const timestamp = Date.now();
      const queryString = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
      const signature = this.generateSignature(queryString, this.config.secretKey);

      const response = await this.makeRequest<BinanceOrder>(
        'GET',
        `/api/v3/order?${queryString}&signature=${signature}`,
      );

      return this.mapBinanceOrder(response);
    } catch (error) {
      throw new ExchangeApiError('Failed to get Binance order', this.name, {
        error,
        symbol,
        orderId,
      });
    }
  }

  async getOpenOrders(symbol?: string): Promise<Order[]> {
    try {
      const timestamp = Date.now();
      const queryString = symbol
        ? `symbol=${symbol}&timestamp=${timestamp}`
        : `timestamp=${timestamp}`;
      const signature = this.generateSignature(queryString, this.config.secretKey);

      const response = await this.makeRequest<BinanceOrder[]>(
        'GET',
        `/api/v3/openOrders?${queryString}&signature=${signature}`,
      );

      return response.map((order) => this.mapBinanceOrder(order));
    } catch (error) {
      throw new ExchangeApiError('Failed to get Binance open orders', this.name, {
        error,
        symbol,
      });
    }
  }

  async getTradingPair(symbol: string): Promise<TradingPair> {
    const pairs = await this.getTradingPairs();
    const pair = pairs.find((p) => p.symbol === symbol);

    if (!pair) {
      throw new ExchangeApiError(`Trading pair ${symbol} not found on Binance`, this.name, {
        symbol,
      });
    }

    return pair;
  }

  async getTradingPairs(): Promise<TradingPair[]> {
    try {
      const response = await this.makeRequest<{ symbols: any[] }>('GET', '/api/v3/exchangeInfo');

      return response.symbols
        .filter((s) => s.status === 'TRADING')
        .map((s) => {
          const lotSizeFilter = s.filters.find((f: any) => f.filterType === 'LOT_SIZE');
          const priceFilter = s.filters.find((f: any) => f.filterType === 'PRICE_FILTER');

          return {
            symbol: s.symbol,
            baseAsset: s.baseAsset,
            quoteAsset: s.quoteAsset,
            minQuantity: lotSizeFilter?.minQty || '0',
            maxQuantity: lotSizeFilter?.maxQty || '0',
            quantityPrecision: s.baseAssetPrecision,
            pricePrecision: s.quotePrecision,
          };
        });
    } catch (error) {
      throw new ExchangeApiError('Failed to get Binance trading pairs', this.name, { error });
    }
  }

  async subscribeOrderbook(
    symbol: string,
    callback: (orderbook: Orderbook) => void,
  ): Promise<void> {
    this.orderbookSubscriptions.set(symbol, callback);
    websocketLogger.info(`Subscribed to Binance orderbook: ${symbol}`);

    // Get initial snapshot
    const snapshot = await this.getOrderbook(symbol);
    this.orderbookCache.set(symbol, snapshot);
    callback(snapshot);
  }

  async unsubscribeOrderbook(symbol: string): Promise<void> {
    this.orderbookSubscriptions.delete(symbol);
    this.orderbookCache.delete(symbol);
    websocketLogger.info(`Unsubscribed from Binance orderbook: ${symbol}`);
  }

  private async connectWebSocket(): Promise<void> {
    try {
      const streams = Array.from(this.orderbookSubscriptions.keys())
        .map((symbol) => `${symbol.toLowerCase()}@depth@100ms`)
        .join('/');

      const wsUrl = streams ? `${this.config.wsUrl}/${streams}` : this.config.wsUrl;

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        websocketLogger.info('Binance WebSocket connected');
        this.setupPingPong();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          websocketLogger.error('Error parsing Binance WebSocket message:', error);
        }
      });

      this.ws.on('error', (error) => {
        websocketLogger.error('Binance WebSocket error:', error);
      });

      this.ws.on('close', () => {
        websocketLogger.warn('Binance WebSocket disconnected');
        this.scheduleReconnect();
      });
    } catch (error) {
      throw new WebSocketError('Failed to connect Binance WebSocket', this.name, { error });
    }
  }

  private handleWebSocketMessage(message: any): void {
    if (message.e === 'depthUpdate') {
      const update = message as BinanceOrderbookUpdate;
      const symbol = update.s;
      const callback = this.orderbookSubscriptions.get(symbol);

      if (callback) {
        const orderbook: Orderbook = {
          exchange: ExchangeName.BINANCE,
          symbol,
          bids: update.b.map(([price, quantity]) => ({ price, quantity })),
          asks: update.a.map(([price, quantity]) => ({ price, quantity })),
          timestamp: update.E,
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
        this.ws.ping();
      }
    }, config.websocket.pingInterval);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      websocketLogger.info('Attempting to reconnect Binance WebSocket...');
      this.connectWebSocket().catch((error) => {
        websocketLogger.error('Binance WebSocket reconnection failed:', error);
      });
    }, config.websocket.reconnectDelay);
  }

  private mapBinanceOrder(order: BinanceOrder): Order {
    return {
      id: order.orderId.toString(),
      exchange: ExchangeName.BINANCE,
      symbol: order.symbol,
      side: order.side as OrderSide,
      type: order.type as OrderType,
      price: order.price,
      quantity: order.origQty,
      filledQuantity: order.executedQty,
      status: this.mapBinanceOrderStatus(order.status),
      timestamp: order.time,
    };
  }

  private mapBinanceOrderStatus(status: string): OrderStatus {
    const statusMap: Record<string, OrderStatus> = {
      NEW: OrderStatus.OPEN,
      PARTIALLY_FILLED: OrderStatus.PARTIALLY_FILLED,
      FILLED: OrderStatus.FILLED,
      CANCELED: OrderStatus.CANCELLED,
      REJECTED: OrderStatus.REJECTED,
      PENDING_CANCEL: OrderStatus.PENDING,
      EXPIRED: OrderStatus.CANCELLED,
    };

    return statusMap[status] || OrderStatus.PENDING;
  }
}
