"""Field metadata (roadmap item 8): what each field is, for the Schema pages
and everything built on them (ERDs, the documentation export, impact
analysis, comparison).

Two reads per object, both read-only:

1. The REST describe (`GET /sobjects/{name}/describe`): the object's label,
   whether it's custom, its key prefix and child relationships (with
   cascadeDelete); per field, type, length, precision and scale, required,
   formula (calculated and calculatedFormula), references (referenceTo,
   relationshipName; relationshipOrder 0 or 1 marks master-detail), external
   id, unique, picklist values, and encryption: **Shield** when describe
   returns `encrypted: true` (only returned when true), **Classic** when the
   type is `encryptedstring`. SOAP API Developer Guide and Object Reference,
   v68. The describe "contains only the fields that the user can view, as
   defined by the user's field-level security settings" (SOAP API guide,
   Field), and the recommended integration user has no field access, so:
2. Tooling API FieldDefinition, which "has parity with metadata type Field"
   (Tooling API guide), for every field the describe left out: label,
   DataType (as Setup shows it, e.g. "Text(40)"), length, precision, scale,
   calculated, referenceTo and relationshipName. It has no encryption,
   formula text or picklist values, so those stay unknown (null) for such
   fields, never "none". FieldDefinition allows only equality filters (no
   IN or OR), so it's one query per object. UNVERIFIED: that FieldDefinition
   lists fields hidden from the integration user by field-level security,
   and the JSON shape of ReferenceTo (RelationshipReferenceTo); check in a
   developer org before relying on them.

Configuration only, the same at every privacy level. Stored with the sync
job (sync_metadata["schema"]); a failure never fails the sync. Objects are
those the org's permissions mention, read a few at a time, at most
MAX_OBJECTS per sync (two API calls each). Every object is read on every
sync: there's no documented signal that a standard object's fields changed
(EntityDefinition has no LastModifiedDate), so caching between syncs is left
out (UNVERIFIED alternative: CustomObject.LastModifiedDate for custom
objects).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)

MAX_OBJECTS = 500
CONCURRENCY = 6
FIELD_KEYS = ("name", "label", "type", "length", "precision", "scale", "calculatedFormula", "relationshipName",
              "relationshipOrder", "inlineHelpText")
FIELD_DEFINITION_SOQL = (
    "SELECT QualifiedApiName, Label, DataType, Length, Precision, Scale, IsCalculated, IsFlsEnabled, "
    "ReferenceTo, RelationshipName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '{name}'"
)


def encryption_of(field: Dict[str, Any]) -> Optional[str]:
    """"shield", "classic" or None."""
    if field.get("encrypted") is True:
        return "shield"
    if (field.get("type") or "").lower() == "encryptedstring":
        return "classic"
    return None


def normalize_field(f: Dict[str, Any]) -> Dict[str, Any]:
    """One describe field, as Newton keeps it."""
    out: Dict[str, Any] = {k: f.get(k) for k in FIELD_KEYS if f.get(k) is not None}
    out["custom"] = bool(f.get("custom"))
    out["formula"] = bool(f.get("calculated"))
    if f.get("permissionable") is not None:
        # Whether field-level security can be set; when not, access follows the object.
        out["permissionable"] = bool(f["permissionable"])
    # Required on create: not nillable, created by the user, no default.
    out["required"] = (f.get("nillable") is False and f.get("createable") is not False
                       and not f.get("defaultedOnCreate"))
    refs = [r for r in (f.get("referenceTo") or []) if r]
    if refs:
        out["referenceTo"] = refs
        out["relationship"] = "master_detail" if f.get("relationshipOrder") in (0, 1) else "lookup"
    if f.get("externalId"):
        out["externalId"] = True
    if f.get("unique"):
        out["unique"] = True
    enc = encryption_of(f)
    if enc:
        out["encryption"] = enc
    values = f.get("picklistValues") or []
    if values:
        out["picklistValues"] = [
            {"value": v.get("value"), "label": v.get("label"), "active": v.get("active", True),
             **({"default": True} if v.get("defaultValue") else {})}
            for v in values if v.get("value") is not None
        ]
    return out


def _references(value: Any) -> List[str]:
    """FieldDefinition.ReferenceTo: a RelationshipReferenceTo; read as a list
    or as {"referenceTo": [...]} (shape UNVERIFIED)."""
    if isinstance(value, dict):
        value = value.get("referenceTo")
    if isinstance(value, str):
        value = [value]
    return [r for r in (value or []) if isinstance(r, str) and r]


def normalize_field_definition(row: Dict[str, Any]) -> Dict[str, Any]:
    """A FieldDefinition row for a field the describe didn't return. What it
    can't say (encryption, formula text, required, picklist values) is left
    out and flagged, never guessed."""
    name = row.get("QualifiedApiName") or ""
    ui_type = row.get("DataType") or ""
    out: Dict[str, Any] = {"name": name, "label": row.get("Label"), "uiType": ui_type or None,
                           "custom": name.endswith("__c"), "formula": bool(row.get("IsCalculated")),
                           "source": "field_definition"}
    if row.get("IsFlsEnabled") is not None:
        out["permissionable"] = bool(row["IsFlsEnabled"])
    for src, key in (("Length", "length"), ("Precision", "precision"), ("Scale", "scale"),
                     ("RelationshipName", "relationshipName")):
        if row.get(src) not in (None, 0, ""):
            out[key] = row[src]
    refs = _references(row.get("ReferenceTo"))
    if refs:
        out["referenceTo"] = refs
        # DataType is Setup's wording ("Master-Detail(Invoice)"); UNVERIFIED beyond the documented "Text(40)".
        out["relationship"] = "master_detail" if ui_type.lower().startswith("master-detail") else "lookup"
    return out


def normalize_object(d: Dict[str, Any]) -> Dict[str, Any]:
    """One describe result, as Newton keeps it."""
    fields = {f["name"]: normalize_field(f) for f in d.get("fields") or [] if f.get("name")}
    children = [
        {"childSObject": c.get("childSObject"), "field": c.get("field"), "relationshipName": c.get("relationshipName"),
         "cascadeDelete": bool(c.get("cascadeDelete"))}
        for c in d.get("childRelationships") or [] if c.get("childSObject") and c.get("field")
    ]
    return {
        "name": d.get("name"),
        "label": d.get("label"),
        "labelPlural": d.get("labelPlural"),
        "custom": bool(d.get("custom")),
        "keyPrefix": d.get("keyPrefix"),
        "fields": fields,
        "childRelationships": children,
    }


def assemble(name: str, describe: Optional[Dict[str, Any]],
             definitions: Optional[List[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    """One object from its describe and FieldDefinition rows (either may be
    missing). Fields the describe left out come from FieldDefinition."""
    if not describe and not definitions:
        return None
    obj = normalize_object(describe) if describe else {
        "name": name, "label": None, "labelPlural": None, "custom": name.endswith("__c"), "keyPrefix": None,
        "fields": {}, "childRelationships": [], "describe_failed": True,
    }
    hidden = 0
    for row in definitions or []:
        f = normalize_field_definition(row)
        if f["name"] and f["name"] not in obj["fields"]:
            obj["fields"][f["name"]] = f
            hidden += 1
    obj["fields_from_field_definition"] = hidden
    return obj


def from_describes(describes: Iterable[Dict[str, Any]],
                   field_definitions: Optional[Dict[str, List[Dict[str, Any]]]] = None) -> Dict[str, Dict[str, Any]]:
    by_name = {d["name"]: d for d in describes if d.get("name")}
    defs = field_definitions or {}
    out = {}
    for name in sorted(set(by_name) | set(defs)):
        obj = assemble(name, by_name.get(name), defs.get(name))
        if obj:
            out[name] = obj
    return out


def notes_for(objects: Dict[str, Dict[str, Any]], failed: List[str], skipped: List[str]) -> List[str]:
    notes = []
    if skipped:
        notes.append(f"{len(skipped)} objects weren't read: at most {MAX_OBJECTS} per sync.")
    if failed:
        notes.append(f"{len(failed)} objects couldn't be read: {', '.join(sorted(failed)[:20])}"
                     + ("…" if len(failed) > 20 else "") + ".")
    partial = sorted(n for n, o in objects.items() if o.get("describe_failed"))
    if partial:
        notes.append(f"{len(partial)} objects couldn't be described ({', '.join(partial[:20])}): their fields come "
                     "from FieldDefinition, without the object's label, encryption, formulas or picklist values.")
    hidden = sum(o.get("fields_from_field_definition", 0) for o in objects.values() if not o.get("describe_failed"))
    if hidden:
        notes.append(f"{hidden} fields aren't visible to the integration user (field-level security), so the "
                     "describe left them out: their type comes from FieldDefinition; encryption, formula text and "
                     "picklist values aren't known for them.")
    return notes


def objects_in(data: Dict[str, Any]) -> List[str]:
    """Objects the synced object and field permissions mention."""
    names = {r.get("SobjectType") for r in data.get("object_permissions") or []}
    names |= {r.get("SobjectType") or (r.get("Field") or "").split(".")[0] for r in data.get("field_permissions") or []}
    return sorted(n for n in names if n)


async def collect_live(client: Any, object_names: Iterable[str]) -> Dict[str, Any]:
    """Describe each object and read its FieldDefinition rows (read-only).
    Objects neither read returns are listed, not fatal."""
    names = sorted({n for n in object_names if n})
    skipped = names[MAX_OBJECTS:]
    names = names[:MAX_OBJECTS]
    sem = asyncio.Semaphore(CONCURRENCY)
    objects: Dict[str, Dict[str, Any]] = {}
    failed: List[str] = []

    async def one(name: str) -> None:
        async with sem:
            describe = definitions = None
            try:
                describe = await client.describe_object(name)
            except Exception as e:  # noqa: BLE001
                logger.info("describe %s failed: %s", name, e)
            if "'" not in name:  # API names never contain quotes; never build a query from one that does
                try:
                    definitions = await client.query_tooling(FIELD_DEFINITION_SOQL.format(name=name))
                except Exception as e:  # noqa: BLE001
                    logger.info("FieldDefinition for %s failed: %s", name, e)
            obj = assemble(name, describe, definitions)
            if obj:
                objects[name] = obj
            else:
                failed.append(name)

    await asyncio.gather(*(one(n) for n in names))
    objects = dict(sorted(objects.items()))
    return {"objects": objects, "failed": sorted(failed), "skipped": skipped,
            "notes": notes_for(objects, failed, skipped)}


TYPE_LABELS = {
    "string": "Text", "textarea": "Text Area", "picklist": "Picklist", "multipicklist": "Multi-Select Picklist",
    "currency": "Currency", "double": "Number", "int": "Number", "long": "Number", "percent": "Percent",
    "date": "Date", "datetime": "Date/Time", "time": "Time", "email": "Email", "phone": "Phone", "url": "URL",
    "boolean": "Checkbox", "id": "ID", "encryptedstring": "Text (Encrypted)", "location": "Geolocation",
    "address": "Address",
}


def type_label(f: Dict[str, Any]) -> str:
    """The field's type in Setup's words, e.g. "Text(80)", "Master-Detail(Invoice__c)",
    "Formula (Currency)". FieldDefinition's DataType is already in those words;
    unknown describe types are shown as returned."""
    if f.get("source") == "field_definition":
        return f.get("uiType") or ""
    t = f.get("type") or ""
    if t == "reference":
        kind = "Master-Detail" if f.get("relationship") == "master_detail" else "Lookup"
        return f"{kind}({', '.join(f.get('referenceTo') or [])})"
    base = TYPE_LABELS.get(t, t)
    if f.get("formula"):
        return f"Formula ({base})"
    if t in ("string", "encryptedstring") and f.get("length"):
        return f"{base}({f['length']})"
    return base


def encryption_known(f: Dict[str, Any]) -> bool:
    return f.get("source") != "field_definition"


def field_payload(f: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """What the Schema API returns for a field: null when not known, never a guess."""
    if not f:
        return {"dataType": None, "typeLabel": None, "isEncrypted": None, "encryption": None}
    known = encryption_known(f)
    return {
        "dataType": f.get("type"),
        "typeLabel": type_label(f),
        "isEncrypted": bool(f.get("encryption")) if known else None,
        "encryption": f.get("encryption"),
    }


def field_details(f: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Every synced attribute, for the field page. `fromFieldDefinition` marks
    a field the describe didn't return: its encryption, formula text,
    required flag and picklist values are unknown."""
    if not f:
        return None
    keep = ("label", "type", "length", "precision", "scale", "required", "formula", "calculatedFormula", "referenceTo",
            "relationship", "relationshipName", "externalId", "unique", "encryption", "picklistValues",
            "inlineHelpText", "custom", "permissionable")
    return {**{k: f[k] for k in keep if k in f}, "typeLabel": type_label(f),
            "fromFieldDefinition": not encryption_known(f)}


