#!/usr/bin/env python3
"""Read-only check before relying on API v68: run the same reads at two API
versions against one org and compare what comes back. For a developer org
or sandbox you own; never a client org.

    SF_INSTANCE_URL=https://yourdomain.my.salesforce.com SF_ACCESS_TOKEN=... \\
        python scripts/compare_api_versions.py [--old 62.0] [--new 68.0]

Only SELECT queries and describes are made (nothing is written). Prints,
per read, the row count at each version and any fields present at one
version but not the other, and exits 1 when a read fails at one version
only or the counts differ.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.salesforce.client import SalesforceAPIClient  # noqa: E402

# The reads the sync depends on most: (label, tooling?, SOQL).
READS = [
    ("Users", False, "SELECT Id, Username, Name, IsActive, ProfileId, UserRoleId, ManagerId, DelegatedApproverId, UserType FROM User"),
    ("Profiles", False, "SELECT Id, Name, UserLicenseId FROM Profile"),
    ("Permission sets", False, "SELECT Id, Name, Label, IsOwnedByProfile, ProfileId, Type FROM PermissionSet"),
    ("Assignments", False, "SELECT Id, AssigneeId, PermissionSetId, PermissionSetGroupId FROM PermissionSetAssignment"),
    ("Groups", False, "SELECT Id, DeveloperName, MasterLabel FROM PermissionSetGroup"),
    ("Object permissions", False, "SELECT Id, ParentId, SobjectType, PermissionsRead, PermissionsEdit, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions"),
    ("Field permissions", False, "SELECT Id, ParentId, SobjectType, Field, PermissionsRead, PermissionsEdit FROM FieldPermissions"),
    ("Roles", False, "SELECT Id, Name, DeveloperName, ParentRoleId FROM UserRole"),
    ("Setup entity access", False, "SELECT ParentId, SetupEntityId, SetupEntityType FROM SetupEntityAccess"),
    ("Flows", False, "SELECT Id, ApiName, ProcessType, TriggerType, IsActive, IsOutOfDate FROM FlowDefinitionView"),
    ("Account shares", False, "SELECT Id, AccountId, UserOrGroupId, RowCause FROM AccountShare LIMIT 2000"),
    ("Apex classes", True, "SELECT Id, Name, NamespacePrefix, ApiVersion, Status FROM ApexClass"),
    ("Coverage", True, "SELECT ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate"),
    ("Validation rules", True, "SELECT Id, ValidationName, Active, EntityDefinition.QualifiedApiName FROM ValidationRule"),
    ("Layouts", True, "SELECT Id, Name, TableEnumOrId FROM Layout"),
]


async def run(client: SalesforceAPIClient, tooling: bool, soql: str):
    try:
        rows = await (client.query_tooling(soql) if tooling else client.query_all(soql))
        return rows, None
    except Exception as e:  # noqa: BLE001
        return None, str(e)[:200]


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--old", default="62.0")
    ap.add_argument("--new", default="68.0")
    args = ap.parse_args()
    url, token = os.environ.get("SF_INSTANCE_URL"), os.environ.get("SF_ACCESS_TOKEN")
    if not url or not token:
        print("Set SF_INSTANCE_URL and SF_ACCESS_TOKEN for a developer org or sandbox you own.")
        return 2
    old = SalesforceAPIClient(url, token, api_version=f"v{args.old}")
    new = SalesforceAPIClient(url, token, api_version=f"v{args.new}")
    problems = 0
    for label, tooling, soql in READS:
        (a, ea), (b, eb) = await asyncio.gather(run(old, tooling, soql), run(new, tooling, soql))
        if ea or eb:
            line = f"{label}: v{args.old} {'error: ' + ea if ea else 'ok'} | v{args.new} {'error: ' + eb if eb else 'ok'}"
            problems += bool(ea) != bool(eb)
        else:
            keys_a = set().union(*[set(r) for r in a]) if a else set()
            keys_b = set().union(*[set(r) for r in b]) if b else set()
            extra = sorted(keys_b - keys_a)
            missing = sorted(keys_a - keys_b)
            line = f"{label}: {len(a)} rows at v{args.old}, {len(b)} at v{args.new}"
            if len(a) != len(b):
                problems += 1
                line += "  <- counts differ"
            if extra or missing:
                line += f"  fields only at v{args.new}: {extra}; only at v{args.old}: {missing}"
        print(line)
    print("No differences." if not problems else f"{problems} read(s) differ.")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
