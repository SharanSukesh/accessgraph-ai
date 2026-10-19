"""Break manager loops in the Lumenvale fixture.

Salesforce doesn't allow them: the User object's Manager field "establishes
a hierarchical relationship, preventing you from selecting a user that
directly or indirectly reports to themselves" (Object Reference, v68). The
generated hierarchy had 4 such loops, so each is broken at the member with
the lowest Salesforce id, whose ManagerId is cleared: they become the top of
their tree. Deterministic. Used by build_synthetic_fixture.py, and run
directly to fix the committed fixture in place:

    python research/demo_fixture/manager_loops.py
"""
import json
from pathlib import Path
from typing import Dict, List

FIXTURE = Path(__file__).resolve().parents[2] / "apps/backend/fixtures/synthetic_mid_market.json"


def find_loops(users: List[dict]) -> List[List[str]]:
    """Each loop of ManagerId references, as the ids in it."""
    manager: Dict[str, str] = {u["Id"]: u["ManagerId"] for u in users if u.get("ManagerId")}
    loops, done = [], set()
    for start in sorted(manager):
        path: List[str] = []
        cur = start
        while cur in manager and cur not in done and cur not in path:
            path.append(cur)
            cur = manager[cur]
        if cur in path:
            loops.append(sorted(path[path.index(cur):]))
        done.update(path)
    return loops


def break_manager_loops(users: List[dict]) -> List[str]:
    """Clear the ManagerId of the lowest id in each loop; returns those ids."""
    by_id = {u["Id"]: u for u in users}
    cleared = []
    for loop in find_loops(users):
        by_id[loop[0]]["ManagerId"] = None
        cleared.append(loop[0])
    return cleared


if __name__ == "__main__":
    fixture = json.loads(FIXTURE.read_text())
    cleared = break_manager_loops(fixture["users"])
    FIXTURE.write_text(json.dumps(fixture, indent=1) + "\n")
    print(f"cleared ManagerId on {len(cleared)} users: {cleared}; loops left: {len(find_loops(fixture['users']))}")
