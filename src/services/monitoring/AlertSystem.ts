/**
 * Alert System with Telegram Integration
 * Sends notifications for important events
 */

import { Telegraf } from 'telegraf';
import { EventEmitter } from 'events';
import { config } from '../../config';
import { systemLogger } from '../../utils/logger';
import { ArbitrageOpportunity } from '../../types';
import { PerformanceSummary } from './PerformanceMetrics';

export enum AlertLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export interface Alert {
  level: AlertLevel;
  title: string;
  message: string;
  timestamp: number;
  data?: any;
}

export class AlertSystem extends EventEmitter {
  private bot: Telegraf | null = null;
  private chatId: string;
  private enabled: boolean;
  private alertQueue: Alert[] = [];
  private sendInterval: NodeJS.Timeout | null = null;
  private readonly SEND_DELAY = 2000; // 2 seconds between messages to avoid rate limits

  constructor() {
    super();

    this.chatId = config.monitoring.telegram.chatId;
    this.enabled = !!(config.monitoring.telegram.botToken && this.chatId);

    if (this.enabled) {
      try {
        this.bot = new Telegraf(config.monitoring.telegram.botToken);
        this.setupBot();
        systemLogger.info('Alert System initialized with Telegram bot');
      } catch (error) {
        systemLogger.error('Failed to initialize Telegram bot:', error);
        this.enabled = false;
      }
    } else {
      systemLogger.warn('Alert System disabled: Telegram credentials not configured');
    }
  }

  /**
   * Setup Telegram bot
   */
  private setupBot(): void {
    if (!this.bot) return;

    this.bot.start((ctx) => {
      ctx.reply('🤖 Arbitrage Bot Alert System\n\nYou will receive notifications for:\n• Trade executions\n• Errors and warnings\n• Daily performance summaries\n• System alerts');
    });

    this.bot.command('status', async (ctx) => {
      ctx.reply('Bot is running and monitoring. Use /help for more commands.');
    });

    this.bot.command('help', async (ctx) => {
      ctx.reply(`Available commands:
/status - Check bot status
/performance - Get current performance metrics
/risk - Get risk metrics
/pause - Pause trading
/resume - Resume trading
/help - Show this message`);
    });

    this.bot.launch().catch((error) => {
      systemLogger.error('Error launching Telegram bot:', error);
    });

    systemLogger.info('Telegram bot launched successfully');
  }

  /**
   * Start alert processing
   */
  public start(): void {
    if (!this.enabled) {
      return;
    }

    // Process alert queue periodically
    this.sendInterval = setInterval(() => {
      this.processQueue();
    }, this.SEND_DELAY);

    systemLogger.info('Alert System started');
  }

  /**
   * Stop alert processing
   */
  public async stop(): Promise<void> {
    if (this.sendInterval) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }

    if (this.bot) {
      await this.bot.stop();
    }

