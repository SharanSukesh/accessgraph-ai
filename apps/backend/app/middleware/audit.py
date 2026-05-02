"""
Audit Logging Middleware
Automatically logs API access to sensitive endpoints for compliance and security.
"""
import logging
import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.domain.models import AuditLog, AuditAction
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


# Sensitive endpoints that should be audited
AUDITED_ENDPOINTS = [
    "/orgs/",           # Organization data access
    "/users/",          # User data access
    "/sync",            # Data synchronization
    "/auth/",           # Authentication
    "/anomalies",       # Anomaly detection results
    "/recommendations", # Security recommendations
]


# Map HTTP methods + paths to audit actions
def get_audit_action(method: str, path: str) -> AuditAction | None:
    """Determine the audit action based on request method and path"""

    # Authentication
    if "/auth/salesforce" in path:
        return AuditAction.CONNECT_SALESFORCE
    elif "/auth/logout" in path:
        return AuditAction.LOGOUT
    elif "/auth/me" in path:
        return AuditAction.LOGIN

    # Data access
    elif "/users" in path and method == "GET":
        if "/access" in path or "/permissions" in path:
            return AuditAction.VIEW_PERMISSIONS
        elif path.count("/") > 3:  # /orgs/{id}/users/{id} = detailed view
            return AuditAction.VIEW_USER_DETAILS
        else:
            return AuditAction.VIEW_USERS

    # Data modification
    elif "/sync" in path and method == "POST":
        return AuditAction.SYNC_DATA
    elif method == "DELETE":
        return AuditAction.DELETE_DATA
    elif "/export" in path:
        return AuditAction.EXPORT_DATA

    # Anomalies and recommendations
    elif "/anomalies" in path:
        return AuditAction.VIEW_ANOMALIES
    elif "/recommendations" in path:
        return AuditAction.VIEW_RECOMMENDATIONS

    # Graph access
    elif "/graph" in path:
        return AuditAction.VIEW_ACCESS_GRAPH

    # Configuration
    elif "/settings" in path and method in ["PUT", "PATCH"]:
        return AuditAction.UPDATE_SETTINGS

    return None


def extract_org_id(path: str) -> str | None:
    """Extract organization ID from path"""
    parts = path.split("/")
    try:
        if "orgs" in parts:
            org_index = parts.index("orgs")
            if len(parts) > org_index + 1:
                return parts[org_index + 1]
    except (ValueError, IndexError):
        pass
    return None


def extract_resource_info(path: str) -> tuple[str, str | None]:
    """Extract resource type and ID from path"""
    parts = path.split("/")

    # Try to identify resource type and ID
    if "users" in parts:
        try:
            user_index = parts.index("users")
            if len(parts) > user_index + 1:
                return ("user", parts[user_index + 1])
            return ("user", None)
        except (ValueError, IndexError):
            return ("user", None)

    elif "sync" in parts:
        return ("sync_job", None)

    elif "anomalies" in parts:
        return ("anomaly", None)

    elif "recommendations" in parts:
        return ("recommendation", None)

    elif "orgs" in parts:
        try:
            org_index = parts.index("orgs")
            if len(parts) > org_index + 1:
                return ("organization", parts[org_index + 1])
        except (ValueError, IndexError):
            pass

    return ("unknown", None)


class AuditMiddleware(BaseHTTPMiddleware):
    """Middleware to log API access for compliance and security auditing"""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and log if it accesses sensitive endpoints"""

        # Check if this endpoint should be audited
        should_audit = any(
            request.url.path.startswith(prefix)
            for prefix in AUDITED_ENDPOINTS
        )

        if not should_audit:
            # Skip audit logging for non-sensitive endpoints
            return await call_next(request)

        # Capture request start time
        start_time = time.time()

        # Extract request details
        method = request.method
        path = request.url.path
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

        # Determine audit action
        action = get_audit_action(method, path)

        # Extract organization and resource info
        org_id = extract_org_id(path)
        resource_type, resource_id = extract_resource_info(path)

        # TODO: Extract user email from session/JWT token
        # For now, we'll use None (anonymous)
        user_email = None
        user_id = None

        # Process the request
        response = None
        error_message = None
        success = True

        try:
            response = await call_next(request)
            success = response.status_code < 400
            return response

        except Exception as e:
            success = False
            error_message = str(e)
            logger.error(f"Request failed: {e}", exc_info=True)
            raise

        finally:
            # Log the audit entry (don't block on failures)
            try:
                if action and org_id:  # Only log if we have meaningful data
                    duration_ms = int((time.time() - start_time) * 1000)

                    await self._create_audit_log(
                        organization_id=org_id,
                        user_email=user_email,
                        user_id=user_id,
                        action=action,
                        resource_type=resource_type,
                        resource_id=resource_id,
                        ip_address=ip_address,
                        user_agent=user_agent,
                        request_path=path,
                        request_method=method,
                        success=success,
                        error_message=error_message,
                        context_data={
                            "duration_ms": duration_ms,
                            "status_code": response.status_code if response else None,
                        }
                    )
            except Exception as audit_error:
                # Don't fail the request if audit logging fails
                logger.error(f"Failed to create audit log: {audit_error}", exc_info=True)

    async def _create_audit_log(
        self,
        organization_id: str,
        user_email: str | None,
        user_id: str | None,
        action: AuditAction,
        resource_type: str,
        resource_id: str | None,
        ip_address: str | None,
        user_agent: str | None,
        request_path: str,
        request_method: str,
        success: bool,
        error_message: str | None,
        context_data: dict,
    ):
        """Create an audit log entry in the database"""
        async with AsyncSessionLocal() as session:
            try:
                audit_log = AuditLog(
                    organization_id=organization_id,
                    user_email=user_email,
                    user_id=user_id,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    request_path=request_path,
                    request_method=request_method,
                    success=success,
                    error_message=error_message,
                    context_data=context_data,
                )
                session.add(audit_log)
                await session.commit()

                logger.debug(
                    f"Audit log created: {action.value} by {user_email or 'anonymous'} "
                    f"on {resource_type} (success={success})"
                )

            except Exception as e:
                logger.error(f"Failed to save audit log: {e}", exc_info=True)
                await session.rollback()
