/**
 * Arbitrage Calculator Service
 * Calculates arbitrage opportunities with precise decimal math
 */

import { Orderbook, ExchangeName, ArbitrageOpportunity } from '../../types';
import { OrderbookAnalyzer } from '../orderbook/OrderbookAnalyzer';
import { config } from '../../config';
import { FEE_RATES, PRECISION } from '../../config/constants';
import { tradingLogger, logOpportunity } from '../../utils/logger';
import Decimal from 'decimal.js';

// Set decimal precision
Decimal.set({ precision: PRECISION.PRICE + PRECISION.QUANTITY, rounding: Decimal.ROUND_DOWN });

export interface FeeStructure {
  makerFee: Decimal;
  takerFee: Decimal;
}

export interface ProfitCalculation {
  symbol: string;
  buyExchange: ExchangeName;
  sellExchange: ExchangeName;
  buyPrice: string;
  sellPrice: string;
  quantity: string;
  grossProfit: string;
  buyFee: string;
  sellFee: string;
  netProfit: string;
  profitPercentage: string;
  roi: string;
  breakEven: boolean;
  profitable: boolean;
}

export interface OpportunityScore {
  opportunity: ArbitrageOpportunity;
  score: number;
  reasons: string[];
}

export class ArbitrageCalculator {
  private orderbookAnalyzer: OrderbookAnalyzer;

  constructor() {
    this.orderbookAnalyzer = new OrderbookAnalyzer();
  }

  /**
   * Calculate fees for an exchange
   */
  private calculateFee(
    exchange: ExchangeName,
    price: Decimal,
    quantity: Decimal,
    isMaker: boolean,
  ): Decimal {
    const feeRate = isMaker
      ? new Decimal(FEE_RATES[exchange].MAKER)
      : new Decimal(FEE_RATES[exchange].TAKER);

    return price.times(quantity).times(feeRate);
  }

  /**
   * Calculate profit for an arbitrage opportunity
   */
  public calculateProfit(
    buyExchange: ExchangeName,
    sellExchange: ExchangeName,
    buyPrice: string,
    sellPrice: string,
    quantity: string,
    buyIsMaker = false,
    sellIsMaker = false,
  ): ProfitCalculation {
    const buyPriceDecimal = new Decimal(buyPrice);
    const sellPriceDecimal = new Decimal(sellPrice);
    const quantityDecimal = new Decimal(quantity);

    // Calculate costs
    const buyCost = buyPriceDecimal.times(quantityDecimal);
    const sellRevenue = sellPriceDecimal.times(quantityDecimal);

    // Calculate fees
    const buyFee = this.calculateFee(buyExchange, buyPriceDecimal, quantityDecimal, buyIsMaker);
    const sellFee = this.calculateFee(sellExchange, sellPriceDecimal, quantityDecimal, sellIsMaker);

    // Calculate profit
    const grossProfit = sellRevenue.minus(buyCost);
    const totalFees = buyFee.plus(sellFee);
    const netProfit = grossProfit.minus(totalFees);

    // Calculate percentages
    const profitPercentage = netProfit.dividedBy(buyCost).times(100);
    const roi = netProfit.dividedBy(buyCost.plus(buyFee)).times(100);

    // Break-even check
    const breakEven = netProfit.greaterThanOrEqualTo(0);
    const profitable = netProfit.greaterThan(config.trading.minProfitAmount);

    return {
      symbol: '',
      buyExchange,
      sellExchange,
      buyPrice: buyPriceDecimal.toFixed(PRECISION.PRICE),
      sellPrice: sellPriceDecimal.toFixed(PRECISION.PRICE),
      quantity: quantityDecimal.toFixed(PRECISION.QUANTITY),
      grossProfit: grossProfit.toFixed(PRECISION.USDT),
      buyFee: buyFee.toFixed(PRECISION.USDT),
      sellFee: sellFee.toFixed(PRECISION.USDT),
      netProfit: netProfit.toFixed(PRECISION.USDT),
      profitPercentage: profitPercentage.toFixed(4),
      roi: roi.toFixed(4),
      breakEven,
      profitable,
    };
  }

  /**
   * Find arbitrage opportunities between two orderbooks
   */
  public findOpportunity(
    orderbook1: Orderbook,
    orderbook2: Orderbook,
    maxQuantity: string,
    maxSlippagePercentage: string,
  ): ArbitrageOpportunity | null {
    const maxQty = new Decimal(maxQuantity);

    // Check both directions
    const opportunity1 = this.checkDirection(
      orderbook1,
      orderbook2,
      maxQty,
      maxSlippagePercentage,
    );

    const opportunity2 = this.checkDirection(
      orderbook2,
      orderbook1,
      maxQty,
      maxSlippagePercentage,
    );

    // Return the most profitable opportunity
    if (!opportunity1 && !opportunity2) {
      return null;
    }

    if (!opportunity1) return opportunity2;
    if (!opportunity2) return opportunity1;

    const profit1 = new Decimal(opportunity1.estimatedProfit);
    const profit2 = new Decimal(opportunity2.estimatedProfit);

    return profit1.greaterThan(profit2) ? opportunity1 : opportunity2;
  }

