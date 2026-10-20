"""What-if simulator (roadmap item 15): stage permission changes against a
snapshot (item 21) and see who gains, loses and keeps access before
anything changes in Salesforce. Nothing here writes to Salesforce.

Operations (applied in order to a copy of the snapshot's state):

  assign            {user, set}       a user gets a permission set or group
  unassign          {user, set}       a user loses one
  remove_set        {set}             a permission set goes, with its
                                      assignments and group memberships
  create_group      {group, label}    a new permission set group
  add_to_group      {group, set}      a set joins a group
  remove_from_group {group, set}      a set leaves a group
  mute              {group, object, flags}  the group's muting set mutes
                                      object permissions (Read, Edit...)
  merge_into        {set, into}       a set's permissions move into
                                      another, its users get the other,
                                      and it goes (Restructure merges)
  set_role          {user, role}      a role change: record-level only,
                                      so its effect isn't predicted
  sharing_rule      {description}     a sharing change: record-level only

The result compares effective access before and after (profile, sets,
groups, muting; objects, fields and system permissions), per user and per
item: gained, lost and kept; the users affected with the changes that
touch them; remaining paths (access a removal meant to take away that the
user still has some other way); and what can't be predicted.
"""
from __future__ import annotations

import copy
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from app.services.org_compare import OBJECT_FLAGS, effective_access

UNPREDICTABLE = [
    "Apex and flows that run in system context ignore these permissions.",
    "Record-level access: role and sharing changes are listed, but which records each user gains or loses isn't "
    "predicted beyond the shares Newton has synced.",
    "Managed packages can grant access through their own sets and licences.",
]
OPS = ("assign", "unassign", "remove_set", "merge_into", "create_group", "add_to_group", "remove_from_group", "mute",
       "set_role", "sharing_rule")
FLAG_FIELD = {label: f for f, label in OBJECT_FLAGS}


def _drop_permissions(s: Dict[str, Dict[str, Dict[str, Any]]], sid: str) -> None:
    """A deleted or merged set's object and field rows go with it."""
    for e in ("object_permission", "field_permission"):
        for k in [k for k, p in (s.get(e) or {}).items() if p.get("ParentId") == sid]:
            s[e].pop(k)


