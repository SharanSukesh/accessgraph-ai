"""Server-side paging for every list that can grow long (the standing
pagination rule in SECURITY_AND_TRUST_ROADMAP.md's working rules).

A list endpoint takes `PageParams` (page, page_size, sort, dir, q) and
returns `paged(...)`: search, filters and sorting apply to every row, then
one page is cut. Without `page` an endpoint keeps returning everything in
its old shape, so exports, image downloads and other callers still get all
rows.

Envelope:
  {"items": [...], "total": 403, "page": 2, "page_size": 25, "pages": 17,
   "sort": "name", "dir": "asc", "q": "..."}
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence

from fastapi import Query

PAGE_SIZES = (25, 50, 100)
DEFAULT_PAGE_SIZE = 25


@dataclass
class PageParams:
    page: Optional[int]
    page_size: int
    sort: Optional[str]
    dir: str
    q: Optional[str]

    @property
    def paged(self) -> bool:
        return self.page is not None


def page_params(
    page: Optional[int] = Query(None, ge=1, description="1-based page; omit for every row"),
    page_size: int = Query(DEFAULT_PAGE_SIZE, description="25, 50 or 100"),
    sort: Optional[str] = Query(None, description="column key to sort by"),
    dir: str = Query("asc", pattern="^(asc|desc)$"),
    q: Optional[str] = Query(None, max_length=200, description="search across the list's text columns"),
) -> PageParams:
    size = page_size if page_size in PAGE_SIZES else DEFAULT_PAGE_SIZE
    return PageParams(page=page, page_size=size, sort=sort, dir=dir, q=(q or "").strip() or None)


def _key(value: Any) -> Any:
    """Sort key that never compares None with a value, and ignores case."""
    if value is None:
        return (1, "")
    if isinstance(value, str):
        return (0, value.lower())
    if isinstance(value, bool):
        return (0, int(value))
    return (0, value)


def search(rows: Iterable[Any], q: Optional[str], text: Callable[[Any], str]) -> List[Any]:
    """Rows whose text contains every word of q (case-insensitive)."""
    rows = list(rows)
    if not q:
        return rows
    words = q.lower().split()
    return [r for r in rows if all(w in (text(r) or "").lower() for w in words)]


def sort_rows(rows: List[Any], params: PageParams, sorts: Mapping[str, Callable[[Any], Any]],
              default: Optional[str] = None) -> List[Any]:
    key = params.sort if params.sort in sorts else default
    if key is None:
        return rows
    getter = sorts[key]
    present = [r for r in rows if getter(r) is not None]
    missing = [r for r in rows if getter(r) is None]  # empty values sort last either way
    return sorted(present, key=lambda r: _key(getter(r)), reverse=params.dir == "desc") + missing


def envelope(items: Sequence[Any], total: int, params: PageParams, sort: Optional[str] = None,
             **extra: Any) -> Dict[str, Any]:
    pages = max(1, -(-total // params.page_size))
    return {"items": list(items), "total": total, "page": min(params.page or 1, pages), "page_size": params.page_size,
            "pages": pages, "sort": sort, "dir": params.dir, "q": params.q, **extra}


def paged(rows: Iterable[Any], params: PageParams, *, text: Optional[Callable[[Any], str]] = None,
          sorts: Optional[Mapping[str, Callable[[Any], Any]]] = None, default_sort: Optional[str] = None,
          **extra: Any) -> Dict[str, Any]:
    """Search, sort, then cut one page. A page past the end returns the last page."""
    rows = search(rows, params.q, text) if text else list(rows)
    sorts = sorts or {}
    rows = sort_rows(rows, params, sorts, default_sort)
    total = len(rows)
    pages = max(1, -(-total // params.page_size))
    page = min(params.page or 1, pages)
    start = (page - 1) * params.page_size
    used = params.sort if params.sort in sorts else default_sort
    return envelope(rows[start:start + params.page_size], total, params, used, **extra)


async def paged_query(db: Any, stmt: Any, params: PageParams, *, order: Sequence[Any] = (),
                      **extra: Any) -> Dict[str, Any]:
    """The same envelope for a SQLAlchemy select: COUNT, then OFFSET/LIMIT.
    `order` is the ORDER BY to apply (already resolved from params.sort)."""
    from sqlalchemy import func, select

    total = (await db.execute(select(func.count()).select_from(stmt.order_by(None).subquery()))).scalar() or 0
    pages = max(1, -(-total // params.page_size))
    page = min(params.page or 1, pages)
    rows = (await db.execute(stmt.order_by(*order).offset((page - 1) * params.page_size).limit(params.page_size))).all()
    return envelope(rows, total, params, params.sort, **extra)
