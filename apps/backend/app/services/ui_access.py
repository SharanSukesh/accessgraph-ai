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
  setup_entity_access SetupEntityAccess: permission set (incl. a profile's own
                      set) -> ApexClass / FlowDefinition ids
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

FORM_FACTORS = (("Large", "Desktop"), ("Small", "Phone"))
SYSTEM_DEFAULT = "Salesforce's default record page"
VISIBILITY_NOTE = (
    "Component visibility rules (filters that show or hide a component on a page) aren't evaluated: "
    "this shows which page is assigned, not what each component displays."
)
PRECEDENCE_NOTE = (
    "Order used: app, record type and profile assignment, then the app default, then the org default. Salesforce "
    "documents that an app, record type and profile assignment beats the app's default; that the app default beats "
    "the org default isn't stated in the documentation we checked (UNVERIFIED)."
)
PROFILE_NAME_NOTE = (
    "App assignments name a profile by its metadata name, which for some standard profiles may differ from the "
    "label shown here (UNVERIFIED); such an assignment wouldn't match."
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
    layouts = {l["id"]: l for l in ui.get("layouts", [])}
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


def resolve_pages(ui: Dict[str, Any], profile_name: str, profile_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """For each object with a record page assigned anywhere: per app (and
    "any other app"), per record type and form factor, the page that wins and
    the rule that decided it."""
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
                        for o in app["overrides"]:
                            if (o["object"] == obj and o["form_factor"] == ff and o.get("profile") == profile_name
                                    and o.get("record_type") and o["record_type"] == rt["key"]):
                                winner, rule = o["page"], "App, record type and profile assignment"
                        considered.append("App, record type and profile assignment: " + (label(winner) if winner else "none for this profile and record type"))
                        if winner is None:
                            d = next((o["page"] for o in app["overrides"] if o["object"] == obj and o["form_factor"] == ff
                                      and not o.get("profile") and not o.get("record_type")), None)
                            considered.append("App default: " + (label(d) if d else "none"))
                            if d:
                                winner, rule = d, "App default"
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
        "page_notes": [VISIBILITY_NOTE, PRECEDENCE_NOTE, PROFILE_NAME_NOTE] + list(ui.get("page_caveats", [])),
        "apex": resolve_apex(ui, sources),
        "apex_note": APEX_NOTE,
        "apex_total": len(ui.get("apex_classes", [])),
        **flows,
        "flows_total": len(ui.get("flows", [])),
        "notes": list(ui.get("notes", [])),
    }


GRAPH_MAX_PER_KIND = 12


def graph_extras(ui: Optional[Dict[str, Any]], user: Any, profile_names: Dict[str, str], ps_rows: Dict[str, Any],
                 assignments: Iterable[Any], components: Iterable[Any], group_names: Dict[str, str],
                 objects_in_graph: Iterable[str]) -> Dict[str, Any]:
    """Nodes and edges for the access graph's "Pages and automation" layer:
    Apex classes and flows from the profile, set or group that grants them,
    and each object's layouts (from the profile) and assigned record pages.
    At most GRAPH_MAX_PER_KIND of each kind; the rest are counted."""
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    hidden: Dict[str, int] = {}
    if not ui:
        return {"nodes": nodes, "edges": edges, "hidden": hidden, "available": False}
    sources = user_sources(user, profile_names, ps_rows, assignments, components, group_names)
    for kind, node_type, catalog, name_key, edge_type in (
        ("ApexClass", "apex_class", ui.get("apex_classes", []), "name", "GRANTS_APEX_CLASS"),
        ("FlowDefinition", "flow", ui.get("flows", []), "label", "GRANTS_FLOW"),
    ):
        by_id = {c["id"]: c for c in catalog}
        granted = _granted(ui, sources, kind, with_nodes=True)
        ordered = sorted(granted, key=lambda i: (by_id.get(i, {}).get(name_key) or i).lower())
        hidden[node_type] = max(0, len(ordered) - GRAPH_MAX_PER_KIND)
        for eid in ordered[:GRAPH_MAX_PER_KIND]:
            item = by_id.get(eid, {})
            nodes.append({"id": f"{node_type}_{eid}", "type": node_type, "label": item.get(name_key) or eid,
                          "properties": {k: v for k, v in item.items() if k != "id"}})
            for path, origin in {(tuple(p), o) for p, o in granted[eid]}:
                edges.append({"id": f"{edge_type}_{origin}_{eid}", "source": origin, "target": f"{node_type}_{eid}",
                              "type": edge_type, "label": " → ".join(path)})
    wanted = set(objects_in_graph)
    profile_name = profile_names.get(user.profile_id, user.profile_id or "")
    seen = set()
    for row in resolve_layouts(ui, user.profile_id, profile_name):
        if row["object"] not in wanted:
            continue
        nid = f"layout_{row['object']}_{row['layout']}"
        if nid not in seen:
            seen.add(nid)
            nodes.append({"id": nid, "type": "layout", "label": row["layout"], "properties": {"object": row["object"], "recordTypes": []}})
            edges.append({"id": f"USES_LAYOUT_{nid}", "source": user.profile_id, "target": nid, "type": "USES_LAYOUT", "label": "page layout"})
            edges.append({"id": f"LAYOUT_FOR_{nid}", "source": nid, "target": f"object_{row['object']}", "type": "LAYOUT_FOR", "label": row["object"]})
        next(n for n in nodes if n["id"] == nid)["properties"]["recordTypes"].append(row["record_type"])
    for row in resolve_pages(ui, profile_name, user.profile_id):
        if row["object"] not in wanted or row["form_factor"] != "Desktop" or row["page"] == SYSTEM_DEFAULT:
            continue
        nid = f"page_{row['object']}_{row['page']}"
        if nid not in seen:
            seen.add(nid)
            nodes.append({"id": nid, "type": "lightning_page", "label": row["page"],
                          "properties": {"object": row["object"], "rules": []}})
            edges.append({"id": f"PAGE_FOR_{nid}", "source": nid, "target": f"object_{row['object']}", "type": "RECORD_PAGE_FOR", "label": "record page"})
        rule = f"{row['app'] or 'Any other app'} · {row['record_type']}: {row['rule']}"
        rules = next(n for n in nodes if n["id"] == nid)["properties"]["rules"]
        if rule not in rules:
            rules.append(rule)
    return {"nodes": nodes, "edges": edges, "hidden": hidden, "available": True}


# ---------------------------------------------------------------- live read

MAX_PROFILE_METADATA = 150   # Profile.Metadata is one record per query
MAX_APP_METADATA = 60        # one query per app
MAX_FLOW_METADATA = 150      # Flow.Metadata is one record per query
MAX_DESCRIBES = 40


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
    out["layouts"] = [{"id": l["Id"], "object": name_of(l.get("TableEnumOrId")), "name": l.get("Name")} for l in layouts]
    pls = await part("profile layouts", lambda: tooling("SELECT ProfileId, LayoutId, RecordTypeId, TableEnumOrId FROM ProfileLayout"),
                     "Profile layout assignments couldn't be read.") or []
    out["profile_layouts"] = [{"profile_id": p["ProfileId"], "layout_id": p["LayoutId"], "record_type_id": p.get("RecordTypeId"),
                               "object": name_of(p.get("TableEnumOrId"))} for p in pls]

    # Record type visibility per profile: Profile.Metadata, one profile per query.
    profiles = await part("profiles", lambda: soql("SELECT Id, Name FROM Profile"), "Profiles couldn't be listed.") or []
    vis: Dict[str, Dict[str, Any]] = {}
    for p in profiles[:MAX_PROFILE_METADATA]:
        rows = await part("profile metadata", lambda pid=p["Id"]: tooling(f"SELECT Metadata FROM Profile WHERE Id = '{pid}'"), "")
        md = ((rows or [{}])[0] or {}).get("Metadata") or {}
        for v in md.get("recordTypeVisibilities") or []:
            obj = (v.get("recordType") or "").split(".")[0]
            slot = vis.setdefault(p["Id"], {}).setdefault(obj, {"available": [], "default": None})
            if v.get("visible"):
                slot["available"].append(v.get("recordType"))
            if v.get("default"):
                slot["default"] = v.get("recordType")
    out["notes"] = [n for n in out["notes"] if n]
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
        out["flows"].append({"id": f["DurableId"], "api_name": f.get("ApiName"), "label": f.get("Label"),
                             "process_type": f.get("ProcessType"), "trigger_type": f.get("TriggerType"),
                             "active": bool(f.get("IsActive")), "restricted": restricted})
    if len(flows) > MAX_FLOW_METADATA:
        out["notes"].append(f"Whether a flow requires explicit access was read for the first {MAX_FLOW_METADATA} flows only.")

    sea = await part("setup entity access", lambda: soql(
        "SELECT ParentId, SetupEntityId, SetupEntityType FROM SetupEntityAccess "
        "WHERE SetupEntityType IN ('ApexClass', 'FlowDefinition')"),
        "Apex class and flow access couldn't be read.") or []
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
