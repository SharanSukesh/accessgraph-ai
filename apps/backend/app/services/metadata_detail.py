"""What the documentation workbook reads out of Salesforce metadata (roadmap
item 11, part c). Pure functions over the Tooling API's `Metadata` field,
which follows the Metadata API types (field names checked in the Metadata
API Developer Guide, v68):

  flow_detail(Flow.Metadata)
      element counts (variables, decisions, record operations, screens,
      subflows, waits...), the start (object and trigger), and the objects
      and fields each record element reads or writes. Parity row #9.
  layout_fields(Layout.Metadata)
      the fields placed on a page layout and how (Edit, Required,
      Readonly). Parity row #4.
  set_record_types(PermissionSet.Metadata)
      record types a permission set makes available. Parity row #11.
      UNVERIFIED read path: PermissionSet isn't confirmed as a Tooling API
      object with a Metadata field; the read stops at the first failure.

Nothing here calls Salesforce.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

# Flow element lists, in the order the workbook shows them, with their labels.
FLOW_ELEMENTS = (
    ("variables", "Variables"), ("formulas", "Formulas"), ("constants", "Constants"),
    ("textTemplates", "Text templates"), ("choices", "Choices"), ("dynamicChoiceSets", "Choice sets"),
    ("screens", "Screens"), ("decisions", "Decisions"), ("assignments", "Assignments"), ("loops", "Loops"),
    ("recordLookups", "Get records"), ("recordCreates", "Create records"), ("recordUpdates", "Update records"),
    ("recordDeletes", "Delete records"), ("recordRollbacks", "Roll back records"),
    ("collectionProcessors", "Collection processors"), ("transforms", "Transforms"),
    ("subflows", "Subflows"), ("actionCalls", "Actions"), ("apexPluginCalls", "Apex plug-ins"),
    ("waits", "Waits"), ("customErrors", "Custom errors"), ("orchestratedStages", "Stages"),
)
OPERATIONS = (("recordLookups", "Read"), ("recordCreates", "Create"), ("recordUpdates", "Update"),
              ("recordDeletes", "Delete"))
LAYOUT_BEHAVIORS = ("Required", "Edit", "Readonly")


def _list(v: Any) -> List[Any]:
    """Metadata lists come back as a list, a single object, or null."""
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def _fields_of(rows: Iterable[Any], key: str = "field") -> List[str]:
    return [r[key] for r in rows if isinstance(r, dict) and r.get(key)]


def flow_detail(md: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Element counts, start, record operations, subflows and actions of one flow version."""
    if not isinstance(md, dict):
        return None
    raw_start = md.get("start")
    start: Dict[str, Any] = raw_start if isinstance(raw_start, dict) else {}
    start_object = start.get("object")
    counts = {key: len(_list(md.get(key))) for key, _ in FLOW_ELEMENTS}
    operations: List[Dict[str, Any]] = []
    for key, op in OPERATIONS:
        for el in _list(md.get(key)):
            if not isinstance(el, dict):
                continue
            obj = el.get("object")
            ref = el.get("inputReference")
            if not obj and ref == "$Record":
                obj = start_object  # a record-triggered flow updating the record that started it
            fields: List[str] = []
            if key == "recordLookups":
                fields += [f for f in _list(el.get("queriedFields")) if isinstance(f, str)]
                fields += _fields_of(_list(el.get("outputAssignments")))
            else:
                fields += _fields_of(_list(el.get("inputAssignments")))
            filters = _fields_of(_list(el.get("filters")))
            operations.append({
                "element": el.get("label") or el.get("name"),
                "operation": op,
                "object": obj,
                # Writing a whole record variable: the object and fields are the variable's, not listed here.
                "from_variable": None if obj else ref,
                "fields": sorted(set(fields)),
                "filter_fields": sorted(set(filters)),
            })
    if start_object:
        trigger_filters = _fields_of(_list(start.get("filters")))
        if trigger_filters:
            operations.insert(0, {"element": "Start", "operation": "Trigger condition", "object": start_object,
                                  "from_variable": None, "fields": [], "filter_fields": sorted(set(trigger_filters))})
    return {
        "elements": {k: n for k, n in counts.items() if n},
        "start_object": start_object,
        "record_trigger": start.get("recordTriggerType"),
        "operations": operations,
        "subflows": sorted({s.get("flowName") for s in _list(md.get("subflows")) if isinstance(s, dict) and s.get("flowName")}),
        "actions": [{"name": a.get("actionName"), "type": a.get("actionType")} for a in _list(md.get("actionCalls"))
                    if isinstance(a, dict) and a.get("actionName")],
    }


def layout_fields(md: Optional[Dict[str, Any]]) -> Optional[List[Dict[str, Any]]]:
    """[{field, behavior, section}] for every field placed on the layout."""
    if not isinstance(md, dict):
        return None
    out: List[Dict[str, Any]] = []
    seen = set()
    for section in _list(md.get("layoutSections")):
        if not isinstance(section, dict):
            continue
        label = section.get("label")
        for column in _list(section.get("layoutColumns")):
            for item in _list((column or {}).get("layoutItems")):
                if not isinstance(item, dict) or not item.get("field") or item["field"] in seen:
                    continue
                seen.add(item["field"])
                behavior = item.get("behavior")
                out.append({"field": item["field"], "behavior": behavior if behavior in LAYOUT_BEHAVIORS else behavior or None,
                            "section": label})
    return out


def set_record_types(md: Optional[Dict[str, Any]]) -> Optional[Dict[str, List[str]]]:
    """Object -> record types ("Object.DeveloperName") the set makes available."""
    if not isinstance(md, dict):
        return None
    out: Dict[str, List[str]] = {}
    for v in _list(md.get("recordTypeVisibilities")):
        if isinstance(v, dict) and v.get("visible") and v.get("recordType"):
            out.setdefault(v["recordType"].split(".")[0], []).append(v["recordType"])
    return {k: sorted(v) for k, v in out.items()}
