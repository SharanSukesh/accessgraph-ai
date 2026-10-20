"""An object's fields and relationships, paged (the standing pagination rule).

  GET /orgs/{org_id}/objects/{object_name}/schema?kind=fields|parents|children

with page, page_size, sort, dir and q (app/api/pagination.py); `filter`
narrows fields to custom, formula or encrypted. Without `page` every row
comes back, for exports. From the synced describe (services/schema_metadata).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.api.pagination import PageParams, page_params, paged
from app.services.risk_scoring import classify_sensitive_field
from app.services.schema_metadata import field_details, latest_schema, relationships

router = APIRouter()
PREVIEW = 10


def field_rows(described: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    for name, f in (described.get("fields") or {}).items():
        match = classify_sensitive_field(name)
        out.append({"apiName": name, **(field_details(f) or {}), "isSensitive": match is not None,
                    "sensitivity": match[0] if match else None})
    return out


def summary(schema: Optional[Dict[str, Any]], object_name: str) -> Optional[Dict[str, Any]]:
    """Counts and first rows for the object page; None when not described."""
    described = ((schema or {}).get("objects") or {}).get(object_name)
    if not described:
        return None
    rows = field_rows(described)
    rels = relationships(schema, object_name)
    return {
        "fields": {"count": len(rows), "preview": rows[:PREVIEW],
                   "custom": sum(1 for r in rows if r.get("custom")), "formula": sum(1 for r in rows if r.get("formula")),
                   "encrypted": sum(1 for r in rows if r.get("encryption"))},
        "parents": {"count": len(rels["parents"]), "preview": rels["parents"][:PREVIEW]},
        "children": {"count": len(rels["children"]), "preview": rels["children"][:PREVIEW]},
    }


@router.get("/orgs/{org_id}/objects/{object_name}/schema")
async def object_schema(org_id: str, object_name: str, kind: str = Query("fields", pattern="^(fields|parents|children)$"),
                        filter: Optional[str] = Query(None, pattern="^(custom|formula|encrypted)$"),
                        params: PageParams = Depends(page_params), db: AsyncSession = Depends(get_database)):
    schema = await latest_schema(db, org_id)
    described = ((schema or {}).get("objects") or {}).get(object_name)
    if not described:
        raise HTTPException(status_code=404, detail="Field metadata isn't synced for this object yet.")
    if kind == "fields":
        rows = field_rows(described)
        if filter == "custom":
            rows = [r for r in rows if r.get("custom")]
        elif filter == "formula":
            rows = [r for r in rows if r.get("formula")]
        elif filter == "encrypted":
            rows = [r for r in rows if r.get("encryption")]
        text = lambda r: f"{r['apiName']} {r.get('label') or ''} {r.get('typeLabel') or ''}"  # noqa: E731
        sorts = {"label": lambda r: r.get("label"), "apiName": lambda r: r["apiName"], "type": lambda r: r.get("typeLabel"),
                 "required": lambda r: r.get("required")}
        default = None  # describe order, as Setup lists them
    else:
        rows = relationships(schema, object_name)[kind]
        text = lambda r: f"{r.get('field')} {r.get('label') or ''} {' '.join(r.get('to') or [])} {r.get('object') or ''}"  # noqa: E731
        sorts = {"field": lambda r: r.get("field"), "object": lambda r: r.get("object") or ", ".join(r.get("to") or []),
                 "kind": lambda r: r.get("kind")}
        default = "object" if kind == "children" else "field"
    if not params.paged:
        return {"items": rows, "total": len(rows)}
    return paged(rows, params, text=text, sorts=sorts, default_sort=default, kind=kind)


@router.get("/orgs/{org_id}/erd")
async def entity_relationship_diagram(
    org_id: str,
    focus: str = Query(..., description="the object at the centre"),
    depth: int = Query(1, ge=1, le=3),
    hide_system: bool = Query(True, alias="hideSystem"),
    readers: bool = Query(False, description="add active users who can read each object"),
    db: AsyncSession = Depends(get_database),
) -> Dict[str, Any]:
    """Item 12: the objects around `focus` and their lookups and master-detail
    relationships, from the synced describe. `readers` overlays how many
    active users can read each object (left out at Metadata only)."""
    from app.domain.models import Organization
    from app.services import erd, privacy_mode
    from app.services.access_index import access_index

    schema = await latest_schema(db, org_id)
    if schema is None:
        raise HTTPException(status_code=404, detail="Field metadata isn't synced yet: sync the org first.")
    counts = None
    note = None
    if readers:
        org = await db.get(Organization, org_id)
        if org is not None and privacy_mode.allows(org, privacy_mode.USER_RECORDS):
            counts = {k: v.get("read", 0) for k, v in (await access_index(db, org_id)).counts("objects").items()}
        else:
            note = "Who can read each object isn't shown at this org's privacy level (metadata only)."
    out = erd.build(schema, focus, depth, hide_system, counts)
    if note:
        out["note"] = note
    return out


@router.get("/orgs/{org_id}/erd.svg")
async def entity_relationship_svg(
    org_id: str,
    focus: str = Query(...),
    depth: int = Query(1, ge=1, le=3),
    hide_system: bool = Query(True, alias="hideSystem"),
    theme: str = Query("light", pattern="^(light|dark)$"),
    transparent: bool = Query(False),
    db: AsyncSession = Depends(get_database),
) -> Response:
    """The same diagram as an SVG file (no user counts), for slides and documents."""
    from app.domain.models import Organization
    from app.services import erd

    schema = await latest_schema(db, org_id)
    if schema is None:
        raise HTTPException(status_code=404, detail="Field metadata isn't synced yet: sync the org first.")
    org = await db.get(Organization, org_id)
    picture = erd.svg(erd.build(schema, focus, depth, hide_system), theme, transparent)
    safe = "".join(c if c.isalnum() or c in "_-" else "-" for c in focus)
    name = f"{'demo-' if org is not None and org.is_demo else ''}data-model-{safe}-depth{depth}.svg"
    return Response(content=picture, media_type="image/svg+xml",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
