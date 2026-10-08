"""PDF client report for the Org Analyzer.

Renders an HTML document through WeasyPrint with inline SVG charts
(services/report/charts.py). Sections:

  1. Cover + executive summary: health score, headline KPIs, change
     since the last run, top priorities.
  2. Findings at a glance: severity mix, category x severity heatmap,
     findings and savings by category, health trend.
  3. Org profile & capacity: composition, licence utilisation, limits.
  4. Access, risk & governance: whatever other Newton modules have
     produced for the org (risk, anomalies, compliance, data quality,
     sprawl, licence fit). Skipped section by section when absent.
  5. Detailed findings, ordered by severity, then savings, then reach.
  6. Methodology.

The weasyprint import stays lazy so a host without the native libraries
still serves every other analyzer endpoint.
"""
from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional

from app.domain.models import (
    FindingCategory,
    FindingSeverity,
    OrgAnalysisSnapshot,
    OrgFinding,
)
from app.services.report import charts
from app.services.report.context import RISK_LEVELS, ReportContext, short_date

logger = logging.getLogger(__name__)


CATEGORY_LABELS = {
    FindingCategory.LICENSE_WASTE: "License & feature waste",
    FindingCategory.CONFIG_BLOAT: "Configuration bloat",
    FindingCategory.AUTOMATION_HYGIENE: "Automation hygiene",
    FindingCategory.SHARING_POSTURE: "Sharing & security posture",
    FindingCategory.STORAGE_LIMIT: "Storage & limit risk",
    FindingCategory.DATA_QUALITY: "Data quality",
    FindingCategory.USER_ACTIVITY: "User activity",
    FindingCategory.PREDICTIVE: "Predictive trends",
}

SEVERITY_ORDER = [
    FindingSeverity.CRITICAL,
    FindingSeverity.HIGH,
    FindingSeverity.MEDIUM,
    FindingSeverity.LOW,
    FindingSeverity.INFO,
]
SEVERITY_LABEL = {s: s.value.capitalize() for s in SEVERITY_ORDER}
SEV_RANK = {s: i for i, s in enumerate(SEVERITY_ORDER)}

HEALTH_BANDS = [(85, "Healthy"), (70, "Fair"), (50, "Needs attention"), (0, "At risk")]


def _esc(value: object) -> str:
    return html.escape(str(value))


def _fmt_money_cents(c: int) -> str:
    dollars = (c or 0) / 100.0
    if dollars >= 1_000_000:
        return f"${dollars / 1_000_000:.2f}M"
    if dollars >= 10_000:
        return f"${dollars / 1_000:.1f}K"
    return f"${dollars:,.0f}"


def _compact(n: float) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 10_000:
        return f"{n / 1_000:.1f}K"
    return f"{n:,.0f}"


def _sev(f: OrgFinding) -> FindingSeverity:
    if isinstance(f.severity, FindingSeverity):
        return f.severity
    try:
        return FindingSeverity(str(f.severity))
    except ValueError:
        return FindingSeverity.INFO


def _cat(f: OrgFinding) -> FindingCategory:
    if isinstance(f.category, FindingCategory):
        return f.category
    try:
        return FindingCategory(str(f.category))
    except ValueError:
        return FindingCategory.CONFIG_BLOAT


def _sorted_findings(findings: Iterable[OrgFinding]) -> List[OrgFinding]:
    return sorted(
        findings,
        key=lambda f: (SEV_RANK.get(_sev(f), 99), -(f.estimated_annual_savings_cents or 0), -(f.affected_count or 0)),
    )


def _sev_chip(sev: FindingSeverity) -> str:
    return (
        f'<span class="sev">{charts.swatch(charts.SEVERITY_RAMP[sev.value])} '
        f'{_esc(SEVERITY_LABEL[sev])}</span>'
    )


def _health_band(score: float) -> str:
    return next(label for threshold, label in HEALTH_BANDS if score >= threshold)


