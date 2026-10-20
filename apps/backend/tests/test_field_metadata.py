"""Field type and encryption aren't synced, so the API reports them as unknown."""
import json
from pathlib import Path

import pytest

from app.domain.models import Organization
from app.ingestion.snapshot import SnapshotPersister
from tests.test_demo_orgs import _cookie, _users, client  # noqa: F401  (fixture)

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "demo_org.json"


@pytest.mark.asyncio
async def test_field_endpoints_never_invent_type_or_encryption(client, async_db_session):  # noqa: F811
    admin, _ = await _users(async_db_session)
    org = Organization(name="Acme", is_demo=True)
    async_db_session.add(org)
    await async_db_session.commit()
    await SnapshotPersister(async_db_session).persist_all(org.id, json.loads(FIXTURE.read_text()))

    listing = (await client.get(f"/orgs/{org.id}/fields", cookies=_cookie(admin))).json()
    assert listing["items"]
    assert all(f["dataType"] is None and f["isEncrypted"] is None for f in listing["items"])

    field_id = listing["items"][0]["id"]
    detail = (await client.get(f"/orgs/{org.id}/fields/{field_id}", cookies=_cookie(admin))).json()
    assert detail["dataType"] is None and detail["isEncrypted"] is None
