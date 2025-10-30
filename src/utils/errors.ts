/**
 * Custom Error Classes
 * Standardized error handling across the application
 */

export enum ErrorCode {
  // General
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // Exchange
  EXCHANGE_API_ERROR = 'EXCHANGE_API_ERROR',
  EXCHANGE_CONNECTION_ERROR = 'EXCHANGE_CONNECTION_ERROR',
  EXCHANGE_RATE_LIMIT = 'EXCHANGE_RATE_LIMIT',
  EXCHANGE_AUTHENTICATION_ERROR = 'EXCHANGE_AUTHENTICATION_ERROR',
  EXCHANGE_TIMEOUT = 'EXCHANGE_TIMEOUT',

  // Order
  ORDER_PLACEMENT_ERROR = 'ORDER_PLACEMENT_ERROR',
  ORDER_CANCELLATION_ERROR = 'ORDER_CANCELLATION_ERROR',
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INVALID_ORDER_PARAMS = 'INVALID_ORDER_PARAMS',

  // Database
  DATABASE_CONNECTION_ERROR = 'DATABASE_CONNECTION_ERROR',
  DATABASE_QUERY_ERROR = 'DATABASE_QUERY_ERROR',
  REDIS_ERROR = 'REDIS_ERROR',

  // Trading
  ARBITRAGE_OPPORTUNITY_LOST = 'ARBITRAGE_OPPORTUNITY_LOST',
  SLIPPAGE_EXCEEDED = 'SLIPPAGE_EXCEEDED',
  PROFIT_THRESHOLD_NOT_MET = 'PROFIT_THRESHOLD_NOT_MET',

  // Risk Management
  POSITION_LIMIT_EXCEEDED = 'POSITION_LIMIT_EXCEEDED',
  DAILY_LOSS_LIMIT_EXCEEDED = 'DAILY_LOSS_LIMIT_EXCEEDED',
  RISK_CHECK_FAILED = 'RISK_CHECK_FAILED',

  // WebSocket
  WEBSOCKET_CONNECTION_ERROR = 'WEBSOCKET_CONNECTION_ERROR',
  WEBSOCKET_MESSAGE_ERROR = 'WEBSOCKET_MESSAGE_ERROR',
}

export class BaseError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    statusCode = 500,
    isOperational = true,
    context?: Record<string, any>,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    this.timestamp = new Date();

    Error.captureStackTrace(this);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

export class ConfigurationError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.CONFIGURATION_ERROR, 500, false, context);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.VALIDATION_ERROR, 400, true, context);
  }
}

export class ExchangeApiError extends BaseError {
  constructor(
    message: string,
    exchange: string,
    context?: Record<string, any>,
  ) {
    super(
      message,
      ErrorCode.EXCHANGE_API_ERROR,
      500,
      true,
      { exchange, ...context },
    );
  }
}

export class ExchangeConnectionError extends BaseError {
  constructor(
    message: string,
    exchange: string,
    context?: Record<string, any>,
  ) {
    super(
      message,
      ErrorCode.EXCHANGE_CONNECTION_ERROR,
      503,
      true,
      { exchange, ...context },
    );
  }
}

export class RateLimitError extends BaseError {
  constructor(
    message: string,
    exchange: string,
    retryAfter?: number,
    context?: Record<string, any>,
  ) {
    super(
      message,
      ErrorCode.EXCHANGE_RATE_LIMIT,
      429,
      true,
      { exchange, retryAfter, ...context },
    );
  }
}

export class AuthenticationError extends BaseError {
  constructor(
    message: string,
    exchange: string,
    context?: Record<string, any>,
  ) {
    super(
      message,
      ErrorCode.EXCHANGE_AUTHENTICATION_ERROR,
      401,
      false,
      { exchange, ...context },
    );
  }
}

export class OrderError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode,
    context?: Record<string, any>,
  ) {
    super(message, code, 400, true, context);
  }
}

export class InsufficientBalanceError extends BaseError {
  constructor(
    message: string,
    exchange: string,
    asset: string,
    required: string,
    available: string,
  ) {
    super(
      message,
      ErrorCode.INSUFFICIENT_BALANCE,
      400,
      true,
      { exchange, asset, required, available },
    );
  }
}

export class DatabaseError extends BaseError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.DATABASE_QUERY_ERROR, 500, true, context);
  }
}

export class RiskManagementError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode,
    context?: Record<string, any>,
  ) {
    super(message, code, 403, true, context);
  }
}

export class WebSocketError extends BaseError {
  constructor(
    message: string,
    exchange: string,
    context?: Record<string, any>,
  ) {
    super(
      message,
      ErrorCode.WEBSOCKET_CONNECTION_ERROR,
      500,
      true,
      { exchange, ...context },
    );
  }
}

export function isOperationalError(error: Error): boolean {
  if (error instanceof BaseError) {
    return error.isOperational;
  }
  return false;
}
