"""Page layouts, Lightning record pages, and the Apex classes and flows a
user can run (roadmap item 1, phase 1). Read-only.

What is read (by client.get_ui_access(); demo orgs read the fixture's
demo_live.ui_access) and stored with the sync job (sync_metadata["ui_access"]):
  record_types        RecordType: object, API name, label, active
  layouts             Tooling Layout: object, name
  profile_layouts     Tooling ProfileLayout: profile + object + record type -> layout
  flexipages          Tooling FlexiPage (record pages): object, API name, label
  org_default_pages   sObject describe actionOverrides (View): page per form factor
  apps                Tooling CustomApplication.Metadata: app defaults and
                      app + record type + profile assignments
  apex_classes        ApexClass: name, namespace
  flows               FlowDefinitionView + Flow.Metadata
                      (isAdditionalPermissionRequiredToRun)
  flow_details        from the same Flow.Metadata: element counts and the
                      objects and fields each flow reads or writes
                      (metadata_detail.flow_detail; item 11 part c)
  layout_fields       Tooling Layout.Metadata, one layout per query: the
                      fields on each layout and their behavior (item 11c)
  set_record_types    PermissionSet.Metadata recordTypeVisibilities, one set
                      per query (UNVERIFIED read path; item 11c)
  setup_entity_access SetupEntityAccess: permission set (incl. a profile's own
                      set) -> ApexClass / FlowDefinition / ApexPage /
                      CustomPermission / TabSet / ExternalDataSource ids
  run_flows           PermissionSet.PermissionsRunFlow per set

Per user, everything is resolved through the same grant paths as object
access: their profile, their permission sets, and the sets inside their
permission set groups. Component visibility rules on Lightning pages are not
evaluated, and the page shown is the one assigned, not what each component
displays. Nothing here calls Salesforce.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Tuple

from app.services import metadata_detail as md_detail

FORM_FACTORS = (("Large", "Desktop"), ("Small", "Phone"))
SYSTEM_DEFAULT = "Salesforce's default record page"
VISIBILITY_NOTE = (
    "Component visibility rules (filters that show or hide a component on a page) aren't evaluated: "
    "this shows which page is assigned, not what each component displays."
)
PRECEDENCE_NOTE = (
    "Order used, most specific first: app + record type + profile, then app + record type, then app + profile, then "
    "the app default, then the org default. Salesforce documents that a profile assignment beats the app's default; "
    "the full order is UNVERIFIED until tested in a developer org."
)
PROFILE_NAME_NOTE = (
    "App assignments name profiles by their API name (for example Admin for System Administrator, as in Salesforce's "
    "CustomApplication example), so Newton matches on the API name read from each profile, not the label."
)
PROFILE_NAME_UNREAD_NOTE = (
    "This profile's API name wasn't read, so assignments are matched on its label; for standard profiles, whose API "
    "names differ from their labels, an assignment may not match."
)
APEX_NOTE = (
    "Class access controls who can run a class's entry points (top-level classes). A class the user can't run "
    "directly may still run when called from one they can."
)
LAYOUT_NOTE = "Page layouts are assigned to profiles only (by record type), so permission sets never change the layout."
# Flows that start on their own rather than being run by a user. Salesforce
# documents that record-triggered flows don't depend on the user's flow
# permissions; for scheduled and platform-event flows that isn't stated.
RECORD_TRIGGERED = {"RecordBeforeSave", "RecordAfterSave", "RecordBeforeDelete"}
SELF_STARTING = RECORD_TRIGGERED | {"Scheduled", "PlatformEvent"}


Source = Tuple[Tuple[str, ...], str]  # (readable path, the graph node it starts from)


def user_sources(user: Any, profile_names: Dict[str, str], ps_rows: Dict[str, Any],
                 assignments: Iterable[Any], components: Iterable[Any],
                 group_names: Dict[str, str]) -> Dict[str, List[Source]]:
    """Permission set id -> the paths through which the user holds it: the
    profile's own set, directly assigned sets, and the sets inside assigned
    permission set groups (assigned by group id, or through the group's
    aggregate set as Salesforce does). Each path carries the id of the node
    it starts from in the access graph (profile, set or group)."""
    out: Dict[str, List[Source]] = defaultdict(list)
    profile_label = f"Profile: {profile_names.get(user.profile_id, user.profile_id)}"
    for ps in ps_rows.values():
        if ps.is_owned_by_profile and ps.profile_id == user.profile_id:
            out[ps.salesforce_id].append(((profile_label,), user.profile_id))
    by_group: Dict[str, List[str]] = defaultdict(list)
    for c in components:
        by_group[c.permission_set_group_id].append(c.permission_set_id)
    for a in assignments:
        ps = ps_rows.get(a.permission_set_id)
        group_id = None
        if a.permission_set_id in by_group or a.permission_set_id in group_names:
            group_id = a.permission_set_id
        elif ps is not None and (ps.ps_type or "") == "Group":
            group_id = (a.raw_data or {}).get("PermissionSetGroupId") or (ps.raw_data or {}).get("PermissionSetGroupId")
        if group_id:
            gname = group_names.get(group_id, group_id)
            for comp in by_group.get(group_id, []):
                c = ps_rows.get(comp)
                if c is not None and (c.ps_type or "") == "Muting":
                    continue
                label = (c.label or c.name) if c is not None else comp
                out[comp].append(((f"Permission set group: {gname}", f"Permission set: {label}"), a.permission_set_id))
        elif ps is not None:
            out[ps.salesforce_id].append(((f"Permission set: {ps.label or ps.name}",), ps.salesforce_id))
    return out


def _granted(ui: Dict[str, Any], sources: Dict[str, List[Source]], kind: str,
             with_nodes: bool = False) -> Dict[str, List[Any]]:
    out: Dict[str, List[Any]] = defaultdict(list)
    for parent, paths in sources.items():
        for entity in (ui.get("setup_entity_access", {}).get(parent, {}) or {}).get(kind, []):
            for path, node in paths:
                out[entity].append((list(path), node) if with_nodes else list(path))
    return out


def _visible(ui: Dict[str, Any], profile_id: str) -> Optional[Dict[str, Dict[str, Any]]]:
    """Record types available to the profile, per object, when read."""
    vis = ui.get("record_type_visibility")
    return None if vis is None else vis.get(profile_id, {})


def resolve_layouts(ui: Dict[str, Any], profile_id: str, profile_name: str) -> List[Dict[str, Any]]:
    layouts = {lay["id"]: lay for lay in ui.get("layouts", [])}
    rts = {r["id"]: r for r in ui.get("record_types", [])}
    vis = _visible(ui, profile_id)
    rows = []
    for pl in ui.get("profile_layouts", []):
        if pl["profile_id"] != profile_id:
            continue
        rt = rts.get(pl.get("record_type_id")) if pl.get("record_type_id") else None
        key = f"{rt['object']}.{rt['developer_name']}" if rt else None
        obj_vis = (vis or {}).get(pl["object"]) if vis is not None else None
        rows.append({
            "available": None if (vis is None or rt is None) else key in (obj_vis or {}).get("available", []),
            "default": None if (vis is None or rt is None) else key == (obj_vis or {}).get("default"),
            "object": pl["object"],
            "record_type": rt["name"] if rt else "Master (no record type)",
            "record_type_active": rt.get("active", True) if rt else True,
            "layout": (layouts.get(pl["layout_id"]) or {}).get("name", pl["layout_id"]),
            "why": f"Assigned to the {profile_name} profile for this record type.",
        })
    return sorted(rows, key=lambda r: (r["object"], r["record_type"]))


def _same(a: Optional[str], b: Optional[str]) -> bool:
    return bool(a) and bool(b) and a.lower() == b.lower()


# Most specific first (UNVERIFIED as Salesforce's exact order; see PRECEDENCE_NOTE).
RULES = (
    ("App, record type and profile assignment",
     lambda o, rt, prof: bool(o.get("profile")) and bool(o.get("record_type")) and o["record_type"] == rt
     and any(_same(o["profile"], p) for p in prof)),
    ("App and record type assignment",
     lambda o, rt, prof: not o.get("profile") and bool(o.get("record_type")) and o["record_type"] == rt),
    ("App and profile assignment",
     lambda o, rt, prof: bool(o.get("profile")) and not o.get("record_type") and any(_same(o["profile"], p) for p in prof)),
    ("App default", lambda o, rt, prof: not o.get("profile") and not o.get("record_type")),
)


def profile_match_keys(ui: Dict[str, Any], profile_id: Optional[str], profile_name: str) -> Tuple[List[str], bool]:
    """Names an app assignment may use for this profile: its API name when
    read; otherwise the label (flagged, since standard profiles differ)."""
    api = (ui.get("profile_api_names") or {}).get(profile_id or "")
    return ([api], True) if api else ([profile_name], False)


def resolve_pages(ui: Dict[str, Any], profile_name: str, profile_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """For each object with a record page assigned anywhere: per app (and
    "any other app"), per record type and form factor, the page that wins and
    the rule that decided it. App assignments are matched on the profile's
    API name (standard profiles: Admin, Standard, ...), never its label,
    when that name was read."""
    profile_keys, _ = profile_match_keys(ui, profile_id, profile_name)
    pages = {p["developer_name"]: p for p in ui.get("flexipages", [])}
    label = lambda dev: (pages.get(dev) or {}).get("label") or dev  # noqa: E731
    objects = sorted({p["object"] for p in pages.values()} | set(ui.get("org_default_pages", {})))
    rts_by_obj: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    vis = _visible(ui, profile_id) if profile_id else None
    for r in ui.get("record_types", []):
        key = f"{r['object']}.{r['developer_name']}"
        if r.get("active", True) and (vis is None or key in (vis.get(r["object"]) or {}).get("available", [])):
            rts_by_obj[r["object"]].append(r)
    out = []
    for obj in objects:
        org = ui.get("org_default_pages", {}).get(obj, {})
        rts = [{"key": None, "name": "Master (no record type)"}] + [
            {"key": f"{obj}.{r['developer_name']}", "name": r["name"]} for r in sorted(rts_by_obj[obj], key=lambda r: r["name"])]
        apps = [a for a in ui.get("apps", []) if any(o["object"] == obj for o in a.get("overrides", []))]
        for app in apps + [None]:
            for rt in rts:
                for ff, ff_label in FORM_FACTORS:
                    considered = []
                    winner, rule = None, None
                    if app is not None:
                        mine = [o for o in app["overrides"] if o["object"] == obj and o["form_factor"] == ff]
                        for rule_name, test in RULES:
                            hit = next((o["page"] for o in mine if test(o, rt["key"], profile_keys)), None)
                            considered.append(f"{rule_name}: " + (label(hit) if hit else "none"))
                            if hit:
                                winner, rule = hit, rule_name
                                break
                    if winner is None:
                        if org.get(ff):
                            winner, rule = org[ff], "Org default"
                        considered.append("Org default: " + (label(org[ff]) if org.get(ff) else "none"))
                    out.append({
                        "object": obj, "app": app["label"] if app else None, "record_type": rt["name"],
                        "form_factor": ff_label, "page": label(winner) if winner else SYSTEM_DEFAULT,
                        "rule": rule or "No assignment: Salesforce's default page", "considered": considered,
                    })
    return out


def resolve_apex(ui: Dict[str, Any], sources: Dict[str, List[Source]]) -> List[Dict[str, Any]]:
    granted = _granted(ui, sources, "ApexClass")
    classes = {c["id"]: c for c in ui.get("apex_classes", [])}
    rows = [{"id": cid, "name": classes.get(cid, {}).get("name", cid), "namespace": classes.get(cid, {}).get("namespace"),
             "via": paths} for cid, paths in granted.items()]
    return sorted(rows, key=lambda r: r["name"].lower())


def resolve_flows(ui: Dict[str, Any], sources: Dict[str, List[Source]], user_id: Optional[str] = None) -> Dict[str, Any]:
    granted = _granted(ui, sources, "FlowDefinition")
    run_flows = ui.get("run_flows") or {}
    run_via = [list(p) for ps, paths in sources.items() if run_flows.get(ps) for p, _node in paths]
    flow_users = ui.get("flow_users")
    is_flow_user = None if flow_users is None else (user_id in flow_users or (user_id or "")[:15] in {u[:15] for u in flow_users})
    if is_flow_user:
        run_via.append(["Flow User (user setting)"])
    has_run = bool(run_via) if (run_flows or is_flow_user) else None
    rows = []
    for f in ui.get("flows", []):
        via = granted.get(f["id"], [])
        if f.get("trigger_type") in RECORD_TRIGGERED:
            can, why = None, "Starts on its own when a record changes; it doesn't depend on the user's flow permissions."
        elif f.get("trigger_type") in SELF_STARTING:
            can, why = None, ("Starts on its own (schedule or platform event). Salesforce documents the no-permission "
                              "rule for record-triggered flows; for this type it's UNVERIFIED.")
        elif f.get("restricted"):
            can = bool(via)
            why = ("Requires explicit access, granted below." if via
                   else "Requires explicit access through a profile or permission set; this user has none.")
        elif via:
            can, why = True, "Access granted to this flow below."
        elif has_run is None:
            can, why = None, "Depends on the Run Flows permission, which wasn't read."
        else:
            can = has_run
            why = ("Through the Run Flows permission or the Flow User setting." if has_run
                   else "No access to this flow, no Run Flows permission and not a Flow User.")
        if f.get("restricted") is None and f.get("trigger_type") not in SELF_STARTING:
            why += " Whether it requires explicit access wasn't read."
        rows.append({**f, "via": via, "can_run": can, "why": why})
    rows.sort(key=lambda r: (r["can_run"] is not True, (r.get("label") or r["api_name"]).lower()))
    return {"run_flows": has_run, "run_flows_via": run_via, "flows": rows}


def for_user(ui: Optional[Dict[str, Any]], user: Any, profile_names: Dict[str, str], ps_rows: Dict[str, Any],
             assignments: Iterable[Any], components: Iterable[Any], group_names: Dict[str, str]) -> Dict[str, Any]:
    if not ui:
        return {"available": False, "reason": "Not read yet: sync the org to read page layouts, record pages, Apex and flows."}
    sources = user_sources(user, profile_names, ps_rows, assignments, components, group_names)
    profile_name = profile_names.get(user.profile_id, user.profile_id or "")
    flows = resolve_flows(ui, sources, getattr(user, "salesforce_id", None))
    return {
        "available": True,
        "collected_at": ui.get("collected_at"),
        "profile": profile_name,
        "layouts": resolve_layouts(ui, user.profile_id, profile_name),
        "layout_note": LAYOUT_NOTE,
        "record_type_visibility_note": ui.get("record_type_visibility_note") or (
            "Which record types this profile can use wasn't read, so every active record type is listed."),
        "pages": resolve_pages(ui, profile_name, user.profile_id),
        "page_notes": [VISIBILITY_NOTE, PRECEDENCE_NOTE,
                       PROFILE_NAME_NOTE if profile_match_keys(ui, user.profile_id, profile_name)[1] else PROFILE_NAME_UNREAD_NOTE]
                      + list(ui.get("page_caveats", [])),
        "apex": resolve_apex(ui, sources),
        "apex_note": APEX_NOTE,
        "apex_total": len(ui.get("apex_classes", [])),
        **flows,
        "flows_total": len(ui.get("flows", [])),
        "notes": list(ui.get("notes", [])),
    }


def _profile_rule(rule: str) -> bool:
    return "profile" in rule.lower()


def graph_extras(ui: Optional[Dict[str, Any]], user: Any, profile_names: Dict[str, str], ps_rows: Dict[str, Any],
                 assignments: Iterable[Any], components: Iterable[Any], group_names: Dict[str, str],
                 objects_in_graph: Iterable[str] = ()) -> Dict[str, Any]:
    """Every page layout, Lightning record page, Apex class and flow this
    user gets, as access-graph nodes (the graph's picker chooses which to
    draw), each with edges showing how the user reaches it:
      Apex class, flow   from the profile, permission set or group granting it
                         (a flow run through Run Flows, from what grants that)
      page layout        from the profile, labelled with its record types
      record page        from the profile when the winning assignment names
                         the profile, otherwise from the user; labelled with
                         the assignment level (desktop pages)
    Layouts and record pages also point at their object, drawn when the
    object is. objects_in_graph is kept for callers; nothing is filtered."""
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    if not ui:
        return {"nodes": nodes, "edges": edges, "hidden": {}, "available": False}
    sources = user_sources(user, profile_names, ps_rows, assignments, components, group_names)
    for kind, node_type, catalog, name_key, edge_type in (
        ("ApexClass", "apex_class", ui.get("apex_classes", []), "name", "GRANTS_APEX_CLASS"),
        ("FlowDefinition", "flow", ui.get("flows", []), "label", "GRANTS_FLOW"),
    ):
        by_id = {c["id"]: c for c in catalog}
        granted = _granted(ui, sources, kind, with_nodes=True)
        for eid in sorted(granted, key=lambda i: (by_id.get(i, {}).get(name_key) or i).lower()):
            item = by_id.get(eid, {})
            nodes.append({"id": f"{node_type}_{eid}", "type": node_type, "label": item.get(name_key) or eid,
                          "properties": {k: v for k, v in item.items() if k != "id"}})
            for path, origin in sorted({(tuple(p), o) for p, o in granted[eid]}):
                # The edge starts at the profile, set or group, so its label is short: a
                # group names the permission set inside it that grants the item.
                label = f"via {path[-1].split(': ', 1)[-1]}" if len(path) > 1 else "grants"
                edges.append({"id": f"{edge_type}_{origin}_{eid}", "source": origin, "target": f"{node_type}_{eid}",
                              "type": edge_type, "label": label, "properties": {"path": " → ".join(path)}})
    # Flows the user can run without a grant of their own: through the Run
    # Flows permission (from whatever grants it) or the Flow User setting.
    # Self-starting flows don't depend on the user, so they aren't drawn.
    run_flows = ui.get("run_flows") or {}
    run_nodes = sorted({(tuple(p), o) for ps, paths in sources.items() if run_flows.get(ps) for p, o in paths})
    flows = resolve_flows(ui, sources, getattr(user, "salesforce_id", None))
    for f in flows["flows"]:
        if f["can_run"] is not True or f["via"]:
            continue
        nid = f"flow_{f['id']}"
        nodes.append({"id": nid, "type": "flow", "label": f.get("label") or f["id"],
                      "properties": {k: v for k, v in f.items() if k not in ("id", "via", "can_run", "why")}})
        for path, origin in run_nodes:
            edges.append({"id": f"RUN_FLOWS_{origin}_{f['id']}", "source": origin, "target": nid, "type": "GRANTS_FLOW",
                          "label": "Run Flows", "properties": {"path": " → ".join(path) + " (Run Flows)"}})
        if ["Flow User (user setting)"] in flows["run_flows_via"]:
            edges.append({"id": f"FLOW_USER_{f['id']}", "source": user.salesforce_id, "target": nid, "type": "GRANTS_FLOW",
                          "label": "Flow User setting"})
    profile_name = profile_names.get(user.profile_id, user.profile_id or "")
    layouts: Dict[str, Dict[str, Any]] = {}
    for row in resolve_layouts(ui, user.profile_id, profile_name):
        nid = f"layout_{row['object']}_{row['layout']}"
        node = layouts.setdefault(nid, {"id": nid, "type": "layout", "label": row["layout"],
                                         "properties": {"object": row["object"], "recordTypes": []}})
        node["properties"]["recordTypes"].append(row["record_type"])
    for nid, node in layouts.items():
        nodes.append(node)
        rts = node["properties"]["recordTypes"]
        edges.append({"id": f"USES_LAYOUT_{nid}", "source": user.profile_id, "target": nid, "type": "USES_LAYOUT",
                      "label": f"{'record type' if len(rts) == 1 else 'record types'}: {', '.join(rts)}"})
        edges.append({"id": f"LAYOUT_FOR_{nid}", "source": nid, "target": f"object_{node['properties']['object']}",
                      "type": "LAYOUT_FOR", "label": node["properties"]["object"]})
    pages: Dict[str, Dict[str, Any]] = {}
    reach: Dict[Tuple[str, str], List[str]] = defaultdict(list)
    for row in resolve_pages(ui, profile_name, user.profile_id):
        if row["form_factor"] != "Desktop" or row["page"] == SYSTEM_DEFAULT:
            continue
        nid = f"page_{row['object']}_{row['page']}"
        node = pages.setdefault(nid, {"id": nid, "type": "lightning_page", "label": row["page"],
                                       "properties": {"object": row["object"], "rules": []}})
        rule = f"{row['app'] or 'Any other app'} · {row['record_type']}: {row['rule']}"
        if rule not in node["properties"]["rules"]:
            node["properties"]["rules"].append(rule)
        source = user.profile_id if _profile_rule(row["rule"]) else user.salesforce_id
        if row["rule"] not in reach[(source, nid)]:
            reach[(source, nid)].append(row["rule"])
    for nid, node in pages.items():
        nodes.append(node)
        edges.append({"id": f"PAGE_FOR_{nid}", "source": nid, "target": f"object_{node['properties']['object']}",
                      "type": "RECORD_PAGE_FOR", "label": "record page"})
    for (source, nid), rules in reach.items():
        edges.append({"id": f"GETS_PAGE_{source}_{nid}", "source": source, "target": nid, "type": "GETS_RECORD_PAGE",
                      "label": "; ".join(rules)})
    return {"nodes": nodes, "edges": edges, "hidden": {}, "available": True}


# ---------------------------------------------------------------- live read

MAX_PROFILE_METADATA = 150   # Profile.Metadata is one record per query
MAX_APP_METADATA = 60        # one query per app
MAX_FLOW_METADATA = 150      # Flow.Metadata is one record per query
MAX_LAYOUT_METADATA = 300    # Layout.Metadata is one record per query
MAX_SET_METADATA = 200       # PermissionSet.Metadata, one record per query
MAX_DESCRIBES = 40


DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def login_restrictions(md: Dict[str, Any]) -> Dict[str, Any]:
    """Profile metadata's loginIpRanges (startAddress, endAddress,
    description) and loginHours ({day}Start / {day}End in minutes since
    midnight), Metadata API v68 ProfileLoginIpRange and ProfileLoginHours.
    loginHours is read as an object or a one-item list (JSON shape
    UNVERIFIED). Empty when the profile restricts neither."""
    out: Dict[str, Any] = {}
    ranges = [{"start": r.get("startAddress"), "end": r.get("endAddress"), "description": r.get("description")}
              for r in md.get("loginIpRanges") or [] if isinstance(r, dict)]
    if ranges:
        out["ip_ranges"] = ranges
    hours = md.get("loginHours")
    if isinstance(hours, list):
        hours = hours[0] if hours else None
    if isinstance(hours, dict):
        days = {}
        for d in DAYS:
            start, end = hours.get(f"{d}Start"), hours.get(f"{d}End")
            if start is not None or end is not None:
                days[d] = {"start": start, "end": end}
        if days:
            out["hours"] = days
    return out


def _short(i: Optional[str]) -> Optional[str]:
    return i[:15] if i else i


async def collect_live(client: Any, include_users: bool = True) -> Dict[str, Any]:
    """Build the ui_access dict from a live org. Queries are read-only."""
    import logging
    log = logging.getLogger(__name__)
    out: Dict[str, Any] = {"notes": [], "page_caveats": []}

    async def soql(q: str) -> List[Dict[str, Any]]:
        return await client.query_all(q)

    async def tooling(q: str) -> List[Dict[str, Any]]:
        return await client.query_tooling(q)

    async def part(name: str, fn, note: str):
        try:
            return await fn()
        except Exception as e:  # noqa: BLE001
            log.info("ui_access %s failed: %s", name, e)
            out["notes"].append(note)
            return None

    # Custom object ids -> API names (Tooling returns ids for custom objects).
    custom = await part("custom objects", lambda: tooling("SELECT Id, DeveloperName, NamespacePrefix FROM CustomObject"),
                        "Custom object names couldn't be read; custom objects show by id.") or []
    obj_name = {_short(c["Id"]): (f"{c['NamespacePrefix']}__" if c.get("NamespacePrefix") else "") + f"{c['DeveloperName']}__c"
                for c in custom}
    name_of = lambda v: obj_name.get(_short(v), v) if v else v  # noqa: E731

    rts = await part("record types", lambda: soql("SELECT Id, SobjectType, DeveloperName, Name, IsActive FROM RecordType"),
                     "Record types couldn't be read.") or []
    out["record_types"] = [{"id": r["Id"], "object": r["SobjectType"], "developer_name": r["DeveloperName"],
                            "name": r["Name"], "active": bool(r.get("IsActive"))} for r in rts]
    layouts = await part("layouts", lambda: tooling("SELECT Id, Name, TableEnumOrId FROM Layout"),
                         "Page layouts couldn't be read.") or []
    out["layouts"] = [{"id": lay["Id"], "object": name_of(lay.get("TableEnumOrId")), "name": lay.get("Name")} for lay in layouts]
    pls = await part("profile layouts", lambda: tooling("SELECT ProfileId, LayoutId, RecordTypeId, TableEnumOrId FROM ProfileLayout"),
                     "Profile layout assignments couldn't be read.") or []
    out["profile_layouts"] = [{"profile_id": p["ProfileId"], "layout_id": p["LayoutId"], "record_type_id": p.get("RecordTypeId"),
                               "object": name_of(p.get("TableEnumOrId"))} for p in pls]
    # The fields on each layout (the field x layout matrix): Layout.Metadata, one layout per query.
    layout_fields: Dict[str, Any] = {}
    for lay in layouts[:MAX_LAYOUT_METADATA]:
        rows = await part("layout metadata", lambda lid=lay["Id"]: tooling(f"SELECT Metadata FROM Layout WHERE Id = '{lid}'"), "")
        placed = md_detail.layout_fields(((rows or [{}])[0] or {}).get("Metadata"))
        if placed is not None:
            layout_fields[lay["Id"]] = placed
    out["layout_fields"] = layout_fields
    if len(layouts) > MAX_LAYOUT_METADATA:
        out["notes"].append(f"The fields on each layout were read for the first {MAX_LAYOUT_METADATA} of {len(layouts)} layouts.")

    # Record type visibility per profile: Profile.Metadata, one profile per query.
    profiles = await part("profiles", lambda: soql("SELECT Id, Name FROM Profile"), "Profiles couldn't be listed.") or []
    vis: Dict[str, Dict[str, Any]] = {}
    api_names: Dict[str, str] = {}  # profile id -> API name (FullName), e.g. Admin
    logins: Dict[str, Dict[str, Any]] = {}  # profile id -> login IP ranges and hours
    for p in profiles[:MAX_PROFILE_METADATA]:
        rows = await part("profile metadata", lambda pid=p["Id"]: tooling(
            f"SELECT FullName, Metadata FROM Profile WHERE Id = '{pid}'"), "")
        row = (rows or [{}])[0] or {}
        if row.get("FullName"):
            api_names[p["Id"]] = row["FullName"]
        md = row.get("Metadata") or {}
        login = login_restrictions(md)
        if login:
            logins[p["Id"]] = login
        for v in md.get("recordTypeVisibilities") or []:
            obj = (v.get("recordType") or "").split(".")[0]
            slot = vis.setdefault(p["Id"], {}).setdefault(obj, {"available": [], "default": None})
            if v.get("visible"):
                slot["available"].append(v.get("recordType"))
            if v.get("default"):
                slot["default"] = v.get("recordType")
    # Record types granted by permission sets: PermissionSet.Metadata, one set per query.
    # UNVERIFIED read path: stop at the first failure rather than repeat it for every set.
    sets = await part("permission sets", lambda: soql("SELECT Id FROM PermissionSet WHERE IsOwnedByProfile = false"), "") or []
    set_rts: Dict[str, Dict[str, List[str]]] = {}
    set_rts_read = bool(sets)
    for ps in sets[:MAX_SET_METADATA]:
        try:
            rows = await tooling(f"SELECT Metadata FROM PermissionSet WHERE Id = '{ps['Id']}'")
        except Exception as e:  # noqa: BLE001
            log.info("ui_access permission set metadata failed: %s", e)
            set_rts_read = False
            break
        rts_of = md_detail.set_record_types(((rows or [{}])[0] or {}).get("Metadata"))
        if rts_of:
            set_rts[ps["Id"]] = rts_of
    # Shown in the documentation workbook only; user and profile pages still list a profile's record types.
    if set_rts_read:
        out["set_record_types"] = set_rts
        if len(sets) > MAX_SET_METADATA:
            out["notes"].append(f"Record types granted by permission sets were read for the first {MAX_SET_METADATA} "
                                f"of {len(sets)} permission sets.")
    elif sets:
        out["notes"].append("Record types granted by permission sets couldn't be read (PermissionSet metadata).")
    out["notes"] = [n for n in out["notes"] if n]
    out["profile_api_names"] = api_names
    out["profile_logins"] = logins
    if vis:
        out["record_type_visibility"] = vis
        out["record_type_visibility_note"] = (
            "Record types available to the profile, from its metadata. Record types granted by permission sets "
            "aren't read." + (f" Only the first {MAX_PROFILE_METADATA} profiles were read." if len(profiles) > MAX_PROFILE_METADATA else ""))

    pages = await part("flexipages", lambda: tooling(
        "SELECT Id, DeveloperName, MasterLabel, EntityDefinitionId FROM FlexiPage WHERE Type = 'RecordPage'"),
        "Lightning record pages couldn't be read.") or []
    out["flexipages"] = [{"id": f["Id"], "developer_name": f["DeveloperName"], "label": f.get("MasterLabel"),
                          "object": name_of(f.get("EntityDefinitionId"))} for f in pages]
    page_by_id = {_short(f["Id"]): f["DeveloperName"] for f in pages}

    # Org default record page: the object's describe actionOverrides (View).
    defaults: Dict[str, Dict[str, str]] = {}
    for obj in sorted({f["object"] for f in out["flexipages"] if f["object"]})[:MAX_DESCRIBES]:
        d = await part("describe", lambda o=obj: client.describe_object(o), "")
        for ov in (d or {}).get("actionOverrides") or []:
            if (ov.get("name") or "").lower() == "view" and ov.get("pageId"):
                ff = "Small" if (ov.get("formFactor") or "").lower() == "small" else "Large"
                defaults.setdefault(obj, {})[ff] = page_by_id.get(_short(ov["pageId"]), ov["pageId"])
    out["org_default_pages"] = defaults
    out["page_caveats"].append(
        "Org defaults are read from each object's describe (actionOverrides); that field isn't described in the "
        "API guides we checked (UNVERIFIED).")

    apps = await part("apps", lambda: tooling("SELECT Id, DeveloperName, MasterLabel FROM CustomApplication"),
                      "Lightning apps couldn't be read.") or []
    out["apps"] = []
    for a in apps[:MAX_APP_METADATA]:
        rows = await part("app metadata", lambda aid=a["Id"]: tooling(f"SELECT Metadata FROM CustomApplication WHERE Id = '{aid}'"), "")
        md = ((rows or [{}])[0] or {}).get("Metadata") or {}
        overrides = []
        for ov in md.get("actionOverrides") or []:
            if (ov.get("actionName") or "").lower() == "view" and ov.get("content"):
                overrides.append({"object": ov.get("pageOrSobjectType"), "form_factor": ov.get("formFactor") or "Large",
                                  "page": ov["content"], "record_type": None, "profile": None})
        for ov in md.get("profileActionOverrides") or []:
            if (ov.get("actionName") or "").lower() == "view" and ov.get("content"):
                overrides.append({"object": ov.get("pageOrSobjectType"), "form_factor": ov.get("formFactor") or "Large",
                                  "page": ov["content"], "record_type": ov.get("recordType"), "profile": ov.get("profile")})
        if overrides:
            out["apps"].append({"id": a["Id"], "developer_name": a["DeveloperName"], "label": a.get("MasterLabel"),
                                "overrides": overrides})
    if len(apps) > MAX_APP_METADATA:
        out["page_caveats"].append(f"Only the first {MAX_APP_METADATA} apps' page assignments were read.")

    classes = await part("apex", lambda: soql("SELECT Id, Name, NamespacePrefix FROM ApexClass"),
                         "Apex classes couldn't be read.") or []
    out["apex_classes"] = [{"id": c["Id"], "name": c["Name"], "namespace": c.get("NamespacePrefix")} for c in classes]

    flows = await part("flows", lambda: soql(
        "SELECT DurableId, ApiName, Label, ProcessType, TriggerType, IsActive, ActiveVersionId FROM FlowDefinitionView"),
        "Flows couldn't be read.") or []
    out["flows"] = []
    for i, f in enumerate(flows):
        restricted = None
        if f.get("ActiveVersionId") and i < MAX_FLOW_METADATA:
            rows = await part("flow metadata", lambda vid=f["ActiveVersionId"]: tooling(
                f"SELECT Metadata FROM Flow WHERE Id = '{vid}'"), "")
            md = ((rows or [{}])[0] or {}).get("Metadata")
            if md is not None:
                restricted = bool(md.get("isAdditionalPermissionRequiredToRun"))
                detail = md_detail.flow_detail(md)
                if detail is not None:
                    out.setdefault("flow_details", {})[f["DurableId"]] = detail
        out["flows"].append({"id": f["DurableId"], "api_name": f.get("ApiName"), "label": f.get("Label"),
                             "process_type": f.get("ProcessType"), "trigger_type": f.get("TriggerType"),
                             "active": bool(f.get("IsActive")), "restricted": restricted})
    if len(flows) > MAX_FLOW_METADATA:
        out["notes"].append(f"Whether a flow requires explicit access, and its elements, were read for the first "
                            f"{MAX_FLOW_METADATA} flows only.")

    sea = await part("setup entity access", lambda: soql(
        "SELECT ParentId, SetupEntityId, SetupEntityType FROM SetupEntityAccess "
        "WHERE SetupEntityType IN ('ApexClass', 'FlowDefinition', 'ApexPage', 'CustomPermission', 'TabSet', "
        "'ExternalDataSource')"),
        "Apex class, flow, Visualforce page, custom permission, app and external data source access couldn't be read.") or []
    grants: Dict[str, Dict[str, List[str]]] = {}
    for r in sea:
        grants.setdefault(r["ParentId"], {}).setdefault(r["SetupEntityType"], []).append(r["SetupEntityId"])
    out["setup_entity_access"] = grants

    rf = await part("run flows", lambda: soql("SELECT Id, PermissionsRunFlow FROM PermissionSet"),
                    "The Run Flows permission couldn't be read.")
    out["run_flows"] = {r["Id"]: bool(r.get("PermissionsRunFlow")) for r in rf or []}
    if include_users:
        fu = await part("flow users", lambda: soql("SELECT Id FROM User WHERE UserPermissionsInteractionUser = true"),
                        "The Flow User setting on users couldn't be read.")
        if fu is not None:
            out["flow_users"] = [u["Id"] for u in fu]

    reasons: Dict[str, Dict[str, str]] = {}
    for obj, share in (("Account", "AccountShare"), ("Opportunity", "OpportunityShare")):
        d = await part("share describe", lambda s=share: client.describe_object(s), "")
        for fld in (d or {}).get("fields") or []:
            if fld.get("name") == "RowCause":
                reasons[obj] = {v["value"]: v.get("label") or v["value"] for v in fld.get("picklistValues") or []}
    out["share_reasons"] = reasons
    out["notes"] = [n for n in out["notes"] if n]
    return out



# ---------------------------------------------------------------- per profile / set
# Configuration only, so these work at every privacy level (Metadata only too).


def profile_sources(profile_id: str, profile_name: str, ps_rows: Dict[str, Any]) -> Dict[str, List[Source]]:
    """The profile's own permission set, as the only grant source."""
    return {ps.salesforce_id: [((f"Profile: {profile_name}",), profile_id)]
            for ps in ps_rows.values() if ps.is_owned_by_profile and ps.profile_id == profile_id}


