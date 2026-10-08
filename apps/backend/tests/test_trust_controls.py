from types import SimpleNamespace

import pytest

from app.services import connection_posture
from tests.test_route_auth import _cookie, _setup, client  # noqa: F401


@pytest.mark.asyncio
async def test_write_back_is_off_until_an_admin_enables_it(client, async_db_session):  # noqa: F811
    _, a, _, admin, analyst, *_ = await _setup(async_db_session)

    r = await client.post(
        f"/orgs/{a.id}/reporting-graph/apply", json={"edits": []}, cookies=_cookie(admin)
    )
    assert r.status_code == 403
    assert "disabled" in r.json()["detail"]

    r = await client.put(f"/orgs/{a.id}/write-back", json={"enabled": True}, cookies=_cookie(analyst))
    assert r.status_code == 403

    r = await client.put(
        f"/orgs/{a.id}/write-back",
        json={"enabled": True, "note": "SOW 2026-14 section 3"},
        cookies=_cookie(admin),
    )
    assert r.status_code == 200
    assert r.json()["changed_by"] == "admin@firm.test"

    r = await client.post(
        f"/orgs/{a.id}/reporting-graph/apply", json={"edits": []}, cookies=_cookie(admin)
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_posture_flags_admin_connection(monkeypatch):
    responses = {
        "FROM User": [{
            "Username": "admin@client.com", "Name": "Admin",
            "Profile": {"Name": "System Administrator", "UserLicense": {"Name": "Salesforce"}},
        }],
        "FROM PermissionSetAssignment": [
            {"PermissionSet": {"PermissionsModifyAllData": True, "PermissionsManageUsers": True}},
        ],
    }

    async def fake_query(self, soql):
        key = next(k for k in responses if k in soql)
        return SimpleNamespace(records=responses[key])

    monkeypatch.setattr(connection_posture.SalesforceAPIClient, "query", fake_query)

    posture = await connection_posture.assess_connected_user(
        "https://x.my.salesforce.com", "tok", "005000000000001AAA"
    )

    assert posture["recommended"] is False
    assert posture["is_integration_user"] is False
    assert posture["elevated_permissions"] == ["Manage Users", "Modify All Data"]


@pytest.mark.asyncio
async def test_posture_rejects_malformed_user_id():
    posture = await connection_posture.assess_connected_user("https://x", "tok", "005' OR Id != '")
    assert posture["assessment_failed"] is True
