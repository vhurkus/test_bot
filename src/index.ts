/**
 * Maker-Taker Arbitrage Bot
 * Entry point for the application
 */

import { config } from './config';
import { logger, systemLogger } from './utils/logger';
import { initializeDatabase, closeDatabase } from './database';
import { redisClient } from './database/redis';
import { ExchangeFactory } from './exchanges';
import { OrderManager } from './services/order/OrderManager';
import { BalanceManager } from './services/balance/BalanceManager';
import { RiskManager } from './services/risk/RiskManager';
import { ExecutionEngine } from './services/execution/ExecutionEngine';
import { gracefulShutdown } from './utils/gracefulShutdown';

let orderManager: OrderManager;
let balanceManager: BalanceManager;
let riskManager: RiskManager;
let executionEngine: ExecutionEngine;

async function main() {
  try {
    logger.info('🚀 Starting Maker-Taker Arbitrage Bot...');
    logger.info(`Environment: ${config.env}`);
    logger.info(`Log Level: ${config.logLevel}`);
    logger.info(`Trading Enabled: ${config.trading.enableTrading}`);
    logger.info(`Paper Trading: ${config.trading.enablePaperTrading}`);

    // Initialize database connections
    systemLogger.info('Initializing database connections...');
    await initializeDatabase();
    await redisClient.connect();

    // Initialize exchange connectors
    systemLogger.info('Initializing exchange connectors...');
    await ExchangeFactory.initializeAll();

    // Test exchange connections
    systemLogger.info('Testing exchange connections...');
    const connectionTests = await ExchangeFactory.testAllConnections();
    systemLogger.info('Connection test results:', connectionTests);

    // Initialize Order Manager
    systemLogger.info('Initializing Order Manager...');
    orderManager = new OrderManager();
    orderManager.start();

    // Initialize Balance Manager
    systemLogger.info('Initializing Balance Manager...');
    balanceManager = new BalanceManager();

    // Register exchanges with Balance Manager
    for (const exchange of ExchangeFactory.getAllExchanges()) {
      balanceManager.registerExchange(exchange);
    }

    balanceManager.start();

    // Initialize Risk Manager
    systemLogger.info('Initializing Risk Manager...');
    riskManager = new RiskManager(balanceManager);

    // Initialize Execution Engine
    systemLogger.info('Initializing Execution Engine...');
    executionEngine = new ExecutionEngine(orderManager, balanceManager, riskManager);

    // Setup execution engine event handlers
    executionEngine.on('tradeCompleted', ({ symbol, execution }) => {
      logger.info(`✅ Trade completed for ${symbol}`, {
        profit: execution.profit,
        profitPercentage: execution.opportunity.estimatedProfitPercentage,
      });
    });

    executionEngine.on('emergencyStop', (reason) => {
      logger.error(`🚨 EMERGENCY STOP: ${reason}`);
    });

    executionEngine.on('paperTrade', ({ symbol, opportunity }) => {
      logger.info(`📝 Paper trade for ${symbol}`, {
        profit: opportunity.estimatedProfit,
        profitPercentage: opportunity.estimatedProfitPercentage,
      });
    });

    // Start execution engine if trading is enabled
    if (config.trading.enableTrading || config.trading.enablePaperTrading) {
      systemLogger.info('Starting Execution Engine...');
      await executionEngine.start();
      logger.info('🎯 Execution Engine started - Trading is active');
    } else {
      logger.warn('⚠️  Trading is disabled - Bot running in monitor-only mode');
    }

    // Register shutdown handlers
    gracefulShutdown.registerHandler('executionEngine', async () => {
      if (executionEngine) {
        await executionEngine.stop();
      }
    });

    gracefulShutdown.registerHandler('orderManager', async () => {
      orderManager.stop();
    });

    gracefulShutdown.registerHandler('balanceManager', async () => {
      balanceManager.stop();
    });

    gracefulShutdown.registerHandler('exchanges', async () => {
      await ExchangeFactory.closeAll();
    });

    gracefulShutdown.registerHandler('database', async () => {
      await closeDatabase();
      await redisClient.disconnect();
    });

    logger.info('✅ Bot started successfully');
    logger.info('📊 System is ready for arbitrage trading');

    // Log system status periodically
    setInterval(() => {
      const orderStats = orderManager.getStats();
      const balanceStats = balanceManager.getStats();
      const exchangeStats = ExchangeFactory.getStats();
      const engineStats = executionEngine ? executionEngine.getStats() : null;
      const riskStats = riskManager ? riskManager.getStats() : null;

      systemLogger.info('System Status:', {
        orders: orderStats,
        balances: balanceStats,
        exchanges: exchangeStats,
        engine: engineStats,
        risk: riskStats,
      });
    }, 60000); // Every minute
  } catch (error) {
    logger.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// Note: Graceful shutdown is now handled by the gracefulShutdown utility
// which sets up signal handlers automatically

main().catch((error) => {
  logger.error('💥 Fatal error:', error);
  process.exit(1);
});