def apply(state: Dict[str, Dict[str, Dict[str, Any]]], ops: List[Dict[str, Any]]) -> Dict[str, Dict[str, Dict[str, Any]]]:
    s = {e: copy.deepcopy(v) for e, v in state.items()
         if e in ("user", "permission_set", "permission_set_group", "group_component", "assignment",
                  "object_permission", "field_permission", "role", "profile")}
    for e in ("user", "permission_set", "permission_set_group", "group_component", "assignment", "object_permission"):
        s.setdefault(e, {})
    for op in ops:
        kind = op.get("op")
        if kind == "assign":
            s["assignment"][f"{op['user']}:{op['set']}"] = {"AssigneeId": op["user"], "PermissionSetId": op["set"]}
        elif kind == "unassign":
            s["assignment"].pop(f"{op['user']}:{op['set']}", None)
        elif kind == "remove_set":
            sid = op["set"]
            s["permission_set"].pop(sid, None)
            for k in [k for k, a in s["assignment"].items() if a.get("PermissionSetId") == sid]:
                s["assignment"].pop(k)
            for k in [k for k, c in s["group_component"].items() if c.get("PermissionSetId") == sid]:
                s["group_component"].pop(k)
            _drop_permissions(s, sid)
        elif kind == "merge_into":
            sid, into = op["set"], op["into"]
            for k, p in list(s["object_permission"].items()):
                if p.get("ParentId") == sid:
                    tgt = s["object_permission"].setdefault(f"{into}:{p.get('SobjectType')}",
                                                            {"ParentId": into, "SobjectType": p.get("SobjectType")})
                    for f, _ in OBJECT_FLAGS:
                        tgt[f] = bool(tgt.get(f)) or bool(p.get(f))
            fps = s.setdefault("field_permission", {})
            for k, p in list(fps.items()):
                if p.get("ParentId") == sid:
                    tgt = fps.setdefault(f"{into}:{p.get('Field')}", {"ParentId": into, "Field": p.get("Field")})
                    tgt["PermissionsRead"] = bool(tgt.get("PermissionsRead")) or bool(p.get("PermissionsRead"))
                    tgt["PermissionsEdit"] = bool(tgt.get("PermissionsEdit")) or bool(p.get("PermissionsEdit"))
            if into in s["permission_set"] and sid in s["permission_set"]:
                merged = set(s["permission_set"][into].get("systemPermissions") or []) | set(
                    s["permission_set"][sid].get("systemPermissions") or [])
                s["permission_set"][into] = {**s["permission_set"][into], "systemPermissions": sorted(merged)}
            for a in [a for a in s["assignment"].values() if a.get("PermissionSetId") == sid]:
                s["assignment"][f"{a['AssigneeId']}:{into}"] = {"AssigneeId": a["AssigneeId"], "PermissionSetId": into}
            s["permission_set"].pop(sid, None)
            for k in [k for k, a in s["assignment"].items() if a.get("PermissionSetId") == sid]:
                s["assignment"].pop(k)
            for k in [k for k, c in s["group_component"].items() if c.get("PermissionSetId") == sid]:
                s["group_component"].pop(k)
            _drop_permissions(s, sid)
        elif kind == "create_group":
            s["permission_set_group"][op["group"]] = {"DeveloperName": op.get("label") or op["group"],
                                                     "MasterLabel": op.get("label") or op["group"], "Status": "Draft"}
        elif kind == "add_to_group":
            s["group_component"][f"{op['group']}:{op['set']}"] = {"PermissionSetGroupId": op["group"], "PermissionSetId": op["set"]}
        elif kind == "remove_from_group":
            for k in [k for k, c in s["group_component"].items()
                      if c.get("PermissionSetGroupId") == op["group"] and c.get("PermissionSetId") == op["set"]]:
                s["group_component"].pop(k)
        elif kind == "mute":
            mute_id = next((c.get("PermissionSetId") for c in s["group_component"].values()
                            if c.get("PermissionSetGroupId") == op["group"]
                            and (s["permission_set"].get(str(c.get("PermissionSetId"))) or {}).get("Type") == "Muting"), None)
            if mute_id is None:
                mute_id = f"draft-mute-{op['group']}"
                s["permission_set"][mute_id] = {"Name": f"{op['group']}_Muting", "Label": "Muting (draft)", "Type": "Muting"}
                s["group_component"][f"{op['group']}:{mute_id}"] = {"PermissionSetGroupId": op["group"], "PermissionSetId": mute_id}
            row = s["object_permission"].setdefault(f"{mute_id}:{op['object']}", {"ParentId": mute_id, "SobjectType": op["object"]})
            for flag in op.get("flags") or []:
                if flag in FLAG_FIELD:
                    row[FLAG_FIELD[flag]] = True
        elif kind == "set_role":
            user = s["user"].get(op["user"])
            if user is not None:
                s["user"][op["user"]] = {**user, "UserRoleId": op.get("role")}
    return s


def _system(state: Dict[str, Any]) -> Dict[str, Set[str]]:
    """user -> system permissions (profile, sets, groups; muting sets subtract)."""
    ps = state.get("permission_set") or {}
    groups = set((state.get("permission_set_group") or {}).keys())
    comps: Dict[Any, List[Any]] = defaultdict(list)
    for c in (state.get("group_component") or {}).values():
        comps[c.get("PermissionSetGroupId")].append(c.get("PermissionSetId"))
    profile_set = {p.get("ProfileId"): i for i, p in ps.items() if p.get("IsOwnedByProfile")}
    assigned: Dict[Any, List[Any]] = defaultdict(list)
    for a in (state.get("assignment") or {}).values():
        assigned[a.get("AssigneeId")].append(a.get("PermissionSetId"))

    def perms(i: Any) -> Set[str]:
        return {p.replace("Permissions", "") for p in (ps.get(i) or {}).get("systemPermissions") or []}

    out: Dict[str, Set[str]] = {}
    for uid, u in (state.get("user") or {}).items():
        if not u.get("IsActive"):
            continue
        held: Set[str] = set()
        for sid in [profile_set.get(u.get("ProfileId"))] + assigned.get(uid, []):
            if not sid:
                continue
            if sid in groups:
                members = comps.get(sid, [])
                g: Set[str] = set()
                for m in members:
                    if (ps.get(m) or {}).get("Type") != "Muting":
                        g |= perms(m)
                for m in members:
                    if (ps.get(m) or {}).get("Type") == "Muting":
                        g -= perms(m)
                held |= g
            else:
                held |= perms(sid)
        out[uid] = held
    return out


