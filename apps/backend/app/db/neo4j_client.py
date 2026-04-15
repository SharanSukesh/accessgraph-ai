"""
Neo4j Graph Database Client
Connection and query utilities for graph operations
"""
import logging
from typing import Any, Dict, List, Optional
from neo4j import AsyncGraphDatabase, AsyncDriver
from neo4j.exceptions import ServiceUnavailable

logger = logging.getLogger(__name__)


class Neo4jClient:
    """
    Neo4j async client for graph database operations
    """

    def __init__(self, uri: str, user: str, password: str):
        """
        Initialize Neo4j client

        Args:
            uri: Neo4j connection URI (bolt://...)
            user: Neo4j username
            password: Neo4j password
        """
        self.uri = uri
        self.user = user
        self.password = password
        self._driver: Optional[AsyncDriver] = None

    async def connect(self) -> AsyncDriver:
        """Establish connection to Neo4j"""
        if self._driver is None:
            self._driver = AsyncGraphDatabase.driver(
                self.uri,
                auth=(self.user, self.password),
                max_connection_pool_size=50,
                connection_timeout=30,
            )
        return self._driver

    async def test_connection(self) -> bool:
        """Test Neo4j connection"""
        try:
            driver = await self.connect()
            async with driver.session() as session:
                result = await session.run("RETURN 1 AS num")
                record = await result.single()
                if record and record["num"] == 1:
                    logger.info("Neo4j connection test successful")
                    return True
            return False
        except ServiceUnavailable as e:
            logger.error(f"Neo4j connection test failed: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error testing Neo4j connection: {e}")
            raise

    async def execute_query(
        self,
        query: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute a Cypher query

        Args:
            query: Cypher query string
            parameters: Query parameters

        Returns:
            List of result records as dictionaries
        """
        driver = await self.connect()
        async with driver.session() as session:
            result = await session.run(query, parameters or {})
            records = await result.data()
            return records

    async def execute_write(
        self,
        query: str,
        parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute a write transaction

        Args:
            query: Cypher query string
            parameters: Query parameters

        Returns:
            List of result records as dictionaries
        """
        driver = await self.connect()

        async def _execute(tx):
            result = await tx.run(query, parameters or {})
            return await result.data()

        async with driver.session() as session:
            records = await session.execute_write(_execute)
            return records

    def close(self) -> None:
        """Close the driver connection"""
        if self._driver is not None:
            self._driver.close()
            self._driver = None
            logger.info("Neo4j connection closed")


# Dependency for FastAPI
_neo4j_client: Optional[Neo4jClient] = None


def get_neo4j_client() -> Neo4jClient:
    """
    Get Neo4j client instance
    Usage: neo4j: Neo4jClient = Depends(get_neo4j_client)
    """
    global _neo4j_client
    if _neo4j_client is None:
        from app.core.config import settings
        _neo4j_client = Neo4jClient(
            uri=settings.NEO4J_URI,
            user=settings.NEO4J_USER,
            password=settings.NEO4J_PASSWORD
        )
    return _neo4j_client
