"""
Salesforce OAuth Client
Handles OAuth 2.0 authentication flow
"""
import logging
from typing import Optional
from urllib.parse import urlencode

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings
from app.salesforce.models import OAuthTokenResponse

logger = logging.getLogger(__name__)


class SalesforceOAuthClient:
    """
    Salesforce OAuth 2.0 client
    Supports web server flow and refresh token flow
    """

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        redirect_uri: Optional[str] = None,
        login_url: Optional[str] = None,
    ):
        self.client_id = client_id or settings.SALESFORCE_CLIENT_ID
        self.client_secret = client_secret or settings.SALESFORCE_CLIENT_SECRET
        self.redirect_uri = redirect_uri or settings.SALESFORCE_REDIRECT_URI
        self.login_url = login_url or settings.SALESFORCE_LOGIN_URL

    def get_authorization_url(self, state: Optional[str] = None) -> str:
        """
        Generate OAuth authorization URL

        Args:
            state: Optional state parameter for CSRF protection

        Returns:
            Authorization URL
        """
        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
        }

        if state:
            params["state"] = state

        auth_url = f"{self.login_url}/services/oauth2/authorize"
        return f"{auth_url}?{urlencode(params)}"

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def exchange_code_for_token(self, code: str) -> OAuthTokenResponse:
        """
        Exchange authorization code for access token

        Args:
            code: Authorization code from callback

        Returns:
            OAuthTokenResponse with access_token and refresh_token

        Raises:
            httpx.HTTPError: If token exchange fails
        """
        token_url = f"{self.login_url}/services/oauth2/token"

        data = {
            "grant_type": "authorization_code",
            "code": code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, data=data)
            response.raise_for_status()

            token_data = response.json()
            logger.info("Successfully exchanged code for token", extra={"instance_url": token_data.get("instance_url")})

            return OAuthTokenResponse(**token_data)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def refresh_access_token(self, refresh_token: str) -> OAuthTokenResponse:
        """
        Refresh access token using refresh token

        Args:
            refresh_token: Refresh token from previous OAuth flow

        Returns:
            OAuthTokenResponse with new access_token

        Raises:
            httpx.HTTPError: If refresh fails
        """
        token_url = f"{self.login_url}/services/oauth2/token"

        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, data=data)
            response.raise_for_status()

            token_data = response.json()
            logger.info("Successfully refreshed access token")

            return OAuthTokenResponse(**token_data)

    async def revoke_token(self, token: str) -> bool:
        """
        Revoke an access or refresh token

        Args:
            token: Token to revoke

        Returns:
            True if revocation successful
        """
        revoke_url = f"{self.login_url}/services/oauth2/revoke"

        data = {"token": token}

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(revoke_url, data=data)
                response.raise_for_status()
                logger.info("Successfully revoked token")
                return True
        except httpx.HTTPError as e:
            logger.error(f"Failed to revoke token: {e}")
            return False
