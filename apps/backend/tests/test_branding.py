from types import SimpleNamespace

import pytest

from app.services import client_logo
from tests.test_route_auth import _cookie, _setup, client  # noqa: F401

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


@pytest.mark.asyncio
async def test_client_logo_upload_roundtrip(client, async_db_session):  # noqa: F811
    _, a, _, admin, analyst, viewer, _ = await _setup(async_db_session)
    files = {"file": ("logo.png", PNG, "image/png")}

    r = await client.post(f"/orgs/{a.id}/org-analyzer/brand/client-logo", files=files, cookies=_cookie(viewer))
    assert r.status_code == 403
    r = await client.post(f"/orgs/{a.id}/org-analyzer/brand/client-logo", files=files, cookies=_cookie(analyst))
    assert r.status_code == 200
    r = await client.get(f"/orgs/{a.id}/org-analyzer/brand", cookies=_cookie(analyst))
    assert r.json()["has_client_logo"] is True
    r = await client.get(f"/orgs/{a.id}/org-analyzer/brand/client-logo", cookies=_cookie(analyst))
    assert r.content == PNG
    r = await client.post(
        f"/orgs/{a.id}/org-analyzer/brand/client-logo",
        files={"file": ("x.svg", b"<svg/>", "image/svg+xml")}, cookies=_cookie(analyst),
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_firm_brand_is_admin_only(client, async_db_session):  # noqa: F811
    _, _, _, admin, analyst, *_ = await _setup(async_db_session)
    body = {"firm_name": "Northwind Advisory", "accent_hex": "#14532d"}
    r = await client.put("/firm-brand", json=body, cookies=_cookie(analyst))
    assert r.status_code == 403
    r = await client.put("/firm-brand", json=body, cookies=_cookie(admin))
    assert r.status_code == 200
    r = await client.get("/firm-brand", cookies=_cookie(analyst))
    assert r.json()["firm_name"] == "Northwind Advisory"


@pytest.mark.asyncio
async def test_logo_fetch_never_sends_token_off_org(monkeypatch):
    sf = SimpleNamespace(instance_url="https://acme.my.salesforce.com", access_token="secret")
    calls = []

    class FakeHttp:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, url, headers):
            calls.append(url)
            return SimpleNamespace(status_code=200, content=PNG)

    monkeypatch.setattr(client_logo.httpx, "AsyncClient", FakeHttp)
    assert await client_logo._download(sf, "https://evil.example.com/logo.png") is None
    assert calls == []
    found = await client_logo._download(sf, "/resource/123/Logo")
    assert found == (PNG, "image/png")
    assert calls == ["https://acme.my.salesforce.com/resource/123/Logo"]