def _stat(label: str, value: str, note: str = "") -> str:
    note_html = f'<div class="stat-note">{note}</div>' if note else ""
    return f'<div class="stat"><div class="stat-label">{_esc(label)}</div><div class="stat-value">{value}</div>{note_html}</div>'


def _signed(n: float, unit: str = "") -> str:
    return f"{'+' if n > 0 else ''}{n:,.0f}{unit}"


# --------------------------------------------------------------- sections


def _cover(org_name: str, snapshot: OrgAnalysisSnapshot, findings: List[OrgFinding],
           ctx: ReportContext, brand) -> str:
    metrics = snapshot.metrics or {}
    score = float(metrics.get("org_health_score") or 0)
    sev_counts = _severity_counts(findings)
    urgent = sev_counts.get(FindingSeverity.CRITICAL, 0) + sev_counts.get(FindingSeverity.HIGH, 0)
    savings = sum(f.estimated_annual_savings_cents or 0 for f in findings)

    change_value, change_note = "First run", ""
    if len(ctx.history) >= 2:
        prev = ctx.history[-2]
        change_value = f"{_signed(score - prev['score'])} pts"
        change_note = (
            f"Health score; {_signed(len(findings) - (prev['findings'] or 0))} findings "
            f"since {short_date(prev['at'])}"
        )

    client_logo = (
        f'<img class="cover-client-logo" src="data:{brand.client_logo_mime};base64,{brand.client_logo_b64}" alt="" />'
        if brand and brand.client_logo_b64 else ""
    )
    firm_logo = (
        f'<img class="cover-firm-logo" src="data:{brand.logo_mime};base64,{brand.logo_b64}" alt="" />'
        if brand and brand.logo_b64 else ""
    )
    firm_name = _esc(brand.firm_name) if brand and brand.firm_name else ""
    logo = f'<div class="cover-logos">{client_logo}</div>' if client_logo else ""
    byline = (
        f'<div class="byline">Prepared by {firm_logo or firm_name}</div>'
        if (firm_logo or firm_name) else ""
    )
    snapshot_at = snapshot.snapshot_at or datetime.now(timezone.utc)
    meter_color = charts.SERIES if score >= 70 else (charts.WARNING if score >= 50 else charts.CRITICAL)

    kpis = "".join([
        _stat("Findings", f"{len(findings)}", f"{urgent} critical or high" if urgent else "None critical or high"),
        _stat("Estimated annual savings", _fmt_money_cents(savings), "From the configured price book"),
        _stat("Active users", _compact(metrics.get("total_active_users") or 0)),
        _stat("Change since last run", change_value, change_note),
    ])

    summary = (
        f'<div class="exec-summary"><div class="eyebrow">Executive summary</div>'
        f'<p>{_esc(snapshot.executive_summary)}</p></div>'
        if snapshot.executive_summary else ""
    )
    return f"""
    <section class="cover">
      {logo}
      <div class="eyebrow">Salesforce org assessment</div>
      <h1 class="org-name">{_esc(org_name)}</h1>
      <div class="subtitle">{snapshot_at.strftime('%B %d, %Y')}</div>
      {byline}
      <div class="hero">
        <div class="hero-label">Org health score</div>
        <div class="hero-value">{score:.0f}<span class="hero-of">/100</span></div>
        <div class="hero-band">{_esc(_health_band(score))}</div>
        <div class="hero-meter"><svg width="320" height="10" viewBox="0 0 320 10" xmlns="http://www.w3.org/2000/svg">
          <rect width="320" height="10" rx="5" fill="{charts.TRACK}"/>
          <rect width="{max(320 * score / 100, 10):.1f}" height="10" rx="5" fill="{meter_color}"/></svg></div>
      </div>
      <div class="kpis">{kpis}</div>
      {summary}
      {_top_priorities(findings)}
    </section>"""


def _severity_counts(findings: Iterable[OrgFinding]) -> Dict[FindingSeverity, int]:
    counts: Dict[FindingSeverity, int] = {}
    for f in findings:
        counts[_sev(f)] = counts.get(_sev(f), 0) + 1
    return counts


