"""Cleanup impact: can this field be deleted? (roadmap item 13; Config
Workbook parity rows #21 and #22.)

The answer is never "safe to delete". It is what was found, where Newton
looked, where it couldn't look, and how many records hold a value:

  references  Salesforce's dependency index (MetadataComponentDependency,
              Beta; reports aren't in Tooling results; at most 2,000 rows
              read) plus Newton's own scans of what the sync already read:
              validation rule formulas, formula fields, flows (the active
              version, and the latest version of inactive flows: what
              they'd use if reactivated), page layouts, and the custom
              field names each Apex class and trigger mentions.
  population  the latest Data Quality run's per-field counts (exact, or
              estimated on large objects), when the field was inspected.
  verdict     in use / referenced only by inactive things / no references
              but holds values / no references and no values (a strong
              cleanup candidate) / not measured, with a confidence level.

Nothing here calls Salesforce; it reads the latest sync (ui_access,
org_docs, schema) and Data Quality run.
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

NOT_CHECKABLE = [
    "Apex that builds field names at run time (dynamic SOQL, describe calls) and other string references.",
    "Integrations, ETL tools and other systems outside Salesforce that read or write the field.",
    "Reports and report types: Salesforce's dependency index leaves reports out of Tooling API results.",
    "Email templates, workflow field updates, list view columns and field set members: not read by Newton yet.",
]
LEVELS = {
    "in_use": ("In use", "Referenced in {n}. Change or remove those first; deleting the field breaks them."),
    "inactive_only": ("Referenced only by inactive configuration",
                      "Referenced only by inactive {what}. Remove those references (or the inactive items) first."),
    "unused_populated": ("No references found, but it holds values",
                         "No references found in the sources checked, but {pop}. Check with the data owner "
                         "whether the values are still needed."),
    "candidate": ("Strong cleanup candidate",
                  "No references found in the sources checked, and {pop}. Still confirm the places Newton can't "
                  "check (below) before deleting."),
    "unmeasured": ("No references found; population not measured",
                   "No references found in the sources checked. {pop}"),
    "standard": ("Standard field", "Standard fields can't be deleted. {refs}"),
}
ORDER = ["candidate", "unmeasured", "unused_populated", "inactive_only", "in_use", "standard"]
# The dependency index's MetadataComponentType, in the words the scans use.
KIND = {"ValidationRule": "Validation rule", "ApexClass": "Apex class", "ApexTrigger": "Apex trigger", "Flow": "Flow",
        "CustomField": "Formula field", "ApexPage": "Visualforce page", "ApexComponent": "Visualforce component",
        "Layout": "Page layout", "WorkflowRule": "Workflow rule", "WebLink": "Button or link",
        "EmailTemplate": "Email template", "FlexiPage": "Lightning page", "LightningComponentBundle": "Lightning component",
        "AuraDefinitionBundle": "Aura component", "FieldSet": "Field set", "ListView": "List view"}


def _norm(name: str) -> str:
    """Flow labels and API names, "Account.Rule" and "Rule", compare equal."""
    return re.sub(r"[^a-z0-9]", "", (name or "").split(".")[-1].lower())


def _token(field: str) -> re.Pattern:
    return re.compile(r"(?<![A-Za-z0-9_])" + re.escape(field) + r"(?![A-Za-z0-9_])", re.I)


class ImpactIndex:
    """References to every field, from one sync's configuration, built once."""

    def __init__(self, schema: Optional[Dict[str, Any]], ui: Optional[Dict[str, Any]],
                 docs: Optional[Dict[str, Any]], population: Optional[Dict[str, Dict[str, Any]]] = None):
        self.schema, self.ui, self.docs = schema, ui, docs
        self.objects: Dict[str, Dict[str, Any]] = (schema or {}).get("objects") or {}
        self.population = population or {}
        self.refs: Dict[Tuple[str, str], List[Dict[str, Any]]] = defaultdict(list)
        self._index()

    # ------------------------------------------------------------ sources
    def sources(self) -> List[Dict[str, Any]]:
        docs, ui = self.docs or {}, self.ui or {}
        deps = docs.get("dependencies")

        def row(name: str, read: bool, note: str = "") -> Dict[str, Any]:
            return {"source": name, "status": "checked" if read else "not read", "note": note}

        return [
            row("Salesforce dependency index", deps is not None,
                ("Read up to its 2,000-row limit: some references may be missing." if docs.get("dependencies_truncated")
                 else "MetadataComponentDependency (Beta); reports aren't included.") if deps is not None
                else "Not read: sync the org again, or the integration user couldn't query it."),
            row("Validation rules", docs.get("validation_rules") is not None,
                "Formulas read for the first 300 rules." if docs.get("validation_rules") is not None else ""),
            row("Formula fields", bool(self.objects), "From the synced field metadata."),
            row("Flows", ui.get("flow_details") is not None,
                "Active versions, and the latest version of inactive flows (first 150 flows)."),
            row("Page layouts", ui.get("layout_fields") is not None, "First 300 layouts."),
            row("Apex classes and triggers", docs.get("apex_field_tokens") is not None,
                "By the field's API name in the code; the object isn't resolved."),
        ]

    def _add(self, obj: str, field: str, ref: Dict[str, Any]) -> None:
        self.refs[(obj, field)].append(ref)

    def _index(self) -> None:
        docs, ui = self.docs or {}, self.ui or {}
        fields_by_name: Dict[str, List[str]] = defaultdict(list)  # Field__c -> objects that have it
        for obj, o in self.objects.items():
            for f in (o.get("fields") or {}):
                fields_by_name[f.lower()].append(obj)

        # Salesforce's dependency index.
        for d in docs.get("dependencies") or []:
            if d.get("field") and "." in d["field"]:
                obj, field = d["field"].split(".", 1)
                kind = KIND.get(d.get("component_type") or "", d.get("component_type") or "")
                self._add(obj, field, {"source": "Dependency index", "kind": kind,
                                       "name": d.get("component") or "", "active": None, "detail": ""})

        # Validation rules: the object's own fields, and other objects' fields through relationship paths.
        for r in docs.get("validation_rules") or []:
            formula = r.get("formula") or ""
            if not formula:
                continue
            for obj, f in self._mentioned(formula, r.get("object") or ""):
                self._add(obj, f, {"source": "Validation rule", "kind": "Validation rule",
                                   "name": f"{r.get('object')}.{r.get('name')}", "active": bool(r.get("active")),
                                   "detail": "checked in its formula"})

        # Formula fields.
        for obj, o in self.objects.items():
            for fname, f in (o.get("fields") or {}).items():
                formula = f.get("calculatedFormula")
                if not formula:
                    continue
                for tobj, tf in self._mentioned(formula, obj):
                    if (tobj, tf) != (obj, fname):
                        self._add(tobj, tf, {"source": "Formula field", "kind": "Formula field",
                                             "name": f"{obj}.{fname}", "active": True, "detail": "used in its formula"})

        # Flows: record elements and trigger conditions.
        active = {f["id"]: bool(f.get("active")) for f in ui.get("flows") or []}
        labels = {f["id"]: f.get("label") or f.get("api_name") for f in ui.get("flows") or []}
        for fid, d in (ui.get("flow_details") or {}).items():
            for op in d.get("operations") or []:
                obj = op.get("object")
                if not obj:
                    continue
                for fld in set(op.get("fields") or []) | set(op.get("filter_fields") or []):
                    use = ("condition" if fld in (op.get("filter_fields") or []) and fld not in (op.get("fields") or [])
                           else "written" if op["operation"] in ("Create", "Update") else "read")
                    self._add(obj, fld, {"source": "Flow", "kind": "Flow", "name": labels.get(fid, fid),
                                         "active": active.get(fid), "detail": f"{op.get('element')}: {use}"})

        # Page layouts.
        layouts = {lay["id"]: lay for lay in ui.get("layouts") or []}
        for lid, placed in (ui.get("layout_fields") or {}).items():
            lay = layouts.get(lid) or {}
            for item in placed or []:
                self._add(lay.get("object") or "", item["field"], {
                    "source": "Page layout", "kind": "Page layout", "name": lay.get("name") or lid, "active": None,
                    "detail": item.get("behavior") or ""})

        # Apex: by name only.
        for cls, tokens in (docs.get("apex_field_tokens") or {}).items():
            for t in tokens:
                for obj in fields_by_name.get(t.lower(), []):
                    self._add(obj, next(f for f in self.objects[obj]["fields"] if f.lower() == t.lower()), {
                        "source": "Apex", "kind": "Apex class", "name": cls, "active": None,
                        "detail": "mentions the name (object not resolved)"})

    def _mentioned(self, formula: str, home: str) -> List[Tuple[str, str]]:
        """(object, field) pairs a formula refers to: the home object's fields
        by name, and other objects' custom fields through a relationship path
        (Account__r.Old_Score__c, Account.Old_Score__c)."""
        out = []
        for fname in (self.objects.get(home) or {}).get("fields") or {}:
            if _token(fname).search(formula):
                out.append((home, fname))
        home_fields = (self.objects.get(home) or {}).get("fields") or {}
        for rel, fname in re.findall(r"\b([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z][A-Za-z0-9_]*__c)\b", formula):
            # Account__r.X: the lookup Account__c; Account.X: the standard lookup AccountId (or an object name).
            lookup = rel[:-3] + "__c" if rel.endswith("__r") else rel + "Id"
            refs = (home_fields.get(lookup) or {}).get("referenceTo") or []
            target = refs[0] if refs else (rel if rel in self.objects else None)
            if target and target != home and fname in ((self.objects.get(target) or {}).get("fields") or {}):
                out.append((target, fname))
        return out

    # ------------------------------------------------------------ one field
    def impact(self, obj: str, field: str) -> Dict[str, Any]:
        meta = ((self.objects.get(obj) or {}).get("fields") or {}).get(field) or {}
        custom = field.endswith("__c")
        # One row per place, whichever sources found it.
        merged: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for r in self.refs.get((obj, field), []):
            kind = "Apex class" if r["kind"] in ("Apex class", "Apex trigger") else r["kind"]
            cur = merged.setdefault((kind, _norm(r["name"])), {**r, "foundBy": [], "details": []})
            if r["source"] not in cur["foundBy"]:
                cur["foundBy"].append(r["source"])
            if r["detail"] and r["detail"] not in cur["details"]:
                cur["details"].append(r["detail"])
            if r["source"] != "Dependency index" and r["source"] != "Apex":
                cur["name"] = r["name"]  # the scan's label reads better than an API name
            if r.get("active") is not None:
                cur["active"] = bool(cur.get("active")) or r["active"] if cur.get("active") is not None else r["active"]
        refs = []
        for r in merged.values():
            r["detail"] = "; ".join(r.pop("details"))
            r["source"] = ", ".join(r["foundBy"])
            refs.append(r)
        refs.sort(key=lambda r: (r["kind"], r["name"].lower()))
        pop = self.population.get(obj, {})
        populated = (pop.get("populated") or {}).get(field)
        population = None if populated is None else {
            "populated": populated, "records": pop.get("records"), "estimated": bool(pop.get("estimated")),
            "run_at": pop.get("run_at")}
        verdict = self._verdict(custom, refs, population)
        return {"object": obj, "field": field, "label": meta.get("label"), "custom": custom, "described": bool(meta),
                "verdict": verdict, "references": refs, "sources": self.sources(), "notCheckable": NOT_CHECKABLE,
                "population": population}

    def _verdict(self, custom: bool, refs: List[Dict[str, Any]], population: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        live = [r for r in refs if r.get("active") is not False]
        if population is None:
            pop = "Population wasn't measured: run Data Quality (it inspects up to 20 fields per object)."
        elif population["estimated"]:
            pop = (f"{population['populated']:,} of {population['records']:,} sampled records hold a value "
                   "(an estimate; a field empty in the sample may still be used)")
        elif population["populated"] == 0:
            pop = f"no value on any of {population['records']:,} records"
        else:
            pop = f"{population['populated']:,} of {population['records']:,} records hold a value"
        if not custom:
            level = "standard"
        elif live:
            level = "in_use"
        elif refs:
            level = "inactive_only"
        elif population is None or population["estimated"]:
            level = "unmeasured"
        elif population["populated"] > 0:
            level = "unused_populated"
        else:
            level = "candidate"
        title, text = LEVELS[level]
        kinds = sorted({r["kind"] for r in live})
        text = text.format(n=f"{len(live)} {'place' if len(live) == 1 else 'places'} ({', '.join(kinds)})",
                           what=", ".join(sorted({r["kind"].lower() + "s" for r in refs})),
                           pop=pop[0].upper() + pop[1:] if level == "unmeasured" else pop,
                           refs=f"{len(live)} references found." if live else "No references found.")
        checked = [s for s in self.sources() if s["status"] == "checked"]
        missing = len(self.sources()) - len(checked)
        index_ok = any(s["source"] == "Salesforce dependency index" for s in checked) and not (
            (self.docs or {}).get("dependencies_truncated"))
        exact = population is not None and not population["estimated"]
        confidence = "High" if index_ok and missing == 0 and exact else "Medium" if index_ok or missing <= 1 else "Low"
        return {"level": level, "title": title, "text": text, "confidence": confidence}

    # ------------------------------------------------------------ every custom field
    def candidates(self) -> List[Dict[str, Any]]:
        rows = []
        for obj, o in self.objects.items():
            for field, meta in (o.get("fields") or {}).items():
                if not field.endswith("__c"):
                    continue
                imp = self.impact(obj, field)
                live = [r for r in imp["references"] if r.get("active") is not False]
                rows.append({"object": obj, "field": field, "label": meta.get("label"), "level": imp["verdict"]["level"],
                             "verdict": imp["verdict"]["title"], "confidence": imp["verdict"]["confidence"],
                             "references": len(live), "inactiveReferences": len(imp["references"]) - len(live),
                             "populated": (imp["population"] or {}).get("populated"),
                             "records": (imp["population"] or {}).get("records"),
                             "estimated": (imp["population"] or {}).get("estimated")})
        return rows


async def load_index(db: Any, org_id: str) -> ImpactIndex:
    from sqlalchemy import desc, select

    from app.api.routes.ui_access import latest_ui_access
    from app.domain.models import DataQualityRun, ObjectQualityScore
    from app.services.org_docs import latest_org_docs
    from app.services.schema_metadata import latest_schema

    population: Dict[str, Dict[str, Any]] = {}
    run = (await db.execute(select(DataQualityRun).where(DataQualityRun.organization_id == org_id)
                            .order_by(desc(DataQualityRun.snapshot_at)).limit(1))).scalar_one_or_none()
    if run is not None:
        for s in (await db.execute(select(ObjectQualityScore).where(ObjectQualityScore.run_id == run.id))).scalars():
            ev = s.evidence or {}
            if ev.get("populated") is not None:
                population[s.object_name] = {"populated": ev["populated"], "records": ev.get("records_counted"),
                                             "estimated": bool(ev.get("estimated")),
                                             "run_at": run.snapshot_at.isoformat() if run.snapshot_at else None}
    return ImpactIndex(await latest_schema(db, org_id), await latest_ui_access(db, org_id),
                       await latest_org_docs(db, org_id), population)
