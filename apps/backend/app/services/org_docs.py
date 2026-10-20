"""Org documentation reads (roadmap item 11, part b): the configuration the
documentation workbook needs beyond what other features already sync.

All read-only, configuration only (the same at every privacy level), each
part on its own: a part that fails is noted and the rest still load. Stored
with the sync job (sync_metadata["org_docs"]). Objects and fields checked
in the v68 Object Reference and Tooling API guide:

  validation_rules      Tooling ValidationRule (list), then
                        Metadata.errorConditionFormula one rule per query
                        (Metadata needs a one-record result), at most
                        MAX_VALIDATION_FORMULAS per sync
  record_type_picklists REST /sobjects/{obj}/describe/layouts/:
                        recordTypeMappings[].picklistsForRecordType, for
                        objects with record types (UNVERIFIED: whether record
                        types unavailable to the integration user are mapped)
  tab_settings          PermissionSetTabSetting (DefaultOn / DefaultOff;
                        profiles through their own permission set)
  visualforce           ApexPage, ApexComponent
  static_resources      StaticResource (no body)
  lightning_components  Tooling AuraDefinitionBundle, LightningComponentBundle
                        (inventory; no source)
  custom_permissions    CustomPermission
  apps                  AppMenuItem of Type TabSet (who sees an app comes from
                        SetupEntityAccess TabSet, read with the rest of
                        SetupEntityAccess in ui_access)
  approval_processes    ProcessDefinition of Type Approval (inventory)
  approval_steps        ProcessNode: each process's steps by name (item 11c).
                        Entry criteria and approvers need the Metadata API,
                        UNVERIFIED with our permissions, so they aren't read;
                        step order isn't a documented field (UNVERIFIED)
  external_data_sources ExternalDataSource: name, label, type (no endpoint);
                        who can use each comes from SetupEntityAccess
                        ExternalDataSource in ui_access (item 11c)
  apex_classes          ApexClass: API version, status, size, and the sharing
                        keyword of the class declaration; the Body is read
                        to find that keyword and never stored
  apex_triggers         ApexTrigger: object, events, status, API version
  coverage              per class and trigger, from the code coverage read
                        (client.get_code_coverage, roadmap item 4)
  web_links             WebLink (buttons and links)
  list_views            ListView
  field_sets            Tooling FieldSet (the object it belongs to isn't a
                        documented column, so it isn't shown)
  custom_fields         Tooling CustomField: id -> Object.Field__c (item 13)
  dependencies          Tooling MetadataComponentDependency (Beta), rows whose
                        RefMetadataComponentType is CustomField: what uses
                        each custom field. One query, at most 2,000 rows
                        (more needs Bulk API 2.0, not used); reports aren't
                        in Tooling results (item 13)
  apex_field_tokens     the custom field and object API names (…__c) each
                        Apex class and trigger body mentions; the body itself
                        is never kept (item 13)
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)

MAX_VALIDATION_FORMULAS = 300
MAX_LAYOUT_DESCRIBES = 40
MAX_LIST_VIEWS = 5000
TRIGGER_EVENTS = (("UsageBeforeInsert", "before insert"), ("UsageAfterInsert", "after insert"),
                  ("UsageBeforeUpdate", "before update"), ("UsageAfterUpdate", "after update"),
                  ("UsageBeforeDelete", "before delete"), ("UsageAfterDelete", "after delete"),
                  ("UsageAfterUndelete", "after undelete"))
_SHARING = re.compile(r"\b(with|without|inherited)\s+sharing\b", re.I)
_CLASS = re.compile(r"\bclass\b", re.I)
_CUSTOM_NAME = re.compile(r"\b[A-Za-z][A-Za-z0-9_]*__c\b")
MAX_TOKENS = 500
MAX_DEPENDENCIES = 2000
_COMMENTS = re.compile(r"/\*.*?\*/|//[^\n]*", re.S)


def sharing_of(body: Optional[str]) -> Optional[str]:
    """The sharing keyword on the outer class declaration: "with sharing",
    "without sharing", "inherited sharing", "not declared", or None when the
    body wasn't readable. Only this is kept, never the body."""
    if not isinstance(body, str):
        return None
    code = _COMMENTS.sub(" ", body)
    m = _CLASS.search(code)
    head = code[:m.start()] if m else code[:500]
    s = _SHARING.search(head)
    return f"{s.group(1).lower()} sharing" if s else "not declared"


