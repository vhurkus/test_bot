/**
 * Risk Manager Unit Tests
 */

import { RiskManager } from '../../src/services/risk/RiskManager';
import { BalanceManager } from '../../src/services/balance/BalanceManager';
import { ExchangeName } from '../../src/types';

// Mock BalanceManager
jest.mock('../../src/services/balance/BalanceManager');

describe('RiskManager', () => {
  let riskManager: RiskManager;
  let mockBalanceManager: jest.Mocked<BalanceManager>;

  beforeEach(() => {
    mockBalanceManager = new BalanceManager() as jest.Mocked<BalanceManager>;
    riskManager = new RiskManager(mockBalanceManager);
  });

  describe('canTrade', () => {
    it('should allow trading when conditions are met', () => {
      const result = riskManager.canTrade();

      expect(result.allowed).toBe(true);
    });

    it('should prevent trading when emergency stop is active', () => {
      riskManager.activateEmergencyStop('Test stop');

      const result = riskManager.canTrade();

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Emergency stop');
    });

    it('should prevent trading when daily loss limit exceeded', () => {
      // Record multiple losing trades
      for (let i = 0; i < 10; i++) {
        riskManager.recordTrade('-100');
      }

      const result = riskManager.canTrade();

      expect(result.allowed).toBe(false);
    });
  });

  describe('validateOpportunity', () => {
    it('should validate profitable opportunity with sufficient balance', async () => {
      const opportunity = {
        buyExchange: ExchangeName.BINANCE,
        sellExchange: ExchangeName.BTCTURK,
        symbol: 'BTCUSDT',
        buyPrice: '50000',
        sellPrice: '50500',
        quantity: '0.1',
        estimatedProfit: '45',
        estimatedProfitPercentage: '0.9',
        timestamp: Date.now(),
      };

      mockBalanceManager.hasSufficientBalance = jest.fn().mockResolvedValue(true);

      const result = await riskManager.validateOpportunity(opportunity);

      expect(result.valid).toBe(true);
    });

    it('should reject opportunity with insufficient profit', async () => {
      const opportunity = {
        buyExchange: ExchangeName.BINANCE,
        sellExchange: ExchangeName.BTCTURK,
        symbol: 'BTCUSDT',
        buyPrice: '50000',
        sellPrice: '50010',
        quantity: '0.1',
        estimatedProfit: '1',
        estimatedProfitPercentage: '0.02',
        timestamp: Date.now(),
      };

      const result = await riskManager.validateOpportunity(opportunity);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Profit below minimum');
    });

    it('should reject opportunity with insufficient balance', async () => {
      const opportunity = {
        buyExchange: ExchangeName.BINANCE,
        sellExchange: ExchangeName.BTCTURK,
        symbol: 'BTCUSDT',
        buyPrice: '50000',
        sellPrice: '50500',
        quantity: '0.1',
        estimatedProfit: '45',
        estimatedProfitPercentage: '0.9',
        timestamp: Date.now(),
      };

      mockBalanceManager.hasSufficientBalance = jest.fn().mockResolvedValue(false);

      const result = await riskManager.validateOpportunity(opportunity);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Insufficient balance');
    });
  });

  describe('recordTrade', () => {
    it('should record profitable trade correctly', () => {
      riskManager.recordTrade('100');

      const metrics = riskManager.getTodayMetrics();

      expect(metrics.totalTrades).toBe(1);
      expect(metrics.profitableTrades).toBe(1);
      expect(metrics.losingTrades).toBe(0);
    });

    it('should record losing trade correctly', () => {
      riskManager.recordTrade('-50');

      const metrics = riskManager.getTodayMetrics();

      expect(metrics.totalTrades).toBe(1);
      expect(metrics.profitableTrades).toBe(0);
      expect(metrics.losingTrades).toBe(1);
    });

    it('should calculate win rate correctly', () => {
      riskManager.recordTrade('100');
      riskManager.recordTrade('50');
      riskManager.recordTrade('-30');

      const winRate = riskManager.getWinRate();

      expect(winRate).toBeCloseTo(66.67, 1); // 2/3 = 66.67%
    });
  });

  describe('getRiskLevel', () => {
    it('should return LOW risk level initially', () => {
      const riskLevel = riskManager.getRiskLevel();

      expect(riskLevel).toBe('LOW');
    });

    it('should return HIGH risk level after significant losses', () => {
      // Record trades that approach daily loss limit
      for (let i = 0; i < 5; i++) {
        riskManager.recordTrade('-80');
      }

      const riskLevel = riskManager.getRiskLevel();

      expect(['HIGH', 'CRITICAL']).toContain(riskLevel);
    });
  });

  describe('emergencyStop', () => {
    it('should activate emergency stop', () => {
      expect(riskManager.isEmergencyStopActive()).toBe(false);

      riskManager.activateEmergencyStop('Test reason');

      expect(riskManager.isEmergencyStopActive()).toBe(true);
    });

    it('should deactivate emergency stop', () => {
      riskManager.activateEmergencyStop('Test reason');
      expect(riskManager.isEmergencyStopActive()).toBe(true);

      riskManager.deactivateEmergencyStop();

      expect(riskManager.isEmergencyStopActive()).toBe(false);
    });
  });
});
