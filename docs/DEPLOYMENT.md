# 🚀 Production Deployment Guide

Complete guide for deploying the Arbitrage Bot to production.

## 📋 Prerequisites

### System Requirements

- **Server**: Ubuntu 20.04+ or similar Linux distribution
- **CPU**: 2+ cores recommended
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 50GB+ SSD
- **Network**: Stable internet connection with low latency to exchanges

### Software Requirements

- Docker 20.10+
- Docker Compose 2.0+
- Git
- (Optional) Nginx for reverse proxy
- (Optional) SSL certificate (Let's Encrypt)

## 🔧 Initial Setup

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/arbitrage-bot.git
cd arbitrage-bot
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

**Required Variables:**

```env
# Application
NODE_ENV=production
LOG_LEVEL=info
PORT=3000

# Exchange API Keys
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET_KEY=your_binance_secret_key
BTCTURK_API_KEY=your_btcturk_api_key
BTCTURK_SECRET_KEY=your_btcturk_secret_key

# Database
DATABASE_PASSWORD=strong_unique_password_here
DATABASE_NAME=arbitrage_bot
DATABASE_USER=postgres

# Redis
REDIS_PASSWORD=strong_redis_password_here

# Trading Parameters
MIN_PROFIT_PERCENTAGE=0.3
MAX_POSITION_SIZE_USDT=1000
MAX_DAILY_LOSS_USDT=500
ENABLE_TRADING=false  # Set to true when ready
ENABLE_PAPER_TRADING=true

# Monitoring (Optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

# Grafana
GRAFANA_USER=admin
GRAFANA_PASSWORD=secure_password_here
```

### 3. API Key Setup

**Binance:**
1. Go to Binance.com → Account → API Management
2. Create new API key
3. Enable "Enable Spot & Margin Trading"
4. **DO NOT** enable withdrawals
5. Add IP whitelist (recommended)
6. Copy API Key and Secret

**BTCTurk:**
1. Go to BTCTurk → Settings → API
2. Create new API key
3. Enable trading permissions only
4. Copy API Key and Secret

### 4. Security Checklist

- [ ] Strong unique passwords for all services
- [ ] API keys with minimum required permissions
- [ ] No withdrawal permissions on exchange APIs
- [ ] IP whitelist configured on exchanges (if available)
- [ ] Firewall rules configured
- [ ] SSL/TLS certificates installed (for production domain)

## 🐳 Docker Deployment

### Option 1: Quick Start (Development)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f bot
```

### Option 2: Production Deployment

```bash
# Run deployment script
chmod +x deploy.sh
./deploy.sh
```

The deployment script will:
- ✅ Validate environment variables
- ✅ Build Docker images
- ✅ Start all services
- ✅ Run database migrations
- ✅ Verify service health

### Manual Production Deployment

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f bot
```

## 📊 Accessing Services

After deployment, services are available at:

- **Bot Dashboard**: http://your-server:3000
- **Grafana**: http://your-server:3001 (admin/your_password)
- **Prometheus**: http://your-server:9090

## 🔍 Monitoring & Health Checks

### Check Service Health

```bash
# Check all services
docker-compose -f docker-compose.prod.yml ps

# Check bot health
curl http://localhost:3000/health

# Check bot status
curl http://localhost:3000/api/status
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Bot only
docker-compose -f docker-compose.prod.yml logs -f bot

# PostgreSQL only
docker-compose -f docker-compose.prod.yml logs -f postgres

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100 bot
```

### Monitor Performance

```bash
# Docker stats
docker stats

# Bot metrics
curl http://localhost:3000/api/performance

# Risk metrics
curl http://localhost:3000/api/risk
```

## 🔄 Updates & Maintenance

### Update Application

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build

# Run migrations
docker-compose -f docker-compose.prod.yml exec bot npm run migration:run
```

### Database Backup

```bash
# Backup PostgreSQL
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres arbitrage_bot > backup_$(date +%Y%m%d).sql

# Restore from backup
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U postgres arbitrage_bot < backup_20250130.sql
```

### Clean Up Old Data

```bash
# Connect to database
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres arbitrage_bot

# Archive old trades (90+ days)
SELECT archive_old_trades(90);

# Clean error logs (30+ days)
SELECT cleanup_error_logs(30);

# Refresh materialized views
SELECT refresh_performance_views();
```

## 🛠️ Troubleshooting

### Bot Won't Start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs bot

# Common issues:
# 1. Missing environment variables
# 2. Database not ready
# 3. Redis connection failed
# 4. Invalid API keys

# Restart services
docker-compose -f docker-compose.prod.yml restart
```

### Database Connection Issues

```bash
# Check PostgreSQL status
docker-compose -f docker-compose.prod.yml exec postgres pg_isready

# Check connection
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -c "SELECT version();"

# Reset database (CAUTION: This deletes all data!)
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d
```

### High Memory Usage

```bash
# Check resource usage
docker stats

# Adjust memory limits in docker-compose.prod.yml
# Then restart:
docker-compose -f docker-compose.prod.yml up -d
```

## 🔒 Security Hardening

### Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw allow 3000/tcp # Bot Dashboard (restrict to specific IPs)
sudo ufw enable
```

### SSL/TLS Setup (with Let's Encrypt)

```bash
# Install certbot
sudo apt install certbot

# Get certificate
sudo certbot certonly --standalone -d your-domain.com

# Configure Nginx
sudo nano /etc/nginx/sites-available/arbitrage-bot

# Restart Nginx
sudo systemctl restart nginx
```

### Regular Security Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Docker images
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d

# Scan for vulnerabilities
npm audit
```

## 📈 Scaling

### Horizontal Scaling

For higher throughput, run multiple bot instances:

```yaml
# docker-compose.prod.yml
services:
  bot:
    deploy:
      replicas: 3
```

### Database Optimization

```bash
# Run optimization script
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres arbitrage_bot -f /docker-entrypoint-initdb.d/optimization.sql

# Monitor query performance
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres arbitrage_bot -c "SELECT * FROM v_index_usage;"
```

## 🚨 Emergency Procedures

### Emergency Stop

```bash
# Via API
curl -X POST http://localhost:3000/api/control/emergency-stop

# Or via Telegram bot
# Send "/emergency-stop" command
```

### Complete Shutdown

```bash
# Stop all services
docker-compose -f docker-compose.prod.yml down

# Stop and remove volumes (CAUTION: Deletes data)
docker-compose -f docker-compose.prod.yml down -v
```

## 📞 Support

If you encounter issues:

1. Check logs: `docker-compose logs`
2. Review TROUBLESHOOTING.md
3. Check SECURITY.md for security issues
4. Open an issue on GitHub

---

**Last Updated**: 2025-10-30
