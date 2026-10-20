"""Cleanup impact (roadmap item 13): can a field be deleted?

  GET /orgs/{org_id}/fields/{field_id}/impact   one field (Object.Field):
      verdict, sources checked and not checkable, population, references
      (paged with `page`; without it, every reference)
  GET /orgs/{org_id}/cleanup-candidates          every custom field with its
      verdict, paged, searched, sorted; filters level and object; without
      `page`, every row (for the CSV)
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.api.pagination import PageParams, page_params, paged
from app.services.cleanup_impact import ORDER, load_index

router = APIRouter()


@router.get("/orgs/{org_id}/fields/{field_id}/impact")
async def field_impact(org_id: str, field_id: str, params: PageParams = Depends(page_params),
                       db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    if "." not in field_id:
        raise HTTPException(status_code=400, detail="Expected 'Object.Field'.")
    obj, _, field = field_id.partition(".")
    index = await load_index(db, org_id)
    if index.schema is None:
        raise HTTPException(status_code=404, detail="Field metadata isn't synced yet: sync the org first.")
    out = index.impact(obj, field)
    if not params.paged:
        return out
    refs = out.pop("references")
    sorts = {"source": lambda r: r["source"], "name": lambda r: r["name"]}
    return paged(refs, params, text=lambda r: f"{r['source']} {r['kind']} {r['name']} {r['detail']}", sorts=sorts,
                 default_sort="source", impact=out)


@router.get("/orgs/{org_id}/cleanup-candidates")
async def cleanup_candidates(org_id: str, level: Optional[str] = Query(None), object: Optional[str] = Query(None),
                             params: PageParams = Depends(page_params),
                             db: AsyncSession = Depends(get_database)) -> Any:
    index = await load_index(db, org_id)
    if index.schema is None:
        raise HTTPException(status_code=404, detail="Field metadata isn't synced yet: sync the org first.")
    rows = index.candidates()
    summary: Dict[str, int] = {lvl: 0 for lvl in ORDER}
    for r in rows:
        summary[r["level"]] += 1
    rows = [r for r in rows if (not level or r["level"] == level) and (not object or r["object"] == object)]
    sorts = {
        "verdict": lambda r: (ORDER.index(r["level"]), -(r["records"] or 0), r["object"], r["field"]),
        "field": lambda r: (r["object"].lower(), r["field"].lower()),
        "references": lambda r: r["references"],
        "populated": lambda r: r["populated"],
    }
    text = lambda r: f"{r['object']} {r['field']} {r.get('label') or ''}"  # noqa: E731
    if not params.paged:
        return {"items": sorted(rows, key=sorts["verdict"]), "total": len(rows), "summary": summary,
                "sources": index.sources()}
    return paged(rows, params, text=text, sorts=sorts, default_sort="verdict", summary=summary, sources=index.sources())
