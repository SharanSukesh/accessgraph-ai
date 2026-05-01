"""
Application Configuration
Environment-based settings using Pydantic Settings
"""
from typing import List
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="allow",
        # Don't try to parse env vars as JSON - use validators instead
        env_parse_none_str="",
        env_parse_enums=False,
    )

    # Application
    BACKEND_HOST: str = Field(default="0.0.0.0", description="Backend host")
    BACKEND_PORT: int = Field(default=8000, description="Backend port")
    BACKEND_RELOAD: bool = Field(default=False, description="Enable auto-reload")
    BACKEND_LOG_LEVEL: str = Field(default="info", description="Log level")
    BACKEND_CORS_ORIGINS: str = Field(
        default="http://localhost:3000,http://localhost:3001",
        description="CORS allowed origins (comma-separated)"
    )

    # Database - PostgreSQL (or SQLite for demo)
    DATABASE_URL: str = Field(
        default="sqlite+aiosqlite:///./accessgraph.db",
        description="Database connection URL (PostgreSQL or SQLite)"
    )

    # Database - Neo4j
    NEO4J_URI: str = Field(
        default="bolt://localhost:7687",
        description="Neo4j connection URI"
    )
    NEO4J_USER: str = Field(default="neo4j", description="Neo4j username")
    NEO4J_PASSWORD: str = Field(default="change_me", description="Neo4j password")

    # Cache - Redis
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL"
    )

    # Demo Mode
    DEMO_MODE: bool = Field(
        default=True,
        description="Run in demo mode (no Salesforce connection required)"
    )

    # Salesforce
    SALESFORCE_CLIENT_ID: str = Field(default="", description="Salesforce OAuth client ID")
    SALESFORCE_CLIENT_SECRET: str = Field(default="", description="Salesforce OAuth client secret")
    SALESFORCE_REDIRECT_URI: str = Field(
        default="http://localhost:8000/auth/salesforce/callback",
        description="OAuth redirect URI"
    )
    SALESFORCE_LOGIN_URL: str = Field(
        default="https://login.salesforce.com",
        description="Salesforce login URL"
    )

    # Encryption
    DATABASE_ENCRYPTION_KEY: str = Field(
        default="",
        description="AES-256 encryption key for sensitive fields (base64 encoded, 32 bytes)"
    )
    ENABLE_FIELD_ENCRYPTION: bool = Field(
        default=True,
        description="Encrypt sensitive database fields (OAuth tokens, PII)"
    )

    # Security
    ENFORCE_HTTPS: bool = Field(
        default=False,
        description="Enforce HTTPS and add HSTS headers (enable in production)"
    )
    HSTS_MAX_AGE: int = Field(
        default=31536000,
        description="HSTS max age in seconds (default: 1 year)"
    )
    ALLOWED_HOSTS: str = Field(
        default="*",
        description="Allowed hostnames (comma-separated, '*' allows all)"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins string into list"""
        if not self.BACKEND_CORS_ORIGINS or self.BACKEND_CORS_ORIGINS.strip() == "":
            # Default origins - includes localhost and Railway domains
            return [
                "http://localhost:3000",
                "http://localhost:3001",
                "https://gentle-love-production-1eba.up.railway.app",
                "https://accessgraph-ai-production.up.railway.app"
            ]
        return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def async_database_url(self) -> str:
        """Convert database URL to async version"""
        if self.DATABASE_URL.startswith("postgresql://"):
            return self.DATABASE_URL.replace("postgresql://", "postgresql+psycopg://")
        # SQLite already has async driver specified
        return self.DATABASE_URL

    @property
    def allowed_hosts_list(self) -> List[str]:
        """Parse allowed hosts string into list"""
        if not self.ALLOWED_HOSTS or self.ALLOWED_HOSTS.strip() == "*":
            return ["*"]
        return [host.strip() for host in self.ALLOWED_HOSTS.split(",") if host.strip()]

    def validate_encryption_key(self) -> bool:
        """Validate that encryption key is set if encryption is enabled"""
        if self.ENABLE_FIELD_ENCRYPTION and not self.DATABASE_ENCRYPTION_KEY:
            raise ValueError(
                "DATABASE_ENCRYPTION_KEY must be set when ENABLE_FIELD_ENCRYPTION=True. "
                "Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
            )
        return True


# Global settings instance
settings = Settings()