def _top_priorities(findings: List[OrgFinding]) -> str:
    top = _sorted_findings(findings)[:5]
    if not top:
        return ""
    rows = "".join(
        f"<tr><td>{_sev_chip(_sev(f))}</td><td>{_esc(f.title)}</td>"
        f"<td class='num'>{f.affected_count:,}</td>"
        f"<td class='num'>{_fmt_money_cents(f.estimated_annual_savings_cents) if f.estimated_annual_savings_cents else '–'}</td></tr>"
        for f in top
    )
    return f"""
      <h3 class="block-title">Top priorities</h3>
      <table class="data"><thead><tr><th>Severity</th><th>Finding</th><th class="num">Affected</th><th class="num">Savings / yr</th></tr></thead>
      <tbody>{rows}</tbody></table>"""


def _glance(findings: List[OrgFinding], ctx: ReportContext) -> str:
    if not findings:
        return ""
    sev_counts = _severity_counts(findings)
    severity_bar = charts.stacked_bar(
        [(SEVERITY_LABEL[s], sev_counts.get(s, 0), charts.SEVERITY_RAMP[s.value]) for s in SEVERITY_ORDER],
        width=640,
    )

    cats = [c for c in CATEGORY_LABELS if any(_cat(f) == c for f in findings)]
    sevs = [s for s in SEVERITY_ORDER if sev_counts.get(s)]
    matrix = [[sum(1 for f in findings if _cat(f) == c and _sev(f) == s) for s in sevs] for c in cats]
    heat = charts.heatmap([CATEGORY_LABELS[c] for c in cats], [SEVERITY_LABEL[s] for s in sevs], matrix)

    by_cat = charts.horizontal_bars(
        [(CATEGORY_LABELS[c], sum(1 for f in findings if _cat(f) == c)) for c in cats], width=320, label_width=150,
    )
    savings_items = [
        (CATEGORY_LABELS[c], sum((f.estimated_annual_savings_cents or 0) for f in findings if _cat(f) == c) / 100)
        for c in cats
    ]
    # One category with savings would be a one-bar chart; the cover total says it.
    savings_chart = charts.horizontal_bars(
        savings_items, width=320, label_width=150, value_label=lambda v: _fmt_money_cents(int(v * 100)),
    ) if sum(1 for _, v in savings_items if v) > 1 else ""

    trend = ""
    if len(ctx.history) >= 2:
        trend_svg = charts.line_chart([(short_date(h["at"]), h["score"]) for h in ctx.history], width=640, height=140)
        trend = f'<h3 class="block-title">Health score over time</h3>{trend_svg}'

    savings_block = (
        f'<div class="col"><h3 class="block-title">Estimated annual savings by category</h3>{savings_chart}</div>'
        if savings_chart else ""
    )
    return f"""
    <section class="page">
      <h2>Findings at a glance</h2>
      <h3 class="block-title">Severity mix</h3>
      {severity_bar}
      <h3 class="block-title">Where the issues are</h3>
      <p class="caption">Number of findings in each category by severity. Darker cells hold more findings.</p>
      {heat}
      <div class="cols">
        <div class="col"><h3 class="block-title">Findings by category</h3>{by_cat}</div>
        {savings_block}
      </div>
      {trend}
    </section>"""


