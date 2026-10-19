"""One API version setting: v68.0, or the newest version an org serves when
that's lower (read from GET /services/data/), cached per instance."""
import httpx
import pytest

from app.salesforce import api_version as av
from app.salesforce.client import SalesforceAPIClient
from app.salesforce.metadata_client import SalesforceMetadataClient
from app.services import role_design


def test_choose_the_newest_version_not_above_the_target():
    assert av.choose(["66.0", "67.0", "68.0"]) == "68.0"
    assert av.choose(["65.0", "66.0", "67.0"]) == "67.0"      # an org still on the previous release
    assert av.choose(["67.0", "68.0", "69.0"]) == "68.0"      # a preview org: stay on the target
    assert av.choose([]) == "68.0"
    assert av.TARGET == "68.0"


def _transport(versions, seen):
    def handler(request):
        seen.append(request.url.path)
        if request.url.path == "/services/data/":
            return httpx.Response(200, json=[{"version": v, "url": f"/services/data/v{v}"} for v in versions])
        return httpx.Response(200, json={"totalSize": 0, "done": True, "records": []})
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_client_settles_the_version_before_its_first_query(monkeypatch):
    seen = []
    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=_transport(["66.0", "67.0"], seen), **kw))
    av._cache.clear()
    c = SalesforceAPIClient("https://older.example.invalid", "token")
    await c.query("SELECT Id FROM User")
    await c.query_tooling("SELECT Id FROM ApexClass")
    assert seen == ["/services/data/", "/services/data/v67.0/query", "/services/data/v67.0/tooling/query"]
    # Cached per instance: a second client doesn't ask again, and the metadata client follows.
    c2 = SalesforceAPIClient("https://older.example.invalid", "token")
    await c2.query("SELECT Id FROM User")
    assert seen[-1] == "/services/data/v67.0/query" and seen.count("/services/data/") == 1
    assert SalesforceMetadataClient("https://older.example.invalid", "token").api_version == "v67.0"


@pytest.mark.asyncio
async def test_an_explicit_version_is_kept_and_an_unreadable_list_falls_back(monkeypatch):
    seen = []
    real = httpx.AsyncClient

    def failing(request):
        seen.append(request.url.path)
        if request.url.path == "/services/data/":
            return httpx.Response(503)
        return httpx.Response(200, json={"totalSize": 0, "done": True, "records": []})
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(failing), **kw))
    av._cache.clear()
    pinned = SalesforceAPIClient("https://x.example.invalid", "token", api_version="v62.0")
    await pinned.query("SELECT Id FROM User")
    assert seen == ["/services/data/v62.0/query"]
    c = SalesforceAPIClient("https://y.example.invalid", "token")
    await c.query("SELECT Id FROM User")
    assert seen[-1] == "/services/data/v68.0/query"


def test_role_design_export_uses_the_same_setting():
    assert role_design.METADATA_API_VERSION == av.TARGET == "68.0"
