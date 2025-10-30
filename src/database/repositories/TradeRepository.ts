/**
 * Trade Repository
 * Optimized database queries for trades
 */

import { AppDataSource } from '../index';
import { databaseLogger } from '../../utils/logger';

export interface TradeQueryOptions {
  limit?: number;
  offset?: number;
  symbol?: string;
  exchange?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
}

export class TradeRepository {
  /**
   * Get recent trades with optimized query
   */
  public static async getRecentTrades(options: TradeQueryOptions = {}): Promise<any[]> {
    const { limit = 50, offset = 0, symbol, exchange, status, startDate, endDate } = options;

    try {
      let query = `
        SELECT * FROM trades
        WHERE 1=1
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (symbol) {
        query += ` AND symbol = $${paramIndex++}`;
        params.push(symbol);
      }

      if (exchange) {
        query += ` AND (buy_exchange = $${paramIndex++} OR sell_exchange = $${paramIndex++})`;
        params.push(exchange, exchange);
      }

      if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
      }

      if (startDate) {
        query += ` AND created_at >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND created_at <= $${paramIndex++}`;
        params.push(endDate);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const result = await AppDataSource.query(query, params);
      return result;
    } catch (error) {
      databaseLogger.error('Error getting recent trades:', error);
      throw error;
    }
  }

  /**
   * Get trade statistics
   */
  public static async getTradeStatistics(startDate?: Date, endDate?: Date): Promise<any> {
    try {
      let query = `
        SELECT
          COUNT(*) as total_trades,
          COUNT(*) FILTER (WHERE net_profit > 0) as profitable_trades,
          COUNT(*) FILTER (WHERE net_profit < 0) as losing_trades,
          SUM(net_profit) as total_profit,
          AVG(net_profit) as avg_profit,
          MAX(net_profit) as largest_win,
          MIN(net_profit) as largest_loss,
          AVG(profit_percentage) as avg_profit_percentage
        FROM trades
        WHERE status = 'COMPLETED'
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (startDate) {
        query += ` AND created_at >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND created_at <= $${paramIndex++}`;
        params.push(endDate);
      }

      const result = await AppDataSource.query(query, params);
      return result[0];
    } catch (error) {
      databaseLogger.error('Error getting trade statistics:', error);
      throw error;
    }
  }

  /**
   * Get daily profit summary
   */
  public static async getDailyProfitSummary(days = 30): Promise<any[]> {
    try {
      const query = `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as total_trades,
          SUM(CASE WHEN net_profit > 0 THEN 1 ELSE 0 END) as profitable_trades,
          SUM(net_profit) as net_profit,
          AVG(net_profit) as avg_profit,
          MAX(net_profit) as best_trade,
          MIN(net_profit) as worst_trade
        FROM trades
        WHERE status = 'COMPLETED'
          AND created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `;

      const result = await AppDataSource.query(query);
      return result;
    } catch (error) {
      databaseLogger.error('Error getting daily profit summary:', error);
      throw error;
    }
  }

  /**
   * Get profit by symbol
   */
  public static async getProfitBySymbol(startDate?: Date, endDate?: Date): Promise<any[]> {
    try {
      let query = `
        SELECT
          symbol,
          COUNT(*) as total_trades,
          SUM(net_profit) as total_profit,
          AVG(net_profit) as avg_profit,
          MAX(net_profit) as best_trade
        FROM trades
        WHERE status = 'COMPLETED'
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (startDate) {
        query += ` AND created_at >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND created_at <= $${paramIndex++}`;
        params.push(endDate);
      }

      query += ` GROUP BY symbol ORDER BY total_profit DESC`;

      const result = await AppDataSource.query(query, params);
      return result;
    } catch (error) {
      databaseLogger.error('Error getting profit by symbol:', error);
      throw error;
    }
  }

  /**
   * Archive old trades (for data retention)
   */
  public static async archiveOldTrades(daysToKeep = 90): Promise<number> {
    try {
      const query = `
        DELETE FROM trades
        WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
          AND status = 'COMPLETED'
        RETURNING id
      `;

      const result = await AppDataSource.query(query);
      databaseLogger.info(`Archived ${result.length} old trades`);
      return result.length;
    } catch (error) {
      databaseLogger.error('Error archiving old trades:', error);
      throw error;
    }
  }

  /**
   * Vacuum and analyze tables for optimization
   */
  public static async optimizeTables(): Promise<void> {
    try {
      await AppDataSource.query('VACUUM ANALYZE trades');
      await AppDataSource.query('VACUUM ANALYZE orders');
      await AppDataSource.query('VACUUM ANALYZE balances');
      await AppDataSource.query('VACUUM ANALYZE profit_tracking');
      databaseLogger.info('Database tables optimized');
    } catch (error) {
      databaseLogger.error('Error optimizing tables:', error);
      throw error;
    }
  }
}