def _profile(snapshot: OrgAnalysisSnapshot) -> str:
    m = snapshot.metrics or {}
    composition = [
        ("Active users", m.get("total_active_users")),
        ("Profiles", m.get("total_profiles")),
        ("Permission sets", m.get("total_permission_sets")),
        ("Permission set groups", m.get("total_permission_set_groups")),
        ("Roles", m.get("total_roles")),
        ("Flows", m.get("total_flows")),
        ("Apex triggers", m.get("total_apex_triggers")),
        ("Apex classes", m.get("total_apex_classes")),
        ("Validation rules", m.get("total_validation_rules")),
        ("Workflow rules", m.get("total_workflow_rules")),
    ]
    tiles = "".join(_stat(label, _compact(v)) for label, v in composition if v is not None)

    licenses = sorted(
        [l for l in (m.get("license_utilization") or []) if l.get("total")],
        key=lambda l: l.get("total", 0), reverse=True,
    )[:10]
    license_rows = "".join(
        f"<tr><td>{_esc(l.get('license_name') or l.get('developer_key'))}</td>"
        f"<td>{charts.meter(l['used'] / l['total'], width=180, warn_at=0.9, critical_at=0.98)}</td>"
        f"<td class='num'>{l['used']:,} of {l['total']:,}</td>"
        f"<td class='num'>{l['total'] - l['used']:,} unused</td></tr>"
        for l in licenses
    )
    license_html = (
        f'<h3 class="block-title">Licence utilisation</h3>'
        f'<table class="data"><thead><tr><th>Licence</th><th>Utilisation</th><th class="num">Used</th><th class="num">Headroom</th></tr></thead>'
        f'<tbody>{license_rows}</tbody></table>'
        if license_rows else ""
    )

    limits = snapshot.org_limits or {}
    limit_rows = []
    for key, label in [("DataStorageMB", "Data storage"), ("FileStorageMB", "File storage"),
                       ("DailyApiRequests", "Daily API requests")]:
        entry = limits.get(key) or {}
        mx, rem = entry.get("Max"), entry.get("Remaining")
        if not mx or rem is None:
            continue
        used = mx - rem
        unit = " MB" if key.endswith("MB") else ""
        limit_rows.append(
            f"<tr><td>{label}</td><td>{charts.meter(used / mx, width=180, warn_at=0.8, critical_at=0.95)}</td>"
            f"<td class='num'>{used / mx * 100:.0f}% used</td><td class='num'>{_compact(used)}{unit} of {_compact(mx)}{unit}</td></tr>"
        )
    limits_html = (
        f'<h3 class="block-title">Platform limits</h3><table class="data"><tbody>{"".join(limit_rows)}</tbody></table>'
        if limit_rows else ""
    )
    if not (tiles or license_html or limits_html):
        return ""
    return f"""
    <section class="page">
      <h2>Org profile &amp; capacity</h2>
      <div class="tiles">{tiles}</div>
      {license_html}
      {limits_html}
    </section>"""


