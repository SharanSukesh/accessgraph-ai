"""Best-effort retrieval of a client's logo from their Salesforce org.

Tried in order:
  1. Lightning "Themes and Branding": the active BrandingSet's brand image
     (Tooling API BrandingSetProperty, PropertyName = BRAND_IMAGE).
  2. A classic Document whose name contains "logo".

Neither is guaranteed to exist, and BrandingSet field shapes vary by org,
so every step fails soft and the caller falls back to manual upload. Only
PNG/JPEG under the size cap are accepted (SVG can carry script).
"""
from __future__ import annotations

import logging
from typing import Optional, Tuple
from urllib.parse import urljoin

import httpx

from app.salesforce.client import SalesforceAPIClient

logger = logging.getLogger(__name__)

MAX_LOGO_BYTES = 256 * 1024
ALLOWED_MIMES = {"image/png", "image/jpeg"}


def _sniff_mime(data: bytes) -> Optional[str]:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


async def _download(client: SalesforceAPIClient, url: str) -> Optional[Tuple[bytes, str]]:
    absolute = url if url.startswith("http") else urljoin(client.instance_url + "/", url.lstrip("/"))
    # Never send the org's token anywhere but the org itself.
    if not absolute.startswith(client.instance_url):
        logger.info("client logo url outside the org, skipped: %s", absolute)
        return None
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as http:
        resp = await http.get(absolute, headers={"Authorization": f"Bearer {client.access_token}"})
    if resp.status_code != 200 or len(resp.content) > MAX_LOGO_BYTES:
        return None
    mime = _sniff_mime(resp.content)
    return (resp.content, mime) if mime in ALLOWED_MIMES else None


async def fetch_client_logo(client: SalesforceAPIClient) -> Optional[Tuple[bytes, str, str]]:
    """Returns (bytes, mime, source) or None."""
    try:
        props = await client.query_tooling(
            "SELECT PropertyName, PropertyValue FROM BrandingSetProperty "
            "WHERE PropertyName = 'BRAND_IMAGE'"
        )
        for prop in props or []:
            value = (prop.get("PropertyValue") or "").strip()
            if value:
                found = await _download(client, value)
                if found:
                    return found[0], found[1], "salesforce_branding"
    except Exception:  # noqa: BLE001
        logger.info("BrandingSet lookup failed", exc_info=True)

    try:
        docs = (await client.query(
            "SELECT Id, Name, ContentType FROM Document "
            "WHERE Name LIKE '%logo%' AND ContentType IN ('image/png', 'image/jpeg') "
            "ORDER BY LastModifiedDate DESC LIMIT 3"
        )).records or []
        for doc in docs:
            found = await _download(
                client, f"{client.base_url}/sobjects/Document/{doc['Id']}/Body"
            )
            if found:
                return found[0], found[1], "salesforce_document"
    except Exception:  # noqa: BLE001
        logger.info("Document logo lookup failed", exc_info=True)
    return None
