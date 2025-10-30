#!/bin/bash
# Production Deployment Script

set -e

echo "🚀 Starting Arbitrage Bot Deployment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo "Please copy .env.example to .env and configure it."
    exit 1
fi

# Load environment variables
source .env

# Check required environment variables
required_vars=(
    "DATABASE_PASSWORD"
    "BINANCE_API_KEY"
    "BINANCE_SECRET_KEY"
    "BTCTURK_API_KEY"
    "BTCTURK_SECRET_KEY"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}Error: $var is not set in .env file${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✓ Environment variables validated${NC}"

# Build Docker images
echo -e "${YELLOW}Building Docker images...${NC}"
docker-compose -f docker-compose.prod.yml build --no-cache

echo -e "${GREEN}✓ Docker images built successfully${NC}"

# Stop existing containers
echo -e "${YELLOW}Stopping existing containers...${NC}"
docker-compose -f docker-compose.prod.yml down

# Start services
echo -e "${YELLOW}Starting services...${NC}"
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
sleep 10

# Check service health
services=("postgres" "redis" "bot")
for service in "${services[@]}"; do
    echo -n "Checking $service... "
    if docker-compose -f docker-compose.prod.yml ps | grep "$service" | grep -q "healthy\|Up"; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo -e "${RED}Error: $service is not healthy${NC}"
        docker-compose -f docker-compose.prod.yml logs "$service"
        exit 1
    fi
done

# Show logs
echo -e "${GREEN}✓ All services started successfully${NC}"
echo ""
echo "📊 Dashboard: http://localhost:3000"
echo "📈 Grafana: http://localhost:3001 (admin/admin)"
echo "🔍 Prometheus: http://localhost:9090"
echo ""
echo "To view logs: docker-compose -f docker-compose.prod.yml logs -f bot"
echo "To stop: docker-compose -f docker-compose.prod.yml down"
echo ""
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
