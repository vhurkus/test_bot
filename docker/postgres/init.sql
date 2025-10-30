-- Initial database schema for arbitrage bot
-- This script is executed when the PostgreSQL container is first created

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create trades table
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_type VARCHAR(20) NOT NULL CHECK (trade_type IN ('BUY', 'SELL', 'ARBITRAGE')),
    buy_exchange VARCHAR(50) NOT NULL,
    sell_exchange VARCHAR(50) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    buy_price DECIMAL(20, 8) NOT NULL,
    sell_price DECIMAL(20, 8) NOT NULL,
    quantity DECIMAL(20, 8) NOT NULL,
    buy_fee DECIMAL(20, 8) NOT NULL DEFAULT 0,
    sell_fee DECIMAL(20, 8) NOT NULL DEFAULT 0,
    gross_profit DECIMAL(20, 8) NOT NULL,
    net_profit DECIMAL(20, 8) NOT NULL,
    profit_percentage DECIMAL(10, 4) NOT NULL,
    buy_order_id VARCHAR(100),
    sell_order_id VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'PARTIAL')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange VARCHAR(50) NOT NULL,
    exchange_order_id VARCHAR(100) UNIQUE NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('BUY', 'SELL')),
    order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('LIMIT', 'MARKET')),
    price DECIMAL(20, 8),
    quantity DECIMAL(20, 8) NOT NULL,
    filled_quantity DECIMAL(20, 8) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED')),
    fee DECIMAL(20, 8) DEFAULT 0,
    fee_asset VARCHAR(10),
    trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    filled_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB
);

-- Create balances table
CREATE TABLE IF NOT EXISTS balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange VARCHAR(50) NOT NULL,
    asset VARCHAR(10) NOT NULL,
    free DECIMAL(20, 8) NOT NULL DEFAULT 0,
    locked DECIMAL(20, 8) NOT NULL DEFAULT 0,
    total DECIMAL(20, 8) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(exchange, asset)
);

-- Create profit tracking table
CREATE TABLE IF NOT EXISTS profit_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    exchange VARCHAR(50),
    symbol VARCHAR(20),
    total_trades INTEGER NOT NULL DEFAULT 0,
    successful_trades INTEGER NOT NULL DEFAULT 0,
    failed_trades INTEGER NOT NULL DEFAULT 0,
    gross_profit DECIMAL(20, 8) NOT NULL DEFAULT 0,
    net_profit DECIMAL(20, 8) NOT NULL DEFAULT 0,
    total_fees DECIMAL(20, 8) NOT NULL DEFAULT 0,
    total_volume DECIMAL(20, 8) NOT NULL DEFAULT 0,
    win_rate DECIMAL(10, 4) NOT NULL DEFAULT 0,
    average_profit_per_trade DECIMAL(20, 8) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, exchange, symbol)
);

-- Create error logs table
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    error_type VARCHAR(50) NOT NULL,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    category VARCHAR(50),
    exchange VARCHAR(50),
    symbol VARCHAR(20),
    operation VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_exchanges ON trades(buy_exchange, sell_exchange);

CREATE INDEX IF NOT EXISTS idx_orders_exchange_order_id ON orders(exchange_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_trade_id ON orders(trade_id);

CREATE INDEX IF NOT EXISTS idx_balances_exchange_asset ON balances(exchange, asset);

CREATE INDEX IF NOT EXISTS idx_profit_tracking_date ON profit_tracking(date DESC);
CREATE INDEX IF NOT EXISTS idx_profit_tracking_exchange ON profit_tracking(exchange);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_balances_updated_at BEFORE UPDATE ON balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profit_tracking_updated_at BEFORE UPDATE ON profit_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert initial balance records for tracking
INSERT INTO balances (exchange, asset, free, locked, total) VALUES
    ('BINANCE', 'USDT', 0, 0, 0),
    ('BINANCE', 'BTC', 0, 0, 0),
    ('BINANCE', 'ETH', 0, 0, 0),
    ('BTCTURK', 'USDT', 0, 0, 0),
    ('BTCTURK', 'BTC', 0, 0, 0),
    ('BTCTURK', 'ETH', 0, 0, 0)
ON CONFLICT (exchange, asset) DO NOTHING;

-- Create view for daily profit summary
CREATE OR REPLACE VIEW daily_profit_summary AS
SELECT
    date,
    SUM(total_trades) as total_trades,
    SUM(successful_trades) as successful_trades,
    SUM(failed_trades) as failed_trades,
    SUM(net_profit) as net_profit,
    SUM(gross_profit) as gross_profit,
    SUM(total_fees) as total_fees,
    AVG(win_rate) as avg_win_rate
FROM profit_tracking
GROUP BY date
ORDER BY date DESC;

-- Create view for active trades
CREATE OR REPLACE VIEW active_trades AS
SELECT
    t.*,
    o_buy.status as buy_order_status,
    o_sell.status as sell_order_status
FROM trades t
LEFT JOIN orders o_buy ON t.buy_order_id = o_buy.exchange_order_id
LEFT JOIN orders o_sell ON t.sell_order_id = o_sell.exchange_order_id
WHERE t.status IN ('PENDING', 'PARTIAL')
ORDER BY t.created_at DESC;