def field(schema: Optional[Dict[str, Any]], object_name: str, field_name: str) -> Optional[Dict[str, Any]]:
    if not schema:
        return None
    return ((schema.get("objects") or {}).get(object_name) or {}).get("fields", {}).get(field_name)


def relationships(schema: Optional[Dict[str, Any]], object_name: str) -> Dict[str, List[Dict[str, Any]]]:
    """Parents (this object's lookup and master-detail fields) and children
    (synced objects' fields pointing here). A child's kind comes from its own
    field; cascadeDelete (deleted with this record) from this object's
    describe, when it has one."""
    objects = (schema or {}).get("objects") or {}
    obj = objects.get(object_name) or {}
    parents = [
        {"field": name, "label": f.get("label"), "to": f["referenceTo"], "kind": f.get("relationship"),
         "required": f.get("required", False)}
        for name, f in sorted(obj.get("fields", {}).items()) if f.get("referenceTo")
    ]
    cascade = {(c["childSObject"], c["field"]): c for c in obj.get("childRelationships", [])}
    children = []
    for child_name, child in objects.items():
        for fname, f in child.get("fields", {}).items():
            if object_name in (f.get("referenceTo") or []):
                c = cascade.get((child_name, fname), {})
                children.append({"object": child_name, "field": fname,
                                 "relationshipName": c.get("relationshipName"), "kind": f.get("relationship"),
                                 "cascadeDelete": c.get("cascadeDelete", False)})
    return {"parents": parents, "children": sorted(children, key=lambda c: (c["object"], c["field"]))}


async def latest_schema(db: Any, org_id: str) -> Optional[Dict[str, Any]]:
    """The newest completed sync's field metadata, or None when none has it."""
    from sqlalchemy import desc, select
    from app.domain.models import SyncJob, SyncStatus
    jobs = (await db.execute(
        select(SyncJob).where(SyncJob.organization_id == org_id, SyncJob.status == SyncStatus.COMPLETED)
        .order_by(desc(SyncJob.completed_at)).limit(5)
    )).scalars().all()
    for j in jobs:
        schema = (j.sync_metadata or {}).get("schema")
        if schema:
            return schema
    return None
