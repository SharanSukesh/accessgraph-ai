"""Entity relationship diagrams from the synced field metadata (roadmap
item 12; Config Workbook parity row #20). Pure functions over item 8's
schema: describe referenceTo, relationship kind (master-detail when
relationshipOrder is set) and childRelationships' cascadeDelete.

A diagram has a focus object and a depth (1 to 3 hops, either direction).
Each object gets a column: the objects it looks up to sit left of it, the
objects that look up to it sit right, so a diagram reads parent to child,
left to right. Objects that are referenced but weren't described (not
synced) are drawn as plain names.

"Hide system objects" (on by default) leaves out the owner and audit
lookups every record has (OwnerId, CreatedById, LastModifiedById) and
Setup objects such as User, Group and RecordType, which otherwise connect
everything to everything. At most MAX_NODES objects are drawn, nearest
first; the rest are counted.
"""
from __future__ import annotations

from collections import deque
from typing import Any, Dict, List, Optional, Set, Tuple

MAX_NODES = 60
DEPTHS = (1, 2, 3)
AUDIT_FIELDS = {"OwnerId", "CreatedById", "LastModifiedById"}
SYSTEM_OBJECTS = {
    "User", "Group", "RecordType", "Profile", "UserRole", "Organization", "BusinessHours", "Name", "Queue",
    "CallCenter", "PermissionSet", "PermissionSetGroup", "UserLicense", "Network", "Site", "Folder", "Document",
    "ContentDocument", "ContentVersion", "EmailTemplate", "BrandTemplate", "Territory2", "Period", "FiscalYearSettings",
}


def edges_of(objects: Dict[str, Dict[str, Any]], hide_system: bool = True) -> List[Dict[str, Any]]:
    """Every relationship among the described objects: child -> parent, by field."""
    out = []
    for child, obj in objects.items():
        for fname, f in (obj.get("fields") or {}).items():
            for parent in f.get("referenceTo") or []:
                if hide_system and (fname in AUDIT_FIELDS or parent in SYSTEM_OBJECTS or child in SYSTEM_OBJECTS):
                    continue
                cascade = next((c for c in (objects.get(parent) or {}).get("childRelationships") or []
                                if c.get("childSObject") == child and c.get("field") == fname), None)
                out.append({
                    "from": child, "to": parent, "field": fname, "label": f.get("label"),
                    "kind": f.get("relationship") or "lookup", "required": bool(f.get("required")),
                    "relationshipName": (cascade or {}).get("relationshipName") or f.get("relationshipName"),
                    "cascadeDelete": bool((cascade or {}).get("cascadeDelete")),
                    "polymorphic": len(f.get("referenceTo") or []) > 1,
                })
    return sorted(out, key=lambda e: (e["from"], e["field"], e["to"]))


