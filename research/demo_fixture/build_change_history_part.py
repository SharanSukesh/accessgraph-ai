"""Lumenvale fixture part 13 (roadmap item 14): a Setup Audit Trail, so
Change-Risk Radar and the workbook's Change History sheet can be shown on
the demo org. Synthetic.

60 changes over the 30 days before the fixture's date anchor (they move
with today like the rest of Lumenvale), by the eight System Administrator
users, across the Setup sections Change-Risk Radar scores. Planted: a
Connected App installed at 23:40 on a Saturday; a Sharing Default changed
by one admin on behalf of another (DelegateUser); a burst of permission
set assignments in one afternoon; and the changes behind item 13's
cleanup plants (the Old_Score_Range validation rule created, the Legacy
Fax Sync flow deactivated).

Writes apps/backend/fixtures/synthetic_mid_market.parts/13-change-history.json.
"""
from __future__ import annotations

import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/backend/fixtures/synthetic_mid_market.parts/13-change-history.json"
ANCHOR = datetime(2026, 10, 19, 22, 0, tzinfo=timezone.utc)  # DemoFixture.anchor for synthetic_mid_market

ADMINS = [("005000000000012DMO", "Viktor Hawthorne"), ("005000000000150DMO", "Ayla Zielinski"),
          ("005000000000165DMO", "Idris Castellan"), ("005000000000275DMO", "Odette Fennimore"),
          ("005000000000278DMO", "Marlow Sallow"), ("005000000000350DMO", "Callum Yarrow"),
          ("005000000000372DMO", "Nikhil Pemberton"), ("005000000000374DMO", "Freya Marchetti")]
ROUTINE = [  # (section, action, display)
    ("Manage Users", "changedUserEmail", "Changed email for user {user}"),
    ("Manage Users", "resetPassword", "Reset password for {user}"),
    ("Manage Users", "deactivateduser", "Deactivated user {user}"),
    ("Manage Users", "createduser", "Created new user {user}"),
    ("Manage Permission Sets", "PermSetAssign", "Permission set Quote Manager: assigned to user {user}"),
    ("Manage Permission Sets", "PermSetUnassign", "Permission set Lead Conversion: unassigned from user {user}"),
    ("Customize Accounts", "changedPicklistValue", "Changed Account Industry picklist value Biotech to Life Sciences"),
    ("Customize Opportunities", "createdCFRecordTypeLayout", "Changed page layout assignment for Opportunity Renewal"),
    ("Custom Objects", "changedCFLength", "Changed field length for Invoice PO Number from 20 to 30"),
    ("Apex Class", "changedApexClass", "Changed Class code: InvoiceService"),
    ("Flows", "activatedinteractiondefversion", "Activated flow version Case Triage, version 4"),
    ("Email Administration", "changedEmailDeliverability", "Changed email deliverability to All email"),
    ("Custom Metadata", "changedCustomMetadataRecord", "Changed Discount Threshold record Strategic"),
    ("Company Information", "changedOrgTimeZone", "Changed default time zone"),
]
USERS = ["Noor Whitlock", "Jun Jovanovic", "Tobias Lindqvist", "Priya Raman", "Mateo Varga", "Elin Sorensen"]
PLANTED = [  # (days before anchor, hour, minute, admin index, section, action, display, delegate)
    (26, 23, 40, 4, "Connected Apps", "insertedConnectedApplication",
     "Installed connected app DataBridge Sync (package install)", None),
    (19, 10, 15, 0, "Sharing Defaults", "changedSharingDefault",
     "Changed Opportunity organization-wide default from Private to Public Read Only", "ayla.zielinski@lumenvale.example.com"),
    (12, 9, 5, 2, "Validation Rules", "newValidationRule", "Created validation rule Old_Score_Range on Account", None),
    (9, 16, 20, 1, "Flows", "deactivatedinteractiondefversion", "Deactivated flow version Legacy Fax Sync, version 3", None),
    (6, 14, 0, 5, "Manage Profiles", "profileFlsChanged", "Changed profile Sales Rep: field-level security for Account Tax ID", None),
    (3, 11, 30, 6, "Field-Level Security", "changedFieldSecurity", "Changed field-level security for Compensation Salary Band", None),
    (2, 22, 10, 3, "Package Manager", "uninstalledPackage", "Uninstalled package Legacy Survey Tool, permanently deleted its data", None),
]


def stamp(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000+0000")


def main() -> int:
    rng = random.Random(14)
    rows = []
    n = 1

    def add(when: datetime, admin: int, section: str, action: str, display: str, delegate=None) -> None:
        nonlocal n
        uid, name = ADMINS[admin]
        rows.append({"Id": f"0Ym{n:012d}DMO", "CreatedDate": stamp(when),
                     "CreatedBy": {"Id": uid, "Name": name, "Username": name.lower().replace(" ", ".") + "@lumenvale.example.com"},
                     "Action": action, "Section": section, "Display": display, "DelegateUser": delegate})
        n += 1

    for days, hour, minute, admin, section, action, display, delegate in PLANTED:
        add(ANCHOR - timedelta(days=days, hours=ANCHOR.hour - hour, minutes=-minute), admin, section, action, display, delegate)
    # A burst: eight permission set assignments in one afternoon, by one admin.
    burst = ANCHOR - timedelta(days=15, hours=ANCHOR.hour - 15)
    for i in range(8):
        add(burst + timedelta(minutes=4 * i), 7, "Manage Permission Sets", "PermSetAssign",
            f"Permission set Discount Approvals: assigned to user {USERS[i % len(USERS)]}")
    while len(rows) < 60:
        days = rng.randint(0, 29)
        when = ANCHOR - timedelta(days=days, hours=ANCHOR.hour - rng.randint(8, 18), minutes=-rng.randint(0, 59))
        section, action, display = ROUTINE[rng.randrange(len(ROUTINE))]
        add(when, rng.randrange(len(ADMINS)), section, action, display.format(user=rng.choice(USERS)))
    rows.sort(key=lambda r: r["CreatedDate"], reverse=True)
    part = {"_source": "Roadmap item 14. Generated by research/demo_fixture/build_change_history_part.py; synthetic.",
            "demo_live": {"setup_audit_trail": rows}}
    OUT.write_text(json.dumps(part, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(rows)} audit trail rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