def _sources(state: Dict[str, Any], uid: str) -> List[Tuple[str, str]]:
    """(source id, label) granting anything to the user: profile set, sets, groups."""
    ps = state.get("permission_set") or {}
    groups = state.get("permission_set_group") or {}
    user = (state.get("user") or {}).get(uid) or {}
    out = [(i, f"Profile: {((state.get('profile') or {}).get(user.get('ProfileId')) or {}).get('Name') or user.get('ProfileId')}")
           for i, p in ps.items() if p.get("IsOwnedByProfile") and p.get("ProfileId") == user.get("ProfileId")]
    for a in (state.get("assignment") or {}).values():
        if a.get("AssigneeId") == uid:
            sid = a.get("PermissionSetId")
            label = (groups.get(sid) or {}).get("MasterLabel") or (ps.get(sid) or {}).get("Label") or sid
            out.append((sid, f"Group: {label}" if sid in groups else f"Permission set: {label}"))
    return out


def _grants(state: Dict[str, Any], source: str) -> Dict[str, Set[str]]:
    """Object -> flags a set (or a group, after its muting) grants."""
    ps = state.get("permission_set") or {}
    groups = state.get("permission_set_group") or {}
    objs: Dict[str, Dict[str, Set[str]]] = defaultdict(lambda: defaultdict(set))
    for p in (state.get("object_permission") or {}).values():
        for f, label in OBJECT_FLAGS:
            if p.get(f):
                objs[p.get("ParentId")][p.get("SobjectType")].add(label)
    if source not in groups:
        return dict(objs.get(source, {}))
    members = [c.get("PermissionSetId") for c in (state.get("group_component") or {}).values()
               if c.get("PermissionSetGroupId") == source]
    out: Dict[str, Set[str]] = defaultdict(set)
    for m in members:
        if (ps.get(m) or {}).get("Type") != "Muting":
            for obj, flags in objs.get(m, {}).items():
                out[obj] |= flags
    for m in members:
        if (ps.get(m) or {}).get("Type") == "Muting":
            for obj, flags in objs.get(m, {}).items():
                out[obj] -= flags
    return dict(out)


def _own_system(state: Dict[str, Any], sid: str) -> Set[str]:
    """System permissions a set grants, or a group through its sets."""
    ps = state.get("permission_set") or {}
    members = [c.get("PermissionSetId") for c in (state.get("group_component") or {}).values()
               if c.get("PermissionSetGroupId") == sid] if sid in (state.get("permission_set_group") or {}) else [sid]
    return {p.replace("Permissions", "") for m in members for p in (ps.get(m) or {}).get("systemPermissions") or []}


