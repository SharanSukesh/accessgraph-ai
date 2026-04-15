#!/bin/bash

# ==============================================================================
# Start Backend Service Only
# Runs the FastAPI backend service locally (without Docker)
# ==============================================================================

set -e

echo "🚀 Starting Backend Service..."
echo ""

# Check if virtual environment exists
if [ ! -d "apps/backend/.venv" ]; then
    echo "📦 Creating virtual environment..."
    cd apps/backend
    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    cd ../..
fi

# Activate virtual environment
source apps/backend/.venv/bin/activate

# Load environment variables
if [ -f apps/backend/.env ]; then
    export $(cat apps/backend/.env | grep -v '^#' | xargs)
fi

# Start backend
cd apps/backend
echo "✅ Starting FastAPI server on port 8000..."
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
