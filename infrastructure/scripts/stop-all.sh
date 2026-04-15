#!/bin/bash

# ==============================================================================
# Stop All Services
# Stops all Docker containers
# ==============================================================================

set -e

echo "🛑 Stopping AccessGraph AI services..."
docker-compose down

echo ""
echo "✅ All services stopped!"
echo ""
echo "To remove volumes as well: docker-compose down -v"
echo ""
