"""
API Dependencies
Shared dependencies for FastAPI endpoints
"""
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from app.db.session import get_db
from app.db.neo4j_client import get_neo4j_client, Neo4jClient
from app.db.redis_client import get_redis_client


# Database dependencies - re-export for convenience
async def get_database() -> AsyncGenerator[AsyncSession, None]:
    """Get PostgreSQL database session"""
    async for session in get_db():
        yield session


async def get_graph_db() -> Neo4jClient:
    """Get Neo4j graph database client"""
    return get_neo4j_client()


async def get_cache() -> Redis:
    """Get Redis cache client"""
    return await get_redis_client()
