"""Static SVG charts for the PDF report (rendered by WeasyPrint).

Follows the dataviz method: one hue for single-series magnitude, an
ordinal one-hue ramp for severity, a sequential ramp for the heatmap,
thin marks with 4px rounded data-ends, hairline axes, labels in ink
(never in the series colour), and selective direct labels. A PDF has no
hover, so every chart is paired with visible values or a table.
"""
from __future__ import annotations

import html
from typing import List, Optional, Sequence, Tuple

INK = "#0b0b0b"
INK_2 = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
BASELINE = "#c3c2b7"
SURFACE = "#fcfcfb"

SERIES = "#2a78d6"  # categorical slot 1, used for every single-series chart
TRACK = "#cde2fb"   # lighter step of the same ramp, for meter tracks
WARNING = "#fab219"
CRITICAL = "#d03b3b"

# Ordinal severity ramp (one hue, validated with --ordinal): critical -> info.
SEVERITY_RAMP = {
    "critical": "#741b1b",
    "high": "#a92a2a",
    "medium": "#d04040",
    "low": "#e06a66",
    "info": "#e8928f",
}

# Sequential blue ramp for heatmaps (step 100 -> 650).
SEQUENTIAL = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#104281"]

FONT = "font-family:'Helvetica Neue',Arial,'DejaVu Sans',sans-serif"


def _esc(text: object) -> str:
    return html.escape(str(text))


def _text(x: float, y: float, text: str, *, size: float = 9, color: str = INK_2,
          anchor: str = "start", weight: str = "normal") -> str:
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{color}" '
        f'text-anchor="{anchor}" font-weight="{weight}" style="{FONT}">{_esc(text)}</text>'
    )


def _bar(x: float, y: float, w: float, h: float, color: str, radius: float = 4) -> str:
    """Horizontal bar: square at the baseline (left), rounded data-end (right)."""
    if w <= 0:
        return ""
    r = min(radius, w, h / 2)
    return (
        f'<path d="M{x:.1f},{y:.1f} H{x + w - r:.1f} '
        f'Q{x + w:.1f},{y:.1f} {x + w:.1f},{y + r:.1f} V{y + h - r:.1f} '
        f'Q{x + w:.1f},{y + h:.1f} {x + w - r:.1f},{y + h:.1f} H{x:.1f} Z" fill="{color}"/>'
    )


def horizontal_bars(
    items: Sequence[Tuple[str, float]],
    *,
    value_label=lambda v: f"{v:,.0f}",
    width: int = 480,
    label_width: int = 170,
    bar_height: int = 14,
    gap: int = 10,
    color: str = SERIES,
    ascending: bool = False,
) -> str:
    """Single-series magnitude comparison, value at each tip. Largest first
    by default; ascending for "worst first" lists of scores."""
    items = [(k, v) for k, v in items if v]
    if not items:
        return ""
    items = sorted(items, key=lambda kv: kv[1], reverse=not ascending)
    max_v = max(v for _, v in items)
    plot_w = width - label_width - 70
    height = len(items) * (bar_height + gap) + gap
    parts = [f'<line x1="{label_width}" y1="0" x2="{label_width}" y2="{height}" stroke="{BASELINE}" stroke-width="1"/>']
    for i, (label, value) in enumerate(items):
        y = gap + i * (bar_height + gap)
        w = plot_w * (value / max_v) if max_v else 0
        parts.append(_text(label_width - 8, y + bar_height - 3, label, anchor="end", color=INK))
        parts.append(_bar(label_width, y, w, bar_height, color))
        parts.append(_text(label_width + w + 6, y + bar_height - 3, value_label(value), color=INK_2))
    return f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">{"".join(parts)}</svg>'


def stacked_bar(
    segments: Sequence[Tuple[str, float, str]],
    *,
    width: int = 480,
    height: int = 18,
    value_label=lambda v: f"{v:,.0f}",
) -> str:
    """Part-to-whole on one row, 2px surface gaps between segments, with a
    legend row underneath (label + count) so colour is never the only key."""
    segments = [(k, v, c) for k, v, c in segments if v]
    total = sum(v for _, v, _ in segments)
    if not total:
        return ""
    gap = 2
    usable = width - gap * (len(segments) - 1)
    x = 0.0
    parts = []
    for i, (label, value, color) in enumerate(segments):
        w = usable * value / total
        is_last = i == len(segments) - 1
        if i == 0 and is_last:
            parts.append(f'<rect x="0" y="0" width="{w:.1f}" height="{height}" rx="4" fill="{color}"/>')
        elif i == 0:
            parts.append(f'<path d="M4,0 H{w:.1f} V{height} H4 Q0,{height} 0,{height - 4} V4 Q0,0 4,0 Z" fill="{color}"/>')
        elif is_last:
            parts.append(_bar(x, 0, w, height, color))
        else:
            parts.append(f'<rect x="{x:.1f}" y="0" width="{w:.1f}" height="{height}" fill="{color}"/>')
        x += w + gap
    legend_y = height + 18
    lx = 0.0
    for label, value, color in segments:
        parts.append(f'<rect x="{lx:.1f}" y="{legend_y - 8}" width="9" height="9" rx="2" fill="{color}"/>')
        text = f"{label} {value_label(value)}"
        parts.append(_text(lx + 13, legend_y, text, color=INK))
        lx += 13 + len(text) * 5.4 + 16
    total_h = legend_y + 6
    return f'<svg width="{width}" height="{total_h}" viewBox="0 0 {width} {total_h}" xmlns="http://www.w3.org/2000/svg">{"".join(parts)}</svg>'