def field_tokens(body: Optional[str]) -> List[str]:
    """Custom field and object API names a class or trigger mentions, outside
    comments; the names only, never the code."""
    if not body:
        return []
    return sorted({m.group(0) for m in _CUSTOM_NAME.finditer(_COMMENTS.sub(" ", body))})[:MAX_TOKENS]


def _name(r: Dict[str, Any]) -> str:
    ns = r.get("NamespacePrefix")
    return f"{ns}__{r.get('DeveloperName') or r.get('Name')}" if ns else (r.get("DeveloperName") or r.get("Name") or "")


async def collect_live(client: Any, record_type_objects: Iterable[str] = ()) -> Dict[str, Any]:
    """Build org_docs from a live org (read-only queries)."""
    out: Dict[str, Any] = {"notes": []}
    names: Dict[str, str] = {}

    def obj(v: Optional[str]) -> Optional[str]:
        return names.get((v or "")[:15], v) if v else v

    async def part(key: str, fn, note: str) -> Any:
        try:
            return await fn()
        except Exception as e:  # noqa: BLE001
            logger.info("org_docs %s failed: %s", key, e)
            out["notes"].append(note)
            return None

    soql, tooling = client.query_all, client.query_tooling
    # Tooling gives custom objects by id in TableEnumOrId; map them to API names.
    custom = await part("custom objects", lambda: tooling("SELECT Id, DeveloperName, NamespacePrefix FROM CustomObject"),
                        "") or []
    names.update({c["Id"][:15]: (f"{c['NamespacePrefix']}__" if c.get("NamespacePrefix") else "") + f"{c['DeveloperName']}__c"
                  for c in custom if c.get("Id")})

    rules = await part("validation rules", lambda: tooling(
        "SELECT Id, ValidationName, Active, Description, ErrorDisplayField, ErrorMessage, "
        "EntityDefinition.QualifiedApiName FROM ValidationRule"), "Validation rules couldn't be read.")
    if rules is not None:
        out["validation_rules"] = []
        for i, r in enumerate(rules):
            formula = None
            if i < MAX_VALIDATION_FORMULAS:
                rows = await part("validation formula", lambda rid=r["Id"]: tooling(
                    f"SELECT Metadata FROM ValidationRule WHERE Id = '{rid}'"), "")
                formula = (((rows or [{}])[0] or {}).get("Metadata") or {}).get("errorConditionFormula")
            out["validation_rules"].append({
                "id": r["Id"], "object": ((r.get("EntityDefinition") or {}).get("QualifiedApiName")),
                "name": r.get("ValidationName"), "active": bool(r.get("Active")), "description": r.get("Description"),
                "error_message": r.get("ErrorMessage"), "error_field": r.get("ErrorDisplayField"), "formula": formula})
        if len(rules) > MAX_VALIDATION_FORMULAS:
            out["notes"].append(f"Validation rule formulas were read for the first {MAX_VALIDATION_FORMULAS} of "
                                f"{len(rules)} rules (one query per rule); the rest show without a formula.")

    rt_picklists: Dict[str, Dict[str, Dict[str, List[str]]]] = {}
    for o in sorted(set(record_type_objects))[:MAX_LAYOUT_DESCRIBES]:
        d = await part("describe layouts", lambda o=o: client.describe_layouts(o), "")
        for m in (d or {}).get("recordTypeMappings") or []:
            rt = rt_picklists.setdefault(o, {}).setdefault(m.get("name") or m.get("recordTypeId") or "", {})
            for p in m.get("picklistsForRecordType") or []:
                rt[p.get("picklistName")] = [v.get("value") for v in p.get("picklistValues") or [] if v.get("value") is not None]
    out["record_type_picklists"] = rt_picklists

    tabs = await part("tab settings", lambda: soql("SELECT ParentId, Name, Visibility FROM PermissionSetTabSetting"),
                      "Tab settings couldn't be read.")
    if tabs is not None:
        out["tab_settings"] = [{"parent_id": t["ParentId"], "tab": t.get("Name"), "visibility": t.get("Visibility")} for t in tabs]

    pages = await part("visualforce pages", lambda: soql(
        "SELECT Id, Name, MasterLabel, NamespacePrefix, ApiVersion, Description FROM ApexPage"),
        "Visualforce pages couldn't be read.")
    comps = await part("visualforce components", lambda: soql(
        "SELECT Id, Name, MasterLabel, NamespacePrefix, ApiVersion, Description FROM ApexComponent"),
        "Visualforce components couldn't be read.")
    out["visualforce"] = (
        [{"id": p["Id"], "kind": "Page", "name": _name(p), "label": p.get("MasterLabel"), "api_version": p.get("ApiVersion"),
          "namespace": p.get("NamespacePrefix"), "description": p.get("Description")} for p in pages or []]
        + [{"id": c["Id"], "kind": "Component", "name": _name(c), "label": c.get("MasterLabel"),
            "api_version": c.get("ApiVersion"), "namespace": c.get("NamespacePrefix"), "description": c.get("Description")}
           for c in comps or []])

    res = await part("static resources", lambda: soql(
        "SELECT Id, Name, NamespacePrefix, ContentType, BodyLength, CacheControl, Description FROM StaticResource"),
        "Static resources couldn't be read.")
    if res is not None:
        out["static_resources"] = [{"name": _name(r), "namespace": r.get("NamespacePrefix"), "content_type": r.get("ContentType"),
                                    "size": r.get("BodyLength"), "cache_control": r.get("CacheControl"),
                                    "description": r.get("Description")} for r in res]

    aura = await part("aura", lambda: tooling(
        "SELECT Id, DeveloperName, MasterLabel, NamespacePrefix, ApiVersion, Description FROM AuraDefinitionBundle"),
        "Aura components couldn't be read.")
    lwc = await part("lwc", lambda: tooling(
        "SELECT Id, DeveloperName, MasterLabel, NamespacePrefix, ApiVersion, IsExposed, Description FROM LightningComponentBundle"),
        "Lightning web components couldn't be read.")
    out["lightning_components"] = (
        [{"kind": "Aura", "name": _name(a), "label": a.get("MasterLabel"), "api_version": a.get("ApiVersion"),
          "namespace": a.get("NamespacePrefix"), "exposed": None, "description": a.get("Description")} for a in aura or []]
        + [{"kind": "Lightning web component", "name": _name(c), "label": c.get("MasterLabel"),
            "api_version": c.get("ApiVersion"), "namespace": c.get("NamespacePrefix"), "exposed": c.get("IsExposed"),
            "description": c.get("Description")} for c in lwc or []])

    perms = await part("custom permissions", lambda: soql(
        "SELECT Id, DeveloperName, MasterLabel, NamespacePrefix, Description FROM CustomPermission"),
        "Custom permissions couldn't be read.")
    if perms is not None:
        out["custom_permissions"] = [{"id": p["Id"], "name": _name(p), "label": p.get("MasterLabel"),
                                      "namespace": p.get("NamespacePrefix"), "description": p.get("Description")} for p in perms]

    apps = await part("apps", lambda: soql(
        "SELECT ApplicationId, Name, Label, NamespacePrefix, Description FROM AppMenuItem WHERE Type = 'TabSet'"),
        "Apps couldn't be read.")
    if apps is not None:
        out["apps"] = [{"id": a.get("ApplicationId"), "name": _name(a), "label": a.get("Label"),
                        "namespace": a.get("NamespacePrefix"), "description": a.get("Description")} for a in apps]

    procs = await part("approval processes", lambda: soql(
        "SELECT Id, Name, DeveloperName, TableEnumOrId, State, LockType, Description FROM ProcessDefinition "
        "WHERE Type = 'Approval'"), "Approval processes couldn't be read.")
    if procs is not None:
        out["approval_processes"] = [{"name": p.get("Name"), "api_name": p.get("DeveloperName"), "object": obj(p.get("TableEnumOrId")),
                                      "state": p.get("State"), "lock_type": p.get("LockType"),
                                      "description": p.get("Description")} for p in procs]
        process_of = {(p.get("Id") or "")[:15]: p.get("DeveloperName") for p in procs}
        steps = await part("approval steps", lambda: soql(
            "SELECT Id, Name, DeveloperName, ProcessDefinitionId, Description FROM ProcessNode"),
            "Approval process steps couldn't be read.")
        if steps is not None:
            out["approval_steps"] = [{"process": process_of.get((s.get("ProcessDefinitionId") or "")[:15]),
                                      "name": s.get("Name"), "api_name": s.get("DeveloperName"),
                                      "description": s.get("Description")}
                                     for s in steps if (s.get("ProcessDefinitionId") or "")[:15] in process_of]

    sources = await part("external data sources", lambda: soql(
        "SELECT Id, DeveloperName, MasterLabel, NamespacePrefix, Type FROM ExternalDataSource"),
        "External data sources couldn't be read.")
    if sources is not None:
        out["external_data_sources"] = [{"id": x["Id"], "name": _name(x), "label": x.get("MasterLabel"),
                                         "namespace": x.get("NamespacePrefix"), "type": x.get("Type")} for x in sources]

    classes = await part("apex classes", lambda: tooling(
        "SELECT Id, Name, NamespacePrefix, ApiVersion, Status, IsValid, LengthWithoutComments, Body FROM ApexClass"),
        "Apex class details couldn't be read.")
    tokens: Dict[str, List[str]] = {}
    if classes is not None:
        tokens.update({c.get("Name") or c["Id"]: field_tokens(c.get("Body")) for c in classes})
        out["apex_classes"] = [{"id": c["Id"], "name": c.get("Name"), "namespace": c.get("NamespacePrefix"),
                                "api_version": c.get("ApiVersion"), "status": c.get("Status"), "valid": c.get("IsValid"),
                                "length": c.get("LengthWithoutComments"), "sharing": sharing_of(c.get("Body"))}
                               for c in classes]
    triggers = await part("apex triggers", lambda: tooling(
        "SELECT Id, Name, NamespacePrefix, TableEnumOrId, ApiVersion, Status, IsValid, Body, "
        + ", ".join(f for f, _ in TRIGGER_EVENTS) + " FROM ApexTrigger"), "Apex triggers couldn't be read.")
    if triggers is not None:
        tokens.update({t.get("Name") or t["Id"]: field_tokens(t.get("Body")) for t in triggers})
        out["apex_triggers"] = [{"id": t["Id"], "name": t.get("Name"), "namespace": t.get("NamespacePrefix"),
                                 "object": obj(t.get("TableEnumOrId")), "api_version": t.get("ApiVersion"),
                                 "status": t.get("Status"), "valid": t.get("IsValid"),
                                 "events": [label for f, label in TRIGGER_EVENTS if t.get(f)]} for t in triggers]
    cov = await part("coverage", lambda: client.get_code_coverage(), "Code coverage couldn't be read.")
    if cov is not None:
        out["coverage"] = [{"name": i.get("name"), "type": i.get("type"), "covered": i.get("covered"),
                            "uncovered": i.get("uncovered"), "is_test": i.get("is_test")} for i in cov.get("items") or []]

    links = await part("buttons and links", lambda: soql(
        "SELECT Id, Name, MasterLabel, PageOrSobjectType, LinkType, DisplayType, OpenType, NamespacePrefix FROM WebLink"),
        "Buttons and links couldn't be read.")
    if links is not None:
        out["web_links"] = [{"object": w.get("PageOrSobjectType"), "name": _name(w), "label": w.get("MasterLabel"),
                             "link_type": w.get("LinkType"), "display_type": w.get("DisplayType"), "open_type": w.get("OpenType")}
                            for w in links]
    views = await part("list views", lambda: soql(
        "SELECT Id, DeveloperName, Name, SobjectType, NamespacePrefix FROM ListView"), "List views couldn't be read.")
    if views is not None:
        out["list_views"] = [{"object": v.get("SobjectType"), "name": v.get("Name"), "api_name": _name(v)}
                             for v in views[:MAX_LIST_VIEWS]]
        if len(views) > MAX_LIST_VIEWS:
            out["notes"].append(f"Only the first {MAX_LIST_VIEWS} of {len(views)} list views are listed.")
    sets = await part("field sets", lambda: tooling(
        "SELECT Id, DeveloperName, MasterLabel, NamespacePrefix, Description FROM FieldSet"), "Field sets couldn't be read.")
    if sets is not None:
        out["field_sets"] = [{"name": _name(s), "label": s.get("MasterLabel"), "description": s.get("Description")} for s in sets]

    if classes is not None or triggers is not None:
        out["apex_field_tokens"] = {k: v for k, v in tokens.items() if v}

    # What uses each custom field (item 13): field ids, then the dependency index.
    fields = await part("custom fields", lambda: tooling(
        "SELECT Id, DeveloperName, NamespacePrefix, TableEnumOrId FROM CustomField"), "Custom field ids couldn't be read.")
    if fields is not None:
        out["custom_fields"] = {
            f["Id"][:15]: f"{obj(f.get('TableEnumOrId'))}."
                          + (f"{f['NamespacePrefix']}__" if f.get("NamespacePrefix") else "") + f"{f['DeveloperName']}__c"
            for f in fields if f.get("Id") and f.get("DeveloperName")}
    deps = await part("dependencies", lambda: tooling(
        "SELECT MetadataComponentId, MetadataComponentName, MetadataComponentType, RefMetadataComponentId, "
        "RefMetadataComponentName FROM MetadataComponentDependency WHERE RefMetadataComponentType = 'CustomField'"),
        "The dependency index (MetadataComponentDependency) couldn't be read.")
    if deps is not None:
        field_of = out.get("custom_fields") or {}
        out["dependencies"] = [{
            "component_type": d.get("MetadataComponentType"), "component": d.get("MetadataComponentName"),
            "component_id": d.get("MetadataComponentId"),
            "field": field_of.get((d.get("RefMetadataComponentId") or "")[:15]), "field_name": d.get("RefMetadataComponentName"),
        } for d in deps[:MAX_DEPENDENCIES]]
        out["dependencies_truncated"] = len(deps) >= MAX_DEPENDENCIES
        if out["dependencies_truncated"]:
            out["notes"].append(f"The dependency index returned its {MAX_DEPENDENCIES:,}-row limit; more would need "
                                "Bulk API 2.0, which Newton doesn't use. Cleanup impact says so for every field.")

    out["notes"] = [n for n in out["notes"] if n]
    return out


async def latest_org_docs(db: Any, org_id: str) -> Optional[Dict[str, Any]]:
    """The newest completed sync's org_docs, or None."""
    from sqlalchemy import desc, select
    from app.domain.models import SyncJob, SyncStatus
    jobs = (await db.execute(
        select(SyncJob).where(SyncJob.organization_id == org_id, SyncJob.status == SyncStatus.COMPLETED)
        .order_by(desc(SyncJob.completed_at)).limit(5)
    )).scalars().all()
    for j in jobs:
        docs = (j.sync_metadata or {}).get("org_docs")
        if docs:
            return docs
    return None