def _risk_and_governance(ctx: ReportContext) -> str:
    blocks: List[str] = []
    level_color = {"critical": "critical", "high": "high", "medium": "medium", "low": "info"}

    if ctx.risk_counts:
        total = sum(ctx.risk_counts.values())
        bar = charts.stacked_bar(
            [(lvl.capitalize(), ctx.risk_counts.get(lvl, 0), charts.SEVERITY_RAMP[level_color[lvl]]) for lvl in RISK_LEVELS],
            width=640,
        )
        rows = "".join(
            f"<tr><td>{_esc(u['name'])}<div class='sub'>{_esc(u['title'] or '')}</div></td>"
            f"<td class='num'>{u['score']:.0f}</td><td>{_esc(u['level'].capitalize())}</td>"
            f"<td class='reason'>{_esc(u['reason'] or '')}</td></tr>"
            for u in ctx.top_risk_users if u["score"] >= 25
        )
        table = (
            f'<table class="data"><thead><tr><th>User</th><th class="num">Score</th><th>Level</th><th>Main drivers</th></tr></thead><tbody>{rows}</tbody></table>'
            if rows else '<p class="caption">No users score medium risk or above.</p>'
        )
        blocks.append(
            f'<h3 class="block-title">User access risk ({total:,} users scored)</h3>{bar}'
            f'<h3 class="block-title">Highest-risk users</h3>{table}'
        )

    if ctx.anomaly_counts:
        bar = charts.stacked_bar(
            [(s.capitalize(), ctx.anomaly_counts.get(s, 0), charts.SEVERITY_RAMP[s])
             for s in ["critical", "high", "medium", "low", "info"]],
            width=640,
        )
        cat_note = ", ".join(f"{v} {k}" for k, v in sorted(ctx.anomaly_by_category.items()))
        blocks.append(
            f'<h3 class="block-title">Access and login anomalies</h3>'
            f'<p class="caption">Users whose access or sign-in behaviour stands out from their peers ({_esc(cat_note)}).</p>{bar}'
        )

    if ctx.compliance:
        rows = "".join(
            f"<tr><td>{_esc(c['framework'])}</td><td>{charts.meter((c['score_pct'] or 0) / 100, width=180)}</td>"
            f"<td class='num'>{(c['score_pct'] or 0):.0f}%</td>"
            f"<td class='num'>{c['passed']} passed · {c['failed']} failed · {c['na']} n/a</td></tr>"
            for c in ctx.compliance
        )
        blocks.append(
            f'<h3 class="block-title">Compliance control coverage</h3>'
            f'<table class="data"><thead><tr><th>Framework</th><th>Controls passed</th><th class="num">Score</th><th class="num">Controls</th></tr></thead><tbody>{rows}</tbody></table>'
        )

    if ctx.data_quality:
        dq = ctx.data_quality
        tiles = "".join([
            _stat("Data quality score", f"{dq['avg_score']:.0f}<span class='of'>/100</span>", f"{dq['objects_analyzed']} objects analysed"),
            _stat("Completeness", f"{dq['avg_completeness']:.0f}%"),
            _stat("Duplicates", f"{dq['avg_duplicate_pct']:.1f}%"),
            _stat("Stale records", f"{dq['avg_staleness_pct']:.0f}%"),
        ])
        worst = charts.horizontal_bars(
            [(o["label"], max(o["score"], 0.5)) for o in dq["worst"]],
            width=640, label_width=200, value_label=lambda v: f"{v:.0f}/100", ascending=True,
        )
        blocks.append(
            f'<h3 class="block-title">Data quality</h3><div class="tiles">{tiles}</div>'
            + (f'<p class="caption">Lowest-scoring objects (with records).</p>{worst}' if worst else "")
        )

    sprawl_rows = []
    if ctx.automation:
        a = ctx.automation
        sprawl_rows.append(("Automations", a.items_total, [
            ("Needs attention", a.items_needs_attention), ("Orphaned", a.items_orphaned),
            ("Inactive", a.items_inactive), ("Unchanged 12+ months", a.items_unchanged), ("Active", a.items_active)]))
    if ctx.reports:
        r = ctx.reports
        sprawl_rows.append(("Reports & dashboards", r.items_total, [
            ("Orphaned", r.items_orphaned), ("Duplicate", r.items_duplicate), ("Unused 12+ months", r.items_zombie),
            ("Usage unknown", r.items_unknown_usage), ("In use", r.items_live)]))
    if ctx.packages:
        p = ctx.packages
        sprawl_rows.append(("Installed packages", p.packages_total, [
            ("Unused", p.packages_unused), ("Under-used", p.packages_underused), ("Active", p.packages_active)]))
    if ctx.integrations:
        i = ctx.integrations
        sprawl_rows.append(("Integrations", i.items_total, [
            ("Broken", i.items_broken), ("Stale", i.items_stale), ("Unknown", i.items_unknown), ("Healthy", i.items_healthy)]))
    if sprawl_rows:
        rows = "".join(
            f"<tr><td>{_esc(name)}</td><td class='num'>{total or 0:,}</td><td>"
            + " · ".join(f"{_esc(label)} <strong>{n or 0:,}</strong>" for label, n in tiers if n)
            + "</td></tr>"
            for name, total, tiers in sprawl_rows
        )
        blocks.append(
            f'<h3 class="block-title">Technical debt inventory</h3>'
            f'<table class="data"><thead><tr><th>Inventory</th><th class="num">Items</th><th>Breakdown</th></tr></thead><tbody>{rows}</tbody></table>'
        )

    if ctx.license_fit and ctx.license_fit.users_assessed:
        lf = ctx.license_fit
        bar = charts.horizontal_bars([
            ("Right-sized", lf.users_right_sized), ("Over-licensed", lf.users_overbuilt),
            ("Wrong cloud", lf.users_wrong_cloud), ("Under-used", lf.users_underused),
            ("Inactive but billed", lf.users_inactive_billed),
        ], width=640, label_width=200)
        blocks.append(
            f'<h3 class="block-title">Licence fit ({lf.users_assessed:,} users)</h3>'
            f'<p class="caption">Estimated annual savings from right-sizing: <strong>{_fmt_money_cents(lf.total_annual_savings_cents or 0)}</strong>.</p>{bar}'
        )

    if not blocks:
        return ""
    return f'<section class="page"><h2>Access, risk &amp; governance</h2>{"".join(blocks)}</section>'


