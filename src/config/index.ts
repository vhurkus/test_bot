/**
 * Configuration management with Joi validation
 */

import * as dotenv from 'dotenv';
import * as Joi from 'joi';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Configuration schema validation
const envSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'verbose')
    .default('info'),
  PORT: Joi.number().default(3000),

  // Binance
  BINANCE_API_KEY: Joi.string().required(),
  BINANCE_SECRET_KEY: Joi.string().required(),
  BINANCE_TESTNET: Joi.boolean().default(false),

  // BTCTurk
  BTCTURK_API_KEY: Joi.string().required(),
  BTCTURK_SECRET_KEY: Joi.string().required(),

  // Database
  DATABASE_HOST: Joi.string().default('localhost'),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_NAME: Joi.string().default('arbitrage_bot'),
  DATABASE_USER: Joi.string().default('postgres'),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_SSL: Joi.boolean().default(false),
  DATABASE_LOGGING: Joi.boolean().default(false),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().default(0),

  // Trading Parameters
  MIN_PROFIT_PERCENTAGE: Joi.number().min(0).default(0.3),
  MIN_PROFIT_AMOUNT: Joi.number().min(0).default(5),
  MAX_POSITION_SIZE_USDT: Joi.number().min(0).default(1000),
  MAX_DAILY_LOSS_USDT: Joi.number().min(0).default(500),
  MAX_OPEN_ORDERS: Joi.number().min(1).default(5),

  // Risk Management
  ENABLE_TRADING: Joi.boolean().default(false),
  ENABLE_PAPER_TRADING: Joi.boolean().default(true),
  MAX_SLIPPAGE_PERCENTAGE: Joi.number().min(0).max(100).default(0.5),
  STOP_LOSS_PERCENTAGE: Joi.number().min(0).max(100).default(2),

  // Monitoring & Alerts
  TELEGRAM_BOT_TOKEN: Joi.string().allow('').default(''),
  TELEGRAM_CHAT_ID: Joi.string().allow('').default(''),
  ALERT_ON_TRADE: Joi.boolean().default(true),
  ALERT_ON_ERROR: Joi.boolean().default(true),
  DAILY_REPORT_HOUR: Joi.number().min(0).max(23).default(20),

  // Rate Limiting
  BINANCE_RATE_LIMIT_PER_SECOND: Joi.number().min(1).default(10),
  BTCTURK_RATE_LIMIT_PER_SECOND: Joi.number().min(1).default(5),

  // WebSocket
  WS_RECONNECT_DELAY_MS: Joi.number().min(1000).default(5000),
  WS_PING_INTERVAL_MS: Joi.number().min(1000).default(30000),

  // Performance
  ORDERBOOK_UPDATE_INTERVAL_MS: Joi.number().min(10).default(100),
  BALANCE_UPDATE_INTERVAL_MS: Joi.number().min(1000).default(5000),
  PROFIT_CALCULATION_INTERVAL_MS: Joi.number().min(100).default(1000),
})
  .unknown()
  .required();

// Validate environment variables
const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

// Export validated configuration
export const config = {
  // Application
  env: envVars.NODE_ENV as string,
  logLevel: envVars.LOG_LEVEL as string,
  port: envVars.PORT as number,
  isProd: envVars.NODE_ENV === 'production',
  isDev: envVars.NODE_ENV === 'development',

  // Exchanges
  binance: {
    apiKey: envVars.BINANCE_API_KEY as string,
    secretKey: envVars.BINANCE_SECRET_KEY as string,
    testnet: envVars.BINANCE_TESTNET as boolean,
    baseUrl: (envVars.BINANCE_TESTNET as boolean)
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com',
    wsUrl: (envVars.BINANCE_TESTNET as boolean)
      ? 'wss://testnet.binance.vision/ws'
      : 'wss://stream.binance.com:9443/ws',
    rateLimit: envVars.BINANCE_RATE_LIMIT_PER_SECOND as number,
  },

  btcturk: {
    apiKey: envVars.BTCTURK_API_KEY as string,
    secretKey: envVars.BTCTURK_SECRET_KEY as string,
    baseUrl: 'https://api.btcturk.com',
    wsUrl: 'wss://ws-feed-pro.btcturk.com',
    rateLimit: envVars.BTCTURK_RATE_LIMIT_PER_SECOND as number,
  },

  // Database
  database: {
    host: envVars.DATABASE_HOST as string,
    port: envVars.DATABASE_PORT as number,
    name: envVars.DATABASE_NAME as string,
    user: envVars.DATABASE_USER as string,
    password: envVars.DATABASE_PASSWORD as string,
    ssl: envVars.DATABASE_SSL as boolean,
    logging: envVars.DATABASE_LOGGING as boolean,
  },

  // Redis
  redis: {
    host: envVars.REDIS_HOST as string,
    port: envVars.REDIS_PORT as number,
    password: envVars.REDIS_PASSWORD as string,
    db: envVars.REDIS_DB as number,
  },

  // Trading Parameters
  trading: {
    minProfitPercentage: envVars.MIN_PROFIT_PERCENTAGE as number,
    minProfitAmount: envVars.MIN_PROFIT_AMOUNT as number,
    maxPositionSizeUsdt: envVars.MAX_POSITION_SIZE_USDT as number,
    maxDailyLossUsdt: envVars.MAX_DAILY_LOSS_USDT as number,
    maxOpenOrders: envVars.MAX_OPEN_ORDERS as number,
    enableTrading: envVars.ENABLE_TRADING as boolean,
    enablePaperTrading: envVars.ENABLE_PAPER_TRADING as boolean,
    maxSlippagePercentage: envVars.MAX_SLIPPAGE_PERCENTAGE as number,
    stopLossPercentage: envVars.STOP_LOSS_PERCENTAGE as number,
  },

  // Monitoring
  monitoring: {
    telegram: {
      botToken: envVars.TELEGRAM_BOT_TOKEN as string,
      chatId: envVars.TELEGRAM_CHAT_ID as string,
    },
    alertOnTrade: envVars.ALERT_ON_TRADE as boolean,
    alertOnError: envVars.ALERT_ON_ERROR as boolean,
    dailyReportHour: envVars.DAILY_REPORT_HOUR as number,
  },

  // WebSocket
  websocket: {
    reconnectDelay: envVars.WS_RECONNECT_DELAY_MS as number,
    pingInterval: envVars.WS_PING_INTERVAL_MS as number,
  },

  // Performance
  performance: {
    orderbookUpdateInterval: envVars.ORDERBOOK_UPDATE_INTERVAL_MS as number,
    balanceUpdateInterval: envVars.BALANCE_UPDATE_INTERVAL_MS as number,
    profitCalculationInterval: envVars.PROFIT_CALCULATION_INTERVAL_MS as number,
  },
} as const;

export type Config = typeof config;
