"""Fixture parts: per-feature demo data merged into the base fixture."""
import json

import app.ingestion.demo_orgs as demo_orgs
from app.ingestion.demo_orgs import load_fixture, merge_fixture_part


def test_merge_appends_lists_merges_dicts_and_replaces_values():
    base = {"demo_live": {"user_licenses": [{"Name": "A"}], "org_limits": {"X": 1}}, "org_name": "Old"}
    merge_fixture_part(base, {"demo_live": {"user_licenses": [{"Name": "B"}], "org_limits": {"Y": 2}},
                              "org_name": "New"})
    assert base == {"demo_live": {"user_licenses": [{"Name": "A"}, {"Name": "B"}], "org_limits": {"X": 1, "Y": 2}},
                    "org_name": "New"}


def test_parts_are_applied_in_name_order(tmp_path, monkeypatch):
    (tmp_path / "synthetic_mid_market.json").write_text(json.dumps({"demo_live": {"rows": [0]}}))
    parts = tmp_path / "synthetic_mid_market.parts"
    parts.mkdir()
    (parts / "20-b.json").write_text(json.dumps({"demo_live": {"rows": [2]}}))
    (parts / "10-a.json").write_text(json.dumps({"demo_live": {"rows": [1]}}))
    (parts / "README.md").write_text("not json")
    monkeypatch.setattr(demo_orgs, "FIXTURES_DIR", tmp_path)

    assert load_fixture("synthetic_mid_market")["demo_live"]["rows"] == [0, 1, 2]


def test_lumenvale_loads_without_parts_changing_the_base():
    data = load_fixture("synthetic_mid_market")
    assert len(data["users"]) == 400


def test_patch_updates_existing_rows_by_id_and_rejects_unknown_ids():
    import pytest

    base = {"users": [{"Id": "005A", "UserRoleId": "00E1"}, {"Id": "005B", "UserRoleId": "00E1"}]}
    merge_fixture_part(base, {"_patch": {"users": [{"Id": "005B", "UserRoleId": "00E2"}]}})
    assert base["users"] == [{"Id": "005A", "UserRoleId": "00E1"}, {"Id": "005B", "UserRoleId": "00E2"}]
    assert "_patch" not in base
    with pytest.raises(KeyError):
        merge_fixture_part(base, {"_patch": {"users": [{"Id": "005Z", "UserRoleId": "00E2"}]}})
