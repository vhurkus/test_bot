/**
 * Orderbook Analyzer Unit Tests
 */

import { OrderbookAnalyzer } from '../../src/services/orderbook/OrderbookAnalyzer';
import { Orderbook, ExchangeName } from '../../src/types';

describe('OrderbookAnalyzer', () => {
  let analyzer: OrderbookAnalyzer;
  let mockOrderbook: Orderbook;

  beforeEach(() => {
    analyzer = new OrderbookAnalyzer();

    mockOrderbook = {
      exchange: ExchangeName.BINANCE,
      symbol: 'BTCUSDT',
      bids: [
        { price: '50000', quantity: '1' },
        { price: '49990', quantity: '2' },
        { price: '49980', quantity: '1.5' },
      ],
      asks: [
        { price: '50010', quantity: '1' },
        { price: '50020', quantity: '2' },
        { price: '50030', quantity: '1.5' },
      ],
      timestamp: Date.now(),
    };
  });

  describe('getBestBid', () => {
    it('should return the highest bid price', () => {
      const bestBid = analyzer.getBestBid(mockOrderbook);
      expect(bestBid).toBe('50000');
    });

    it('should return null for empty orderbook', () => {
      const emptyOrderbook = { ...mockOrderbook, bids: [] };
      const bestBid = analyzer.getBestBid(emptyOrderbook);
      expect(bestBid).toBeNull();
    });
  });

  describe('getBestAsk', () => {
    it('should return the lowest ask price', () => {
      const bestAsk = analyzer.getBestAsk(mockOrderbook);
      expect(bestAsk).toBe('50010');
    });

    it('should return null for empty orderbook', () => {
      const emptyOrderbook = { ...mockOrderbook, asks: [] };
      const bestAsk = analyzer.getBestAsk(emptyOrderbook);
      expect(bestAsk).toBeNull();
    });
  });

  describe('calculateSpread', () => {
    it('should calculate spread between two orderbooks', () => {
      const orderbook1 = { ...mockOrderbook };
      const orderbook2 = {
        ...mockOrderbook,
        exchange: ExchangeName.BTCTURK,
        bids: [{ price: '50100', quantity: '1' }],
        asks: [{ price: '50110', quantity: '1' }],
      };

      const spread = analyzer.calculateSpread(orderbook1, orderbook2);

      expect(spread).not.toBeNull();
      expect(parseFloat(spread!.spread)).toBeGreaterThan(0);
    });
  });

  describe('analyzeDepth', () => {
    it('should analyze orderbook depth correctly', () => {
      const depth = analyzer.analyzeDepth(mockOrderbook, 3);

      expect(depth.symbol).toBe('BTCUSDT');
      expect(parseFloat(depth.bidVolume)).toBe(4.5); // 1 + 2 + 1.5
      expect(parseFloat(depth.askVolume)).toBe(4.5);
      expect(depth.levels).toBe(3);
    });

    it('should handle partial depth levels', () => {
      const depth = analyzer.analyzeDepth(mockOrderbook, 10);

      expect(depth.levels).toBe(3); // Only 3 levels available
    });
  });

  describe('estimateSlippage', () => {
    it('should estimate slippage for market buy order', () => {
      const slippage = analyzer.estimateSlippage(mockOrderbook, 'buy', '2');

      expect(slippage).not.toBeNull();
      expect(parseFloat(slippage!.requestedQuantity)).toBe(2);
      expect(parseFloat(slippage!.averagePrice)).toBeGreaterThan(50010);
    });

    it('should return null for insufficient liquidity', () => {
      const slippage = analyzer.estimateSlippage(mockOrderbook, 'buy', '100');

      expect(slippage).toBeNull();
    });

    it('should estimate slippage for market sell order', () => {
      const slippage = analyzer.estimateSlippage(mockOrderbook, 'sell', '2');

      expect(slippage).not.toBeNull();
      expect(parseFloat(slippage!.requestedQuantity)).toBe(2);
      expect(parseFloat(slippage!.averagePrice)).toBeLessThan(50000);
    });
  });

  describe('getMidPrice', () => {
    it('should calculate mid price correctly', () => {
      const midPrice = analyzer.getMidPrice(mockOrderbook);

      expect(midPrice).not.toBeNull();
      expect(parseFloat(midPrice!)).toBe(50005); // (50000 + 50010) / 2
    });
  });

  describe('hasSufficientLiquidity', () => {
    it('should return true for sufficient liquidity with low slippage', () => {
      const hasSufficient = analyzer.hasSufficientLiquidity(
        mockOrderbook,
        'buy',
        '1',
        '0.5',
      );

      expect(hasSufficient).toBe(true);
    });

    it('should return false for insufficient liquidity', () => {
      const hasSufficient = analyzer.hasSufficientLiquidity(
        mockOrderbook,
        'buy',
        '100',
        '0.5',
      );

      expect(hasSufficient).toBe(false);
    });
  });

  describe('getImbalance', () => {
    it('should calculate orderbook imbalance', () => {
      const imbalance = analyzer.getImbalance(mockOrderbook, 3);

      expect(imbalance).toBeGreaterThan(0);
      expect(imbalance).toBe(1); // Equal bid and ask volumes
    });
  });

  describe('calculateQualityScore', () => {
    it('should calculate quality score for good orderbook', () => {
      const score = analyzer.calculateQualityScore(mockOrderbook);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return low score for poor orderbook', () => {
      const poorOrderbook = {
        ...mockOrderbook,
        bids: [{ price: '50000', quantity: '0.01' }],
        asks: [{ price: '51000', quantity: '0.01' }], // Very wide spread
      };

      const score = analyzer.calculateQualityScore(poorOrderbook);

      expect(score).toBeLessThan(50);
    });
  });
});