def heatmap(
    row_labels: Sequence[str],
    col_labels: Sequence[str],
    matrix: Sequence[Sequence[int]],
    *,
    label_width: int = 170,
    cell_w: int = 58,
    cell_h: int = 24,
) -> str:
    """Counts on a sequential one-hue ramp; empty cells stay surface."""
    max_v = max((v for row in matrix for v in row), default=0)
    if not max_v:
        return ""
    header_h = 18
    width = label_width + cell_w * len(col_labels)
    height = header_h + cell_h * len(row_labels)
    parts = []
    for j, col in enumerate(col_labels):
        parts.append(_text(label_width + j * cell_w + cell_w / 2, 12, col, anchor="middle", color=INK_2, size=8.5))
    for i, row in enumerate(row_labels):
        y = header_h + i * cell_h
        parts.append(_text(label_width - 8, y + cell_h / 2 + 3, row, anchor="end", color=INK))
        for j, value in enumerate(matrix[i]):
            x = label_width + j * cell_w
            if value:
                step = SEQUENTIAL[min(len(SEQUENTIAL) - 1, int((value / max_v) * (len(SEQUENTIAL) - 1)))]
                dark = SEQUENTIAL.index(step) >= 3
                parts.append(f'<rect x="{x + 1}" y="{y + 1}" width="{cell_w - 2}" height="{cell_h - 2}" rx="3" fill="{step}"/>')
                parts.append(_text(x + cell_w / 2, y + cell_h / 2 + 3, str(value), anchor="middle",
                                   color="#ffffff" if dark else INK, weight="600"))
            else:
                parts.append(f'<rect x="{x + 1}" y="{y + 1}" width="{cell_w - 2}" height="{cell_h - 2}" rx="3" fill="none" stroke="{GRID}" stroke-width="1"/>')
    return f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">{"".join(parts)}</svg>'


def line_chart(
    points: Sequence[Tuple[str, float]],
    *,
    width: int = 480,
    height: int = 150,
    y_max: float = 100,
    y_ticks: Sequence[float] = (0, 50, 100),
    value_label=lambda v: f"{v:.0f}",
) -> str:
    """Single series over time; label only the last point."""
    if len(points) < 2:
        return ""
    left, right, top, bottom = 30, 40, 10, 22
    pw, ph = width - left - right, height - top - bottom
    parts = []
    for t in y_ticks:
        y = top + ph - ph * (t / y_max)
        parts.append(f'<line x1="{left}" y1="{y:.1f}" x2="{left + pw}" y2="{y:.1f}" stroke="{GRID}" stroke-width="1"/>')
        parts.append(_text(left - 6, y + 3, f"{t:.0f}", anchor="end", color=MUTED, size=8))
    step = pw / (len(points) - 1)
    coords = [(left + i * step, top + ph - ph * (v / y_max)) for i, (_, v) in enumerate(points)]
    path = " ".join(f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f}" for i, (x, y) in enumerate(coords))
    parts.append(f'<path d="{path}" fill="none" stroke="{SERIES}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>')
    for x, y in coords:
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="{SERIES}" stroke="{SURFACE}" stroke-width="2"/>')
    lx, ly = coords[-1]
    parts.append(_text(lx + 8, ly + 3, value_label(points[-1][1]), color=INK, weight="600"))
    for i in sorted({0, len(points) - 1}):
        parts.append(_text(coords[i][0], height - 6, points[i][0], anchor="middle", color=MUTED, size=8))
    return f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">{"".join(parts)}</svg>'


def meter(fraction: float, *, width: int = 220, height: int = 8,
          warn_at: Optional[float] = None, critical_at: Optional[float] = None) -> str:
    """Ratio against a limit: same-ramp track, fill carries severity."""
    f = max(0.0, min(1.0, fraction))
    color = SERIES
    if critical_at is not None and f >= critical_at:
        color = CRITICAL
    elif warn_at is not None and f >= warn_at:
        color = WARNING
    fill = (
        f'<rect x="0" y="0" width="{max(width * f, height):.1f}" height="{height}" rx="{height / 2}" fill="{color}"/>'
        if f > 0 else ""
    )
    return (
        f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">'
        f'<rect x="0" y="0" width="{width}" height="{height}" rx="{height / 2}" fill="{TRACK}"/>{fill}</svg>'
    )


def swatch(color: str, size: int = 9) -> str:
    return (
        f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg">'
        f'<rect width="{size}" height="{size}" rx="2" fill="{color}"/></svg>'
    )


def legend_items(items: List[Tuple[str, str]]) -> str:
    return "".join(
        f'<span class="legend-item">{swatch(color)} {_esc(label)}</span>' for label, color in items
    )
