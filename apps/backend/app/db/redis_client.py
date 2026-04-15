"""
Redis Cache Client
Connection and utility functions for Redis operations
"""
import logging
from typing import Optional, Any
import redis.asyncio as redis
from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger(__name__)

# Global Redis client instance
_redis_client: Optional[Redis] = None


async def get_redis_client() -> Redis:
    """
    Get Redis client instance
    Usage: cache: Redis = Depends(get_redis_client)
    """
    global _redis_client
    if _redis_client is None:
        _redis_client = await redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=10,
        )
        logger.info("Redis client initialized")
    return _redis_client


async def close_redis_client() -> None:
    """Close Redis client connection"""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None
        logger.info("Redis connection closed")


async def test_redis_connection() -> bool:
    """Test Redis connection"""
    try:
        client = await get_redis_client()
        await client.ping()
        logger.info("Redis connection test successful")
        return True
    except Exception as e:
        logger.error(f"Redis connection test failed: {e}")
        return False
