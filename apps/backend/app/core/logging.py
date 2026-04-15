"""
Structured Logging Configuration
JSON logging for production, human-readable for development
"""
import logging
import sys
from typing import Any, Dict
from pythonjsonlogger import jsonlogger

from app.core.config import settings


class CustomJsonFormatter(jsonlogger.JsonFormatter):
    """Custom JSON formatter with additional fields"""

    def add_fields(
        self,
        log_record: Dict[str, Any],
        record: logging.LogRecord,
        message_dict: Dict[str, Any]
    ) -> None:
        """Add custom fields to log record"""
        super().add_fields(log_record, record, message_dict)

        # Add standard fields
        log_record["service"] = "accessgraph-backend"
        log_record["level"] = record.levelname
        log_record["logger"] = record.name

        # Add extra fields from record
        if hasattr(record, "correlation_id"):
            log_record["correlation_id"] = record.correlation_id


def setup_logging() -> None:
    """
    Configure application logging
    Uses JSON format in production, human-readable in development
    """
    log_level = settings.BACKEND_LOG_LEVEL.upper()

    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Remove existing handlers
    root_logger.handlers.clear()

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)

    # Format based on environment
    if settings.BACKEND_RELOAD:  # Development mode
        # Human-readable format
        formatter = logging.Formatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
    else:  # Production mode
        # JSON format
        formatter = CustomJsonFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={"asctime": "timestamp", "levelname": "level"}
        )

    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # Suppress noisy loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
