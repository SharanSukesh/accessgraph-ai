#!/bin/bash

# ==============================================================================
# Create Database Migration
# Creates a new Alembic migration file
# ==============================================================================

set -e

if [ -z "$1" ]; then
    echo "Usage: ./infrastructure/scripts/create-migration.sh \"migration description\""
    exit 1
fi

MIGRATION_MESSAGE="$1"

echo "📝 Creating migration: $MIGRATION_MESSAGE"
echo ""

cd apps/backend

# Activate virtual environment if it exists
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Create migration
alembic revision --autogenerate -m "$MIGRATION_MESSAGE"

echo ""
echo "✅ Migration created successfully!"
echo "Review the migration file in apps/backend/alembic/versions/"
echo ""
