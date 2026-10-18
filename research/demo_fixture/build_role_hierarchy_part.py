"""Writes the Lumenvale fixture part that gives it a realistic role hierarchy
(roadmap: role hierarchy tool). Synthetic. Deterministic.

The generated base fixture has five identical department chains with every
role holding one child, 11 of 21 roles empty and all 229 sales associates in
one role. This part:
  - renames roles to real titles and adds API names (DeveloperName);
  - splits Sales into North America, EMEA and APAC (director, manager and
    associate roles per region; users assigned by a stable hash of their Id);
  - puts one user in each department head role, adds a single-user Sales
    Operations role, an empty Sales Enablement role, and a Support Team Lead
    level (depth 5 from the CEO);
  - adds a three-role partner portal branch (PortalType "Partner", no users).
No user is added or removed and no permission changes. Measured on 20 Oct:
Health Report 41, 18 findings, $183,180; License Fit, risk levels, Priority
Actions and the flagged anomalies (users, ranks, types) unchanged; only the
peer counts quoted in some anomaly reasons change.

    python research/demo_fixture/build_role_hierarchy_part.py
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "apps/backend/fixtures/synthetic_mid_market.json"
OUT = ROOT / "apps/backend/fixtures/synthetic_mid_market.parts/05-role-hierarchy.json"

RENAME = {
    "Ceo": "CEO", "Finance Admin": "VP Finance", "Marketing Admin": "VP Marketing", "Sales Admin": "VP Sales",
    "Support Admin": "VP Customer Support", "It Admin": "IT Administrators", "Finance Senior": "Finance Director",
    "It Senior": "IT Service Desk", "Marketing Senior": "Marketing Director",
    "Sales Senior": "Sales Director, North America", "Support Senior": "Support Director",
    "Finance Mid": "Finance Manager", "It Mid": "IT Analyst", "Marketing Mid": "Marketing Manager",
    "Sales Mid": "Sales Manager, North America", "Support Mid": "Support Manager",
    "Finance Junior": "Finance Associate", "It Junior": "IT Intern", "Marketing Junior": "Marketing Associate",
    "Sales Junior": "Sales Associate, North America", "Support Junior": "Support Associate",
}


def dev(name: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in name).replace("__", "_").strip("_")


def rid(n: int) -> str:
    return f"00E00000000{n:04d}DMO"


# Users the demo talks about (the 8 flagged anomalies and the 5 critical-risk
# users on Lumenvale) never fill a head or Sales Operations role, so their
# story stays the same; they can still move region within their title.
DEMO_USERS = {f"005000000000{n:03d}DMO" for n in (1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 83, 173, 384)}

REGIONS = ["NA"] * 5 + ["EMEA"] * 3 + ["APAC"] * 2  # 50 / 30 / 20


def region(uid: str) -> str:
    return REGIONS[int(hashlib.sha1(uid.encode()).hexdigest(), 16) % len(REGIONS)]


def main() -> None:
    base = json.loads(BASE.read_text())
    old = {r["Name"]: r["Id"] for r in base["roles"]}
    role_patch = [{"Id": r["Id"], "Name": RENAME[r["Name"]], "DeveloperName": dev(RENAME[r["Name"]])}
                  for r in base["roles"]]
    new = []

    def add(n, name, parent, **kw):
        new.append({"Id": rid(n), "Name": name, "DeveloperName": dev(name), "ParentRoleId": parent, **kw})
        return rid(n)

    vp_sales = old["Sales Admin"]
    emea_d, apac_d = add(101, "Sales Director, EMEA", vp_sales), add(102, "Sales Director, APAC", vp_sales)
    emea_m, apac_m = add(103, "Sales Manager, EMEA", emea_d), add(104, "Sales Manager, APAC", apac_d)
    emea_a, apac_a = add(105, "Sales Associate, EMEA", emea_m), add(106, "Sales Associate, APAC", apac_m)
    ops = add(107, "Sales Operations", vp_sales)
    add(108, "Sales Enablement", vp_sales)
    lead = add(109, "Support Team Lead", old["Support Mid"])
    next(r for r in role_patch if r["Id"] == old["Support Junior"])["ParentRoleId"] = lead
    # Partner portal branch: executive > manager > user.
    add(112, "Northwind Partners Partner Executive", None, PortalType="Partner")
    add(111, "Northwind Partners Partner Manager", rid(112), PortalType="Partner")
    add(110, "Northwind Partners Partner User", rid(111), PortalType="Partner")
    regional = {("Sales Senior", "EMEA"): emea_d, ("Sales Senior", "APAC"): apac_d,
                ("Sales Mid", "EMEA"): emea_m, ("Sales Mid", "APAC"): apac_m,
                ("Sales Junior", "EMEA"): emea_a, ("Sales Junior", "APAC"): apac_a}
    name_of = {v: k for k, v in old.items()}
    heads = {"Sales Senior": "Sales Admin", "Finance Senior": "Finance Admin",
             "Marketing Mid": "Marketing Admin", "Support Mid": "Support Admin"}
    filled, user_patch = set(), []
    for u in sorted(base["users"], key=lambda u: u["Id"]):
        role = name_of.get(u.get("UserRoleId"))
        target = None
        if u["Id"] not in DEMO_USERS and role in heads and heads[role] not in filled:
            filled.add(heads[role]); target = old[heads[role]]
        elif u["Id"] not in DEMO_USERS and role == "Sales Mid" and "ops" not in filled:
            filled.add("ops"); target = ops
        elif role in ("Sales Senior", "Sales Mid", "Sales Junior") and region(u["Id"]) != "NA":
            target = regional[(role, region(u["Id"]))]
        elif role == "Support Junior" and int(u["Id"][-6:-3], 36) % 4 == 0:
            target = lead
        if target:
            user_patch.append({"Id": u["Id"], "UserRoleId": target})
    part = {
        "_source": "Role hierarchy for the role hierarchy tool (roadmap). Generated by research/demo_fixture/build_role_hierarchy_part.py; synthetic.",
        "roles": new,
        "_patch": {"roles": role_patch, "users": user_patch},
    }
    OUT.write_text(json.dumps(part, indent=1) + "\n")
    print(f"{len(new)} roles added, {len(role_patch)} roles patched, {len(user_patch)} users moved")


if __name__ == "__main__":
    main()
