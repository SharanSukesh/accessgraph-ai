FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies. The libpango / libcairo / libgdk-pixbuf
# trio is required by WeasyPrint, which powers the Org Analyzer PDF
# report. Adding them here so Railway's Docker build doesn't fail when
# the PDF endpoint is hit in production.
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Make startup script executable
RUN chmod +x scripts/startup.sh

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health')"

# Default command (Railway will set PORT env var)
# Run migrations then start server
CMD ["sh", "-c", "python scripts/run_migrations.py && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
