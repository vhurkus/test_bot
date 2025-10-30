/**
 * Real-time Dashboard Server
 * Express + Socket.io for monitoring
 */

import express, { Application, Request, Response } from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { ExecutionEngine } from '../execution/ExecutionEngine';
import { PerformanceMetrics } from './PerformanceMetrics';
import { RiskManager } from '../risk/RiskManager';
import { BalanceManager } from '../balance/BalanceManager';
import { OrderManager } from '../order/OrderManager';
import { ExchangeFactory } from '../../exchanges';
import { config } from '../../config';
import { systemLogger } from '../../utils/logger';

export interface DashboardConfig {
  port: number;
  updateInterval: number; // milliseconds
}

export class DashboardServer {
  private app: Application;
  private httpServer: HttpServer;
  private io: SocketServer;
  private config: DashboardConfig;

  private executionEngine: ExecutionEngine;
  private performanceMetrics: PerformanceMetrics;
  private riskManager: RiskManager;
  private balanceManager: BalanceManager;
  private orderManager: OrderManager;

  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    executionEngine: ExecutionEngine,
    performanceMetrics: PerformanceMetrics,
    riskManager: RiskManager,
    balanceManager: BalanceManager,
    orderManager: OrderManager,
    dashboardConfig?: Partial<DashboardConfig>,
  ) {
    this.executionEngine = executionEngine;
    this.performanceMetrics = performanceMetrics;
    this.riskManager = riskManager;
    this.balanceManager = balanceManager;
    this.orderManager = orderManager;

    this.config = {
      port: dashboardConfig?.port || config.port,
      updateInterval: dashboardConfig?.updateInterval || 1000,
    };

    // Initialize Express
    this.app = express();
    this.httpServer = createServer(this.app);

    // Initialize Socket.io
    this.io = new SocketServer(this.httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.setupRoutes();
    this.setupSocketHandlers();

    systemLogger.info('Dashboard Server initialized', {
      port: this.config.port,
      updateInterval: this.config.updateInterval,
    });
  }

  /**
   * Setup HTTP routes
   */
  private setupRoutes(): void {
    // Middleware
    this.app.use(express.json());
    this.app.use(express.static('public'));

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime(),
      });
    });

    // Dashboard home
    this.app.get('/', (req: Request, res: Response) => {
      res.send(this.getHTMLDashboard());
    });

    // API: Get performance summary
    this.app.get('/api/performance', (req: Request, res: Response) => {
      const summary = this.performanceMetrics.getSummary();
      res.json(summary);
    });

    // API: Get system status
    this.app.get('/api/status', (req: Request, res: Response) => {
      const status = this.getSystemStatus();
      res.json(status);
    });

    // API: Get balances
    this.app.get('/api/balances', (req: Request, res: Response) => {
      const balances = this.balanceManager.getAllBalances();
      res.json(balances);
    });

    // API: Get active strategies
    this.app.get('/api/strategies', (req: Request, res: Response) => {
      const strategies = this.executionEngine.getAllStrategyStats();
      res.json(strategies);
    });

    // API: Get risk stats
    this.app.get('/api/risk', (req: Request, res: Response) => {
      const risk = this.riskManager.getStats();
      res.json(risk);
    });

    // API: Get recent trades
    this.app.get('/api/trades/recent', (req: Request, res: Response) => {
      const limit = parseInt(req.query.limit as string) || 10;
      const trades = this.performanceMetrics.getRecentTrades(limit);
      res.json(trades);
    });

    // API: Control commands
    this.app.post('/api/control/:action', async (req: Request, res: Response) => {
      const { action } = req.params;

      try {
        switch (action) {
          case 'pause':
            await this.executionEngine.pause();
            res.json({ success: true, message: 'Trading paused' });
            break;

          case 'resume':
            await this.executionEngine.resume();
            res.json({ success: true, message: 'Trading resumed' });
            break;

          case 'emergency-stop':
            this.riskManager.activateEmergencyStop('Manual emergency stop');
            res.json({ success: true, message: 'Emergency stop activated' });
            break;

          default:
            res.status(400).json({ success: false, message: 'Unknown action' });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          message: (error as Error).message,
        });
      }
    });
  }

  /**
   * Setup Socket.io handlers
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      systemLogger.info('Dashboard client connected', { socketId: socket.id });

      // Send initial data
      socket.emit('initialData', this.getAllData());

      // Handle disconnect
      socket.on('disconnect', () => {
        systemLogger.info('Dashboard client disconnected', { socketId: socket.id });
      });

      // Handle data requests
      socket.on('requestUpdate', () => {
        socket.emit('update', this.getAllData());
      });
    });
  }

  /**
   * Get all dashboard data
   */
  private getAllData() {
    return {
      performance: this.performanceMetrics.getSummary(),
      status: this.getSystemStatus(),
      balances: this.balanceManager.getAllBalances(),
      strategies: this.executionEngine.getAllStrategyStats(),
      risk: this.riskManager.getStats(),
      recentTrades: this.performanceMetrics.getRecentTrades(10),
      timestamp: Date.now(),
    };
  }

  /**
   * Get system status
   */
  private getSystemStatus() {
    return {
      isRunning: this.executionEngine.isEngineRunning(),
      orderStats: this.orderManager.getStats(),
      balanceStats: this.balanceManager.getStats(),
      exchangeStats: ExchangeFactory.getStats(),
      engineStats: this.executionEngine.getStats(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }

  /**
   * Start the dashboard server
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      systemLogger.warn('Dashboard server is already running');
      return;
    }

    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, () => {
        systemLogger.info(`Dashboard server started on port ${this.config.port}`);
        systemLogger.info(`Dashboard URL: http://localhost:${this.config.port}`);

        // Start periodic updates
        this.startPeriodicUpdates();

        this.isRunning = true;
        resolve();
      });
    });
  }

  /**
   * Stop the dashboard server
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Stop periodic updates
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    return new Promise((resolve, reject) => {
      this.httpServer.close((err) => {
        if (err) {
          systemLogger.error('Error closing dashboard server:', err);
          reject(err);
        } else {
          systemLogger.info('Dashboard server stopped');
          this.isRunning = false;
          resolve();
        }
      });
    });
  }

  /**
   * Start periodic updates to connected clients
   */
  private startPeriodicUpdates(): void {
    this.updateInterval = setInterval(() => {
      const data = this.getAllData();
      this.io.emit('update', data);
    }, this.config.updateInterval);
  }

  /**
   * Broadcast event to all connected clients
   */
  public broadcast(event: string, data: any): void {
    this.io.emit(event, data);
  }

  /**
   * Get simple HTML dashboard
   */
  private getHTMLDashboard(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Arbitrage Bot Dashboard</title>
    <script src="https://cdn.socket.io/4.6.0/socket.io.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { margin-bottom: 30px; color: #60a5fa; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .card {
            background: #1e293b;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        }
        .card h2 {
            font-size: 18px;
            margin-bottom: 16px;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .metric {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid #334155;
        }
        .metric:last-child { border-bottom: none; margin-bottom: 0; }
        .metric-label { color: #94a3b8; }
        .metric-value {
            font-weight: 600;
            color: #e2e8f0;
        }
        .positive { color: #10b981 !important; }
        .negative { color: #ef4444 !important; }
        .status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }
        .status.running { background: #065f46; color: #6ee7b7; }
        .status.stopped { background: #7f1d1d; color: #fca5a5; }
        .controls {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        button {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-primary:hover { background: #2563eb; }
        .btn-danger { background: #ef4444; color: white; }
        .btn-danger:hover { background: #dc2626; }
        .btn-success { background: #10b981; color: white; }
        .btn-success:hover { background: #059669; }
        #lastUpdate {
            text-align: right;
            color: #64748b;
            font-size: 14px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Maker-Taker Arbitrage Bot Dashboard</h1>

        <div class="grid">
            <div class="card">
                <h2>System Status</h2>
                <div class="metric">
                    <span class="metric-label">Status</span>
                    <span class="metric-value status" id="systemStatus">-</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Uptime</span>
                    <span class="metric-value" id="uptime">-</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Active Strategies</span>
                    <span class="metric-value" id="activeStrategies">-</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Open Orders</span>
                    <span class="metric-value" id="openOrders">-</span>
                </div>
            </div>

            <div class="card">
                <h2>Performance</h2>
                <div class="metric">
                    <span class="metric-label">Total Trades</span>
                    <span class="metric-value" id="totalTrades">-</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Win Rate</span>
                    <span class="metric-value" id="winRate">-</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Net Profit</span>
                    <span class="metric-value" id="netProfit">-</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Sharpe Ratio</span>
                    <span class="metric-value" id="sharpeRatio">-</span>
                </div>
            </div>

            <div class="card">
                <h2>Risk Metrics</h2>
                <div class="metric">
                    <span class="metric-label">Risk Level</span>
                    <span class="metric-value" id="riskLevel">-</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Max Drawdown</span>
                    <span class="metric-value negative" id="maxDrawdown">-</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Daily P&L</span>
                    <span class="metric-value" id="dailyPnl">-</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Emergency Stop</span>
                    <span class="metric-value" id="emergencyStop">-</span>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>Controls</h2>
            <div class="controls">
                <button class="btn-primary" onclick="pauseTrading()">Pause Trading</button>
                <button class="btn-success" onclick="resumeTrading()">Resume Trading</button>
                <button class="btn-danger" onclick="emergencyStop()">Emergency Stop</button>
            </div>
        </div>

        <div id="lastUpdate">Last updated: -</div>
    </div>

    <script>
        const socket = io();

        socket.on('connect', () => {
            console.log('Connected to dashboard server');
        });

        socket.on('initialData', (data) => {
            updateDashboard(data);
        });

        socket.on('update', (data) => {
            updateDashboard(data);
        });

        function updateDashboard(data) {
            // System Status
            document.getElementById('systemStatus').textContent = data.status.isRunning ? 'Running' : 'Stopped';
            document.getElementById('systemStatus').className = 'metric-value status ' + (data.status.isRunning ? 'running' : 'stopped');
            document.getElementById('uptime').textContent = formatUptime(data.status.uptime);
            document.getElementById('activeStrategies').textContent = data.engineStats.activeStrategies + '/' + data.engineStats.totalStrategies;
            document.getElementById('openOrders').textContent = data.status.orderStats.activeOrdersCount;

            // Performance
            document.getElementById('totalTrades').textContent = data.performance.totalTrades;
            document.getElementById('winRate').textContent = data.performance.winRate.toFixed(2) + '%';
            document.getElementById('netProfit').textContent = '$' + data.performance.netProfit;
            document.getElementById('netProfit').className = 'metric-value ' + (parseFloat(data.performance.netProfit) >= 0 ? 'positive' : 'negative');
            document.getElementById('sharpeRatio').textContent = data.performance.sharpeRatio.toFixed(2);

            // Risk
            document.getElementById('riskLevel').textContent = data.risk.riskLevel;
            document.getElementById('maxDrawdown').textContent = '$' + data.performance.maxDrawdown + ' (' + data.performance.maxDrawdownPercentage.toFixed(2) + '%)';
            document.getElementById('dailyPnl').textContent = '$' + data.risk.today.netProfit;
            document.getElementById('dailyPnl').className = 'metric-value ' + (parseFloat(data.risk.today.netProfit) >= 0 ? 'positive' : 'negative');
            document.getElementById('emergencyStop').textContent = data.risk.emergencyStop ? 'ACTIVE' : 'Inactive';
            document.getElementById('emergencyStop').className = 'metric-value ' + (data.risk.emergencyStop ? 'negative' : 'positive');

            // Last update
            document.getElementById('lastUpdate').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
        }

        function formatUptime(seconds) {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return days + 'd ' + hours + 'h ' + minutes + 'm';
        }

        async function pauseTrading() {
            await fetch('/api/control/pause', { method: 'POST' });
        }

        async function resumeTrading() {
            await fetch('/api/control/resume', { method: 'POST' });
        }

        async function emergencyStop() {
            if (confirm('Are you sure you want to activate emergency stop?')) {
                await fetch('/api/control/emergency-stop', { method: 'POST' });
            }
        }
    </script>
</body>
</html>
    `;
  }
}
