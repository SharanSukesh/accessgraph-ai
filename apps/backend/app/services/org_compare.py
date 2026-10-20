"""Org comparison (roadmap item 9 v1; the comparison engine item 6 will reuse).

Compares two snapshots (item 21): two orgs (production and a sandbox, any
two orgs), or one org on two dates. Matching is by API name and namespace,
never by Salesforce id, because ids differ between orgs:

  permission sets by API name, a profile's own set as "Profile: <name>",
  groups by developer name, users by username without a sandbox suffix
  (".uat"; when usernames are masked, by Salesforce id, which a sandbox
  keeps after a refresh), objects and fields by API name, packages by
  namespace.

A mapping per org pair handles what doesn't match by name: a namespace
(lvx on one side is lvxdev on the other) and renamed items (a field renamed
on one side), so they compare as one item. Approved differences (expected,
e.g. a sandbox-only tester set) are stored per pair; everything else is
drift. Both live in the left org's settings["comparisons"][<right org or
"self">].

Consequences, not just differences:
  access        users (matched on both sides) who gain or lose object or
                field access, by each side's effective access computed from
                its snapshot (profile, sets, groups, muting);
  dependencies  for fields removed, renamed or changed on the right, what
                references them on the left (item 13's index).

Nothing here calls Salesforce.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

CATEGORIES = [
    "Users", "Profiles", "Permission sets", "Permission set groups", "Group components", "Assignments",
    "Object permissions", "Field permissions", "Roles", "Objects", "Fields", "Record types", "Layouts",
    "Validation rules", "Flows", "Approval processes", "Apex classes", "Apex triggers", "Custom permissions",
    "Packages", "Org-wide defaults",
]
USER_CATEGORIES = {"Users", "Assignments"}
OBJECT_FLAGS = (("PermissionsRead", "Read"), ("PermissionsCreate", "Create"), ("PermissionsEdit", "Edit"),
                ("PermissionsDelete", "Delete"), ("PermissionsViewAllRecords", "View All"),
                ("PermissionsModifyAllRecords", "Modify All"))
MASKED_DOMAIN = "@masked.newton"
Facet = Dict[str, Dict[str, Dict[str, Any]]]  # category -> key -> {"label", "value"}


def sandbox_suffix(names: Iterable[str], other: Iterable[str]) -> Optional[str]:
    """The ".uat" a sandbox adds to every username: the trailing segment
    most names here share, accepted only when removing it makes most of them
    match a username on the other side."""
    names = [n for n in names if n]
    others = set(n for n in other if n)
    if not names or not others:
        return None
    last = Counter(n.rsplit(".", 1)[-1] for n in names if "." in n)
    if not last:
        return None
    suffix = "." + last.most_common(1)[0][0]
    stripped = [n[: -len(suffix)] for n in names if n.endswith(suffix)]
    return suffix if sum(1 for n in stripped if n in others) >= 0.5 * len(names) else None


def _ns(name: Optional[str], ns_map: Dict[str, str]) -> Optional[str]:
    """Rewrite the right side's namespace prefix to the left side's."""
    if not name:
        return name
    for right, left in ns_map.items():
        name = re.sub(rf"(?<![A-Za-z0-9_]){re.escape(right)}__", f"{left}__", name)
    return name


def facets(state: Dict[str, Dict[str, Dict[str, Any]]], suffix: Optional[str] = None,
           ns_map: Optional[Dict[str, str]] = None) -> Facet:
    """Every compared item of one side, keyed by API name."""
    ns_map = ns_map or {}
    st = {e: state.get(e) or {} for e in ("user", "profile", "permission_set", "permission_set_group", "group_component",
                                          "assignment", "object_permission", "field_permission", "role", "schema_object",
                                          "ui_access", "org_docs", "org_wide_default")}
    profiles: Dict[Any, Any] = {k: v.get("Name") for k, v in st["profile"].items()}
    roles: Dict[Any, Any] = {k: v.get("DeveloperName") or v.get("Name") for k, v in st["role"].items()}
    groups: Dict[Any, Any] = {k: v.get("DeveloperName") or v.get("MasterLabel") for k, v in st["permission_set_group"].items()}

    def ps_key(i: Any) -> str:
        if i in groups:
            return f"Group: {_ns(groups[i], ns_map)}"
        ps = st["permission_set"].get(i) or {}
        if ps.get("IsOwnedByProfile"):
            return f"Profile: {profiles.get(ps.get('ProfileId'), ps.get('ProfileId'))}"
        return _ns(ps.get("Name") or ps.get("Label") or str(i), ns_map) or str(i)

    def user_key(i: Any) -> str:
        u = st["user"].get(i) or {}
        name = u.get("Username") or ""
        if not name or name.endswith(MASKED_DOMAIN):
            return str(i)  # masked: a sandbox keeps the user's id after a refresh
        return name[: -len(suffix)] if suffix and name.endswith(suffix) else name

    out: Facet = {c: {} for c in CATEGORIES}

    def put(cat: str, key: Optional[str], value: Dict[str, Any], label: Optional[str] = None) -> None:
        if key:
            out[cat][key] = {"label": label or key, "value": value}

    for i, u in st["user"].items():
        manager = u.get("ManagerId")
        put("Users", user_key(i), {"Active": u.get("IsActive"), "Profile": profiles.get(u.get("ProfileId")),
                                   "Role": roles.get(u.get("UserRoleId")),
                                   "Manager": user_key(manager) if manager in st["user"] else manager}, u.get("Name"))
    for i, p in st["profile"].items():
        put("Profiles", p.get("Name"), {})
    for i, ps in st["permission_set"].items():
        if ps.get("Type") in ("Group",):
            continue
        put("Permission sets", ps_key(i), {"Label": ps.get("Label"), "Type": ps.get("Type"),
                                          "System permissions": sorted(p.replace("Permissions", "") for p in ps.get("systemPermissions") or [])})
    for i, g in st["permission_set_group"].items():
        put("Permission set groups", _ns(g.get("DeveloperName"), ns_map), {"Label": g.get("MasterLabel"), "Status": g.get("Status")})
    for c in st["group_component"].values():
        put("Group components", f"{ps_key(c.get('PermissionSetGroupId'))} ⊃ {ps_key(c.get('PermissionSetId'))}", {})
    for a in st["assignment"].values():
        u = st["user"].get(str(a.get("AssigneeId"))) or {}
        put("Assignments", f"{user_key(a.get('AssigneeId'))} → {ps_key(a.get('PermissionSetId'))}", {},
            f"{u.get('Name') or user_key(a.get('AssigneeId'))} → {ps_key(a.get('PermissionSetId'))}")
    def has_parent(p: Dict[str, Any]) -> bool:
        """Salesforce never has a permission without its set; skip any such row."""
        return p.get("ParentId") in st["permission_set"]

    for p in st["object_permission"].values():
        if not has_parent(p):
            continue
        put("Object permissions", f"{ps_key(p.get('ParentId'))} · {_ns(p.get('SobjectType'), ns_map)}",
            {label: bool(p.get(f)) for f, label in OBJECT_FLAGS})
    for p in st["field_permission"].values():
        if not has_parent(p):
            continue
        put("Field permissions", f"{ps_key(p.get('ParentId'))} · {_ns(p.get('Field'), ns_map)}",
            {"Read": bool(p.get("PermissionsRead")), "Edit": bool(p.get("PermissionsEdit"))})
    for i, r in st["role"].items():
        put("Roles", r.get("DeveloperName") or r.get("Name"), {"Name": r.get("Name"), "Parent": roles.get(r.get("ParentRoleId"))})
    for name, obj in st["schema_object"].items():
        obj_name = _ns(name, ns_map)
        put("Objects", obj_name, {"Label": obj.get("label"), "Custom": bool(obj.get("custom"))})
        for fname, f in (obj.get("fields") or {}).items():
            put("Fields", f"{obj_name}.{_ns(fname, ns_map)}", {
                "Type": f.get("uiType") or f.get("type"), "Length": f.get("length"), "Required": f.get("required"),
                "Formula": f.get("calculatedFormula"), "References": ", ".join(f.get("referenceTo") or []) or None})
    ui = {k: (v or {}).get("value") for k, v in st["ui_access"].items()}
    docs = {k: (v or {}).get("value") for k, v in st["org_docs"].items()}
    for f in ui.get("flows") or []:
        put("Flows", _ns(f.get("api_name"), ns_map), {"Active": f.get("active"), "Type": f.get("process_type"),
                                                     "Trigger": f.get("trigger_type")}, f.get("label"))
    for rt in ui.get("record_types") or []:
        put("Record types", f"{_ns(rt.get('object'), ns_map)}.{rt.get('developer_name')}", {"Active": rt.get("active")})
    layouts = {lay["id"]: lay for lay in ui.get("layouts") or []}
    for lid, placed in (ui.get("layout_fields") or {}).items():
        lay = layouts.get(lid) or {}
        for item in placed or []:
            put("Layouts", f"{lay.get('name')} · {_ns(lay.get('object'), ns_map)}.{_ns(item.get('field'), ns_map)}",
                {"Behavior": item.get("behavior"), "Section": item.get("section")})
    for r in docs.get("validation_rules") or []:
        put("Validation rules", f"{_ns(r.get('object'), ns_map)}.{r.get('name')}", {"Active": r.get("active"), "Formula": r.get("formula")})
    for p in docs.get("approval_processes") or []:
        put("Approval processes", p.get("api_name"), {"Object": p.get("object"), "State": p.get("state")}, p.get("name"))
    for c in docs.get("apex_classes") or []:
        put("Apex classes", _ns(c.get("name"), ns_map), {"API version": c.get("api_version"), "Status": c.get("status"),
                                                        "Sharing": c.get("sharing")})
    for t in docs.get("apex_triggers") or []:
        put("Apex triggers", _ns(t.get("name"), ns_map), {"Object": t.get("object"), "Status": t.get("status"),
                                                         "API version": t.get("api_version")})
    for p in docs.get("custom_permissions") or []:
        put("Custom permissions", _ns(p.get("name"), ns_map), {"Label": p.get("label")})
    for p in docs.get("installed_packages") or []:
        ns = ns_map.get(p.get("namespace") or "", p.get("namespace"))
        put("Packages", ns or p.get("name"), {"Name": p.get("name"), "Version": p.get("version")}, p.get("name"))
    for name, o in st["org_wide_default"].items():
        put("Org-wide defaults", name, {"Internal": o.get("InternalSharingModel") or o.get("internal_sharing_model"),
                                        "External": o.get("ExternalSharingModel") or o.get("external_sharing_model")})
    return out


def apply_renames(right: Facet, renames: Dict[str, Dict[str, str]]) -> Facet:
    """Renamed items take their left-side key. A field rename also renames the
    field in field permissions and layouts."""
    out = {c: dict(items) for c, items in right.items()}
    for cat, pairs in renames.items():
        for left_key, right_key in pairs.items():
            if right_key in out.get(cat, {}):
                out[cat][left_key] = out[cat].pop(right_key)
            if cat == "Fields":
                for dep in ("Field permissions", "Layouts"):
                    for k in [k for k in out[dep] if k.endswith(f" · {right_key}")]:
                        out[dep][k[: -len(right_key)] + left_key] = out[dep].pop(k)
    return out


def compare(left: Facet, right: Facet, approved: Optional[Dict[str, Any]] = None,
            skip: Iterable[str] = ()) -> List[Dict[str, Any]]:
    approved = approved or {}
    rows = []
    for cat in CATEGORIES:
        if cat in skip:
            continue
        a, b = left.get(cat, {}), right.get(cat, {})
        for key in sorted(set(a) | set(b), key=str.lower):
            x, y = a.get(key), b.get(key)
            if x is not None and y is not None and x["value"] == y["value"]:
                continue
            status = "only_left" if y is None else "only_right" if x is None else "different"
            fields: List[str] = []
            if x is not None and y is not None:
                fields = sorted(k for k in set(x["value"]) | set(y["value"]) if x["value"].get(k) != y["value"].get(k))
            either: Dict[str, Any] = x if x is not None else (y or {})
            diff_id = f"{cat}|{key}"
            rows.append({"id": diff_id, "category": cat, "key": key, "label": either["label"], "status": status,
                         "left": x["value"] if x else None, "right": y["value"] if y else None, "fields": fields,
                         "approved": diff_id in approved, "approval": approved.get(diff_id)})
    return rows


# ---------------------------------------------------------------- consequences

Access = Dict[str, Dict[str, Dict[str, Dict[str, bool]]]]  # user -> objects|fields -> item -> flags


def effective_access(state: Dict[str, Dict[str, Dict[str, Any]]]) -> Access:
    """user id -> {"objects": {Object: flags}, "fields": {Object.Field: flags}} from a snapshot:
    profile, assigned sets and groups (muting sets subtract), active users only."""
    ps = state.get("permission_set") or {}
    groups = set((state.get("permission_set_group") or {}).keys())
    comps: Dict[Any, List[Any]] = defaultdict(list)
    for c in (state.get("group_component") or {}).values():
        comps[c.get("PermissionSetGroupId")].append(c.get("PermissionSetId"))
    objs: Dict[Any, Dict[str, Dict[str, bool]]] = defaultdict(dict)
    for p in (state.get("object_permission") or {}).values():
        objs[p.get("ParentId")][str(p.get("SobjectType"))] = {label: bool(p.get(f)) for f, label in OBJECT_FLAGS}
    flds: Dict[Any, Dict[str, Dict[str, bool]]] = defaultdict(dict)
    for p in (state.get("field_permission") or {}).values():
        flds[p.get("ParentId")][str(p.get("Field"))] = {"Read": bool(p.get("PermissionsRead")), "Edit": bool(p.get("PermissionsEdit"))}
    profile_set = {p.get("ProfileId"): i for i, p in ps.items() if p.get("IsOwnedByProfile")}
    assigned: Dict[Any, List[Any]] = defaultdict(list)
    for a in (state.get("assignment") or {}).values():
        assigned[a.get("AssigneeId")].append(a.get("PermissionSetId"))

    def merge(into: Dict[str, Dict[str, bool]], grants: Dict[str, Dict[str, bool]], muted: bool = False) -> None:
        for key, flags in grants.items():
            cur = into.setdefault(key, {f: False for f in flags})
            for f, on in flags.items():
                if on:
                    cur[f] = False if muted else True

    out: Access = {}
    for uid, u in (state.get("user") or {}).items():
        if not u.get("IsActive"):
            continue
        o: Dict[str, Dict[str, bool]] = {}
        f: Dict[str, Dict[str, bool]] = {}
        sources = [profile_set.get(u.get("ProfileId"))] + assigned.get(uid, [])
        for sid in sources:
            if not sid:
                continue
            if sid in groups:
                members = comps.get(sid, [])
                normal = [m for m in members if (ps.get(m) or {}).get("Type") != "Muting"]
                mutes = [m for m in members if (ps.get(m) or {}).get("Type") == "Muting"]
                go: Dict[str, Dict[str, bool]] = {}
                gf: Dict[str, Dict[str, bool]] = {}
                for m in normal:
                    merge(go, objs.get(m, {}))
                    merge(gf, flds.get(m, {}))
                for m in mutes:
                    merge(go, objs.get(m, {}), muted=True)
                    merge(gf, flds.get(m, {}), muted=True)
                merge(o, go)
                merge(f, gf)
            else:
                merge(o, objs.get(sid, {}))
                merge(f, flds.get(sid, {}))
        out[uid] = {"objects": {k: v for k, v in o.items() if any(v.values())},
                    "fields": {k: v for k, v in f.items() if any(v.values())}}
    return out


def access_changes(left_state: Dict[str, Any], right_state: Dict[str, Any], left_suffix: Optional[str],
                   right_suffix: Optional[str], ns_map: Dict[str, str], field_renames: Dict[str, str]) -> List[Dict[str, Any]]:
    """One row per matched user and object or field whose access differs."""
    def keyed(state: Dict[str, Any], suffix: Optional[str]) -> Dict[str, Tuple[str, str]]:
        out = {}
        for i, u in (state.get("user") or {}).items():
            name = u.get("Username") or ""
            key = i if not name or name.endswith(MASKED_DOMAIN) else (name[: -len(suffix)] if suffix and name.endswith(suffix) else name)
            out[key] = (i, u.get("Name") or key)
        return out

    la: Access = effective_access(left_state)
    ra: Access = effective_access(right_state)
    lk, rk = keyed(left_state, left_suffix), keyed(right_state, right_suffix)
    back = {v: k for k, v in field_renames.items()}  # right field -> left field
    rows = []
    for key in sorted(set(lk) & set(rk)):
        (lid, name), (rid, _) = lk[key], rk[key]
        if lid not in la and rid not in ra:
            continue
        left, right = la.get(lid, {"objects": {}, "fields": {}}), ra.get(rid, {"objects": {}, "fields": {}})
        for kind in ("objects", "fields"):
            rmap = {back.get(_ns(k, ns_map) or k, _ns(k, ns_map) or k): v for k, v in right[kind].items()}
            for item in sorted(set(left[kind]) | set(rmap)):
                x, y = left[kind].get(item, {}), rmap.get(item, {})
                gained = sorted(f for f, on in y.items() if on and not x.get(f))
                lost = sorted(f for f, on in x.items() if on and not y.get(f))
                if gained or lost:
                    rows.append({"user": key, "name": name, "kind": "Object" if kind == "objects" else "Field", "item": item,
                                 "gains": gained, "loses": lost})
    return rows


def dependency_rows(index: Any, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """What references, on the left, the fields removed, renamed or changed on the right."""
    out = []
    for r in rows:
        if r["category"] != "Fields" or r["status"] == "only_right":
            continue
        obj, _, field = r["key"].partition(".")
        refs = index.impact(obj, field)["references"]
        if refs:
            out.append({"field": r["key"], "status": r["status"], "fields": r["fields"], "references": len(refs),
                        "where": [f"{x['kind']}: {x['name']}" for x in refs]})
    return out


def privacy_skip(left_org: Any, right_org: Any) -> Tuple[Set[str], bool, Optional[str]]:
    """The stricter level of the two orgs: user categories and access
    consequences go when either side doesn't keep user records."""
    from app.services import privacy_mode
    users_ok = all(privacy_mode.allows(o, privacy_mode.USER_RECORDS) for o in (left_org, right_org))
    if users_ok:
        return set(), True, None
    return set(USER_CATEGORIES), False, ("Users, assignments and who gains or loses access are left out: one of the "
                                         "orgs is at Metadata only, and the stricter level applies to the comparison.")
