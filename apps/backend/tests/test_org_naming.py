import pytest

from app.domain.models import Organization
from app.services.org_naming import apply_salesforce_name
from tests.test_route_auth import _cookie, _setup, client  # noqa: F401


def test_salesforce_name_applies_until_renamed_manually():
    org = Organization(name="Salesforce Org (orgfarm-1-dev-ed)", settings={})
    apply_salesforce_name(org, "Acme Corporation")
    assert org.name == "Acme Corporation"

    org.settings = {"name_source": "manual"}
    apply_salesforce_name(org, "Something Else")
    assert org.name == "Acme Corporation"

    apply_salesforce_name(org, None)
    assert org.name == "Acme Corporation"


@pytest.mark.asyncio
async def test_rename_endpoint(client, async_db_session):  # noqa: F811
    _, a, _, admin, analyst, viewer, _ = await _setup(async_db_session)

    r = await client.patch(f"/orgs/{a.id}", json={"name": "Meridian Demo"}, cookies=_cookie(viewer))
    assert r.status_code == 403
    r = await client.patch(f"/orgs/{a.id}", json={"name": "  "}, cookies=_cookie(analyst))
    assert r.status_code == 400
    r = await client.patch(f"/orgs/{a.id}", json={"name": "Meridian Demo"}, cookies=_cookie(analyst))
    assert r.status_code == 200
    assert r.json()["name"] == "Meridian Demo"
    await async_db_session.refresh(a)
    assert a.settings["name_source"] == "manual"
