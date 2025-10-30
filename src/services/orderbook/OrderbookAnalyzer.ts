/**
 * Orderbook Analyzer Service
 * Analyzes orderbook data for trading opportunities
 */

import { Orderbook, OrderbookLevel, ExchangeName } from '../../types';
import { tradingLogger } from '../../utils/logger';
import Decimal from 'decimal.js';

export interface OrderbookDepth {
  symbol: string;
  exchange: ExchangeName;
  bidDepth: string;
  askDepth: string;
  bidVolume: string;
  askVolume: string;
  levels: number;
  timestamp: number;
}

export interface SpreadAnalysis {
  symbol: string;
  buyExchange: ExchangeName;
  sellExchange: ExchangeName;
  bestBid: string;
  bestAsk: string;
  spread: string;
  spreadPercentage: string;
  timestamp: number;
}

export interface SlippageEstimate {
  requestedQuantity: string;
  averagePrice: string;
  totalCost: string;
  slippage: string;
  slippagePercentage: string;
  priceImpact: string;
}

export class OrderbookAnalyzer {
  /**
   * Get best bid price from orderbook
   */
  public getBestBid(orderbook: Orderbook): string | null {
    if (!orderbook.bids || orderbook.bids.length === 0) {
      return null;
    }
    return orderbook.bids[0].price;
  }

  /**
   * Get best ask price from orderbook
   */
  public getBestAsk(orderbook: Orderbook): string | null {
    if (!orderbook.asks || orderbook.asks.length === 0) {
      return null;
    }
    return orderbook.asks[0].price;
  }

  /**
   * Calculate spread between two orderbooks
   */
  public calculateSpread(
    buyOrderbook: Orderbook,
    sellOrderbook: Orderbook,
  ): SpreadAnalysis | null {
    const bestBid = this.getBestBid(sellOrderbook);
    const bestAsk = this.getBestAsk(buyOrderbook);

    if (!bestBid || !bestAsk) {
      return null;
    }

    const bidDecimal = new Decimal(bestBid);
    const askDecimal = new Decimal(bestAsk);
    const spread = bidDecimal.minus(askDecimal);
    const spreadPercentage = spread.dividedBy(askDecimal).times(100);

    return {
      symbol: buyOrderbook.symbol,
      buyExchange: buyOrderbook.exchange,
      sellExchange: sellOrderbook.exchange,
      bestBid,
      bestAsk,
      spread: spread.toString(),
      spreadPercentage: spreadPercentage.toString(),
      timestamp: Date.now(),
    };
  }

  /**
   * Analyze orderbook depth
   */
  public analyzeDepth(orderbook: Orderbook, levels = 10): OrderbookDepth {
    let bidDepth = new Decimal(0);
    let bidVolume = new Decimal(0);
    let askDepth = new Decimal(0);
    let askVolume = new Decimal(0);

    // Calculate bid depth
    const bidLevels = Math.min(levels, orderbook.bids.length);
    for (let i = 0; i < bidLevels; i++) {
      const level = orderbook.bids[i];
      const price = new Decimal(level.price);
      const quantity = new Decimal(level.quantity);
      bidDepth = bidDepth.plus(price.times(quantity));
      bidVolume = bidVolume.plus(quantity);
    }

    // Calculate ask depth
    const askLevels = Math.min(levels, orderbook.asks.length);
    for (let i = 0; i < askLevels; i++) {
      const level = orderbook.asks[i];
      const price = new Decimal(level.price);
      const quantity = new Decimal(level.quantity);
      askDepth = askDepth.plus(price.times(quantity));
      askVolume = askVolume.plus(quantity);
    }

    return {
      symbol: orderbook.symbol,
      exchange: orderbook.exchange,
      bidDepth: bidDepth.toString(),
      askDepth: askDepth.toString(),
      bidVolume: bidVolume.toString(),
      askVolume: askVolume.toString(),
      levels: Math.min(levels, Math.min(orderbook.bids.length, orderbook.asks.length)),
      timestamp: orderbook.timestamp,
    };
  }

