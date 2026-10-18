"""Role design mode v1 (roadmap 35b): drafts of a role hierarchy redesign,
an Account and Opportunity impact preview, and a ZIP export for the client
to apply. Nothing is ever sent to Salesforce.

A draft keeps the hierarchy it started from (`base`: internal roles,
parents and user assignments) and a list of operations. Replaying
operations[:position] on the base gives the draft; the diff is against the
base, so no stored snapshot is needed. When the org has been synced since,
the base is compared with the current hierarchy and the draft is "stale"
until the consultant acknowledges what changed in Salesforce.

Portal and community roles are left out: the Role metadata type has no
portal fields and portal roles can't be updated through the API.

Operations (each a dict with "op"):
  move_role    role_id, parent_id (None = top level)
  move_user    user_id, role_id (None = no role)
  create_role  role_id ("new:<anything>"), name, developer_name, parent_id
  rename_role  role_id, name (an existing role's API name can't change:
               the export identifies roles by API name)
  delete_role  role_id (only with no roles below it and no users in it)
"""
from __future__ import annotations

import copy
import io
import re
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Set
from xml.sax.saxutils import escape

from app.services.role_hierarchy import ACCOUNT_OWNER_ACCESS_FIELDS, OWNED_OBJECTS, OWNED_RECORDS_KEY, is_portal

NEW_PREFIX = "new:"
MAX_OPERATIONS = 2000
METADATA_API_VERSION = "62.0"  # the API version the Salesforce client uses
_API_NAME = re.compile(r"^[A-Za-z](?:[A-Za-z0-9]|_(?!_))*(?<!_)$")

# What the org-wide default leaves the hierarchy to change, per object.
# Users above a role can view and edit what's owned by or shared with users
# below it, so with Private both change; with Public Read Only everyone can
# already see the records and only edit changes; with Public Read/Write
# nothing changes.
OWD_EFFECT = {
    "private": ("view_and_edit", "Private: users above a role can view and edit these records only through the hierarchy, so a move changes both."),
    "read": ("edit_only", "Public Read Only: everyone can already see these records, so a move changes who can edit them."),
    "read_write": ("none", "Public Read/Write: everyone can already view and edit these records, so the hierarchy changes nothing."),
    "unknown": ("view_and_edit", "Org-wide default not synced: shown as if Private, so both view and edit may change."),
}
UPPER_BOUND_NOTE = (
    "Counts are an upper bound: some of these users may still see the same records through other sharing "
    "(sharing rules, teams, manual shares, View All)."
)
RECALC_WARNING = (
    "Applying a hierarchy change makes Salesforce recalculate sharing automatically. Large changes can hit "
    "\"could not acquire lock\" errors: apply them leaf roles first, one at a time, off-peak, and in a sandbox first."
)


class DesignError(ValueError):
    def __init__(self, message: str, index: Optional[int] = None):
        super().__init__(message)
        self.index = index


def _owd_kind(model: Optional[str]) -> str:
    m = (model or "").replace(" ", "").lower()
    if m in ("private", "none"):
        return "private"
    if m in ("read", "readselect", "publicreadonly"):
        return "read"
    if m in ("edit", "readwrite", "readwritetransfer", "publicreadwrite", "publicfullaccess", "fullaccess", "all"):
        return "read_write"
    return "unknown"


# ---------------------------------------------------------------- base


def base_from_snapshot(roles: Iterable[Any], users: Iterable[Any], users_allowed: bool,
                       synced_at: Optional[datetime]) -> Dict[str, Any]:
    """The hierarchy a draft starts from: internal roles (portal roles left
    out), parents, and each user's role (none at Metadata only)."""
    internal = {r.salesforce_id: r for r in roles if not is_portal(r.raw_data or {})}
    out_roles = []
    for r in internal.values():
        raw = r.raw_data or {}
        out_roles.append({
            "id": r.salesforce_id,
            "name": r.name,
            "developer_name": raw.get("DeveloperName"),
            "parent_id": r.parent_role_id if r.parent_role_id in internal else None,
            "access": {f: raw.get(f) for f, _ in ACCOUNT_OWNER_ACCESS_FIELDS if raw.get(f)},
        })
    user_roles = {}
    if users_allowed:
        for u in users:
            if getattr(u, "user_role_id", None) in internal:
                user_roles[u.salesforce_id] = u.user_role_id
    return {
        "roles": sorted(out_roles, key=lambda r: r["name"].lower()),
        "users": user_roles,
        "synced_at": synced_at.isoformat() if synced_at else None,
    }