def _detailed_findings(findings: List[OrgFinding]) -> str:
    if not findings:
        return '<section class="page"><h2>Detailed findings</h2><p class="caption">No findings. The org is in good shape.</p></section>'
    parts = ['<section class="page"><h2>Detailed findings</h2>'
             '<p class="caption">Ordered by severity, then estimated savings, then number of items affected.</p>']
    by_sev: Dict[FindingSeverity, List[OrgFinding]] = {}
    for f in _sorted_findings(findings):
        by_sev.setdefault(_sev(f), []).append(f)
    for sev in SEVERITY_ORDER:
        group = by_sev.get(sev)
        if not group:
            continue
        parts.append(f'<h3 class="sev-heading">{_sev_chip(sev)} <span class="count">{len(group)}</span></h3>')
        for f in group:
            savings = (
                f'<span class="savings">{_fmt_money_cents(f.estimated_annual_savings_cents)} / yr</span>'
                if f.estimated_annual_savings_cents else ""
            )
            action = (
                f'<p class="action"><strong>Recommended action.</strong> {_esc(f.recommended_action)}</p>'
                if f.recommended_action else ""
            )
            parts.append(f"""
            <article class="finding" style="border-left-color:{charts.SEVERITY_RAMP[sev.value]}">
              <div class="finding-head"><h4>{_esc(f.title)}</h4>{savings}</div>
              <div class="finding-meta">{_esc(CATEGORY_LABELS[_cat(f)])} · {f.affected_count:,} affected · <code>{_esc(f.code)}</code></div>
              <p>{_esc(f.description)}</p>
              {action}
            </article>""")
    parts.append("</section>")
    return "".join(parts)


def _methodology(snapshot: OrgAnalysisSnapshot) -> str:
    rubric = (snapshot.metrics or {}).get("org_health_rubric") or {}
    weights = rubric.get("weights") or {}
    weight_text = ", ".join(f"{k.capitalize()} −{v}" for k, v in weights.items()) if weights else ""
    return f"""
    <section class="page methodology">
      <h2>Methodology</h2>
      <p><strong>Health score.</strong> Starts at 100 and deducts points per open finding by severity{f' ({_esc(weight_text)})' if weight_text else ''}. Findings marked as ignored are excluded from this report.</p>
      <p><strong>Savings.</strong> Estimated from licence counts and the price book configured for this engagement. They indicate scale, not a quote.</p>
      <p><strong>Data scope.</strong> Newton reads Salesforce configuration metadata, the org's users and their access, recent login history and the Setup Audit Trail. Record-level figures (counts, completeness, duplicates) come from aggregate queries; the contents of business records are never read.</p>
      <p><strong>Risk and anomalies.</strong> User risk combines privileged system permissions, access to sensitive data, unusual access compared with peers, inactivity and sole ownership of access. Anomalies are users whose access pattern differs statistically from their peers or whose sign-ins look unusual.</p>
      <p><strong>Point in time.</strong> All figures reflect the org on the date of this report and should be confirmed before changes are made.</p>
    </section>"""


