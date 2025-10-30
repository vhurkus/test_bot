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
- [ ] **Phase 2**: Exchange Integration (Week 2)
- [ ] **Phase 3**: Trading Logic (Week 3)
- [ ] **Phase 4**: Monitoring & Optimization (Week 4)
- [ ] **Phase 5**: Production Deployment (Week 5)

## 📊 Features

### Current
- ✅ TypeScript project structure
- ✅ ESLint & Prettier configuration
- ✅ Jest testing setup
- ✅ Git repository initialization

### Upcoming
- 🔄 Environment configuration with validation
- 🔄 Winston logger system
- 🔄 PostgreSQL & Redis setup
- 🔄 Error handling framework
- 🔄 Exchange connectors (Binance, BTCTurk)
- 🔄 Order management system
- 🔄 Balance tracking
- 🔄 Arbitrage calculator
- 🔄 Risk management
- 🔄 Real-time monitoring dashboard
- 🔄 Telegram alerts

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

**Status**: 🚧 In Development - Phase 1 Complete

**Last Updated**: 2025-10-30
