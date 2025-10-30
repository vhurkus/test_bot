# 🏗️ System Architecture

Technical architecture overview of the Maker-Taker Arbitrage Bot.

## 📐 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     User Interfaces                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Dashboard  │  │   Telegram   │  │   Grafana    │  │
│  │  (Socket.io) │  │     Bot      │  │  Dashboard   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│              Application Layer (Node.js)                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Execution Engine                        │   │
│  │  ┌────────────────┐  ┌────────────────┐          │   │
│  │  │  Strategy 1    │  │  Strategy N    │          │   │
│  │  │  (BTCUSDT)     │  │  (ETHUSDT)     │          │   │
│  │  └────────────────┘  └────────────────┘          │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────┐   │
│  │   Order   │  │  Balance  │  │  Performance     │   │
│  │  Manager  │  │  Manager  │  │    Metrics       │   │
│  └───────────┘  └───────────┘  └──────────────────┘   │
│                                                          │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────┐   │
│  │   Risk    │  │ Orderbook │  │   Arbitrage      │   │
│  │  Manager  │  │  Analyzer │  │   Calculator     │   │
│  └───────────┘  └───────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│               Exchange Connectors                        │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │     Binance      │  │     BTCTurk      │            │
│  │  ┌────┐  ┌────┐  │  │  ┌────┐  ┌────┐  │            │
│  │  │REST│  │ WS │  │  │  │REST│  │ WS │  │            │
│  │  └────┘  └────┘  │  │  └────┘  └────┘  │            │
│  └──────────────────┘  └──────────────────┘            │
└──────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                  Data Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐   │
│  │  PostgreSQL  │  │    Redis     │  │  Prometheus │   │
│  │  (Persist)   │  │   (Cache)    │  │  (Metrics)  │   │
│  └──────────────┘  └──────────────┘  └─────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## 🧩 Component Details

### 1. Execution Engine

**Purpose**: Orchestrates all trading strategies

**Responsibilities**:
- Manages multiple symbol strategies
- Coordinates order execution
- Handles strategy lifecycle
- Aggregates performance metrics

**Key Features**:
- Event-driven architecture
- Dynamic strategy management
- Graceful shutdown handling

### 2. Maker-Taker Strategy

**Purpose**: Implements the core arbitrage logic

**Workflow**:
```
1. IDLE → SCANNING
   - Subscribe to orderbooks
   - Monitor for opportunities

2. SCANNING → PLACING_MAKER
   - Opportunity detected
   - Validate with Risk Manager
   - Place limit order on BTCTurk

3. PLACING_MAKER → WAITING_MAKER_FILL
   - Monitor order status
   - Timeout after 60 seconds

4. WAITING_MAKER_FILL → EXECUTING_TAKER
   - Maker order filled
   - Execute market order on Binance

5. EXECUTING_TAKER → COMPLETED
   - Calculate actual profit
   - Record trade metrics
   - Return to SCANNING
```

**State Machine**:
- IDLE: Not active
- SCANNING: Looking for opportunities
- PLACING_MAKER: Submitting limit order
- WAITING_MAKER_FILL: Waiting for fill
- EXECUTING_TAKER: Executing market order
- COMPLETED: Trade finished
- ERROR: Error occurred

### 3. Exchange Connectors

**Architecture**:
```typescript
IExchange (Interface)
   ↓
BaseExchange (Abstract)
   ├── Rate Limiter
   ├── Circuit Breaker
   └── Retry Logic
      ↓
├── BinanceExchange
│   ├── REST API
│   └── WebSocket
└── BTCTurkExchange
    ├── REST API
    └── WebSocket
```

**Features**:
- Connection pooling
- Auto-reconnection
- Request/response logging
- Error handling

### 4. Order Manager

**Purpose**: Manages order lifecycle across exchanges

**Capabilities**:
- Order placement & tracking
- Fill detection (full & partial)
- Status synchronization
- Timeout handling
- Order history (1000 orders)

### 5. Balance Manager

**Purpose**: Tracks balances across exchanges

**Features**:
- Real-time balance updates (5s interval)
- Available vs locked tracking
- Low balance alerts
- Cross-exchange aggregation
- Redis caching