  /**
   * Check arbitrage opportunity in one direction
   */
  private checkDirection(
    buyOrderbook: Orderbook,
    sellOrderbook: Orderbook,
    maxQuantity: Decimal,
    maxSlippagePercentage: string,
  ): ArbitrageOpportunity | null {
    // Get best prices
    const bestAsk = this.orderbookAnalyzer.getBestAsk(buyOrderbook);
    const bestBid = this.orderbookAnalyzer.getBestBid(sellOrderbook);

    if (!bestAsk || !bestBid) {
      return null;
    }

    const askPrice = new Decimal(bestAsk);
    const bidPrice = new Decimal(bestBid);

    // Quick check: is there a positive spread?
    if (bidPrice.lessThanOrEqualTo(askPrice)) {
      return null;
    }

    // Calculate optimal quantity considering liquidity and slippage
    const optimalQty = this.calculateOptimalQuantity(
      buyOrderbook,
      sellOrderbook,
      maxQuantity,
      maxSlippagePercentage,
    );

    if (!optimalQty || optimalQty.lessThanOrEqualTo(0)) {
      return null;
    }

    // Estimate average prices with slippage
    const buySlippage = this.orderbookAnalyzer.estimateSlippage(
      buyOrderbook,
      'buy',
      optimalQty.toString(),
    );

    const sellSlippage = this.orderbookAnalyzer.estimateSlippage(
      sellOrderbook,
      'sell',
      optimalQty.toString(),
    );

    if (!buySlippage || !sellSlippage) {
      return null;
    }

    // Calculate profit (buy on buyOrderbook as taker, sell on sellOrderbook as maker)
    const profitCalc = this.calculateProfit(
      buyOrderbook.exchange,
      sellOrderbook.exchange,
      buySlippage.averagePrice,
      sellSlippage.averagePrice,
      optimalQty.toString(),
      false, // buy is taker
      true,  // sell is maker (for BTCTurk)
    );

    // Check if profitable
    if (!profitCalc.profitable) {
      return null;
    }

    const opportunity: ArbitrageOpportunity = {
      buyExchange: buyOrderbook.exchange,
      sellExchange: sellOrderbook.exchange,
      symbol: buyOrderbook.symbol,
      buyPrice: profitCalc.buyPrice,
      sellPrice: profitCalc.sellPrice,
      quantity: profitCalc.quantity,
      estimatedProfit: profitCalc.netProfit,
      estimatedProfitPercentage: profitCalc.profitPercentage,
      timestamp: Date.now(),
    };

    logOpportunity(opportunity);

    return opportunity;
  }

  /**
   * Calculate optimal quantity for arbitrage
   */
  private calculateOptimalQuantity(
    buyOrderbook: Orderbook,
    sellOrderbook: Orderbook,
    maxQuantity: Decimal,
    maxSlippagePercentage: string,
  ): Decimal | null {
    const maxSlippage = new Decimal(maxSlippagePercentage);

    // Start with max quantity and work down
    let quantity = maxQuantity;
    const step = maxQuantity.dividedBy(10);

    for (let i = 0; i < 10; i++) {
      if (quantity.lessThanOrEqualTo(0)) {
        break;
      }

      // Check if both sides have sufficient liquidity with acceptable slippage
      const buySlippage = this.orderbookAnalyzer.estimateSlippage(
        buyOrderbook,
        'buy',
        quantity.toString(),
      );

      const sellSlippage = this.orderbookAnalyzer.estimateSlippage(
        sellOrderbook,
        'sell',
        quantity.toString(),
      );

      if (buySlippage && sellSlippage) {
        const buySlippagePct = new Decimal(buySlippage.slippagePercentage);
        const sellSlippagePct = new Decimal(sellSlippage.slippagePercentage);

        if (
          buySlippagePct.lessThanOrEqualTo(maxSlippage) &&
          sellSlippagePct.lessThanOrEqualTo(maxSlippage)
        ) {
          return quantity;
        }
      }

      quantity = quantity.minus(step);
    }

    return null;
  }

  /**
   * Calculate break-even price
   */
  public calculateBreakEvenPrice(
    buyPrice: string,
    buyExchange: ExchangeName,
    sellExchange: ExchangeName,
    buyIsMaker = false,
    sellIsMaker = false,
  ): string {
    const buyPriceDecimal = new Decimal(buyPrice);

    const buyFeeRate = buyIsMaker
      ? new Decimal(FEE_RATES[buyExchange].MAKER)
      : new Decimal(FEE_RATES[buyExchange].TAKER);

    const sellFeeRate = sellIsMaker
      ? new Decimal(FEE_RATES[sellExchange].MAKER)
      : new Decimal(FEE_RATES[sellExchange].TAKER);

    // Break-even: sellPrice * (1 - sellFee) = buyPrice * (1 + buyFee)
    const breakEvenPrice = buyPriceDecimal
      .times(new Decimal(1).plus(buyFeeRate))
      .dividedBy(new Decimal(1).minus(sellFeeRate));

    return breakEvenPrice.toFixed(PRECISION.PRICE);
  }