def empty_base() -> Dict[str, Any]:
    """Implementation Advisor: a hierarchy designed from scratch."""
    return {"roles": [], "users": {}, "synced_at": None}


# ---------------------------------------------------------------- replay


def _descendants(roles: Dict[str, Dict[str, Any]], rid: str) -> Set[str]:
    kids = defaultdict(list)
    for r in roles.values():
        kids[r["parent_id"]].append(r["id"])
    out, stack = set(), [rid]
    while stack:
        for c in kids.get(stack.pop(), []):
            if c not in out:
                out.add(c)
                stack.append(c)
    return out


def apply_operations(base: Dict[str, Any], operations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """The draft hierarchy: {roles: {id: role}, users: {user_id: role_id}}.
    Raises DesignError (with the operation's index) on an invalid step."""
    if len(operations) > MAX_OPERATIONS:
        raise DesignError(f"A draft can hold at most {MAX_OPERATIONS} changes.")
    roles = {r["id"]: {**copy.deepcopy(r), "new": False} for r in base.get("roles", [])}
    users = dict(base.get("users", {}))
    for i, op in enumerate(operations):
        kind = op.get("op")
        rid = op.get("role_id")

        def need_role(x: Optional[str], what: str = "Role") -> None:
            if x not in roles:
                raise DesignError(f"{what} not found in this draft.", i)

        if kind == "move_role":
            need_role(rid)
            parent = op.get("parent_id")
            if parent is not None:
                need_role(parent, "New parent role")
                if parent == rid or parent in _descendants(roles, rid):
                    raise DesignError("A role can't move under itself or one of the roles below it.", i)
            roles[rid]["parent_id"] = parent
        elif kind == "move_user":
            uid = op.get("user_id")
            if uid not in users:
                raise DesignError("User not found in this draft.", i)
            if op.get("role_id") is not None:
                need_role(op.get("role_id"))
            users[uid] = op.get("role_id")
        elif kind == "create_role":
            if not isinstance(rid, str) or not rid.startswith(NEW_PREFIX) or rid in roles:
                raise DesignError("A new role needs a new id.", i)
            name = (op.get("name") or "").strip()
            dev = (op.get("developer_name") or "").strip()
            if not name:
                raise DesignError("A role needs a name.", i)
            if not _API_NAME.match(dev):
                raise DesignError(
                    "API name: start with a letter; letters, numbers and single underscores only; "
                    "no underscore at the end.", i)
            if any((r.get("developer_name") or "").lower() == dev.lower() for r in roles.values()):
                raise DesignError(f"Another role already uses the API name {dev}.", i)
            parent = op.get("parent_id")
            if parent is not None:
                need_role(parent, "Parent role")
            roles[rid] = {"id": rid, "name": name, "developer_name": dev, "parent_id": parent, "access": {}, "new": True}
        elif kind == "rename_role":
            need_role(rid)
            name = (op.get("name") or "").strip()
            if not name:
                raise DesignError("A role needs a name.", i)
            roles[rid]["name"] = name
            dev = op.get("developer_name")
            if dev is not None and dev != roles[rid].get("developer_name"):
                if not roles[rid]["new"]:
                    raise DesignError("An existing role's API name can't change here: the export identifies roles by API name.", i)
                if not _API_NAME.match(dev):
                    raise DesignError("API name: start with a letter; letters, numbers and single underscores only.", i)
                if any((r.get("developer_name") or "").lower() == dev.lower() for k, r in roles.items() if k != rid):
                    raise DesignError(f"Another role already uses the API name {dev}.", i)
                roles[rid]["developer_name"] = dev
        elif kind == "delete_role":
            need_role(rid)
            if any(r["parent_id"] == rid for r in roles.values()):
                raise DesignError("Move the roles below it first.", i)
            if any(role == rid for role in users.values()):
                raise DesignError("Move its users to another role first.", i)
            del roles[rid]
        else:
            raise DesignError(f"Unknown change: {kind!r}.", i)
    return {"roles": roles, "users": users}


def ancestors(roles: Dict[str, Dict[str, Any]], rid: Optional[str]) -> List[str]:
    """Strict ancestors, nearest first."""
    out, seen = [], set()
    cur = roles.get(rid, {}).get("parent_id") if rid else None
    while cur and cur in roles and cur not in seen:
        out.append(cur)
        seen.add(cur)
        cur = roles[cur]["parent_id"]
    return out


def diff(base: Dict[str, Any], state: Dict[str, Any]) -> Dict[str, Any]:
    before = {r["id"]: r for r in base.get("roles", [])}
    after = state["roles"]
    created = [r for r in after.values() if r["new"]]
    deleted = [before[i] for i in before if i not in after]
    renamed = [{"id": i, "from": before[i]["name"], "to": after[i]["name"]}
               for i in before if i in after and before[i]["name"] != after[i]["name"]]
    reparented = [{"id": i, "from": before[i]["parent_id"], "to": after[i]["parent_id"]}
                  for i in before if i in after and before[i]["parent_id"] != after[i]["parent_id"]]
    moved_users = [{"user_id": u, "from": base["users"].get(u), "to": r}
                   for u, r in state["users"].items() if base["users"].get(u) != r]
    return {"created": created, "deleted": deleted, "renamed": renamed, "reparented": reparented,
            "moved_users": moved_users,
            "count": len(created) + len(deleted) + len(renamed) + len(reparented) + len(moved_users)}


def stale_changes(base: Dict[str, Any], current: Dict[str, Any]) -> List[str]:
    """What changed in Salesforce since the draft started, in words."""
    if base.get("synced_at") is None and not base.get("roles"):
        return []  # a blank (Implementation Advisor) draft
    out: List[str] = []
    b = {r["id"]: r for r in base.get("roles", [])}
    c = {r["id"]: r for r in current.get("roles", [])}
    for i in c.keys() - b.keys():
        out.append(f"Role added in Salesforce: {c[i]['name']}")
    for i in b.keys() - c.keys():
        out.append(f"Role removed in Salesforce: {b[i]['name']}")
    for i in b.keys() & c.keys():
        if b[i]["name"] != c[i]["name"]:
            out.append(f"Role renamed in Salesforce: {b[i]['name']} is now {c[i]['name']}")
        if b[i]["parent_id"] != c[i]["parent_id"]:
            out.append(f"Role moved in Salesforce: {c[i]['name']}")
    moved = sum(1 for u, r in current.get("users", {}).items() if base.get("users", {}).get(u) != r)
    moved += sum(1 for u in base.get("users", {}) if u not in current.get("users", {}))
    if moved:
        out.append(f"{moved} user{'s' if moved != 1 else ''} changed role in Salesforce")
    return out


# ---------------------------------------------------------------- impact


def impact(base: Dict[str, Any], state: Dict[str, Any], users: Iterable[Any],
           owds: Dict[str, Optional[str]], share_counts: Dict[str, Dict[str, int]],
           names: Dict[str, str], coverage_label: Optional[str], top: int = 15) -> Dict[str, Any]:
    """Who gains and who loses access through the hierarchy to Account and
    Opportunity records, counts only.

    For every user whose role, or whose role's ancestors, differ between
    the base and the draft, the users in the old and new ancestor roles are
    compared: those only above them after the change gain access to the
    records they own (and those shared with them, counted apart); those
    only above them before lose it. Viewers are active users; records owned
    by inactive users still count."""
    before_roles = {r["id"]: r for r in base.get("roles", [])}
    after_roles = state["roles"]
    by_id = {u.salesforce_id: u for u in users}
    active = {uid for uid, u in by_id.items() if getattr(u, "is_active", False)}

    def members(user_roles: Dict[str, Optional[str]]) -> Dict[str, Set[str]]:
        m: Dict[str, Set[str]] = defaultdict(set)
        for uid, rid in user_roles.items():
            if rid and uid in active:
                m[rid].add(uid)
        return m

    m_before, m_after = members(base.get("users", {})), members(state["users"])
    anc_b = {rid: ancestors(before_roles, rid) for rid in before_roles}
    anc_a = {rid: ancestors(after_roles, rid) for rid in after_roles}

    def viewers(rid: Optional[str], anc: Dict[str, List[str]], m: Dict[str, Set[str]]) -> Set[str]:
        out: Set[str] = set()
        for a in anc.get(rid, []) if rid else []:
            out |= m.get(a, set())
        return out

    affected = []
    for uid in set(base.get("users", {})) | set(state["users"]):
        rb, ra = base["users"].get(uid), state["users"].get(uid)
        vb, va = viewers(rb, anc_b, m_before), viewers(ra, anc_a, m_after)
        vb.discard(uid)
        va.discard(uid)
        if vb != va:
            affected.append((uid, va - vb, vb - va))

    objects = {}
    for obj in OWNED_OBJECTS:
        kind = _owd_kind(owds.get(obj))
        effect, explanation = OWD_EFFECT[kind]
        gain: Dict[str, int] = defaultdict(int)
        lose: Dict[str, int] = defaultdict(int)
        gain_unknown: Set[str] = set()
        lose_unknown: Set[str] = set()
        owners = records = shared = 0
        unknown = False
        for uid, gained, lost in affected:
            stored = ((getattr(by_id.get(uid), "raw_data", None) or {}).get(OWNED_RECORDS_KEY) or {})
            n = stored.get(obj) if uid in by_id else None
            s = share_counts.get(obj, {}).get(uid, 0)
            if n is None:
                # Not counted by the sync: these viewers may gain or lose
                # records, how many isn't known. Never shown as zero.
                unknown = True
                gain_unknown |= gained
                lose_unknown |= lost
                n = 0
            elif not (n or s):
                continue
            owners += 1
            records += n
            shared += s
            for v in gained:
                gain[v] += n + s
            for v in lost:
                lose[v] += n + s

        def listing(d: Dict[str, int], partial: Set[str]) -> List[Dict[str, Any]]:
            people = set(d) | partial
            ranked = sorted(people, key=lambda u: (-d.get(u, 0), names.get(u, u)))
            return [{"user_id": u, "name": names.get(u, u), "records": d.get(u, 0), "at_least": u in partial}
                    for u in ranked[:top]]

        changes = effect != "none"
        objects[obj] = {
            "org_wide_default": owds.get(obj),
            "effect": effect,
            "explanation": explanation,
            "owners_affected": owners if changes else 0,
            # None when an affected owner wasn't counted: the total isn't known.
            "records_owned": (None if unknown else records) if changes else 0,
            "records_owned_counted": records if changes else 0,
            "records_shared": shared if changes else 0,
            "users_gaining": len(set(gain) | gain_unknown) if changes else 0,
            "users_losing": len(set(lose) | lose_unknown) if changes else 0,
            "gaining": listing(gain, gain_unknown) if changes else [],
            "losing": listing(lose, lose_unknown) if changes else [],
            "some_counts_unknown": unknown,
        }
    return {
        "objects": objects,
        "users_affected": len(affected),
        "upper_bound_note": UPPER_BOUND_NOTE,
        "coverage_label": coverage_label,
        "recalculation_warning": RECALC_WARNING,
    }


RULES_NOT_READ_NOTE = (
    "Some sharing rules' targets weren't read (owner-based rules need the AccountOwnerSharingRule and "
    "OpportunityOwnerSharingRule objects, which Salesforce Support enables; criteria-based rules have no queryable "
    "target), so Newton can't tell whether these use the moved roles. Check them in Setup before applying."
)
RULE_SHARES_NOTE = (
    "Share rows created by sharing rules name the group they share to, not the rule. A role group's RelatedId is the "
    "role, so these counts are records reaching the changed roles through sharing rules, whichever rule made them."
)


def references(changed_roles: Set[str], rules: Iterable[Any], groups: Iterable[Any],
               members: Iterable[Any], rule_shares: Optional[Dict[str, Dict[str, int]]] = None) -> Dict[str, Any]:
    """Public groups that include a changed role, sharing rules that share to
    or from one (through its role group; Group.RelatedId is the UserRole),
    and how many rule-based share rows reach the changed roles."""
    groups = list(groups)
    role_groups = {g.salesforce_id: g for g in groups
                   if (g.group_type or "").startswith("Role") and g.related_id in changed_roles}
    by_id = {g.salesforce_id: g for g in groups}
    public = sorted({by_id[m.group_id].name for m in members
                     if m.user_or_group_id in role_groups and m.group_id in by_id
                     and by_id[m.group_id].group_type in ("Regular", "Queue")})
    named, unread = [], []
    for r in rules:
        if r.sobject_type not in OWNED_OBJECTS:
            continue
        criteria = getattr(r, "criteria", None)
        source = criteria.get("source_group_id") if isinstance(criteria, dict) else None
        hits = []
        target = getattr(r, "shared_to_id", None)
        if target in role_groups:
            hits.append("shares to a changed role")
        if source in role_groups:
            hits.append("shares records owned in a changed role")
        if hits:
            named.append(f"{r.rule_name} ({r.sobject_type}): " + " and ".join(hits))
        elif not target and "role" in (r.shared_to_type or "").lower():
            unread.append(f"{r.rule_name} ({r.sobject_type})")
    shares = {obj: sum(n for gid, n in (rule_shares or {}).get(obj, {}).items() if gid in role_groups)
              for obj in OWNED_OBJECTS}
    return {
        "public_groups": public,
        "named_rules": sorted(named),
        "role_sharing_rules": sorted(unread),
        "sharing_rules_note": RULES_NOT_READ_NOTE if unread else None,
        "rule_shares": shares,
        "rule_shares_note": RULE_SHARES_NOTE if any(shares.values()) else None,
    }


# ---------------------------------------------------------------- export


def _role_xml(r: Dict[str, Any], parent_dev: Optional[str]) -> str:
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<Role xmlns="http://soap.sforce.com/2006/04/metadata">']
    access = r.get("access") or {}
    for field, tag in (("CaseAccessForAccountOwner", "caseAccessLevel"),
                       ("ContactAccessForAccountOwner", "contactAccessLevel")):
        if access.get(field):
            lines.append(f"    <{tag}>{escape(access[field])}</{tag}>")
    lines.append(f"    <name>{escape(r['name'])}</name>")
    if access.get("OpportunityAccessForAccountOwner"):
        lines.append(f"    <opportunityAccessLevel>{escape(access['OpportunityAccessForAccountOwner'])}</opportunityAccessLevel>")
    if parent_dev:
        lines.append(f"    <parentRole>{escape(parent_dev)}</parentRole>")
    lines.append("</Role>")
    return "\n".join(lines) + "\n"


def _package_xml(members: List[str]) -> str:
    body = "".join(f"        <members>{escape(m)}</members>\n" for m in sorted(members))
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n'
            f"    <types>\n{body}        <name>Role</name>\n    </types>\n"
            f"    <version>{METADATA_API_VERSION}</version>\n</Package>\n")


