#!/bin/bash

# ==============================================================================
# Run Database Migrations
# Applies Alembic migrations to PostgreSQL database
# ==============================================================================

set -e

echo "🗃️  Running database migrations..."
echo ""

# Check if running in Docker or locally
if [ -n "$DOCKER_CONTAINER" ]; then
    # Running inside Docker
    cd /app
    alembic upgrade head
else
    # Running locally
    cd apps/backend

    # Activate virtual environment if it exists
    if [ -d ".venv" ]; then
        source .venv/bin/activate
    fi

    # Load environment variables
    if [ -f .env ]; then
        export $(cat .env | grep -v '^#' | xargs)
    fi

    alembic upgrade head

    cd ../..
fi

echo ""
echo "✅ Migrations completed successfully!"
echo ""