FOOTER_FONT = "font-family: 'Helvetica Neue', Arial, 'DejaVu Sans', sans-serif; font-size: 7.5pt; color: #898781;"

STYLE = """
  @page { size: Letter; margin: 0.95in 0.6in 0.7in 0.6in; @top-center { content: element(letterhead); width: 100%; vertical-align: bottom; padding-bottom: 10px; } }
  @page :first { margin-top: 0.6in; @top-center { content: none; } }
  .letterhead { position: running(letterhead); display: flex; justify-content: space-between; align-items: center; width: 100%; border-bottom: 1px solid #e1e0d9; padding-bottom: 6px; }
  .lh-logo { max-height: 26px; max-width: 150px; }
  .lh-text { font-size: 8pt; color: #898781; font-weight: 600; }
  .cover-logos { margin-bottom: 1.4em; }
  .cover-client-logo { max-height: 64px; max-width: 260px; }
  .cover-firm-logo { max-height: 22px; max-width: 140px; vertical-align: middle; margin-left: 4px; }
  body { font-family: 'Helvetica Neue', Arial, 'DejaVu Sans', sans-serif; color: #0b0b0b; font-size: 10pt; line-height: 1.45; }
  h1, h2, h3, h4 { margin: 0; }
  h2 { font-size: 16pt; color: ACCENT; margin-bottom: 0.6em; }
  .page { page-break-before: always; }
  .eyebrow { font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase; color: #898781; font-weight: 600; }
  .cover .org-name { font-size: 26pt; color: ACCENT; margin: 0.15em 0 0.1em; }
  .subtitle { color: #52514e; font-size: 11pt; }
  .byline { color: #52514e; font-size: 9pt; margin-top: 0.2em; }
  .hero { margin: 1.6em 0 1.2em; }
  .hero-label { font-size: 9pt; color: #52514e; }
  .hero-value { font-size: 52pt; font-weight: 700; line-height: 1; }
  .hero-of, .of { font-size: 0.4em; color: #898781; font-weight: 400; }
  .hero-band { font-size: 11pt; font-weight: 600; margin: 0.2em 0 0.5em; }
  .kpis, .tiles { display: flex; flex-wrap: wrap; gap: 10px; margin: 0.6em 0 1em; }
  .stat { box-sizing: border-box; flex: 1 1 0; min-width: 0; border: 1px solid #e1e0d9; border-radius: 8px; padding: 8px 10px; background: #fcfcfb; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); }
  .stat-label { font-size: 8pt; color: #52514e; }
  .stat-value { font-size: 17pt; font-weight: 600; }
  .stat-note { font-size: 7.5pt; color: #898781; }
  .exec-summary { margin: 0.8em 0 1em; padding: 0.8em 1em; border-left: 3px solid ACCENT; background: #f9f9f7; }
  .exec-summary p { margin: 0.3em 0 0; }
  .block-title { font-size: 10.5pt; margin: 1.3em 0 0.5em; }
  .caption { color: #52514e; font-size: 8.5pt; margin: 0 0 0.5em; }
  .cols { display: flex; gap: 24px; }
  .col { flex: 1; }
  table.data { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  table.data th { text-align: left; color: #52514e; font-weight: 600; border-bottom: 1px solid #c3c2b7; padding: 4px 6px; }
  table.data td { border-bottom: 1px solid #e1e0d9; padding: 5px 6px; vertical-align: middle; }
  table.data .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.data .sub { color: #898781; font-size: 7.5pt; }
  table.data .reason { color: #52514e; font-size: 8pt; }
  tr { page-break-inside: avoid; }
  .sev { white-space: nowrap; font-weight: 600; }
  .sev svg { vertical-align: -1px; }
  .legend-item { margin-right: 12px; }
  .sev-heading { font-size: 12pt; margin: 1.2em 0 0.5em; }
  .sev-heading .count { color: #898781; font-weight: 400; }
  .finding { border: 1px solid #e1e0d9; border-left: 4px solid #c3c2b7; border-radius: 6px; padding: 8px 12px; margin: 0 0 8px; page-break-inside: avoid; }
  .finding-head { display: flex; justify-content: space-between; gap: 12px; }
  .finding h4 { font-size: 10.5pt; }
  .finding-meta { color: #898781; font-size: 8pt; margin: 2px 0 4px; }
  .finding p { margin: 0.25em 0; }
  .savings { color: #006300; font-weight: 600; white-space: nowrap; }
  .action { font-size: 9pt; }
  code { font-size: 7.5pt; background: #f0efec; padding: 0 3px; border-radius: 2px; }
  .methodology p { margin: 0 0 0.7em; }
"""