  /**
   * Calculate liquidity at a specific price level
   */
  public calculateLiquidity(
    orderbook: Orderbook,
    side: 'bid' | 'ask',
    priceThreshold: string,
  ): string {
    const levels = side === 'bid' ? orderbook.bids : orderbook.asks;
    const threshold = new Decimal(priceThreshold);
    let totalLiquidity = new Decimal(0);

    for (const level of levels) {
      const price = new Decimal(level.price);
      const quantity = new Decimal(level.quantity);

      // For bids, include prices >= threshold
      // For asks, include prices <= threshold
      if (
        (side === 'bid' && price.greaterThanOrEqualTo(threshold)) ||
        (side === 'ask' && price.lessThanOrEqualTo(threshold))
      ) {
        totalLiquidity = totalLiquidity.plus(quantity);
      } else {
        break; // Orderbook is sorted, so we can stop
      }
    }

    return totalLiquidity.toString();
  }

  /**
   * Estimate slippage for a market order
   */
  public estimateSlippage(
    orderbook: Orderbook,
    side: 'buy' | 'sell',
    quantity: string,
  ): SlippageEstimate | null {
    const levels = side === 'buy' ? orderbook.asks : orderbook.bids;
    const requestedQty = new Decimal(quantity);

    if (levels.length === 0) {
      return null;
    }

    let remainingQty = requestedQty;
    let totalCost = new Decimal(0);
    let weightedPrice = new Decimal(0);
    const bestPrice = new Decimal(levels[0].price);

    // Walk through orderbook levels
    for (const level of levels) {
      if (remainingQty.lessThanOrEqualTo(0)) {
        break;
      }

      const levelPrice = new Decimal(level.price);
      const levelQty = new Decimal(level.quantity);
      const fillQty = Decimal.min(remainingQty, levelQty);

      totalCost = totalCost.plus(levelPrice.times(fillQty));
      weightedPrice = weightedPrice.plus(levelPrice.times(fillQty));
      remainingQty = remainingQty.minus(fillQty);
    }

    // Check if we have enough liquidity
    if (remainingQty.greaterThan(0)) {
      tradingLogger.warn('Insufficient liquidity in orderbook', {
        symbol: orderbook.symbol,
        exchange: orderbook.exchange,
        requestedQty: quantity,
        availableQty: requestedQty.minus(remainingQty).toString(),
      });
      return null;
    }

    const averagePrice = weightedPrice.dividedBy(requestedQty);
    const slippage = averagePrice.minus(bestPrice);
    const slippagePercentage = slippage.dividedBy(bestPrice).times(100).abs();
    const priceImpact = slippage.dividedBy(bestPrice).times(100);

    return {
      requestedQuantity: quantity,
      averagePrice: averagePrice.toString(),
      totalCost: totalCost.toString(),
      slippage: slippage.toString(),
      slippagePercentage: slippagePercentage.toString(),
      priceImpact: priceImpact.toString(),
    };
  }

  /**
   * Get mid price (average of best bid and ask)
   */
  public getMidPrice(orderbook: Orderbook): string | null {
    const bestBid = this.getBestBid(orderbook);
    const bestAsk = this.getBestAsk(orderbook);

    if (!bestBid || !bestAsk) {
      return null;
    }

    const midPrice = new Decimal(bestBid).plus(bestAsk).dividedBy(2);
    return midPrice.toString();
  }

  /**
   * Calculate weighted average price for a given quantity
   */
  public getWeightedAveragePrice(
    orderbook: Orderbook,
    side: 'buy' | 'sell',
    quantity: string,
  ): string | null {
    const slippage = this.estimateSlippage(orderbook, side, quantity);
    return slippage ? slippage.averagePrice : null;
  }

  /**
   * Check if orderbook has sufficient liquidity for a trade
   */
  public hasSufficientLiquidity(
    orderbook: Orderbook,
    side: 'buy' | 'sell',
    quantity: string,
    maxSlippagePercentage: string,
  ): boolean {
    const slippage = this.estimateSlippage(orderbook, side, quantity);

    if (!slippage) {
      return false;
    }

    const maxSlippage = new Decimal(maxSlippagePercentage);
    const actualSlippage = new Decimal(slippage.slippagePercentage);

    return actualSlippage.lessThanOrEqualTo(maxSlippage);
  }

