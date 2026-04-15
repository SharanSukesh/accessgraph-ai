#!/bin/bash

# ==============================================================================
# Start All Services
# Starts the entire AccessGraph AI platform using Docker Compose
# ==============================================================================

set -e

echo "🚀 Starting AccessGraph AI..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Copying from .env.example..."
    cp .env.example .env
    echo "✅ Created .env file. Please update it with your configuration."
    echo ""
fi

# Start Docker Compose
echo "📦 Starting Docker containers..."
docker-compose up -d

echo ""
echo "✅ All services started!"
echo ""
echo "Service URLs:"
echo "  🌐 Frontend:  http://localhost:3000"
echo "  🔧 Backend:   http://localhost:8000"
echo "  📊 API Docs:  http://localhost:8000/docs"
echo "  🗄️  PostgreSQL: localhost:5432"
echo "  🕸️  Neo4j:     http://localhost:7474"
echo "  🔴 Redis:     localhost:6379"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop:      ./infrastructure/scripts/stop-all.sh"
echo ""