def source_changes(before: Dict[str, Any], after: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Per profile, set and group: object access gained or lost. Needs no
    users, so it works at Metadata only too."""
    ps_b, ps_a = before.get("permission_set") or {}, after.get("permission_set") or {}
    groups = {**(before.get("permission_set_group") or {}), **(after.get("permission_set_group") or {})}
    profiles = {k: v.get("Name") for k, v in (before.get("profile") or {}).items()}

    def label(i: str) -> str:
        p = ps_b.get(i) or ps_a.get(i) or {}
        if p.get("IsOwnedByProfile"):
            return f"Profile: {profiles.get(p.get('ProfileId')) or p.get('ProfileId')}"
        if i in groups:
            return f"Group: {groups[i].get('MasterLabel') or groups[i].get('DeveloperName') or i}"
        return f"Permission set: {p.get('Label') or p.get('Name') or i}"

    out = []
    for sid in sorted(set(ps_b) | set(ps_a) | set(groups)):
        if (ps_b.get(sid) or ps_a.get(sid) or {}).get("Type") == "Muting":
            continue
        gb, ga = _grants(before, sid), _grants(after, sid)
        sb, sa = _own_system(before, sid), _own_system(after, sid)
        if sb != sa:
            gb, ga = {**gb, "System permissions": sb}, {**ga, "System permissions": sa}
        for obj in sorted(set(gb) | set(ga)):
            gained, lost = sorted(ga.get(obj, set()) - gb.get(obj, set())), sorted(gb.get(obj, set()) - ga.get(obj, set()))
            if gained or lost:
                out.append({"source": label(sid), "object": obj, "gains": gained, "loses": lost,
                            "removed": sid not in ps_a and sid not in (after.get("permission_set_group") or {})})
    return out


def simulate(state: Dict[str, Any], ops: List[Dict[str, Any]]) -> Dict[str, Any]:
    after = apply(state, ops)
    before_acc, after_acc = effective_access(state), effective_access(after)
    before_sys, after_sys = _system(state), _system(after)
    users = state.get("user") or {}
    profiles = {k: v.get("Name") for k, v in (state.get("profile") or {}).items()}
    roles = {k: v.get("Name") for k, v in (state.get("role") or {}).items()}

    # Which staged changes touch each user.
    holders: Dict[str, Set[str]] = defaultdict(set)  # set or group -> users holding it before or after
    for st in (state, after):
        groups_of: Dict[str, Set[str]] = defaultdict(set)
        for c in (st.get("group_component") or {}).values():
            groups_of[c.get("PermissionSetId")].add(c.get("PermissionSetGroupId"))
        for a in (st.get("assignment") or {}).values():
            holders[a.get("PermissionSetId")].add(a.get("AssigneeId"))
        for sid, gids in groups_of.items():
            for gid in gids:
                holders[sid] |= holders.get(gid, set())
    reasons: Dict[str, List[str]] = defaultdict(list)
    for i, op in enumerate(ops):
        label = describe(op, state, after)
        if op.get("user"):
            reasons[op["user"]].append(label)
        for key in ("set", "group"):
            if op.get(key):
                for uid in holders.get(op[key], set()):
                    if op.get("user") in (None, uid) and label not in reasons[uid]:
                        reasons[uid].append(label)

    rows: List[Dict[str, Any]] = []
    for uid in sorted(set(before_acc) | set(after_acc)):
        b, a = before_acc.get(uid, {"objects": {}, "fields": {}}), after_acc.get(uid, {"objects": {}, "fields": {}})
        for kind, label in (("objects", "Object"), ("fields", "Field")):
            for item in sorted(set(b[kind]) | set(a[kind])):
                x, y = b[kind].get(item, {}), a[kind].get(item, {})
                gained = sorted(f for f, on in y.items() if on and not x.get(f))
                lost = sorted(f for f, on in x.items() if on and not y.get(f))
                kept = sorted(f for f, on in x.items() if on and y.get(f))
                if gained or lost:
                    rows.append({"user": uid, "kind": label, "item": item, "gains": gained, "loses": lost, "keeps": kept})
        gs, ls = sorted(after_sys.get(uid, set()) - before_sys.get(uid, set())), sorted(before_sys.get(uid, set()) - after_sys.get(uid, set()))
        if gs or ls:
            rows.append({"user": uid, "kind": "System permission", "item": "System permissions", "gains": gs, "loses": ls,
                         "keeps": sorted(before_sys.get(uid, set()) & after_sys.get(uid, set()))})

    # Remaining paths: what a removal granted that the user still has some other way that
    # was already there (not a set or group this draft assigns or creates).
    added_by_draft: Dict[str, Set[str]] = defaultdict(set)
    created = {op["group"] for op in ops if op.get("op") == "create_group"}
    for op in ops:
        if op.get("op") == "assign":
            added_by_draft[op["user"]].add(op["set"])
    paths: List[Dict[str, Any]] = []
    for op in ops:
        removed: List[Tuple[str, List[str]]] = []
        if op.get("op") == "unassign":
            removed = [(op["set"], [op["user"]])]
        elif op.get("op") in ("remove_set", "remove_from_group"):
            removed = [(op["set"], sorted(holders.get(op["set"], set()) if op["op"] == "remove_set"
                                          else holders.get(op["group"], set())))]
        for source, uids in removed:
            granted = _grants(state, source)
            granted_sys = {p.replace("Permissions", "") for p in ((state.get("permission_set") or {}).get(source) or {})
                           .get("systemPermissions") or []}
            for uid in uids:
                others = [(sid, lbl) for sid, lbl in _sources(after, uid)
                          if sid not in added_by_draft.get(uid, set()) and sid not in created]
                still = (after_acc.get(uid) or {}).get("objects") or {}
                for obj, flags in granted.items():
                    remaining = sorted(f for f in flags if (still.get(obj) or {}).get(f))
                    via = [lbl for sid, lbl in others if set(remaining) & _grants(after, sid).get(obj, set())]
                    if remaining and via:
                        paths.append({"user": uid, "change": describe(op, state, after), "object": obj, "still": remaining,
                                      "via": via})
                kept_sys = sorted(granted_sys & after_sys.get(uid, set()))
                if kept_sys:
                    ps_after = after.get("permission_set") or {}
                    via = [lbl for sid, lbl in others if set(kept_sys) & {p.replace("Permissions", "") for p in
                                                                         (ps_after.get(sid) or {}).get("systemPermissions") or []}]
                    paths.append({"user": uid, "change": describe(op, state, after), "object": "System permissions",
                                  "still": kept_sys, "via": via or ["another source"]})

    changed_users = {r["user"] for r in rows}
    direct = {op["user"] for op in ops if op.get("user")}
    affected = sorted((changed_users | direct | {p["user"] for p in paths}) & set(users))
    unpredictable = list(UNPREDICTABLE)
    if any(op.get("op") == "set_role" for op in ops):
        unpredictable.insert(0, f"{sum(op.get('op') == 'set_role' for op in ops)} role changes: records shared through the "
                                "role hierarchy move with them; object and field access doesn't.")
    if any(op.get("op") == "sharing_rule" for op in ops):
        unpredictable.insert(0, "Sharing rule changes affect records, not object or field access.")

    def user_row(uid: str) -> Dict[str, Any]:
        u = users.get(uid) or {}
        mine = [r for r in rows if r["user"] == uid]
        return {"user": uid, "name": u.get("Name") or uid, "profile": profiles.get(u.get("ProfileId")),
                "role": roles.get(u.get("UserRoleId")), "gains": sum(len(r["gains"]) for r in mine),
                "losses": sum(len(r["loses"]) for r in mine), "reasons": reasons.get(uid, [])}

    by_item: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for r in rows:
        cur = by_item.setdefault((r["kind"], r["item"]), {"kind": r["kind"], "item": r["item"], "usersGaining": 0, "usersLosing": 0})
        cur["usersGaining"] += int(bool(r["gains"]))
        cur["usersLosing"] += int(bool(r["loses"]))
    return {
        "summary": {"usersAffected": len(affected), "usersGaining": len({r["user"] for r in rows if r["gains"]}),
                    "usersLosing": len({r["user"] for r in rows if r["loses"]}),
                    "kept": sum(len(r["keeps"]) for r in rows), "remainingPaths": len(paths), "operations": len(ops)},
        "users": [user_row(u) for u in affected],
        "changes": [{**r, "name": (users.get(r["user"]) or {}).get("Name") or r["user"]} for r in rows],
        "items": sorted(by_item.values(), key=lambda x: (-(x["usersGaining"] + x["usersLosing"]), x["item"])),
        "paths": [{**p, "name": (users.get(p["user"]) or {}).get("Name") or p["user"]} for p in paths],
        "unpredictable": unpredictable,
        "sources": source_changes(state, after),
    }


def describe(op: Dict[str, Any], before: Dict[str, Any], after: Optional[Dict[str, Any]] = None) -> str:
    """One staged change in words, with names from the state."""
    names: Dict[str, str] = {}
    for st in (before, after or {}):
        for i, p in (st.get("permission_set") or {}).items():
            names.setdefault(i, p.get("Label") or p.get("Name") or i)
        for i, g in (st.get("permission_set_group") or {}).items():
            names.setdefault(i, g.get("MasterLabel") or g.get("DeveloperName") or i)
        for i, u in (st.get("user") or {}).items():
            names.setdefault(i, u.get("Name") or i)
        for i, r in (st.get("role") or {}).items():
            names.setdefault(i, r.get("Name") or i)
    n = lambda k: names.get(op.get(k) or "", op.get(k) or "")  # noqa: E731
    kind = op.get("op")
    if kind == "assign":
        return f"Assign {n('set')} to {n('user')}"
    if kind == "unassign":
        return f"Remove {n('set')} from {n('user')}"
    if kind == "remove_set":
        return f"Delete permission set {n('set')}"
    if kind == "merge_into":
        return f"Merge {n('set')} into {n('into')}"
    if kind == "create_group":
        return f"Create group {op.get('label') or op.get('group')}"
    if kind == "add_to_group":
        return f"Add {n('set')} to {n('group')}"
    if kind == "remove_from_group":
        return f"Take {n('set')} out of {n('group')}"
    if kind == "mute":
        return f"Mute {', '.join(op.get('flags') or [])} on {op.get('object')} in {n('group')}"
    if kind == "set_role":
        return f"Move {n('user')} to role {n('role')}"
    if kind == "sharing_rule":
        return f"Sharing: {op.get('description') or 'a sharing rule change'}"
    return str(kind)


def preset(name: str, state: Dict[str, Any]) -> Tuple[str, List[Dict[str, Any]]]:
    """Lumenvale's demo scenarios, built from the state so ids stay right."""
    ps = state.get("permission_set") or {}
    groups = state.get("permission_set_group") or {}
    if name == "remove_legacy_integration_admin":
        sid = next((i for i, p in ps.items() if p.get("Label") == "Legacy Integration Admin"), None)
        if sid is None:
            raise KeyError("This org has no Legacy Integration Admin permission set.")
        return "Remove Legacy Integration Admin", [{"op": "remove_set", "set": sid}]
    if name == "split_sales_manager_bundle":
        gid = next((i for i, g in groups.items() if g.get("MasterLabel") == "Sales Manager Bundle"), None)
        if gid is None:
            raise KeyError("This org has no Sales Manager Bundle group.")
        label = {i: (p.get("Label") or "") for i, p in ps.items()}
        members = [c.get("PermissionSetId") for c in (state.get("group_component") or {}).values()
                   if c.get("PermissionSetGroupId") == gid]
        pipeline = [m for m in members if label.get(m) in ("Opportunity Approvals", "Quote Manager")]
        accounts = [m for m in members if label.get(m) == "Account Team Lead"]
        managers = {i for i, p in (state.get("profile") or {}).items() if p.get("Name") == "Sales Manager"}
        bundle_users = sorted(a.get("AssigneeId") for a in (state.get("assignment") or {}).values()
                              if a.get("PermissionSetId") == gid)
        ops: List[Dict[str, Any]] = [{"op": "create_group", "group": "draft-group-pipeline", "label": "Sales Manager Pipeline"},
                                     {"op": "create_group", "group": "draft-group-accounts", "label": "Sales Manager Accounts"}]
        ops += [{"op": "add_to_group", "group": "draft-group-pipeline", "set": m} for m in pipeline]
        ops += [{"op": "add_to_group", "group": "draft-group-accounts", "set": m} for m in accounts]
        for uid in bundle_users:
            ops.append({"op": "unassign", "user": uid, "set": gid})
            ops.append({"op": "assign", "user": uid, "set": "draft-group-pipeline"})
            if ((state.get("user") or {}).get(uid) or {}).get("ProfileId") in managers:
                ops.append({"op": "assign", "user": uid, "set": "draft-group-accounts"})
        return "Split Sales Manager Bundle", ops
    raise KeyError(f"Unknown preset {name}")