def _rows(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> Dict[str, int]:
    """Order within each column: outward from the focus, each object near
    the average position of its neighbours closer in (two sweeps), so lines
    cross as little as is cheap to arrange."""
    col = {n["name"]: n["column"] for n in nodes}
    near: Dict[str, Set[str]] = {n["name"]: set() for n in nodes}
    for e in edges:
        near[e["from"]].add(e["to"])
        near[e["to"]].add(e["from"])
    columns: Dict[int, List[str]] = {}
    for n in sorted(nodes, key=lambda n: n["name"].lower()):
        columns.setdefault(n["column"], []).append(n["name"])
    row = {name: i for names in columns.values() for i, name in enumerate(names)}
    order = sorted(columns, key=lambda c: (abs(c), c))
    for _ in range(2):
        for c in order:
            def weight(name: str) -> float:
                inward = [row[m] for m in near[name] if abs(col[m]) < abs(c) or (c == 0 and col[m] == 0)]
                anyone = inward or [row[m] for m in near[name]]
                return sum(anyone) / len(anyone) if anyone else row[name]
            columns[c].sort(key=lambda name: (weight(name), name.lower()))
            for i, name in enumerate(columns[c]):
                row[name] = i
    return row


def build(schema: Optional[Dict[str, Any]], focus: str, depth: int = 1, hide_system: bool = True,
          readers: Optional[Dict[str, int]] = None, max_nodes: int = MAX_NODES) -> Dict[str, Any]:
    """The diagram around `focus`: nodes with their column and distance,
    and the relationships among them."""
    objects = (schema or {}).get("objects") or {}
    depth = depth if depth in DEPTHS else 1
    edges = edges_of(objects, hide_system)
    adjacent: Dict[str, List[Tuple[str, int]]] = {}
    for e in edges:
        adjacent.setdefault(e["from"], []).append((e["to"], -1))   # a parent sits left
        adjacent.setdefault(e["to"], []).append((e["from"], +1))   # a child sits right
    column: Dict[str, int] = {focus: 0}
    distance: Dict[str, int] = {focus: 0}
    queue = deque([focus])
    while queue:
        cur = queue.popleft()
        if distance[cur] >= depth:
            continue
        for nxt, step in sorted(adjacent.get(cur, []), key=lambda x: x[0]):
            if nxt not in distance:
                distance[nxt] = distance[cur] + 1
                column[nxt] = column[cur] + step
                queue.append(nxt)
    reached = sorted(distance, key=lambda n: (distance[n], n.lower()))
    kept: Set[str] = set(reached[:max_nodes])
    nodes: List[Dict[str, Any]] = []
    for name in reached[:max_nodes]:
        obj = objects.get(name)
        node: Dict[str, Any] = {"name": name, "label": (obj or {}).get("label") or name, "custom": name.endswith("__c"),
                "described": obj is not None, "fields": len((obj or {}).get("fields") or {}),
                "distance": distance[name], "column": column[name], "focus": name == focus}
        if readers is not None:
            node["readers"] = readers.get(name, 0)
        nodes.append(node)
    shown = [e for e in edges if e["from"] in kept and e["to"] in kept]
    rows = _rows(nodes, shown)
    for n in nodes:
        n["row"] = rows[n["name"]]
    return {
        "focus": focus, "depth": depth, "hideSystem": hide_system, "found": focus in objects,
        "nodes": nodes, "edges": shown, "leftOut": max(0, len(reached) - max_nodes),
        "objects": sorted(objects),
    }


# ---------------------------------------------------------------- SVG
# One drawing for the SVG download and the image pack, from the same
# columns and rows the page uses. Lookups thin, master-detail bold; the
# end at the parent carries a bar ("one"), a cascade delete a filled dot.

BOX_W, BOX_H, COL_GAP, ROW_GAP, PAD = 190, 46, 90, 22, 24
THEMES = {
    "light": {"bg": "#fcfcfb", "box": "#ffffff", "ink": "#0b0b0b", "muted": "#52514e", "line": "#898781",
              "focus": "#D8794A", "custom": "#199E70", "stub": "#c3c2b7"},
    "dark": {"bg": "#0c1a14", "box": "#16302a", "ink": "#eee8d3", "muted": "#b8b3a1", "line": "#8f9a92",
             "focus": "#E8956B", "custom": "#3bbf8c", "stub": "#4a5a52"},
}


def _esc(v: Any) -> str:
    return str(v).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def positions(diagram: Dict[str, Any]) -> Dict[str, Tuple[float, float]]:
    """Top-left corner of each object's box."""
    nodes = diagram["nodes"]
    if not nodes:
        return {}
    first = min(n["column"] for n in nodes)
    height: Dict[int, int] = {}
    for n in nodes:
        height[n["column"]] = max(height.get(n["column"], 0), n["row"] + 1)
    tallest = max(height.values())
    out = {}
    for n in nodes:
        offset = (tallest - height[n["column"]]) * (BOX_H + ROW_GAP) / 2  # centre short columns
        out[n["name"]] = (PAD + (n["column"] - first) * (BOX_W + COL_GAP), PAD + offset + n["row"] * (BOX_H + ROW_GAP))
    return out


LEGEND_H = 22


def default_focus(schema: Optional[Dict[str, Any]]) -> Optional[str]:
    """The most connected object (system lookups left out), for the image pack."""
    edges = edges_of((schema or {}).get("objects") or {})
    degree: Dict[str, int] = {}
    for e in edges:
        for n in (e["from"], e["to"]):
            degree[n] = degree.get(n, 0) + 1
    return min(degree, key=lambda n: (-degree[n], n.lower())) if degree else None


def svg(diagram: Dict[str, Any], theme: str = "light", transparent: bool = False, legend: bool = True,
        fit: Optional[Tuple[float, float]] = None) -> str:
    """The diagram as SVG; `fit` (width, height) scales it to fit that box."""
    t = THEMES.get(theme, THEMES["light"])
    pos = positions(diagram)
    if not pos:
        return '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="60"></svg>'
    col = {n["name"]: n["column"] for n in diagram["nodes"]}
    loops = any(col[e["from"]] == col[e["to"]] for e in diagram["edges"])  # same-column edges arc out to the right
    width = max(max(x for x, _ in pos.values()) + BOX_W + PAD + (50 if loops else 0), 420)
    height = max(y for _, y in pos.values()) + BOX_H + PAD + (LEGEND_H if legend else 0)
    scale = min(fit[0] / width, fit[1] / height) if fit else 1.0
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width * scale:.0f}" height="{height * scale:.0f}" '
             f'viewBox="0 0 {width:.0f} {height:.0f}" font-family="Inter, Helvetica, Arial, sans-serif">']
    if not transparent:
        parts.append(f'<rect width="100%" height="100%" fill="{t["bg"]}"/>')
    for e in diagram["edges"]:
        (cx, cy), (px, py) = pos[e["from"]], pos[e["to"]]
        cy, py = cy + BOX_H / 2, py + BOX_H / 2
        if cx > px:          # child right of its parent: from the child's left side to the parent's right side
            x1, x2, out1, out2 = cx, px + BOX_W, -1, 1
        elif cx < px:
            x1, x2, out1, out2 = cx + BOX_W, px, 1, -1
        else:                # same column: loop out to the right
            x1, x2, out1, out2 = cx + BOX_W, px + BOX_W, 1, 1
        if x1 == x2:
            c1, c2 = x1 + 60, x2 + 60
        else:
            c1 = c2 = (x1 + x2) / 2
        md = e["kind"] == "master_detail"
        parts.append(f'<path d="M{x1:.1f},{cy:.1f} C{c1:.1f},{cy:.1f} {c2:.1f},{py:.1f} {x2:.1f},{py:.1f}" fill="none" '
                     f'stroke="{t["line"]}" stroke-width="{3 if md else 1.2}"><title>{_esc(e["from"])}.{_esc(e["field"])} → '
                     f'{_esc(e["to"])} ({"master-detail" if md else "lookup"})</title></path>')
        bar = x2 + 7 * out2   # "one" at the parent
        parts.append(f'<line x1="{bar:.1f}" y1="{py - 6:.1f}" x2="{bar:.1f}" y2="{py + 6:.1f}" '
                     f'stroke="{t["line"]}" stroke-width="{2.5 if md else 1.2}"/>')
        if e.get("cascadeDelete"):  # deleted with the parent: a dot at the child
            parts.append(f'<circle cx="{x1 + 7 * out1:.1f}" cy="{cy:.1f}" r="3.5" fill="{t["line"]}"/>')
    for n in diagram["nodes"]:
        x, y = pos[n["name"]]
        stroke = t["focus"] if n["focus"] else (t["custom"] if n["custom"] else (t["line"] if n["described"] else t["stub"]))
        dash = '' if n["described"] else ' stroke-dasharray="4 3"'
        parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{BOX_W}" height="{BOX_H}" rx="8" fill="{t["box"]}" '
                     f'stroke="{stroke}" stroke-width="{2.5 if n["focus"] else 1.4}"{dash}/>')
        name = n["name"] if len(n["name"]) <= 26 else n["name"][:25] + "…"
        parts.append(f'<text x="{x + 12:.1f}" y="{y + 19:.1f}" font-size="12.5" font-weight="600" fill="{t["ink"]}">'
                     f'{_esc(name)}</text>')
        caption = (f'{n["fields"]} fields' if n["described"] else "not synced")
        if n.get("readers") is not None:
            caption += f' · {n["readers"]:,} can read'
        parts.append(f'<text x="{x + 12:.1f}" y="{y + 35:.1f}" font-size="10" fill="{t["muted"]}">{_esc(caption)}</text>')
    if legend:
        y = height - PAD / 2 - 4
        parts.append(f'<line x1="{PAD}" y1="{y - 4}" x2="{PAD + 26}" y2="{y - 4}" stroke="{t["line"]}" stroke-width="1.2"/>'
                     f'<text x="{PAD + 32}" y="{y}" font-size="10" fill="{t["muted"]}">lookup</text>'
                     f'<line x1="{PAD + 80}" y1="{y - 4}" x2="{PAD + 106}" y2="{y - 4}" stroke="{t["line"]}" stroke-width="3"/>'
                     f'<text x="{PAD + 112}" y="{y}" font-size="10" fill="{t["muted"]}">master-detail</text>'
                     f'<circle cx="{PAD + 198}" cy="{y - 4}" r="3.5" fill="{t["line"]}"/>'
                     f'<text x="{PAD + 206}" y="{y}" font-size="10" fill="{t["muted"]}">deleted with the parent</text>'
                     f'<rect x="{PAD + 340}" y="{y - 11}" width="14" height="12" rx="3" fill="none" stroke="{t["stub"]}" '
                     f'stroke-dasharray="3 2"/><text x="{PAD + 360}" y="{y}" font-size="10" fill="{t["muted"]}">not synced</text>')
    parts.append("</svg>")
    return "".join(parts)