  /**
   * Get orderbook imbalance (bid vs ask volume ratio)
   */
  public getImbalance(orderbook: Orderbook, levels = 10): number {
    const depth = this.analyzeDepth(orderbook, levels);
    const bidVolume = new Decimal(depth.bidVolume);
    const askVolume = new Decimal(depth.askVolume);

    if (askVolume.equals(0)) {
      return 1;
    }

    return bidVolume.dividedBy(askVolume).toNumber();
  }

  /**
   * Aggregate multiple orderbooks (for the same symbol)
   */
  public aggregateOrderbooks(orderbooks: Orderbook[]): Orderbook | null {
    if (orderbooks.length === 0) {
      return null;
    }

    if (orderbooks.length === 1) {
      return orderbooks[0];
    }

    // Combine all bids and asks
    const allBids: OrderbookLevel[] = [];
    const allAsks: OrderbookLevel[] = [];

    for (const orderbook of orderbooks) {
      allBids.push(...orderbook.bids);
      allAsks.push(...orderbook.asks);
    }

    // Sort bids (descending) and asks (ascending)
    allBids.sort((a, b) => new Decimal(b.price).minus(a.price).toNumber());
    allAsks.sort((a, b) => new Decimal(a.price).minus(b.price).toNumber());

    // Merge levels at the same price
    const mergedBids = this.mergeLevels(allBids);
    const mergedAsks = this.mergeLevels(allAsks);

    return {
      exchange: orderbooks[0].exchange,
      symbol: orderbooks[0].symbol,
      bids: mergedBids,
      asks: mergedAsks,
      timestamp: Date.now(),
    };
  }

  /**
   * Merge orderbook levels at the same price
   */
  private mergeLevels(levels: OrderbookLevel[]): OrderbookLevel[] {
    const merged: Map<string, Decimal> = new Map();

    for (const level of levels) {
      const price = level.price;
      const quantity = new Decimal(level.quantity);

      if (merged.has(price)) {
        merged.set(price, merged.get(price)!.plus(quantity));
      } else {
        merged.set(price, quantity);
      }
    }

    return Array.from(merged.entries()).map(([price, quantity]) => ({
      price,
      quantity: quantity.toString(),
    }));
  }

  /**
   * Get price at specific depth (cumulative volume)
   */
  public getPriceAtDepth(
    orderbook: Orderbook,
    side: 'bid' | 'ask',
    targetVolume: string,
  ): string | null {
    const levels = side === 'bid' ? orderbook.bids : orderbook.asks;
    const target = new Decimal(targetVolume);
    let cumulativeVolume = new Decimal(0);

    for (const level of levels) {
      const quantity = new Decimal(level.quantity);
      cumulativeVolume = cumulativeVolume.plus(quantity);

      if (cumulativeVolume.greaterThanOrEqualTo(target)) {
        return level.price;
      }
    }

    return null; // Not enough depth
  }

  /**
   * Calculate order book quality score (0-100)
   */
  public calculateQualityScore(orderbook: Orderbook): number {
    const depth = this.analyzeDepth(orderbook, 10);
    const bestBid = this.getBestBid(orderbook);
    const bestAsk = this.getBestAsk(orderbook);

    if (!bestBid || !bestAsk) {
      return 0;
    }

    // Factors for quality score
    const spread = new Decimal(bestAsk).minus(bestBid).dividedBy(bestBid).times(100);
    const bidLevels = orderbook.bids.length;
    const askLevels = orderbook.asks.length;
    const totalVolume = new Decimal(depth.bidVolume).plus(depth.askVolume);
    const imbalance = Math.abs(1 - this.getImbalance(orderbook, 10));

    // Calculate score components
    let score = 100;

    // Penalize wide spreads (0-30 points)
    if (spread.greaterThan(1)) score -= 30;
    else if (spread.greaterThan(0.5)) score -= 20;
    else if (spread.greaterThan(0.1)) score -= 10;

    // Penalize low depth (0-30 points)
    if (bidLevels < 5 || askLevels < 5) score -= 30;
    else if (bidLevels < 10 || askLevels < 10) score -= 15;

    // Penalize low volume (0-20 points)
    if (totalVolume.lessThan(10)) score -= 20;
    else if (totalVolume.lessThan(50)) score -= 10;

    // Penalize high imbalance (0-20 points)
    if (imbalance > 0.5) score -= 20;
    else if (imbalance > 0.3) score -= 10;

    return Math.max(0, Math.min(100, score));
  }
}
