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
- [x] **Phase 5**: Production Deployment (Week 5)

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

### Phase 5: Production Deployment ✅
- ✅ Multi-stage Docker production setup
- ✅ Docker Compose with 6 services (postgres, redis, bot, prometheus, grafana, nginx)
- ✅ Automated deployment script with health checks
- ✅ Security hardening (AES-256-GCM encryption, non-root containers)
- ✅ CI/CD pipeline with GitHub Actions (lint, test, build, security, deploy)
- ✅ Monitoring stack (Prometheus + Grafana)
- ✅ Security scanning (npm audit, Snyk)
- ✅ Complete documentation (DEPLOYMENT.md, ARCHITECTURE.md, SECURITY.md)

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

- [Architecture Overview](docs/ARCHITECTURE.md) - System design and component details
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment procedures
- [Security Policy](SECURITY.md) - Security best practices and policies

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

**Status**: 🎉 All Phases Complete - Production Deployment Ready!

**Last Updated**: 2025-10-30

## 🎯 Project Complete

**All 5 Phases (25 Tasks) Successfully Implemented:**

✅ **Phase 1**: Infrastructure Setup
- TypeScript project with strict typing
- Winston logging system with file rotation
- PostgreSQL + Redis in Docker
- Circuit breaker + retry patterns

✅ **Phase 2**: Exchange Integration
- Binance & BTCTurk connectors
- WebSocket real-time orderbooks
- Order & Balance management
- Token bucket rate limiting

✅ **Phase 3**: Trading Logic
- Orderbook analysis & arbitrage calculation
- Maker-Taker strategy with state machine
- Risk management with emergency stop
- Execution engine coordination

✅ **Phase 4**: Monitoring & Optimization
- Performance metrics (P&L, Sharpe ratio, drawdown)
- Real-time dashboard with Socket.io
- Telegram alerts system
- Database optimization & testing suite

✅ **Phase 5**: Production Deployment
- Multi-stage Docker with security hardening
- CI/CD pipeline with GitHub Actions
- Prometheus + Grafana monitoring
- Complete documentation suite

## 🚀 Ready for Production

The arbitrage bot is now fully developed and ready for production deployment. See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions.
