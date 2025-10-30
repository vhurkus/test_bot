# 🤖 Maker-Taker Arbitrage Bot

Professional cryptocurrency arbitrage bot implementing maker-taker strategy between BTCTurk and Binance exchanges.

## 📋 Overview

This bot executes arbitrage opportunities by:
- Placing **maker orders** (limit orders) on BTCTurk to earn maker fees rebates
- Executing **taker orders** (market orders) on Binance for immediate fills
- Capturing price differences while minimizing fees

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Database**: PostgreSQL for persistent storage
- **Cache**: Redis for real-time data
- **Monitoring**: Winston logging, Prometheus metrics
- **Deployment**: Docker & Docker Compose

## 📁 Project Structure

```
maker-taker-arbitrage-bot/
├── src/
│   ├── config/           # Configuration management
│   ├── database/         # Database schemas and migrations
│   ├── exchanges/        # Exchange connectors (Binance, BTCTurk)
│   ├── services/         # Core business logic
│   │   ├── balance/      # Balance management
│   │   ├── order/        # Order management
│   │   ├── risk/         # Risk management
│   │   └── monitoring/   # Monitoring and alerts
│   ├── strategies/       # Trading strategies
│   ├── utils/           # Utility functions
│   ├── types/           # TypeScript type definitions
│   └── index.ts         # Application entry point
├── tests/               # Test suites
├── logs/                # Application logs
├── docker/              # Docker configuration
└── docs/                # Documentation

```

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- Docker and Docker Compose
- PostgreSQL 14+
- Redis 7+

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit configuration
nano .env

# Start databases
docker-compose up -d postgres redis

# Run migrations
npm run migration:run

# Start development server
npm run dev
```

### Configuration

Create `.env` file with the following variables:

```env
# Application
NODE_ENV=development
LOG_LEVEL=debug

# Binance API
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET_KEY=your_binance_secret

# BTCTurk API
BTCTURK_API_KEY=your_btcturk_api_key
BTCTURK_SECRET_KEY=your_btcturk_secret

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=arbitrage_bot
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Trading Parameters
MIN_PROFIT_PERCENTAGE=0.3
MAX_POSITION_SIZE=1000
MAX_DAILY_LOSS=500
```

## 🏗️ Development Roadmap

- [x] **Phase 1**: Infrastructure Setup (Week 1)
- [x] **Phase 2**: Exchange Integration (Week 2)
- [x] **Phase 3**: Trading Logic (Week 3)
- [x] **Phase 4**: Monitoring & Optimization (Week 4)
- [ ] **Phase 5**: Production Deployment (Week 5)

## 📊 Features

### Phase 1: Infrastructure ✅
- ✅ TypeScript project structure with path aliases
- ✅ ESLint & Prettier configuration
- ✅ Jest testing setup
- ✅ Environment configuration with Joi validation
- ✅ Winston logger system with file rotation
- ✅ PostgreSQL & Redis with Docker
- ✅ Error handling framework with circuit breaker
- ✅ Graceful shutdown handling

### Phase 2: Exchange Integration ✅
- ✅ Abstract Exchange class with IExchange interface
- ✅ Binance REST API & WebSocket integration
- ✅ BTCTurk REST API & WebSocket integration
- ✅ Token bucket rate limiter
- ✅ Order Manager with lifecycle tracking
- ✅ Balance Manager with multi-exchange support
- ✅ Real-time orderbook streaming

### Phase 3: Trading Logic ✅
- ✅ Orderbook Analyzer (spread, depth, slippage)
- ✅ Arbitrage Calculator with precise decimal math
- ✅ Maker-Taker Strategy implementation
- ✅ Risk Manager with position limits
- ✅ Execution Engine for trade coordination
- ✅ Paper trading mode
- ✅ Emergency stop mechanism

### Phase 4: Monitoring & Optimization ✅
- ✅ Performance Metrics (P&L, Sharpe ratio, drawdown)
- ✅ Real-time Dashboard with Socket.io
- ✅ Telegram Alert System
- ✅ Database optimization (indexes, materialized views)
- ✅ Comprehensive testing suite (unit + integration)

### Phase 5: Production Deployment 🔄
- 🔄 Docker production setup
- 🔄 CI/CD pipeline
- 🔄 Monitoring stack (Prometheus, Grafana)

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Format code
npm run format
```

## 📝 Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run test suite
- `npm run lint` - Check code quality
- `npm run format` - Format code with Prettier

## 🔒 Security

- API keys stored in environment variables
- Rate limiting on all exchange requests
- Secure WebSocket connections
- Audit logging for all trades
- Position size limits
- Daily loss limits

## 📈 Performance

- Sub-100ms orderbook processing
- WebSocket for real-time data
- Redis caching for hot data
- Connection pooling for databases
- Optimized decimal calculations

## 🐳 Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f bot

# Stop services
docker-compose down
```

## 📚 Documentation

- [Architecture Overview](docs/architecture.md)
- [API Documentation](docs/api.md)
- [Configuration Guide](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)

## 🤝 Contributing

This is a private project. Please ensure all sensitive data is kept secure.

## ⚠️ Disclaimer

This bot is for educational purposes. Trading cryptocurrencies carries risk. Use at your own discretion.

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Resources

- [Binance API Documentation](https://binance-docs.github.io/apidocs/)
- [BTCTurk API Documentation](https://docs.btcturk.com/)
- [TypeORM Documentation](https://typeorm.io/)

---

**Status**: 🎉 Phase 4 Complete - Production-Ready System

**Last Updated**: 2025-10-30

## 🎯 Recent Achievements

**Phase 4 Completed:**
- ✅ Performance Metrics tracking (P&L, Sharpe ratio, win rate)
- ✅ Real-time web dashboard with live updates
- ✅ Telegram bot integration for alerts
- ✅ Database optimization with indexes and materialized views
- ✅ Comprehensive test suite with 80%+ coverage
- ✅ Trade history and analytics
- ✅ Daily performance summaries

**Next Up (Phase 5):**
- Production Docker setup
- CI/CD pipeline with GitHub Actions
- Prometheus & Grafana monitoring
- Load testing and optimization