### 6. Risk Manager

**Purpose**: Enforces trading limits and risk controls

**Controls**:
- Position size limits
- Daily loss limits
- Maximum open orders
- Emergency stop mechanism
- Drawdown tracking

### 7. Orderbook Analyzer

**Purpose**: Analyzes orderbook data

**Metrics**:
- Spread calculation
- Depth analysis
- Slippage estimation
- Liquidity assessment
- Quality scoring (0-100)

### 8. Arbitrage Calculator

**Purpose**: Calculates profit opportunities

**Calculations**:
- Fee optimization (maker/taker)
- Net profit with all costs
- Break-even price
- Minimum profitable price
- Opportunity scoring

### 9. Performance Metrics

**Purpose**: Tracks trading performance

**Metrics**:
- P&L tracking
- Win rate
- Profit factor
- Sharpe ratio
- Maximum drawdown
- Daily summaries

### 10. Alert System

**Purpose**: Sends notifications via Telegram

**Alert Types**:
- Trade executions
- Opportunities detected
- Errors & warnings
- Low balance alerts
- Daily summaries
- Emergency events

## 🔄 Data Flow

### Trade Execution Flow

```
1. Orderbook Updates (WebSocket)
   ↓
2. Orderbook Analyzer
   - Calculate spread
   - Estimate slippage
   ↓
3. Arbitrage Calculator
   - Calculate profit
   - Score opportunity
   ↓
4. Risk Manager
   - Validate limits
   - Check balances
   ↓
5. Execution Engine
   - Place maker order
   - Wait for fill
   - Execute taker order
   ↓
6. Performance Metrics
   - Record trade
   - Update statistics
   ↓
7. Alert System
   - Notify via Telegram
   - Log to dashboard
```

### Database Schema

```sql
trades
├── id (UUID)
├── buy_exchange
├── sell_exchange
├── symbol
├── buy_price
├── sell_price
├── quantity
├── net_profit
├── profit_percentage
└── created_at

orders
├── id (UUID)
├── exchange_order_id
├── exchange
├── symbol
├── side
├── type
├── price
├── quantity
├── filled_quantity
├── status
└── created_at

balances
├── exchange
├── asset
├── free
├── locked
├── total
└── updated_at

profit_tracking (daily)
├── date
├── exchange
├── symbol
├── total_trades
├── net_profit
├── win_rate
└── average_profit
```

## 🔐 Security Architecture

### Defense in Depth

```
Layer 1: Network
├── Firewall rules
├── IP whitelisting
└── TLS/SSL

Layer 2: Application
├── Rate limiting
├── Input validation
└── API key encryption

Layer 3: Data
├── PostgreSQL auth
├── Redis passwords
└── Encrypted backups

Layer 4: Monitoring
├── Audit logs
├── Error tracking
└── Alert system
```

### API Key Security

```
API Keys (Plain)
   ↓
AES-256-GCM Encryption
   ↓
Encrypted Storage
   ↓
Runtime Decryption
   ↓
In-Memory Only
```

## 📊 Performance Optimizations

### Database

- Composite indexes for queries
- Materialized views for aggregations
- Connection pooling (20 connections)
- Prepared statements only

### Cache

- Redis for hot data
- TTL-based expiration
- LRU eviction policy
- 512MB memory limit

### Application

- Event-driven architecture
- Non-blocking I/O
- Connection pooling
- Decimal.js for precision

### WebSocket

- Auto-reconnection
- Ping/pong keepalive
- Message queue buffering
- Backpressure handling

## 🚀 Scalability

### Horizontal Scaling

```
Load Balancer
   ↓
┌──────────────────────┐
│ Bot Instance 1       │
│ Bot Instance 2       │
│ Bot Instance N       │
└──────────────────────┘
   ↓
Shared Database & Redis
```

### Vertical Scaling

- CPU: 2-4 cores recommended
- RAM: 4-8 GB recommended
- Storage: SSD for database

## 📈 Monitoring Stack

```
Application
   ↓
Prometheus (Metrics)
   ↓
Grafana (Visualization)

Application Logs
   ↓
Winston (Logging)
   ↓
File Rotation (Daily)
```

---

**Last Updated**: 2025-10-30
