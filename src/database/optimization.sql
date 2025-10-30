-- Database Optimization Script
-- Additional indexes and query optimization

-- ====================
-- Performance Indexes
-- ====================

-- Composite index for trade queries with date range and status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_status_created_at
ON trades(status, created_at DESC);

-- Index for profit tracking queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_symbol_created_at
ON trades(symbol, created_at DESC)
WHERE status = 'COMPLETED';

-- Index for exchange-specific queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_exchanges_created_at
ON trades(buy_exchange, sell_exchange, created_at DESC);

-- Index for profit range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_net_profit
ON trades(net_profit DESC)
WHERE status = 'COMPLETED';

-- Partial index for active orders
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_active
ON orders(status, created_at DESC)
WHERE status IN ('PENDING', 'OPEN', 'PARTIALLY_FILLED');

-- Index for order lookup by exchange
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_exchange_symbol
ON orders(exchange, symbol, created_at DESC);

-- ====================
-- Materialized Views for Fast Queries
-- ====================

-- Daily performance summary materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_performance AS
SELECT
    DATE(created_at) as date,
    COUNT(*) as total_trades,
    COUNT(*) FILTER (WHERE net_profit > 0) as profitable_trades,
    COUNT(*) FILTER (WHERE net_profit < 0) as losing_trades,
    SUM(net_profit) as net_profit,
    AVG(net_profit) as avg_profit,
    MAX(net_profit) as best_trade,
    MIN(net_profit) as worst_trade,
    SUM(buy_fee + sell_fee) as total_fees,
    AVG(profit_percentage) as avg_profit_percentage
FROM trades
WHERE status = 'COMPLETED'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_performance_date
ON mv_daily_performance(date DESC);

-- Symbol performance materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_symbol_performance AS
SELECT
    symbol,
    COUNT(*) as total_trades,
    SUM(net_profit) as total_profit,
    AVG(net_profit) as avg_profit,
    MAX(net_profit) as best_trade,
    MIN(net_profit) as worst_trade,
    COUNT(*) FILTER (WHERE net_profit > 0) as profitable_trades,
    (COUNT(*) FILTER (WHERE net_profit > 0)::float / COUNT(*)::float * 100) as win_rate
FROM trades
WHERE status = 'COMPLETED'
GROUP BY symbol
ORDER BY total_profit DESC;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_symbol_performance_symbol
ON mv_symbol_performance(symbol);

-- ====================
-- Functions for Auto-refresh
-- ====================

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_performance_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_performance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_symbol_performance;
END;
$$ LANGUAGE plpgsql;

-- ====================
-- Partitioning Setup (Optional)
-- ====================

-- Create partitioned table for trades (by month)
-- Uncomment if you want to use partitioning for large datasets

/*
CREATE TABLE trades_partitioned (
    LIKE trades INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Create partitions for each month
CREATE TABLE trades_2025_01 PARTITION OF trades_partitioned
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE trades_2025_02 PARTITION OF trades_partitioned
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Add more partitions as needed
*/

-- ====================
-- Database Maintenance
-- ====================

-- Function to archive old completed trades
CREATE OR REPLACE FUNCTION archive_old_trades(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM trades
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL
        AND status = 'COMPLETED'
    RETURNING COUNT(*) INTO deleted_count;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old error logs
CREATE OR REPLACE FUNCTION cleanup_error_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM error_logs
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL
    RETURNING COUNT(*) INTO deleted_count;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ====================
-- Query Optimization Settings
-- ====================

-- Increase work_mem for complex queries (adjust based on available RAM)
-- ALTER DATABASE arbitrage_bot SET work_mem = '16MB';

-- Increase shared_buffers (adjust based on available RAM)
-- ALTER DATABASE arbitrage_bot SET shared_buffers = '256MB';

-- Enable parallel query execution
-- ALTER DATABASE arbitrage_bot SET max_parallel_workers_per_gather = 4;

-- ====================
-- Monitoring Queries
-- ====================

-- View to check index usage
CREATE OR REPLACE VIEW v_index_usage AS
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- View to check table sizes
CREATE OR REPLACE VIEW v_table_sizes AS
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ====================
-- Performance Analysis
-- ====================

-- Query to find slow queries (requires pg_stat_statements extension)
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

/*
SELECT
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY mean_exec_time DESC
LIMIT 10;
*/

-- ====================
-- Backup & Restore
-- ====================

-- Create backup function
CREATE OR REPLACE FUNCTION create_backup()
RETURNS TEXT AS $$
DECLARE
    backup_file TEXT;
BEGIN
    backup_file := 'backup_' || TO_CHAR(NOW(), 'YYYY_MM_DD_HH24_MI_SS') || '.sql';
    RETURN backup_file;
END;
$$ LANGUAGE plpgsql;

-- ====================
-- Completion
-- ====================

COMMENT ON FUNCTION refresh_performance_views() IS 'Refreshes all materialized views for performance metrics';
COMMENT ON FUNCTION archive_old_trades(INTEGER) IS 'Archives trades older than specified days';
COMMENT ON FUNCTION cleanup_error_logs(INTEGER) IS 'Cleans up error logs older than specified days';
