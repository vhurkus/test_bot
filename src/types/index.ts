/**
 * Common type definitions for the arbitrage bot
 */

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export enum ExchangeName {
  BINANCE = 'BINANCE',
  BTCTURK = 'BTCTURK',
}

export interface Order {
  id: string;
  exchange: ExchangeName;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: string;
  quantity: string;
  filledQuantity: string;
  status: OrderStatus;
  timestamp: number;
}

export interface Balance {
  asset: string;
  free: string;
  locked: string;
  total: string;
}

export interface OrderbookLevel {
  price: string;
  quantity: string;
}

export interface Orderbook {
  exchange: ExchangeName;
  symbol: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
}

export interface Trade {
  id: string;
  buyExchange: ExchangeName;
  sellExchange: ExchangeName;
  symbol: string;
  buyPrice: string;
  sellPrice: string;
  quantity: string;
  profit: string;
  profitPercentage: string;
  timestamp: number;
}

export interface ArbitrageOpportunity {
  buyExchange: ExchangeName;
  sellExchange: ExchangeName;
  symbol: string;
  buyPrice: string;
  sellPrice: string;
  quantity: string;
  estimatedProfit: string;
  estimatedProfitPercentage: string;
  timestamp: number;
}

export interface ExchangeConfig {
  name: ExchangeName;
  apiKey: string;
  secretKey: string;
  testnet?: boolean;
}

export interface TradingPair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  minQuantity: string;
  maxQuantity: string;
  quantityPrecision: number;
  pricePrecision: number;
}
