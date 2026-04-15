#!/bin/bash

# ==============================================================================
# Start Frontend Service Only
# Runs the Next.js frontend application locally (without Docker)
# ==============================================================================

set -e

echo "🚀 Starting Frontend Service..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start frontend
cd apps/frontend
echo "✅ Starting Next.js dev server on port 3000..."
npm run dev