def _csv(rows: List[List[str]]) -> str:
    import csv
    out = io.StringIO()
    csv.writer(out, lineterminator="\n").writerows(rows)
    return out.getvalue()


def build_export(name: str, org_name: Optional[str], base: Dict[str, Any], state: Dict[str, Any],
                 names: Dict[str, str], is_demo: bool, stale: List[str]) -> bytes:
    """The ZIP a client applies by hand. Newton never deploys anything."""
    d = diff(base, state)
    after, before = state["roles"], {r["id"]: r for r in base.get("roles", [])}

    def dev(roles: Dict[str, Dict[str, Any]], rid: Optional[str]) -> Optional[str]:
        return roles[rid].get("developer_name") if rid and rid in roles else None

    changed = {r["id"] for r in d["created"]} | {x["id"] for x in d["renamed"]} | {x["id"] for x in d["reparented"]}
    missing_api = [after[i]["name"] for i in changed if not after[i].get("developer_name")]
    files: Dict[str, str] = {}
    for rid in sorted(changed, key=lambda i: after[i]["name"].lower()):
        r = after[rid]
        if r.get("developer_name"):
            files[f"after/roles/{r['developer_name']}.role"] = _role_xml(r, dev(after, r["parent_id"]))
    files["after/package.xml"] = _package_xml([after[i]["developer_name"] for i in changed if after[i].get("developer_name")])

    rows = [["Id", "UserRoleId", "RoleApiName", "Name"]]
    for m in sorted(d["moved_users"], key=lambda m: names.get(m["user_id"], m["user_id"]).lower()):
        target = m["to"]
        rows.append([m["user_id"], "" if (not target or target.startswith(NEW_PREFIX)) else target,
                     dev(after, target) or "", names.get(m["user_id"], "")])
    files["after/user-role-assignments.csv"] = _csv(rows)

    for rid, r in sorted(before.items(), key=lambda kv: kv[1]["name"].lower()):
        if r.get("developer_name"):
            files[f"before/roles/{r['developer_name']}.role"] = _role_xml(r, dev(before, r["parent_id"]))
    files["before/package.xml"] = _package_xml([r["developer_name"] for r in before.values() if r.get("developer_name")])
    rows = [["Id", "UserRoleId", "RoleApiName", "Name"]]
    for uid, rid in sorted(base.get("users", {}).items(), key=lambda kv: names.get(kv[0], kv[0]).lower()):
        rows.append([uid, rid or "", dev(before, rid) or "", names.get(uid, "")])
    files["before/user-role-assignments.csv"] = _csv(rows)
    files["README.md"] = _readme(name, org_name, d, after, before, names, is_demo, stale, missing_api)

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for path, text in files.items():
            z.writestr(path, text)
        if is_demo:
            z.writestr("DEMO-DATA.txt", "This export is from a synthetic demo org, not a real Salesforce org.\n")
    return out.getvalue()


