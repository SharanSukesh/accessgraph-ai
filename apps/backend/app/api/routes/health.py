"""
Health Check Endpoints
Service health and readiness checks
"""
import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database, get_graph_db, get_cache
from app.db.neo4j_client import Neo4jClient
from redis.asyncio import Redis

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health", status_code=status.HTTP_200_OK)
async def health_check() -> Dict[str, Any]:
    """
    Basic health check endpoint
    Returns service status
    """
    return {
        "status": "ok",
        "service": "accessgraph-backend",
        "version": "0.1.0"
    }


@router.get("/health/ready", status_code=status.HTTP_200_OK)
async def readiness_check(
    db: AsyncSession = Depends(get_database),
    neo4j: Neo4jClient = Depends(get_graph_db),
    cache: Redis = Depends(get_cache)
) -> Dict[str, Any]:
    """
    Readiness check - verifies all dependencies are available
    Checks: PostgreSQL, Neo4j, Redis
    """
    checks = {
        "postgres": "unknown",
        "neo4j": "unknown",
        "redis": "unknown"
    }

    # Check PostgreSQL
    try:
        result = await db.execute(text("SELECT 1"))
        await result.fetchone()
        checks["postgres"] = "healthy"
    except Exception as e:
        logger.error(f"PostgreSQL health check failed: {e}")
        checks["postgres"] = "unhealthy"

    # Check Neo4j
    try:
        await neo4j.test_connection()
        checks["neo4j"] = "healthy"
    except Exception as e:
        logger.error(f"Neo4j health check failed: {e}")
        checks["neo4j"] = "unhealthy"

    # Check Redis
    try:
        await cache.ping()
        checks["redis"] = "healthy"
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        checks["redis"] = "unhealthy"

    # Determine overall status
    all_healthy = all(status == "healthy" for status in checks.values())
    overall_status = "ready" if all_healthy else "not_ready"

    return {
        "status": overall_status,
        "service": "accessgraph-backend",
        "version": "0.1.0",
        "checks": checks
    }