  /**
   * Calculate minimum profitable price
   */
  public calculateMinProfitablePrice(
    buyPrice: string,
    buyExchange: ExchangeName,
    sellExchange: ExchangeName,
    minProfitPercentage: string,
  ): string {
    const breakEven = new Decimal(
      this.calculateBreakEvenPrice(buyPrice, buyExchange, sellExchange),
    );

    const minProfitPct = new Decimal(minProfitPercentage).dividedBy(100);
    const minProfitablePrice = breakEven.times(new Decimal(1).plus(minProfitPct));

    return minProfitablePrice.toFixed(PRECISION.PRICE);
  }

  /**
   * Score arbitrage opportunity (0-100)
   */
  public scoreOpportunity(
    opportunity: ArbitrageOpportunity,
    buyOrderbook: Orderbook,
    sellOrderbook: Orderbook,
  ): OpportunityScore {
    let score = 0;
    const reasons: string[] = [];

    // Profit percentage (0-40 points)
    const profitPct = new Decimal(opportunity.estimatedProfitPercentage);
    if (profitPct.greaterThan(2)) {
      score += 40;
      reasons.push('Excellent profit margin (>2%)');
    } else if (profitPct.greaterThan(1)) {
      score += 30;
      reasons.push('Good profit margin (>1%)');
    } else if (profitPct.greaterThan(0.5)) {
      score += 20;
      reasons.push('Moderate profit margin (>0.5%)');
    } else {
      score += 10;
      reasons.push('Low profit margin (<0.5%)');
    }

    // Absolute profit (0-20 points)
    const profit = new Decimal(opportunity.estimatedProfit);
    if (profit.greaterThan(100)) {
      score += 20;
      reasons.push('High absolute profit (>$100)');
    } else if (profit.greaterThan(50)) {
      score += 15;
      reasons.push('Good absolute profit (>$50)');
    } else if (profit.greaterThan(20)) {
      score += 10;
      reasons.push('Moderate absolute profit (>$20)');
    } else {
      score += 5;
      reasons.push('Low absolute profit (<$20)');
    }

    // Orderbook quality (0-20 points)
    const buyQuality = this.orderbookAnalyzer.calculateQualityScore(buyOrderbook);
    const sellQuality = this.orderbookAnalyzer.calculateQualityScore(sellOrderbook);
    const avgQuality = (buyQuality + sellQuality) / 2;

    if (avgQuality > 80) {
      score += 20;
      reasons.push('Excellent orderbook quality');
    } else if (avgQuality > 60) {
      score += 15;
      reasons.push('Good orderbook quality');
    } else if (avgQuality > 40) {
      score += 10;
      reasons.push('Moderate orderbook quality');
    } else {
      score += 5;
      reasons.push('Poor orderbook quality');
    }

    // Quantity/liquidity (0-20 points)
    const quantity = new Decimal(opportunity.quantity);
    const maxQty = new Decimal(config.trading.maxPositionSizeUsdt).dividedBy(opportunity.buyPrice);

    if (quantity.greaterThanOrEqualTo(maxQty)) {
      score += 20;
      reasons.push('Sufficient liquidity for max position');
    } else if (quantity.greaterThanOrEqualTo(maxQty.times(0.5))) {
      score += 15;
      reasons.push('Good liquidity');
    } else if (quantity.greaterThanOrEqualTo(maxQty.times(0.25))) {
      score += 10;
      reasons.push('Moderate liquidity');
    } else {
      score += 5;
      reasons.push('Limited liquidity');
    }

    return {
      opportunity,
      score: Math.min(100, score),
      reasons,
    };
  }

  /**
   * Validate opportunity is still valid
   */
  public validateOpportunity(
    opportunity: ArbitrageOpportunity,
    maxAgeMs = 5000,
  ): boolean {
    const age = Date.now() - opportunity.timestamp;

    if (age > maxAgeMs) {
      tradingLogger.warn('Opportunity too old', {
        symbol: opportunity.symbol,
        ageMs: age,
        maxAgeMs,
      });
      return false;
    }

    const profitPct = new Decimal(opportunity.estimatedProfitPercentage);
    if (profitPct.lessThan(config.trading.minProfitPercentage)) {
      tradingLogger.warn('Opportunity below minimum profit threshold', {
        symbol: opportunity.symbol,
        profitPct: profitPct.toString(),
        minProfitPct: config.trading.minProfitPercentage,
      });
      return false;
    }

    return true;
  }

  /**
   * Estimate execution time value
   */
  public estimateTimeValue(
    opportunity: ArbitrageOpportunity,
    estimatedExecutionTimeMs: number,
  ): string {
    // Simple time decay model: profit decreases over time
    const profitPct = new Decimal(opportunity.estimatedProfitPercentage);
    const timeDecayFactor = new Decimal(estimatedExecutionTimeMs).dividedBy(1000).times(0.1); // 10% per second

    const adjustedProfitPct = profitPct.times(
      new Decimal(1).minus(timeDecayFactor.dividedBy(100)),
    );

    return adjustedProfitPct.toFixed(4);
  }
}