def _readme(name, org_name, d, after, before, names, is_demo, stale, missing_api) -> str:
    def role(rid, roles):
        return roles[rid]["name"] if rid and rid in roles else "(top level)" if rid is None else rid

    lines = [f"# Role hierarchy change: {name}", ""]
    if is_demo:
        lines += ["**Demo data.** This export is from a synthetic demo org, not a real Salesforce org.", ""]
    lines += [f"Org: {org_name or 'not connected (designed from scratch)'}. "
              f"Exported {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')} by Newton. "
              "Newton never deploys anything: these files are for you to apply.", ""]
    if stale:
        lines += ["## Changed in Salesforce since this draft started", "",
                  *[f"- {s}" for s in stale], "", "Check these before applying.", ""]
    lines += ["## What changes", ""]
    for r in d["created"]:
        lines.append(f"- New role **{r['name']}** (`{r['developer_name']}`) under {role(r['parent_id'], after)}")
    for x in d["reparented"]:
        lines.append(f"- **{after[x['id']]['name']}** moves from {role(x['from'], before)} to {role(x['to'], after)}")
    for x in d["renamed"]:
        lines.append(f"- **{x['from']}** is renamed **{x['to']}**")
    for r in d["deleted"]:
        lines.append(f"- **{r['name']}** is deleted (do this by hand, last; it has no users or roles below it in this draft)")
    if d["moved_users"]:
        lines.append(f"- {len(d['moved_users'])} user{'s' if len(d['moved_users']) != 1 else ''} change role "
                     "(after/user-role-assignments.csv)")
    if not d["count"]:
        lines.append("- Nothing: the draft matches its starting hierarchy.")
    lines += ["", "## Files", "",
              "- `after/roles/*.role` and `after/package.xml`: Role metadata for the new, moved and renamed roles.",
              "- `after/user-role-assignments.csv`: users whose role changes (User Id, UserRoleId), for Data Loader.",
              "- `before/`: the starting hierarchy in the same two forms, so the change can be put back by hand. "
              "This is a manual way back, not an automatic rollback.", "",
              "## Before you apply", "",
              "- Apply in a sandbox first.",
              "- Changing roles needs the Manage Roles permission; setting a user's role (User.UserRoleId) needs "
              "Manage Internal Users.",
              f"- {RECALC_WARNING}",
              "- Back up the current hierarchy (the `before/` folder is Newton's copy as of the draft's start).", "",
              "## Steps", "",
              "1. Deploy `after/` (Role metadata) with your usual tool. **Unconfirmed:** whether a parent role and a "
              "new child role can go in the same deployment, and whether `parentRole` takes the parent's API name, "
              "are still being tested in a developer org. If the deployment fails on a parent, deploy the parent "
              "roles first, then the rest.",
              "2. Users moving into a **new** role have an empty UserRoleId in the CSV: after step 1, look up the new "
              "role's Id (the RoleApiName column gives its API name) and fill it in.",
              "3. Update the users with Data Loader: object User, operation Update, mapping Id and UserRoleId. "
              "Users moving to no role have an empty UserRoleId and RoleApiName; Data Loader only clears a field "
              "with its \"Insert null values\" setting on.",
              "4. Delete any roles listed as deleted above, by hand in Setup.", ""]
    notes = []
    if any(not (r.get("access") or {}) for r in d["created"]):
        notes.append("New roles carry no access levels for the account owner (Opportunity, Case, Contact); "
                     "set them in Setup or add them to the .role files before deploying.")
    if missing_api:
        notes.append("Some changed roles have no API name in Newton's sync and are left out of the metadata: "
                     + ", ".join(missing_api) + ". Change them in Setup.")
    if notes:
        lines += ["## Notes", "", *[f"- {n}" for n in notes], ""]
    lines += ["Portal and community roles aren't included: the Role metadata type has no portal fields and portal "
              "roles can't be updated through the API.", ""]
    return "\n".join(lines)
