"""Roadmap item 11, part a: the org documentation workbook."""
import io

import pytest
from openpyxl import load_workbook
from sqlalchemy import select

from app.domain.models import UserSnapshot
from app.services import privacy_mode
from app.services.effective_access import EffectiveAccessService
from app.services.report.documentation import NOT_AT_METADATA_ONLY, SHEETS, build_documentation_workbook
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401
from tests.test_demo_privacy import ALIAS, _sync_demo


def _rows(ws):
    head = [c.value for c in ws[1]]
    return head, [dict(zip(head, r)) for r in ws.iter_rows(min_row=2, values_only=True)]


@pytest.mark.asyncio
async def test_org_wide_access_matches_the_per_user_views(async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, _ = lumenvale
    svc = EffectiveAccessService(db)
    every = await svc.org_access(org_id)
    users = (await db.execute(select(UserSnapshot.salesforce_id).where(
        UserSnapshot.organization_id == org_id, UserSnapshot.is_active.is_(True)))).scalars().all()
    assert len(every) == len(users)
    for uid in users:
        objs = {o["object"]: o["access"] for o in (await svc.get_user_object_access(org_id, uid))["objects"]}
        assert {k: v for k, v in every[uid]["objects"].items() if any(v.values())} == objs
        fields = {f"{f['objectName']}.{f['fieldName']}": f["access"]
                  for f in (await svc.get_user_field_access(org_id, uid))["fields"]}
        assert {k: v for k, v in every[uid]["fields"].items() if any(v.values())} == fields


@pytest.mark.asyncio
async def test_documentation_workbook_on_lumenvale(client, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    r = await client.get(f"/orgs/{org_id}/documentation.xlsx", cookies=cookie)
    assert r.status_code == 200 and 'filename="demo-org-documentation-' in r.headers["content-disposition"]
    wb = load_workbook(io.BytesIO(r.content))
    assert wb.sheetnames == list(SHEETS)
    about = {row[0]: row[1] for row in wb["About"].iter_rows(values_only=True)}
    assert about["Demo data"] and about["Organization"] == "Lumenvale Systems (Demo)" and about["Privacy level"] == "Full"

    head, objects = _rows(wb["Objects"])
    by = {o["Object"]: o for o in objects}
    assert len(objects) == 29 and by["Invoice__c"]["Fields"] == 11
    assert by["Payment__c"]["Master-detail parent"] == "Invoice__c"
    assert "System Administrator (Profile)" in by["Account"]["Modify All granted by"]
    assert by["Account"]["Users with Read"] == 376

    _, fields = _rows(wb["Fields"])
    f = {(x["Object"], x["Field"]): x for x in fields}
    assert len(fields) == 259
    assert f[("Employee__c", "National_ID__c")]["Encryption"] == "Shield"
    assert f[("Treasury_Account__c", "Account_Number__c")]["Type"] == "Text (Encrypted)(32)"
    assert (f[("Compensation__c", "Bonus__c")]["Encryption"], f[("Compensation__c", "Bonus__c")]["Required"]) == ("Not known", "Not known")
    assert f[("Invoice__c", "Days_Overdue__c")]["Formula"].startswith("IF(ISBLANK(")
    # Required fields follow the object; FLS fields count their own grants.
    assert f[("Account", "Name")]["Access follows"] == "Object access"
    assert f[("Account", "Name")]["Users with Read"] == 376
    assert f[("Employee__c", "National_ID__c")]["Access follows"] == "Field-level security"

    head, matrix = _rows(wb["Object Access"])
    assert head[1] == "Finance Analyst (Profile)" and any(h.endswith("(Group)") for h in head)
    account = next(m for m in matrix if m["Object"] == "Account")
    assert account["System Administrator (Profile)"] == "R C E D VA MA"
    _, unused = _rows(wb["Unused Layouts"])
    assert [(u["Object"], u["Layout"]) for u in unused] == [("Account", "Account - Legacy Layout"),
                                                             ("Case", "Case - Old Support Layout")]
    _, flows = _rows(wb["Flows"])
    discount = next(x for x in flows if x["API name"] == "Discount_Approval_Request")
    assert discount["Explicit access granted by"] == "Discount Approvals (in Sales Manager Bundle)"
    assert discount["Note"] == "Only through the explicit access listed."
    _, people = _rows(wb["Profile Users"])
    assert len(people) == 400 and all("@" not in (p["User"] or "") for p in people)


@pytest.mark.asyncio
async def test_masked_users_stay_masked(async_db_session):
    org = await _sync_demo(async_db_session, privacy_mode.MASKED)
    wb = load_workbook(io.BytesIO(await build_documentation_workbook(async_db_session, org)))
    _, people = _rows(wb["Profile Users"])
    _, assigned = _rows(wb["Assignments"])
    assert people and all(ALIAS.match(p["User"]) for p in people)
    assert assigned and all(ALIAS.match(a["User"]) for a in assigned)
    text = repr([[c for c in r] for ws in wb.worksheets for r in ws.iter_rows(values_only=True)])
    assert "Mina Tanaka" not in text and "lumenvale.example.com" not in text


@pytest.mark.asyncio
async def test_metadata_only_leaves_out_people(async_db_session):
    org = await _sync_demo(async_db_session, privacy_mode.METADATA_ONLY)
    wb = load_workbook(io.BytesIO(await build_documentation_workbook(async_db_session, org)))
    assert wb["Assignments"]["A2"].value == NOT_AT_METADATA_ONLY
    assert wb["Profile Users"]["A2"].value == NOT_AT_METADATA_ONLY
    head, objects = _rows(wb["Objects"])
    assert "Users with Read" not in head and len(objects) == 29
    _, fields = _rows(wb["Fields"])
    assert len(fields) == 259  # configuration is the same at every level
