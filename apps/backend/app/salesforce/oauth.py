"""
Salesforce OAuth Client
Handles OAuth 2.0 authentication flow with PKCE support
"""
import base64
import hashlib
import logging
import secrets
from typing import Optional, Dict
from urllib.parse import urlencode

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings
from app.salesforce.models import OAuthTokenResponse

logger = logging.getLogger(__name__)

# In-memory store for code verifiers (in production, use Redis/session)
_code_verifiers: Dict[str, str] = {}


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

    def _generate_code_verifier(self) -> str:
        """Generate PKCE code verifier"""
        return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')

    def _generate_code_challenge(self, verifier: str) -> str:
        """Generate PKCE code challenge from verifier"""
        digest = hashlib.sha256(verifier.encode('utf-8')).digest()
        return base64.urlsafe_b64encode(digest).decode('utf-8').rstrip('=')

    def get_authorization_url(self, state: Optional[str] = None) -> str:
        """
        Generate OAuth authorization URL with PKCE

        Args:
            state: Optional state parameter for CSRF protection

        Returns:
            Authorization URL
        """
        # Generate PKCE code verifier and challenge
        code_verifier = self._generate_code_verifier()
        code_challenge = self._generate_code_challenge(code_verifier)

        # Store code verifier for later use in token exchange
        if state:
            _code_verifiers[state] = code_verifier

        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
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
    async def exchange_code_for_token(self, code: str, state: Optional[str] = None) -> OAuthTokenResponse:
        """
        Exchange authorization code for access token with PKCE

        Args:
            code: Authorization code from callback
            state: State parameter to retrieve code verifier

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

        # Add code verifier for PKCE
        if state and state in _code_verifiers:
            data["code_verifier"] = _code_verifiers[state]
            # Clean up the verifier after use
            del _code_verifiers[state]

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
