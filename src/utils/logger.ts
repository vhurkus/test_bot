/**
 * Winston Logger Configuration
 * Production-grade logging with file rotation and structured logging
 */

import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import * as path from 'path';
import { config } from '../config';

// Custom log format
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, category, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    const categoryStr = category ? `[${category}]` : '';
    return `${timestamp} ${level} ${categoryStr}: ${message} ${metaStr}`;
  }),
);

// Logs directory
const logsDir = path.join(process.cwd(), 'logs');

// File rotation transport for all logs
const allLogsTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  format: customFormat,
  level: config.logLevel,
});

// File rotation transport for error logs
const errorLogsTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  format: customFormat,
  level: 'error',
});

// File rotation transport for trade logs
const tradeLogsTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'trades-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '50m',
  maxFiles: '90d',
  format: customFormat,
});

// Console transport
const consoleTransport = new winston.transports.Console({
  format: consoleFormat,
  level: config.logLevel,
});

// Create the main logger
export const logger = winston.createLogger({
  level: config.logLevel,
  format: customFormat,
  defaultMeta: { service: 'arbitrage-bot' },
  transports: [allLogsTransport, errorLogsTransport, consoleTransport],
  exitOnError: false,
});

// Create specialized trade logger
export const tradeLogger = winston.createLogger({
  level: 'info',
  format: customFormat,
  defaultMeta: { service: 'arbitrage-bot', category: 'TRADE' },
  transports: [tradeLogsTransport, consoleTransport],
  exitOnError: false,
});

// Helper functions for categorized logging
export const createCategoryLogger = (category: string) => {
  return {
    error: (message: string, meta?: any) =>
      logger.error(message, { category, ...meta }),
    warn: (message: string, meta?: any) =>
      logger.warn(message, { category, ...meta }),
    info: (message: string, meta?: any) =>
      logger.info(message, { category, ...meta }),
    debug: (message: string, meta?: any) =>
      logger.debug(message, { category, ...meta }),
    verbose: (message: string, meta?: any) =>
      logger.verbose(message, { category, ...meta }),
  };
};

// Pre-configured category loggers
export const systemLogger = createCategoryLogger('SYSTEM');
export const tradingLogger = createCategoryLogger('TRADING');
export const exchangeLogger = createCategoryLogger('EXCHANGE');
export const databaseLogger = createCategoryLogger('DATABASE');
export const websocketLogger = createCategoryLogger('WEBSOCKET');
export const riskLogger = createCategoryLogger('RISK');

// Log trade execution
export const logTrade = (trade: {
  type: 'BUY' | 'SELL' | 'ARBITRAGE';
  exchange: string;
  symbol: string;
  price: string;
  quantity: string;
  profit?: string;
  profitPercentage?: string;
  [key: string]: any;
}) => {
  tradeLogger.info('Trade executed', trade);
};

// Log arbitrage opportunity
export const logOpportunity = (opportunity: {
  buyExchange: string;
  sellExchange: string;
  symbol: string;
  buyPrice: string;
  sellPrice: string;
  estimatedProfit: string;
  estimatedProfitPercentage: string;
  [key: string]: any;
}) => {
  tradingLogger.info('Arbitrage opportunity detected', opportunity);
};

// Log error with context
export const logError = (
  error: Error,
  context: {
    category?: string;
    operation?: string;
    exchange?: string;
    [key: string]: any;
  },
) => {
  logger.error('Error occurred', {
    message: error.message,
    stack: error.stack,
    ...context,
  });
};

// Log performance metrics
export const logPerformance = (metrics: {
  operation: string;
  duration: number;
  success: boolean;
  [key: string]: any;
}) => {
  logger.debug('Performance metric', metrics);
};

// Development mode check
if (!config.isProd) {
  logger.debug('Logger initialized in development mode');
}

export default logger;
