/**
 * Exchange Integration Tests
 * Tests actual exchange connectivity (requires valid API keys)
 */

import { BinanceExchange } from '../../src/exchanges/binance/BinanceExchange';
import { BTCTurkExchange } from '../../src/exchanges/btcturk/BTCTurkExchange';

// Skip these tests by default - only run when explicitly testing
describe.skip('Exchange Integration Tests', () => {
  describe('Binance Exchange', () => {
    let exchange: BinanceExchange;

    beforeAll(async () => {
      exchange = new BinanceExchange();
      await exchange.initialize();
    });

    afterAll(async () => {
      await exchange.close();
    });

    it('should get server time', async () => {
      const serverTime = await exchange.getServerTime();

      expect(serverTime).toBeGreaterThan(0);
      expect(Math.abs(Date.now() - serverTime)).toBeLessThan(10000); // Within 10 seconds
    });

    it('should get balances', async () => {
      const balances = await exchange.getBalances();

      expect(Array.isArray(balances)).toBe(true);
      expect(balances.length).toBeGreaterThan(0);

      if (balances.length > 0) {
        const balance = balances[0];
        expect(balance).toHaveProperty('asset');
        expect(balance).toHaveProperty('free');
        expect(balance).toHaveProperty('locked');
        expect(balance).toHaveProperty('total');
      }
    });

    it('should get orderbook', async () => {
      const orderbook = await exchange.getOrderbook('BTCUSDT', 10);

      expect(orderbook).toHaveProperty('bids');
      expect(orderbook).toHaveProperty('asks');
      expect(orderbook.bids.length).toBeGreaterThan(0);
      expect(orderbook.asks.length).toBeGreaterThan(0);

      // Check orderbook structure
      const bid = orderbook.bids[0];
      expect(bid).toHaveProperty('price');
      expect(bid).toHaveProperty('quantity');
    });

    it('should get trading pairs', async () => {
      const pairs = await exchange.getTradingPairs();

      expect(Array.isArray(pairs)).toBe(true);
      expect(pairs.length).toBeGreaterThan(0);

      const btcPair = pairs.find((p) => p.symbol === 'BTCUSDT');
      expect(btcPair).toBeDefined();
      expect(btcPair?.baseAsset).toBe('BTC');
      expect(btcPair?.quoteAsset).toBe('USDT');
    });
  });

  describe('BTCTurk Exchange', () => {
    let exchange: BTCTurkExchange;

    beforeAll(async () => {
      exchange = new BTCTurkExchange();
      await exchange.initialize();
    });

    afterAll(async () => {
      await exchange.close();
    });

    it('should get server time', async () => {
      const serverTime = await exchange.getServerTime();

      expect(serverTime).toBeGreaterThan(0);
    });

    it('should get balances', async () => {
      const balances = await exchange.getBalances();

      expect(Array.isArray(balances)).toBe(true);
    });

    it('should get orderbook', async () => {
      const orderbook = await exchange.getOrderbook('BTCUSDT', 10);

      expect(orderbook).toHaveProperty('bids');
      expect(orderbook).toHaveProperty('asks');
    });

    it('should get trading pairs', async () => {
      const pairs = await exchange.getTradingPairs();

      expect(Array.isArray(pairs)).toBe(true);
      expect(pairs.length).toBeGreaterThan(0);
    });
  });
});
