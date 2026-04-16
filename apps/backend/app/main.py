"""
AccessGraph AI - FastAPI Application Entry Point
"""
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import health
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import engine, test_connection
from app.db.neo4j_client import Neo4jClient

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan handler - startup and shutdown logic
    """
    # Startup
    logger.info("Starting AccessGraph AI Backend Service", extra={"version": "0.1.0"})

    # Test database connections
    try:
        await test_connection()
        logger.info("PostgreSQL connection established")
    except Exception as e:
        logger.error(f"Failed to connect to PostgreSQL: {e}")

    try:
        neo4j_client = Neo4jClient(
            uri=settings.NEO4J_URI,
            user=settings.NEO4J_USER,
            password=settings.NEO4J_PASSWORD
        )
        await neo4j_client.test_connection()
        logger.info("Neo4j connection established")
        neo4j_client.close()
    except Exception as e:
        logger.error(f"Failed to connect to Neo4j: {e}")

    yield

    # Shutdown
    logger.info("Shutting down AccessGraph AI Backend Service")
    await engine.dispose()


# Create FastAPI application
app = FastAPI(
    title="AccessGraph AI API",
    description="Enterprise Access Intelligence Platform - API Service",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
from app.api.routes import auth, orgs, users

app.include_router(health.router, tags=["health"])
app.include_router(auth.router, tags=["authentication"])
app.include_router(orgs.router, tags=["organizations"])
app.include_router(users.router, tags=["users"])


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(
        f"Unhandled exception: {exc}",
        extra={"path": request.url.path, "method": request.method},
        exc_info=True
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "AccessGraph AI",
        "version": "0.1.0",
        "status": "running",
        "docs": "/docs"
    }