def set_sources(ps_id: str, ps_rows: Dict[str, Any], components: Iterable[Any],
                group_names: Dict[str, str]) -> Dict[str, List[Source]]:
    """A permission set, or a permission set group through its component
    sets (muting sets left out)."""
    if ps_id in group_names:
        out: Dict[str, List[Source]] = defaultdict(list)
        for c in components:
            if c.permission_set_group_id != ps_id:
                continue
            comp = ps_rows.get(c.permission_set_id)
            if comp is not None and (comp.ps_type or "") == "Muting":
                continue
            label = (comp.label or comp.name) if comp is not None else c.permission_set_id
            out[c.permission_set_id].append(((f"Permission set: {label}",), c.permission_set_id))
        return out
    ps = ps_rows.get(ps_id)
    return {ps_id: [((f"Permission set: {(ps.label or ps.name) if ps else ps_id}",), ps_id)]}


def for_profile(ui: Optional[Dict[str, Any]], profile_id: str, profile_name: str, ps_rows: Dict[str, Any]) -> Dict[str, Any]:
    """Layouts, record pages, Apex and flows that come with a profile alone
    (a user may get more through permission sets)."""
    if not ui:
        return {"available": False, "reason": "Not read yet: sync the org to read page layouts, record pages, Apex and flows."}
    sources = profile_sources(profile_id, profile_name, ps_rows)
    flows = resolve_flows(ui, sources)
    return {
        "available": True,
        "collected_at": ui.get("collected_at"),
        "profile": profile_name,
        "profile_api_name": (ui.get("profile_api_names") or {}).get(profile_id),
        "layouts": resolve_layouts(ui, profile_id, profile_name),
        "layout_note": LAYOUT_NOTE,
        "record_type_visibility_note": ui.get("record_type_visibility_note") or (
            "Which record types this profile can use wasn't read, so every active record type is listed."),
        "pages": resolve_pages(ui, profile_name, profile_id),
        "page_notes": [VISIBILITY_NOTE, PRECEDENCE_NOTE,
                       PROFILE_NAME_NOTE if profile_match_keys(ui, profile_id, profile_name)[1] else PROFILE_NAME_UNREAD_NOTE]
                      + list(ui.get("page_caveats", [])),
        "apex": resolve_apex(ui, sources),
        "apex_total": len(ui.get("apex_classes", [])),
        "apex_note": APEX_NOTE,
        **flows,
        "flows_total": len(ui.get("flows", [])),
        "notes": list(ui.get("notes", [])) + [
            "This is what the profile grants on its own. Users with this profile may get more Apex and flow access "
            "through permission sets, and may be Flow Users."],
    }


def for_set(ui: Optional[Dict[str, Any]], ps_id: str, ps_rows: Dict[str, Any], components: Iterable[Any],
            group_names: Dict[str, str]) -> Dict[str, Any]:
    """Apex classes and flows a permission set (or group) grants."""
    if not ui:
        return {"available": False, "reason": "Not read yet: sync the org to read Apex classes and flows."}
    sources = set_sources(ps_id, ps_rows, components, group_names)
    granted_flows = _granted(ui, sources, "FlowDefinition")
    flows = {f["id"]: f for f in ui.get("flows", [])}
    run_flows = ui.get("run_flows") or {}
    return {
        "available": True,
        "collected_at": ui.get("collected_at"),
        "apex": resolve_apex(ui, sources),
        "apex_note": APEX_NOTE,
        "flows": sorted(({**flows.get(fid, {"id": fid, "api_name": fid, "label": fid}), "via": via}
                         for fid, via in granted_flows.items()), key=lambda f: (f.get("label") or f["api_name"]).lower()),
        "run_flows": (any(run_flows.get(p) for p in sources) if run_flows else None),
        "notes": list(ui.get("notes", [])),
    }
