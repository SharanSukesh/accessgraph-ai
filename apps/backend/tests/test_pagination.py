"""The standing pagination rule: server-side paging helper."""
from app.api.pagination import PageParams, paged


def P(page=1, size=25, sort=None, dir="asc", q=None):
    return PageParams(page=page, page_size=size, sort=sort, dir=dir, q=q)


ROWS = [{"name": f"User {i:03d}", "profile": "Sales" if i % 3 else "Support", "n": i % 7} for i in range(1, 404)]
TEXT = lambda r: f"{r['name']} {r['profile']}"  # noqa: E731
SORTS = {"name": lambda r: r["name"], "n": lambda r: r["n"], "profile": lambda r: r["profile"]}


def test_pages_cover_every_row_once():
    seen = []
    for page in range(1, 18):
        out = paged(ROWS, P(page), text=TEXT, sorts=SORTS, default_sort="name")
        seen += [r["name"] for r in out["items"]]
    assert out["total"] == 403 and out["pages"] == 17 and len(out["items"]) == 3
    assert seen == sorted(r["name"] for r in ROWS)


def test_search_and_sort_apply_before_the_page_is_cut():
    out = paged(ROWS, P(2, 25, sort="n", dir="desc", q="support"), text=TEXT, sorts=SORTS, default_sort="name")
    support = [r for r in ROWS if r["profile"] == "Support"]
    assert out["total"] == len(support) == 134
    assert [r["n"] for r in out["items"]] == sorted((r["n"] for r in support), reverse=True)[25:50]
    # every word must match, case-insensitive
    assert paged(ROWS, P(q="USER 040 sales"), text=TEXT)["total"] == 1


def test_page_past_the_end_is_the_last_page_and_unknown_sort_is_ignored():
    out = paged(ROWS, P(99, 100, sort="nope"), sorts=SORTS, default_sort="name")
    assert (out["page"], out["pages"], len(out["items"]), out["sort"]) == (5, 5, 3, "name")
    empty = paged([], P(3))
    assert (empty["total"], empty["page"], empty["pages"], empty["items"]) == (0, 1, 1, [])


def test_none_sorts_last_and_mixed_case_sorts_together():
    rows = [{"v": None}, {"v": "b"}, {"v": "A"}, {"v": "c"}]
    out = paged(rows, P(), sorts={"v": lambda r: r["v"]}, default_sort="v")
    assert [r["v"] for r in out["items"]] == ["A", "b", "c", None]
    out = paged(rows, P(dir="desc"), sorts={"v": lambda r: r["v"]}, default_sort="v")
    assert [r["v"] for r in out["items"]] == ["c", "b", "A", None]


# --------------------------------------------------------------------------- access index

import pytest  # noqa: E402

from tests.test_demo_path import lumenvale  # noqa: E402,F401


async def _check_index(db, org_id):
    from app.services.access_index import build
    from app.services.effective_access import EffectiveAccessService
    every = await EffectiveAccessService(db).org_access(org_id)
    index = await build(db, org_id)
    for kind, flags in (("objects", ("read", "create", "edit", "delete")), ("fields", ("read", "edit"))):
        keys = {k for acc in every.values() for k in acc[kind]}
        counts = index.counts(kind)
        for key in keys:
            for f in flags:
                expected = {u for u, acc in every.items() if (acc[kind].get(key) or {}).get(f)}
                assert index.users_with(kind, key, f) == expected, (kind, key, f)
                assert counts.get(key, {}).get(f, 0) == len(expected)
    return index


@pytest.mark.asyncio
async def test_access_index_matches_the_per_user_rules_on_lumenvale(async_db_session, lumenvale):  # noqa: F811
    org_id, _ = lumenvale
    index = await _check_index(async_db_session, org_id)
    assert len(index.users_with("objects", "Account")) == 376


@pytest.mark.asyncio
async def test_access_index_matches_at_scale(async_db_session):
    from app.domain.models import Organization
    from tests import list_scale
    org = Organization(name="List scale", is_demo=False)
    async_db_session.add(org)
    await async_db_session.flush()
    await list_scale.seed(async_db_session, org.id)
    await async_db_session.commit()
    index = await _check_index(async_db_session, org.id)
    assert len(index.counts("fields")) == 2400
