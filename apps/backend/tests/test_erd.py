"""Entity relationship diagrams (item 12, parity #20): columns, depth,
system lookups, the node cap, the SVG and the image pack's Data model."""
import re

import pytest

from app.domain.models import Organization
from app.services import erd, privacy_mode
from app.services.report import image_pack as ip
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401


def _f(*refs, kind="lookup", required=False):
    return {"referenceTo": list(refs), "relationship": kind, "required": required, "label": "x"}


SCHEMA = {"objects": {
    "Account": {"label": "Account", "fields": {"OwnerId": _f("User"), "ParentId": _f("Account")},
                "childRelationships": [{"childSObject": "Invoice__c", "field": "Account__c", "cascadeDelete": False}]},
    "Invoice__c": {"label": "Invoice", "fields": {"Account__c": _f("Account"), "OwnerId": _f("User", "Group")},
                   "childRelationships": [{"childSObject": "Payment__c", "field": "Invoice__c", "cascadeDelete": True,
                                           "relationshipName": "Payments__r"}]},
    "Payment__c": {"label": "Payment", "fields": {"Invoice__c": _f("Invoice__c", kind="master_detail", required=True),
                                                 "CreatedById": _f("User")}, "childRelationships": []},
    "Task": {"label": "Task", "fields": {"WhatId": _f("Account", "Invoice__c")}, "childRelationships": []},
}}


def test_columns_read_parent_to_child_left_to_right():
    d = erd.build(SCHEMA, "Invoice__c", 1)
    col = {n["name"]: n["column"] for n in d["nodes"]}
    assert col == {"Invoice__c": 0, "Account": -1, "Payment__c": 1, "Task": 1}
    md = next(e for e in d["edges"] if e["from"] == "Payment__c")
    assert (md["kind"], md["cascadeDelete"], md["relationshipName"], md["required"]) == (
        "master_detail", True, "Payments__r", True)
    assert next(e for e in d["edges"] if e["from"] == "Task" and e["to"] == "Invoice__c")["polymorphic"] is True
    # Account's self-lookup stays, drawn as a loop in its own column.
    assert any(e["from"] == e["to"] == "Account" for e in erd.build(SCHEMA, "Account", 1)["edges"])


def test_system_lookups_hidden_by_default_and_depth_limits_the_reach():
    hidden = erd.build(SCHEMA, "Payment__c", 1)
    assert {n["name"] for n in hidden["nodes"]} == {"Payment__c", "Invoice__c"}
    shown = erd.build(SCHEMA, "Payment__c", 1, hide_system=False)
    user = next(n for n in shown["nodes"] if n["name"] == "User")
    assert user["described"] is False and user["column"] == -1
    assert {n["name"] for n in erd.build(SCHEMA, "Payment__c", 2)["nodes"]} == {"Payment__c", "Invoice__c", "Account", "Task"}
    assert erd.build(SCHEMA, "Payment__c", 9)["depth"] == 1  # only 1 to 3
    assert erd.build(SCHEMA, "Nope__c", 1)["found"] is False


def test_node_cap_keeps_the_nearest_and_counts_the_rest():
    d = erd.build(SCHEMA, "Invoice__c", 2, max_nodes=2)
    assert [n["name"] for n in d["nodes"]] == ["Invoice__c", "Account"] and d["leftOut"] == 2
    assert all(e["from"] in {"Invoice__c", "Account"} and e["to"] in {"Invoice__c", "Account"} for e in d["edges"])


def test_svg_draws_every_object_and_relationship():
    d = erd.build(SCHEMA, "Invoice__c", 2, readers={"Account": 12})
    picture = erd.svg(d)
    assert picture.startswith("<svg") and picture.count('rx="8"') == len(d["nodes"])
    assert picture.count("<path ") == len(d["edges"]) and 'stroke-width="3"' in picture  # master-detail bold
    assert "12 can read" in picture and "deleted with the parent" in picture
    assert erd.default_focus(SCHEMA) in ("Account", "Invoice__c")


@pytest.mark.asyncio
async def test_routes_on_lumenvale(client, async_db_session, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    d = (await client.get(f"/orgs/{org_id}/erd", params={"focus": "Invoice__c", "depth": 2, "readers": "true"},
                          cookies=cookie)).json()
    names = {n["name"] for n in d["nodes"]}
    assert {"Invoice__c", "Account", "Payment__c"} <= names and "User" not in names
    payment = next(e for e in d["edges"] if e["from"] == "Payment__c")
    assert (payment["to"], payment["kind"], payment["cascadeDelete"]) == ("Invoice__c", "master_detail", True)
    assert next(n for n in d["nodes"] if n["name"] == "Account")["readers"] == 376
    r = await client.get(f"/orgs/{org_id}/erd.svg", params={"focus": "Invoice__c", "depth": 2}, cookies=cookie)
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/svg+xml")
    assert 'filename="demo-data-model-Invoice__c-depth2.svg"' in r.headers["content-disposition"]
    assert "376 can read" not in r.text  # the SVG carries no user counts

    org = await async_db_session.get(Organization, org_id)
    privacy_mode.set_privacy(org, privacy_mode.METADATA_ONLY, False, "test")
    await async_db_session.commit()
    d = (await client.get(f"/orgs/{org_id}/erd", params={"focus": "Invoice__c", "readers": "true"}, cookies=cookie)).json()
    assert d["note"] and all("readers" not in n for n in d["nodes"])


@pytest.mark.asyncio
async def test_image_pack_data_model(async_db_session, lumenvale):  # noqa: F811
    src = await ip.gather_pack_source(async_db_session, lumenvale[0])
    avail = {v["key"]: v for v in ip.availability(src)}
    assert avail["data_model"]["available"] and avail["data_model"]["title"] == "Data model"
    caption, body = ip.build_visual("data_model", src)[0]
    assert caption.startswith(f"{erd.default_focus(src.schema)} and the objects related to it")
    assert body.startswith('<div style="text-align:center"><svg')
    width, height = (float(v) for v in re.search(r'width="([\d.]+)" height="([\d.]+)"', body).groups())
    assert width <= 720 and height <= 330 and (width == 720 or height == 330)
    src.schema = None
    assert ip.build_visual("data_model", src)[1].startswith("Sync the org")
