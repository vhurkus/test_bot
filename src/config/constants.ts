/**
 * Application constants
 */

export const TRADING_PAIRS = {
  BINANCE: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT'],
  BTCTURK: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT'],
} as const;

export const FEE_RATES = {
  BINANCE: {
    MAKER: 0.001, // 0.1%
    TAKER: 0.001, // 0.1%
  },
  BTCTURK: {
    MAKER: 0.0008, // 0.08% (with maker rebate)
    TAKER: 0.002, // 0.2%
  },
} as const;

export const PRECISION = {
  PRICE: 8,
  QUANTITY: 8,
  USDT: 2,
} as const;

export const TIMEOUTS = {
  API_REQUEST: 10000, // 10 seconds
  WEBSOCKET_PING: 30000, // 30 seconds
  ORDER_FILL: 60000, // 1 minute
  DATABASE_QUERY: 5000, // 5 seconds
} as const;

export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000, // 1 second
  MAX_DELAY: 30000, // 30 seconds
  BACKOFF_MULTIPLIER: 2,
} as const;

export const CACHE_TTL = {
  ORDERBOOK: 1, // 1 second
  BALANCE: 5, // 5 seconds
  TICKER: 2, // 2 seconds
  EXCHANGE_INFO: 3600, // 1 hour
} as const;

export const ORDER_BOOK_DEPTH = 20;

export const MIN_ORDER_SIZES = {
  BTCUSDT: 0.0001,
  ETHUSDT: 0.001,
  BNBUSDT: 0.01,
  ADAUSDT: 1,
  SOLUSDT: 0.01,
} as const;

export const DATABASE_TABLES = {
  TRADES: 'trades',
  ORDERS: 'orders',
  BALANCES: 'balances',
  PROFIT_TRACKING: 'profit_tracking',
  ERROR_LOGS: 'error_logs',
} as const;

export const REDIS_KEYS = {
  ORDERBOOK_PREFIX: 'orderbook:',
  BALANCE_PREFIX: 'balance:',
  TICKER_PREFIX: 'ticker:',
  OPPORTUNITY_PREFIX: 'opportunity:',
  DAILY_PNL: 'pnl:daily:',
} as const;

export const LOG_CATEGORIES = {
  SYSTEM: 'SYSTEM',
  TRADING: 'TRADING',
  EXCHANGE: 'EXCHANGE',
  DATABASE: 'DATABASE',
  WEBSOCKET: 'WEBSOCKET',
  RISK: 'RISK',
  ERROR: 'ERROR',
} as const;
