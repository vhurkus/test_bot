/**
 * Arbitrage Calculator Unit Tests
 */

import { ArbitrageCalculator } from '../../src/services/arbitrage/ArbitrageCalculator';
import { ExchangeName } from '../../src/types';
import Decimal from 'decimal.js';

describe('ArbitrageCalculator', () => {
  let calculator: ArbitrageCalculator;

  beforeEach(() => {
    calculator = new ArbitrageCalculator();
  });

  describe('calculateProfit', () => {
    it('should calculate profit correctly with maker and taker fees', () => {
      const result = calculator.calculateProfit(
        ExchangeName.BINANCE,
        ExchangeName.BTCTURK,
        '50000',
        '50500',
        '0.1',
        false, // buy is taker
        true,  // sell is maker
      );

      expect(result.buyExchange).toBe(ExchangeName.BINANCE);
      expect(result.sellExchange).toBe(ExchangeName.BTCTURK);
      expect(parseFloat(result.grossProfit)).toBeGreaterThan(0);
      expect(parseFloat(result.netProfit)).toBeGreaterThan(0);
      expect(result.profitable).toBe(true);
    });

    it('should return unprofitable when fees exceed gross profit', () => {
      const result = calculator.calculateProfit(
        ExchangeName.BINANCE,
        ExchangeName.BTCTURK,
        '50000',
        '50001', // Very small price difference
        '0.1',
        false,
        false, // both taker fees (higher)
      );

      expect(parseFloat(result.netProfit)).toBeLessThan(5); // Below min profit threshold
    });

    it('should handle zero profit correctly', () => {
      const result = calculator.calculateProfit(
        ExchangeName.BINANCE,
        ExchangeName.BTCTURK,
        '50000',
        '50000', // Same price
        '0.1',
        false,
        false,
      );

      expect(parseFloat(result.grossProfit)).toBe(0);
      expect(parseFloat(result.netProfit)).toBeLessThan(0); // Fees make it negative
      expect(result.breakEven).toBe(false);
    });
  });

  describe('calculateBreakEvenPrice', () => {
    it('should calculate break-even price correctly', () => {
      const breakEven = calculator.calculateBreakEvenPrice(
        '50000',
        ExchangeName.BINANCE,
        ExchangeName.BTCTURK,
        false, // taker on buy
        true,  // maker on sell
      );

      const breakEvenDecimal = new Decimal(breakEven);
      expect(breakEvenDecimal.greaterThan('50000')).toBe(true);
    });
  });

  describe('calculateMinProfitablePrice', () => {
    it('should calculate minimum profitable price correctly', () => {
      const minPrice = calculator.calculateMinProfitablePrice(
        '50000',
        ExchangeName.BINANCE,
        ExchangeName.BTCTURK,
        '0.5', // 0.5% minimum profit
      );

      const minPriceDecimal = new Decimal(minPrice);
      const breakEven = new Decimal(
        calculator.calculateBreakEvenPrice(
          '50000',
          ExchangeName.BINANCE,
          ExchangeName.BTCTURK,
        ),
      );

      expect(minPriceDecimal.greaterThan(breakEven)).toBe(true);
    });
  });

  describe('validateOpportunity', () => {
    it('should validate fresh opportunity', () => {
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

      const isValid = calculator.validateOpportunity(opportunity, 5000);
      expect(isValid).toBe(true);
    });

    it('should reject old opportunity', () => {
      const opportunity = {
        buyExchange: ExchangeName.BINANCE,
        sellExchange: ExchangeName.BTCTURK,
        symbol: 'BTCUSDT',
        buyPrice: '50000',
        sellPrice: '50500',
        quantity: '0.1',
        estimatedProfit: '45',
        estimatedProfitPercentage: '0.9',
        timestamp: Date.now() - 10000, // 10 seconds old
      };

      const isValid = calculator.validateOpportunity(opportunity, 5000);
      expect(isValid).toBe(false);
    });

    it('should reject low profit opportunity', () => {
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

      const isValid = calculator.validateOpportunity(opportunity, 5000);
      expect(isValid).toBe(false);
    });
  });
});