    systemLogger.info('Alert System stopped');
  }

  /**
   * Send alert
   */
  public sendAlert(alert: Alert): void {
    this.alertQueue.push(alert);
    this.emit('alert', alert);

    // Log alert
    const logMethod = {
      [AlertLevel.INFO]: 'info',
      [AlertLevel.WARNING]: 'warn',
      [AlertLevel.ERROR]: 'error',
      [AlertLevel.CRITICAL]: 'error',
    }[alert.level];

    systemLogger[logMethod](`Alert: ${alert.title}`, {
      message: alert.message,
      data: alert.data,
    });
  }

  /**
   * Process alert queue
   */
  private async processQueue(): Promise<void> {
    if (!this.enabled || !this.bot || this.alertQueue.length === 0) {
      return;
    }

    const alert = this.alertQueue.shift();
    if (!alert) return;

    try {
      const message = this.formatAlert(alert);
      await this.bot.telegram.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      systemLogger.error('Error sending Telegram alert:', error);
    }
  }

  /**
   * Format alert message
   */
  private formatAlert(alert: Alert): string {
    const emoji = {
      [AlertLevel.INFO]: 'ℹ️',
      [AlertLevel.WARNING]: '⚠️',
      [AlertLevel.ERROR]: '❌',
      [AlertLevel.CRITICAL]: '🚨',
    }[alert.level];

    const timestamp = new Date(alert.timestamp).toLocaleString();

    let message = `${emoji} *${alert.title}*\n\n${alert.message}\n\n_${timestamp}_`;

    if (alert.data) {
      message += '\n\n```\n' + JSON.stringify(alert.data, null, 2) + '\n```';
    }

    return message;
  }

  /**
   * Send trade notification
   */
  public notifyTrade(
    symbol: string,
    profit: string,
    profitPercentage: string,
    buyExchange: string,
    sellExchange: string,
  ): void {
    if (!config.monitoring.alertOnTrade) {
      return;
    }

    const profitNum = parseFloat(profit);
    const emoji = profitNum >= 0 ? '✅' : '❌';

    this.sendAlert({
      level: profitNum >= 0 ? AlertLevel.INFO : AlertLevel.WARNING,
      title: `Trade Executed ${emoji}`,
      message: `Symbol: ${symbol}\nProfit: $${profit} (${profitPercentage}%)\nBuy: ${buyExchange}\nSell: ${sellExchange}`,
      timestamp: Date.now(),
      data: { symbol, profit, profitPercentage, buyExchange, sellExchange },
    });
  }

  /**
   * Send opportunity notification
   */
  public notifyOpportunity(opportunity: ArbitrageOpportunity): void {
    this.sendAlert({
      level: AlertLevel.INFO,
      title: '💰 Arbitrage Opportunity',
      message: `Symbol: ${opportunity.symbol}\nProfit: $${opportunity.estimatedProfit} (${opportunity.estimatedProfitPercentage}%)\nBuy: ${opportunity.buyExchange} @ $${opportunity.buyPrice}\nSell: ${opportunity.sellExchange} @ $${opportunity.sellPrice}\nQuantity: ${opportunity.quantity}`,
      timestamp: Date.now(),
      data: opportunity,
    });
  }

  /**
   * Send error notification
   */
  public notifyError(title: string, error: Error, context?: any): void {
    if (!config.monitoring.alertOnError) {
      return;
    }

    this.sendAlert({
      level: AlertLevel.ERROR,
      title,
      message: error.message,
      timestamp: Date.now(),
      data: { error: error.stack, context },
    });
  }

  /**
   * Send warning notification
   */
  public notifyWarning(title: string, message: string, data?: any): void {
    this.sendAlert({
      level: AlertLevel.WARNING,
      title,
      message,
      timestamp: Date.now(),
      data,
    });
  }

  /**
   * Send critical notification
   */
  public notifyCritical(title: string, message: string, data?: any): void {
    this.sendAlert({
      level: AlertLevel.CRITICAL,
      title,
      message,
      timestamp: Date.now(),
      data,
    });
  }

  /**
   * Send emergency stop notification
   */
  public notifyEmergencyStop(reason: string): void {
    this.sendAlert({
      level: AlertLevel.CRITICAL,
      title: '🚨 EMERGENCY STOP ACTIVATED',
      message: `Reason: ${reason}\n\nAll trading has been stopped. Manual intervention required.`,
      timestamp: Date.now(),
      data: { reason },
    });
  }

  /**
   * Send low balance notification
   */
  public notifyLowBalance(exchange: string, asset: string, balance: string, threshold: string): void {
    this.sendAlert({
      level: AlertLevel.WARNING,
      title: '💸 Low Balance Alert',
      message: `Exchange: ${exchange}\nAsset: ${asset}\nCurrent: ${balance}\nThreshold: ${threshold}`,
      timestamp: Date.now(),
      data: { exchange, asset, balance, threshold },
    });
  }

  /**
   * Send daily summary
   */
  public sendDailySummary(performance: PerformanceSummary, date: string): void {
    const profitEmoji = parseFloat(performance.netProfit) >= 0 ? '📈' : '📉';

    this.sendAlert({
      level: AlertLevel.INFO,
      title: `${profitEmoji} Daily Summary - ${date}`,
      message: `Total Trades: ${performance.totalTrades}\nWin Rate: ${performance.winRate.toFixed(2)}%\nNet Profit: $${performance.netProfit}\nProfit Factor: ${performance.profitFactor.toFixed(2)}\nSharpe Ratio: ${performance.sharpeRatio.toFixed(2)}\nMax Drawdown: $${performance.maxDrawdown} (${performance.maxDrawdownPercentage.toFixed(2)}%)`,
      timestamp: Date.now(),
      data: performance,
    });
  }

  /**
   * Send system status
   */
  public sendSystemStatus(status: any): void {
    this.sendAlert({
      level: AlertLevel.INFO,
      title: '📊 System Status',
      message: `Status: ${status.isRunning ? 'Running' : 'Stopped'}\nUptime: ${Math.floor(status.uptime / 3600)}h\nActive Strategies: ${status.activeStrategies}/${status.totalStrategies}\nTotal Trades: ${status.performance.totalTrades}\nNet Profit: $${status.performance.totalProfit}`,
      timestamp: Date.now(),
      data: status,
    });
  }

  /**
   * Send startup notification
   */
  public notifyStartup(): void {
    this.sendAlert({
      level: AlertLevel.INFO,
      title: '🚀 Bot Started',
      message: `Arbitrage bot has been started successfully.\nEnvironment: ${config.env}\nTrading: ${config.trading.enableTrading ? 'Enabled' : 'Disabled'}\nPaper Trading: ${config.trading.enablePaperTrading ? 'Enabled' : 'Disabled'}`,
      timestamp: Date.now(),
    });
  }

  /**
   * Send shutdown notification
   */
  public notifyShutdown(): void {
    this.sendAlert({
      level: AlertLevel.INFO,
      title: '🛑 Bot Stopped',
      message: 'Arbitrage bot has been stopped.',
      timestamp: Date.now(),
    });
  }

  /**
   * Test alert system
   */
  public async testAlert(): Promise<void> {
    this.sendAlert({
      level: AlertLevel.INFO,
      title: '🧪 Test Alert',
      message: 'This is a test alert from the Arbitrage Bot Alert System.',
      timestamp: Date.now(),
    });
  }

  /**
   * Check if alert system is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get pending alerts count
   */
  public getPendingAlertsCount(): number {
    return this.alertQueue.length;
  }
}