def _letterhead(org_name: str, brand) -> str:
    """Running header on every page after the cover: client left, firm right."""
    def img(mime, b64):
        return f'<img class="lh-logo" src="data:{mime};base64,{b64}" alt="" />' if b64 else ""

    client = img(getattr(brand, "client_logo_mime", None), getattr(brand, "client_logo_b64", None))
    firm = img(getattr(brand, "logo_mime", None), getattr(brand, "logo_b64", None))
    left = client or f'<span class="lh-text">{_esc(org_name)}</span>'
    right = firm or (f'<span class="lh-text">{_esc(brand.firm_name)}</span>' if brand and brand.firm_name else "")
    return f'<div class="letterhead"><div class="lh-left">{left}</div><div class="lh-right">{right}</div></div>'


def _build_html(
    org_name: str,
    snapshot: OrgAnalysisSnapshot,
    findings: List[OrgFinding],
    brand: Optional["BrandContext"] = None,
    ctx: Optional[ReportContext] = None,
) -> str:
    ctx = ctx or ReportContext()
    accent = (brand.accent_hex if brand else None) or "#14532d"
    footer = _esc(brand.firm_name) if (brand and brand.firm_name) else "Newton"
    style = STYLE.replace("ACCENT", accent) + (
        f'@page {{ @bottom-left {{ content: "{_esc(org_name)} · Salesforce org assessment"; {FOOTER_FONT} }}'
        f' @bottom-right {{ content: "{footer} · page " counter(page) " of " counter(pages); {FOOTER_FONT} }} }}'
    )
    body = _letterhead(org_name, brand) + "".join([
        _cover(org_name, snapshot, findings, ctx, brand),
        _glance(findings, ctx),
        _profile(snapshot),
        _risk_and_governance(ctx),
        _detailed_findings(findings),
        _methodology(snapshot),
    ])
    return (
        f'<!doctype html><html><head><meta charset="utf-8">'
        f'<title>Salesforce org assessment — {_esc(org_name)}</title><style>{style}</style></head>'
        f"<body>{body}</body></html>"
    )


class BrandContext:
    """Letterhead inputs; None fields fall back to defaults."""

    __slots__ = ("firm_name", "accent_hex", "logo_mime", "logo_b64", "client_logo_mime", "client_logo_b64")

    def __init__(
        self,
        firm_name: Optional[str] = None,
        accent_hex: Optional[str] = None,
        logo_mime: Optional[str] = None,
        logo_b64: Optional[str] = None,
        client_logo_mime: Optional[str] = None,
        client_logo_b64: Optional[str] = None,
    ):
        self.firm_name = firm_name
        self.accent_hex = accent_hex
        self.logo_mime = logo_mime
        self.logo_b64 = logo_b64
        self.client_logo_mime = client_logo_mime
        self.client_logo_b64 = client_logo_b64


def build_report_pdf(
    org_name: str,
    snapshot: OrgAnalysisSnapshot,
    findings: List[OrgFinding],
    brand: Optional[BrandContext] = None,
    ctx: Optional[ReportContext] = None,
) -> bytes:
    from weasyprint import HTML  # type: ignore

    return HTML(string=_build_html(org_name, snapshot, findings, brand=brand, ctx=ctx)).write_pdf()
