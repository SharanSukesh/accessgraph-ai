"""Build a realistic, fully synthetic Salesforce org fixture for demos.

Statistics come from the research generator (anomaly_benchmark, mid-market
persona: profile mix, permission-set counts, last-login spread, planted
anomaly archetypes) and roles/managers from rl_solution's hierarchy. This
script turns those statistics into concrete Salesforce metadata (profiles,
permission sets, permission set groups with muting sets, object and field
permissions, assignments) in the same JSON shape as
apps/backend/fixtures/demo_org.json, so Newton computes everything itself.

It also writes the small amount of org-level data Newton normally reads
live (user and permission-set licences, edition, limits, per-user record
ownership) under "demo_live", served to demo orgs by a fixture-backed client.

Everything is fictional: invented company name, generated person names,
example.com email domains. No real data is read.

    python -m research.demo_fixture.build_synthetic_fixture [--seed N] [--users N]
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

from research.anomaly_benchmark.data.distributions import PROFILE_CATALOG
from research.anomaly_benchmark.data.generator import generate_org
from research.anomaly_benchmark.data.schemas import AnomalyArchetype
from research.rl_solution.data.synth_hierarchy import augment

ORG_NAME = "Lumenvale Systems (Demo)"
EMAIL_DOMAIN = "lumenvale.example.com"
OUT = Path(__file__).resolve().parents[2] / "apps/backend/fixtures/synthetic_mid_market.json"
NOW = datetime(2026, 10, 14, 9, 0, tzinfo=timezone.utc)

FIRST = ["Avery", "Jordan", "Riley", "Morgan", "Casey", "Taylor", "Quinn", "Rowan", "Parker", "Emerson",
         "Hayden", "Reese", "Skyler", "Dakota", "Finley", "Sawyer", "Ellis", "Harper", "Kendall", "Marlow",
         "Noor", "Priya", "Mateo", "Lucia", "Kenji", "Amara", "Tobias", "Ines", "Rafael", "Sanna",
         "Oskar", "Leila", "Dmitri", "Ayla", "Callum", "Freya", "Idris", "Jun", "Keira", "Lorenzo",
         "Mina", "Nikhil", "Odette", "Pavel", "Rosa", "Soren", "Tamsin", "Uma", "Viktor", "Wren",
         "Xander", "Yara", "Zane", "Beatrix", "Cyrus", "Delphine", "Ezra", "Fatima", "Gideon", "Hana"]
LAST = ["Ashdown", "Brightwell", "Carrow", "Dunmore", "Ellery", "Fairbourne", "Galloway", "Hartwell",
        "Ingram", "Jessop", "Kilbride", "Lockhart", "Marchetti", "Northcott", "Okafor", "Pemberton",
        "Quayle", "Ravensworth", "Sallow", "Thistlewood", "Underhill", "Vance", "Whitlock", "Yarrow",
        "Ambrose", "Blackwood", "Castellan", "Delacroix", "Esterhaz", "Fennimore", "Greyhaven", "Holloway",
        "Ishikawa", "Jovanovic", "Karlsson", "Lindqvist", "Moreau", "Nakamura", "Ortega", "Petrakis",
        "Quintero", "Rasmussen", "Sorensen", "Tanaka", "Ulloa", "Varga", "Wakefield", "Zielinski",
        "Abernathy", "Bellweather", "Coldbrook", "Driscoll", "Eastwick", "Foxglove", "Gallant", "Hawthorne"]

# Objects each department works with: (object, sensitive?)
DEPT_OBJECTS: Dict[str, List[str]] = {
    "Sales": ["Account", "Contact", "Opportunity", "Lead", "Quote", "Product2", "Pricebook2", "Task", "Event"],
    "Support": ["Case", "Contact", "Account", "Asset", "Entitlement", "Solution", "Task", "Event"],
    "Marketing": ["Campaign", "CampaignMember", "Lead", "Contact", "Task", "Event"],
    "Finance": ["Account", "Contract", "Order", "Invoice__c", "Payment__c", "Task"],
    "HR": ["Employee__c", "Compensation__c", "Benefits_Enrollment__c", "Performance_Review__c", "Task"],
    "IT": ["Asset", "Incident__c", "Change_Request__c", "Task", "Event"],
}
# Fields per object (sensitive ones carry personal/financial names the
# classifier recognises).
OBJECT_FIELDS: Dict[str, List[str]] = {
    "Account": ["Industry", "AnnualRevenue", "Rating", "Tax_ID__c"],
    "Contact": ["Phone", "Email", "Birthdate", "Home_Address__c"],
    "Opportunity": ["Amount", "StageName", "Discount_Percent__c"],
    "Lead": ["Company", "Phone", "Lead_Score__c"],
    "Case": ["Priority", "Status", "Customer_Sentiment__c"],
    "Contract": ["ContractTerm", "Payment_Terms__c"],
    "Order": ["TotalAmount", "Status"],
    "Invoice__c": ["Amount__c", "Due_Date__c", "Bank_Account_Number__c"],
    "Payment__c": ["Amount__c", "Card_Last4__c", "Routing_Number__c"],
    "Employee__c": ["Department__c", "Date_of_Birth__c", "National_ID__c", "Home_Address__c"],
    "Compensation__c": ["Base_Salary__c", "Bonus__c", "Equity_Grant__c"],
    "Benefits_Enrollment__c": ["Plan__c", "Medical_Condition__c", "Dependents__c"],
    "Performance_Review__c": ["Rating__c", "Manager_Notes__c"],
    "Incident__c": ["Severity__c", "Root_Cause__c"],
    "Asset": ["SerialNumber", "Status"],
}
HR_RESTRICTED = {"Employee__c", "Compensation__c", "Benefits_Enrollment__c", "Performance_Review__c"}
ALL_OBJECTS = sorted({o for objs in DEPT_OBJECTS.values() for o in objs})

# Licence per profile department/seniority.
PLATFORM_DEPTS = {"HR", "IT", "Finance"}

PRIVILEGED = {"ModifyAllData", "ViewAllData", "ManageUsers", "AuthorApex", "CustomizeApplication",
              "ManageProfilesPermissionsets", "ViewSetup", "ApiEnabled", "ExportReport", "ManageSharing"}


class Ids:
    def __init__(self) -> None:
        self.counters: Counter = Counter()

    def next(self, prefix: str) -> str:
        self.counters[prefix] += 1
        return f"{prefix}{self.counters[prefix]:012d}DMO"[:18]


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000+0000")


def crud(level: str) -> Dict[str, bool]:
    return {
        "read": {"PermissionsRead": True},
        "edit": {"PermissionsRead": True, "PermissionsCreate": True, "PermissionsEdit": True},
        "full": {"PermissionsRead": True, "PermissionsCreate": True, "PermissionsEdit": True, "PermissionsDelete": True},
        "viewall": {"PermissionsRead": True, "PermissionsCreate": True, "PermissionsEdit": True,
                    "PermissionsDelete": True, "PermissionsViewAllRecords": True},
        "modifyall": {"PermissionsRead": True, "PermissionsCreate": True, "PermissionsEdit": True,
                      "PermissionsDelete": True, "PermissionsViewAllRecords": True, "PermissionsModifyAllRecords": True},
    }[level]


def build(seed: int, n_users: int, prevalence: float) -> Tuple[dict, dict]:
    rng = np.random.default_rng(seed)
    ids = Ids()
    org = generate_org(persona="mid_market", seed=seed, n_users=n_users, anomaly_prevalence=prevalence)
    hetero = augment(org, seed=seed)
    users = org.users
    catalog = {p.name: p for p in PROFILE_CATALOG}

    fx: Dict[str, list] = defaultdict(list)
    obj_rows = fx["object_permissions"]
    fld_rows = fx["field_permissions"]

    def grant(parent: str, obj: str, level: str, fields: str = "read") -> None:
        obj_rows.append({"Id": ids.next("110"), "ParentId": parent, "SobjectType": obj,
                         **{k: False for k in ("PermissionsRead", "PermissionsCreate", "PermissionsEdit",
                                               "PermissionsDelete", "PermissionsViewAllRecords",
                                               "PermissionsModifyAllRecords")}, **crud(level)})
        for f in OBJECT_FIELDS.get(obj, []):
            fld_rows.append({"Id": ids.next("01k"), "ParentId": parent, "SobjectType": obj, "Field": f"{obj}.{f}",
                             "PermissionsRead": True, "PermissionsEdit": fields == "edit"})

    def perm_set(name: str, label: str, sys: Tuple[str, ...] = (), ps_type: Optional[str] = None,
                 profile_id: Optional[str] = None) -> str:
        ps_id = ids.next("0PS")
        row = {"Id": ps_id, "Name": name, "Label": label, "IsOwnedByProfile": profile_id is not None,
               "ProfileId": profile_id, "Type": ps_type or ("Profile" if profile_id else "Regular")}
        for p in PRIVILEGED:
            row[f"Permissions{p}"] = p in sys
        fx["permission_sets"].append(row)
        return ps_id

    # ---- licences
    licences = {
        "Salesforce": {"Id": ids.next("100"), "Name": "Salesforce", "MasterLabel": "Salesforce",
                       "LicenseDefinitionKey": "SFDC", "Status": "Active"},
        "Salesforce Platform": {"Id": ids.next("100"), "Name": "Salesforce Platform",
                                "MasterLabel": "Salesforce Platform", "LicenseDefinitionKey": "AUL",
                                "Status": "Active"},
    }

    # ---- profiles (one profile-owned permission set each)
    used_profiles = sorted({u.profile_name for u in users})
    profile_ids: Dict[str, str] = {}
    profile_licence: Dict[str, str] = {}
    for name in used_profiles:
        spec = catalog[name]
        lic = "Salesforce Platform" if spec.department in PLATFORM_DEPTS and spec.seniority != "admin" else "Salesforce"
        pid = ids.next("00e")
        profile_ids[name] = pid
        profile_licence[name] = lic
        fx["profiles"].append({"Id": pid, "Name": name, "UserLicenseId": licences[lic]["Id"]})
        if name == "System Administrator":
            sys = ("ModifyAllData", "ViewAllData", "ManageUsers", "AuthorApex", "CustomizeApplication",
                   "ManageProfilesPermissionsets", "ViewSetup", "ApiEnabled", "ExportReport", "ManageSharing")
        elif spec.seniority == "senior":
            sys = ("ApiEnabled", "ExportReport")
        else:
            sys = ("ApiEnabled",)
        pps = perm_set(f"X{pid}", pid, sys, profile_id=pid)
        if name == "System Administrator":
            for obj in ALL_OBJECTS:
                if obj not in HR_RESTRICTED:
                    grant(pps, obj, "modifyall", "edit")
        elif name == "Read Only":
            for obj in DEPT_OBJECTS["Sales"]:
                grant(pps, obj, "read")
        else:
            level = {"junior": "edit", "mid": "edit", "senior": "full"}[spec.seniority]
            for obj in DEPT_OBJECTS[spec.department]:
                grant(pps, obj, level, "edit" if spec.seniority != "junior" else "read")

    # ---- department permission sets
    dept_ps: Dict[str, List[str]] = defaultdict(list)
    ps_by_name: Dict[str, str] = {}

    def dept_set(dept: str, name: str, label: str, grants: List[Tuple[str, str]], sys=(), assignable=True) -> str:
        ps_id = perm_set(name, label, sys)
        for obj, level in grants:
            grant(ps_id, obj, level, "edit" if level != "read" else "read")
        ps_by_name[name] = ps_id
        if assignable:
            dept_ps[dept].append(ps_id)
        return ps_id

    dept_set("Sales", "Opportunity_Approvals", "Opportunity Approvals", [("Opportunity", "full")])
    dept_set("Sales", "Quote_Manager", "Quote Manager", [("Quote", "full"), ("Product2", "edit")])
    dept_set("Sales", "Lead_Conversion", "Lead Conversion", [("Lead", "edit"), ("Contact", "edit")])
    dept_set("Sales", "Account_Team_Lead", "Account Team Lead", [("Account", "viewall")])
    dept_set("Support", "Case_Escalation", "Case Escalation", [("Case", "full")])
    dept_set("Support", "Knowledge_Author", "Knowledge Author", [("Solution", "full")])
    dept_set("Support", "Entitlement_Manager", "Entitlement Manager", [("Entitlement", "full"), ("Asset", "edit")])
    dept_set("Marketing", "Campaign_Manager", "Campaign Manager", [("Campaign", "full"), ("CampaignMember", "full")])
    dept_set("Marketing", "Lead_Import", "Lead Import", [("Lead", "full")], sys=("ExportReport",))
    dept_set("Finance", "Invoice_Approver", "Invoice Approver", [("Invoice__c", "full"), ("Order", "edit")])
    dept_set("Finance", "Finance_Reporting", "Finance Reporting", [("Contract", "read"), ("Payment__c", "read")],
             sys=("ExportReport",))
    dept_set("Finance", "Contract_Admin", "Contract Admin", [("Contract", "viewall")])
    dept_set("HR", "HR_Records_Viewer", "HR Records Viewer", [("Employee__c", "read"), ("Performance_Review__c", "read")])
    dept_set("HR", "Benefits_Admin", "Benefits Admin", [("Benefits_Enrollment__c", "full")])
    dept_set("IT", "Incident_Responder", "Incident Responder", [("Incident__c", "full"), ("Change_Request__c", "edit")])
    dept_set("IT", "Asset_Manager", "Asset Manager", [("Asset", "full")])
    # Powerful sets used by planted archetypes (not handed out normally).
    dept_set("IT", "Legacy_Integration_Admin", "Legacy Integration Admin", [],
             sys=("ModifyAllData", "AuthorApex", "ApiEnabled", "ViewSetup"), assignable=False)
    dept_set("HR", "Compensation_Admin", "Compensation Admin", [("Compensation__c", "viewall"), ("Employee__c", "viewall")],
             assignable=False)
    dept_set("Finance", "Finance_Director_Access", "Finance Director Access",
             [("Contract", "modifyall"), ("Invoice__c", "modifyall"), ("Payment__c", "viewall")],
             sys=("ExportReport",), assignable=False)
    dept_set("HR", "Payroll_Data_Steward", "Payroll Data Steward", [("Compensation__c", "full"), ("Payment__c", "full")],
             assignable=False)
    # Unused sets (configuration bloat for the Health Report).
    for i, label in enumerate(["Q3 Promo Pilot", "Old Territory Mgmt", "Temp Contractor Access", "Pilot Chatter Bot"]):
        perm_set(f"Unused_Set_{i + 1}", label, ("ApiEnabled",))

    # ---- permission set groups (two with muting sets)
    groups: Dict[str, Dict] = {}

    def group(dept: str, dev: str, label: str, members: List[str], mute: Optional[Tuple[str, str, List[str]]] = None):
        gid = ids.next("0PG")
        fx["permission_set_groups"].append({"Id": gid, "DeveloperName": dev, "MasterLabel": label})
        comps = [ps_by_name[m] for m in members]
        if mute:
            mute_name, mute_label, muted = mute
            mid = perm_set(mute_name, mute_label, ps_type="Muting")
            for obj in muted:
                obj_rows.append({"Id": ids.next("110"), "ParentId": mid, "SobjectType": obj,
                                 "PermissionsRead": False, "PermissionsCreate": False, "PermissionsEdit": False,
                                 "PermissionsDelete": True, "PermissionsViewAllRecords": False,
                                 "PermissionsModifyAllRecords": False})
            comps.append(mid)
        for c in comps:
            fx["permission_set_group_components"].append(
                {"Id": ids.next("0PC"), "PermissionSetGroupId": gid, "PermissionSetId": c})
        groups[dev] = {"id": gid, "dept": dept}

    group("Sales", "Sales_Manager_Bundle", "Sales Manager Bundle",
          ["Opportunity_Approvals", "Quote_Manager", "Account_Team_Lead"],
          mute=("Sales_Manager_Bundle_Muting", "Sales Manager Bundle Muting", ["Opportunity", "Account"]))
    group("Sales", "Sales_Rep_Bundle", "Sales Rep Bundle", ["Lead_Conversion", "Quote_Manager"])
    group("Support", "Support_Lead_Bundle", "Support Lead Bundle", ["Case_Escalation", "Knowledge_Author", "Entitlement_Manager"],
          mute=("Support_Lead_Bundle_Muting", "Support Lead Bundle Muting", ["Case"]))
    group("Marketing", "Marketing_Ops_Bundle", "Marketing Ops Bundle", ["Campaign_Manager", "Lead_Import"])
    group("Finance", "Finance_Ops_Bundle", "Finance Ops Bundle", ["Invoice_Approver", "Finance_Reporting"])
    group("IT", "IT_Ops_Bundle", "IT Ops Bundle", ["Incident_Responder", "Asset_Manager"])
    dept_groups: Dict[str, List[str]] = defaultdict(list)
    for dev, g in groups.items():
        dept_groups[g["dept"]].append(g["id"])

    # ---- roles
    role_ids = {name: ids.next("00E") for name in hetero.role_above}
    for name, parent in hetero.role_above.items():
        fx["roles"].append({"Id": role_ids[name], "Name": name.replace("-", " ").title(),
                            "ParentRoleId": role_ids.get(parent) if parent else None})

    # ---- users
    sf_ids = {u.user_id: ids.next("005") for u in users}
    taken = set()
    names: Dict[str, str] = {}
    for u in users:
        while True:
            name = f"{FIRST[int(rng.integers(len(FIRST)))]} {LAST[int(rng.integers(len(LAST)))]}"
            if name not in taken:
                taken.add(name)
                names[u.user_id] = name
                break
    titles = {"junior": "Associate", "mid": "Manager", "senior": "Director", "admin": "Administrator"}
    never_logged = set(
        u.user_id for u in rng.choice(
            [u for u in users if not u.is_anomaly and catalog[u.profile_name].seniority == "junior"],
            size=max(1, int(0.04 * len(users))), replace=False)
    )

    assignments = fx["permission_set_assignments"]

    def assign(uid: str, ps_id: str) -> None:
        assignments.append({"Id": ids.next("0Pa"), "AssigneeId": sf_ids[uid], "PermissionSetId": ps_id})

    owner_counts: Dict[str, Dict[str, int]] = defaultdict(dict)
    for u in users:
        spec = catalog[u.profile_name]
        name = names[u.user_id]
        email = f"{name.lower().replace(' ', '.')}@{EMAIL_DOMAIN}"
        created = NOW - timedelta(days=int(rng.integers(120, 2200)))
        last_login = None if u.user_id in never_logged else iso(NOW - timedelta(days=u.last_login_days_ago, hours=int(rng.integers(0, 12))))
        fx["users"].append({
            "Id": sf_ids[u.user_id], "Username": email, "Name": name, "Email": email,
            "ProfileId": profile_ids[u.profile_name], "UserRoleId": role_ids.get(hetero.user_role.get(u.user_id) or "CEO"),
            "ManagerId": sf_ids.get(hetero.manages.get(u.user_id) or ""), "IsActive": True, "UserType": "Standard",
            "Department": u.department, "Title": f"{spec.department} {titles[spec.seniority]}",
            "LastLoginDate": last_login, "CreatedDate": iso(created),
        })

        pool = dept_ps.get(spec.department, [])
        n_ps = min(len(pool), max(0, int(u.num_permission_sets) - (1 if u.num_permission_set_groups else 0)))
        for ps_id in rng.choice(pool, size=n_ps, replace=False) if n_ps else []:
            assign(u.user_id, str(ps_id))
        if u.num_permission_set_groups and dept_groups.get(spec.department):
            gids = dept_groups[spec.department]
            for gid in rng.choice(gids, size=min(len(gids), int(u.num_permission_set_groups)), replace=False):
                assign(u.user_id, str(gid))

        arch = u.anomaly_archetype
        if arch == AnomalyArchetype.OVER_PRIVILEGED:
            assign(u.user_id, ps_by_name["Finance_Director_Access"])
            assign(u.user_id, ps_by_name["Compensation_Admin"])
        elif arch == AnomalyArchetype.DORMANT_POWERFUL:
            assign(u.user_id, ps_by_name["Legacy_Integration_Admin"])
        elif arch == AnomalyArchetype.ROLE_MISMATCH:
            assign(u.user_id, ps_by_name["HR_Records_Viewer"])
            assign(u.user_id, ps_by_name["Compensation_Admin"])
        elif arch == AnomalyArchetype.PERMISSION_ACCUMULATOR:
            already = {a["PermissionSetId"] for a in assignments if a["AssigneeId"] == sf_ids[u.user_id]}
            extra = [p for d in DEPT_OBJECTS for p in dept_ps.get(d, []) if p not in already]
            for ps_id in rng.choice(extra, size=min(len(extra), 10), replace=False):
                assign(u.user_id, str(ps_id))
        elif arch == AnomalyArchetype.SOLE_ACCESS_RISK:
            assign(u.user_id, ps_by_name["Payroll_Data_Steward"])

        # Record ownership drives License Fit's usage signal. Never-logged-in
        # and HR/IT users own nothing; a share of Sales licences sit idle.
        if u.user_id not in never_logged:
            active_scale = 1.0 if u.last_login_days_ago < 30 else 0.2
            if spec.department == "Sales" and spec.name != "Read Only" and rng.random() > 0.15:
                owner_counts["Opportunity"][sf_ids[u.user_id]] = int(rng.poisson(40 * active_scale)) + 1
                owner_counts["Lead"][sf_ids[u.user_id]] = int(rng.poisson(25 * active_scale))
                owner_counts["Contact"][sf_ids[u.user_id]] = int(rng.poisson(60 * active_scale))
            elif spec.department == "Support":
                owner_counts["Case"][sf_ids[u.user_id]] = int(rng.poisson(90 * active_scale)) + 1
            elif spec.department == "Marketing":
                owner_counts["Lead"][sf_ids[u.user_id]] = int(rng.poisson(120 * active_scale))

    # ---- org-level data normally read live
    active = len(fx["users"])
    per_licence = Counter(profile_licence[u.profile_name] for u in users)
    lic_rows = []
    for name, row in licences.items():
        used = per_licence.get(name, 0)
        lic_rows.append({**row, "UsedLicenses": used, "TotalLicenses": used + int(max(5, used * 0.12))})
    demo_live = {
        "organization": {"Id": "00D000000000DMOAAA", "Name": ORG_NAME, "OrganizationType": "Enterprise Edition",
                         "IsSandbox": False, "InstanceName": "DEMO1", "TrialExpirationDate": None},
        "user_licenses": lic_rows,
        "permission_set_licenses": [
            {"Id": ids.next("0PL"), "DeveloperName": "SalesCloudEinstein", "MasterLabel": "Sales Cloud Einstein",
             "TotalLicenses": 80, "UsedLicenses": 71, "Status": "Active"},
            {"Id": ids.next("0PL"), "DeveloperName": "CRMAnalyticsPlus", "MasterLabel": "Tableau CRM Plus",
             "TotalLicenses": 15, "UsedLicenses": 9, "Status": "Active"},
        ],
        "org_limits": {
            "DataStorageMB": {"Max": 24576, "Remaining": 4420},
            "FileStorageMB": {"Max": 102400, "Remaining": 63100},
            "DailyApiRequests": {"Max": 1015000, "Remaining": 622000},
        },
        "owner_counts": {obj: counts for obj, counts in owner_counts.items()},
    }

    fixture = {"org_name": ORG_NAME, "org_domain": EMAIL_DOMAIN, **fx, "demo_live": demo_live}

    archetypes = Counter(u.anomaly_archetype.value for u in users if u.anomaly_archetype)
    days = [u.last_login_days_ago for u in users if u.user_id not in never_logged]
    summary = {
        "seed": seed,
        "users": active,
        "profiles": Counter(u.profile_name for u in users).most_common(),
        "licences": dict(per_licence),
        "permission_sets": sum(1 for p in fx["permission_sets"] if not p["IsOwnedByProfile"] and p["Type"] != "Muting"),
        "muting_sets": sum(1 for p in fx["permission_sets"] if p["Type"] == "Muting"),
        "groups": len(fx["permission_set_groups"]),
        "groups_with_muting": [g for g in ("Sales Manager Bundle", "Support Lead Bundle")],
        "archetypes": dict(archetypes),
        "anomaly_prevalence_pct": round(100 * sum(archetypes.values()) / active, 2),
        "never_logged_in": len(never_logged),
        "last_login_days": {
            "<=7": sum(d <= 7 for d in days), "8-30": sum(7 < d <= 30 for d in days),
            "31-90": sum(30 < d <= 90 for d in days), ">90": sum(d > 90 for d in days),
        },
        "sample_users": [(f["Name"], f["Email"], f["Title"]) for f in fx["users"][:5]],
        # Ground truth for demo prep only; never written into the fixture.
        "planted": [{"name": names[u.user_id], "id": sf_ids[u.user_id], "archetype": u.anomaly_archetype.value}
                    for u in users if u.anomaly_archetype],
        "object_permission_rows": len(obj_rows),
        "field_permission_rows": len(fld_rows),
        "assignments": len(assignments),
    }
    return fixture, summary


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=20261014)
    ap.add_argument("--users", type=int, default=400)
    ap.add_argument("--prevalence", type=float, default=0.025)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()
    fixture, summary = build(args.seed, args.users, args.prevalence)
    args.out.write_text(json.dumps(fixture, indent=1) + "\n")
    print(json.dumps(summary, indent=2))
    print(f"wrote {args.out} ({args.out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
