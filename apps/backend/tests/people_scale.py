"""A synthetic 600-user org for the People view at scale (roadmap: People
tab at 500 to 600 users). Deterministic. Shape: a CEO, 6 VPs, 18 directors,
72 managers and their teams, plus planted cases the view flags:

  - 8 active people with no manager (besides the CEO);
  - 3 inactive managers who still have active reports;
  - 5 active people whose delegated approver is inactive;
  - 40 inactive people with nobody reporting to them;
  - 30 high-risk and 6 critical-risk people.

Used by tests/test_people_scale.py and, locally, to seed an org for the
browser check. Not a demo fixture: nothing here is shown in the product.
"""
from __future__ import annotations

import random
from typing import Any, Dict, List

DEPARTMENTS = ["Sales", "Service", "Finance", "Engineering", "Marketing", "Operations"]
PROFILES = [("00e0000000PSC001", "System Administrator"), ("00e0000000PSC002", "Sales User"),
            ("00e0000000PSC003", "Service User"), ("00e0000000PSC004", "Standard User"),
            ("00e0000000PSC005", "Finance Analyst")]
FIRST = ["Alex", "Blair", "Casey", "Drew", "Emery", "Finley", "Gray", "Harper", "Indy", "Jules", "Kai", "Logan",
         "Morgan", "Noel", "Oakley", "Parker", "Quinn", "Reese", "Sage", "Tatum", "Umi", "Vale", "Wren", "Yael", "Zion"]
LAST = ["Abara", "Brook", "Castell", "Dunmore", "Ellery", "Fairholm", "Garrow", "Hale", "Ingram", "Jessop", "Kerr",
        "Lowe", "Marsh", "Nyland", "Orme", "Pryce", "Quill", "Rowan", "Strand", "Thorne", "Underhill", "Voss", "Wilde"]


def _sfid(prefix: str, n: int) -> str:
    return f"{prefix}{n:012d}PSC"[:18]


def build(total: int = 600, seed: int = 600) -> Dict[str, List[Dict[str, Any]]]:
    rng = random.Random(seed)
    roles: List[Dict[str, Any]] = [{"salesforce_id": _sfid("00E", 1), "name": "CEO", "parent_role_id": None}]
    users: List[Dict[str, Any]] = []

    def add_user(title: str, dept: str, role_id: str, manager: Any, profile: int) -> Dict[str, Any]:
        i = len(users) + 1
        u = {"salesforce_id": _sfid("005", i), "name": f"{FIRST[i % len(FIRST)]} {LAST[(i * 7) % len(LAST)]} {i}",
             "title": title, "department": dept, "user_role_id": role_id, "manager_id": manager,
             "delegated_approver_id": None, "profile_id": PROFILES[profile][0], "is_active": True}
        users.append(u)
        return u

    ceo = add_user("Chief Executive Officer", "Executive", roles[0]["salesforce_id"], None, 0)
    managers: List[Dict[str, Any]] = []
    for d, dept in enumerate(DEPARTMENTS):
        vp_role = {"salesforce_id": _sfid("00E", 10 + d), "name": f"VP {dept}", "parent_role_id": roles[0]["salesforce_id"]}
        dir_role = {"salesforce_id": _sfid("00E", 20 + d), "name": f"Director {dept}", "parent_role_id": vp_role["salesforce_id"]}
        mgr_role = {"salesforce_id": _sfid("00E", 30 + d), "name": f"Manager {dept}", "parent_role_id": dir_role["salesforce_id"]}
        ic_role = {"salesforce_id": _sfid("00E", 40 + d), "name": f"{dept} Team", "parent_role_id": mgr_role["salesforce_id"]}
        roles += [vp_role, dir_role, mgr_role, ic_role]
        prof = {"Sales": 1, "Service": 2, "Finance": 4}.get(dept, 3)
        vp = add_user(f"VP {dept}", dept, vp_role["salesforce_id"], ceo["salesforce_id"], prof)
        for _ in range(3):
            director = add_user(f"Director, {dept}", dept, dir_role["salesforce_id"], vp["salesforce_id"], prof)
            for _ in range(4):
                managers.append(add_user(f"{dept} Manager", dept, mgr_role["salesforce_id"], director["salesforce_id"], prof))
    ic_roles = {r["name"].replace(" Team", ""): r["salesforce_id"] for r in roles if r["name"].endswith(" Team")}
    while len(users) < total:
        m = managers[len(users) % len(managers)]
        add_user(f"{m['department']} Specialist", m["department"], ic_roles[m["department"]], m["salesforce_id"],
                 {"Sales": 1, "Service": 2, "Finance": 4}.get(m["department"], 3))

    ics = [u for u in users if u["title"].endswith("Specialist")]
    rng.shuffle(ics)
    for u in ics[:8]:                         # no manager
        u["manager_id"] = None
    for m in managers[:3]:                    # inactive managers who keep active reports
        m["is_active"] = False
    for u in ics[8:48]:                       # inactive people with nobody reporting to them
        u["is_active"] = False
    inactive_ics = ics[8:48]
    for u, approver in zip(ics[48:53], inactive_ics):   # inactive delegated approvers
        u["delegated_approver_id"] = approver["salesforce_id"]
    for u in ics[53:83]:
        u["risk_level"] = "high"
    for u in ics[83:89]:
        u["risk_level"] = "critical"
    return {"users": users, "roles": roles, "profiles": [{"salesforce_id": i, "name": n} for i, n in PROFILES]}


async def seed(db: Any, org_id: str, total: int = 600) -> Dict[str, List[Dict[str, Any]]]:
    """Write the synthetic org's users, roles, profiles and risk scores."""
    from datetime import datetime, timezone
    from app.domain.models import ProfileSnapshot, RiskLevel, RiskScore, RoleSnapshot, UserSnapshot
    data = build(total)
    now = datetime.now(timezone.utc)
    for r in data["roles"]:
        db.add(RoleSnapshot(organization_id=org_id, **r))
    for p in data["profiles"]:
        db.add(ProfileSnapshot(organization_id=org_id, **p))
    for u in data["users"]:
        level = u.get("risk_level")
        db.add(UserSnapshot(organization_id=org_id, username=f"{u['salesforce_id']}@people.test",
                            **{k: v for k, v in u.items() if k != "risk_level"}))
        if level:
            db.add(RiskScore(organization_id=org_id, entity_type="user", entity_id=u["salesforce_id"],
                             risk_score=80.0 if level == "high" else 95.0, risk_level=RiskLevel(level),
                             reason_text="Synthetic.", calculated_at=now))
    await db.flush()
    return data
