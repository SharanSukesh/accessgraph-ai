"""PDF report generator for the Org Analyzer.

Renders an inline HTML template through WeasyPrint. Kept in a separate
module from the route + the analyzer service so the weasyprint import
only happens when a PDF is actually requested — if the dep is missing
on the host, the rest of the analyzer still works.
"""
from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Iterable, List, Optional

from app.domain.models import (
    FindingCategory,
    FindingSeverity,
    OrgAnalysisSnapshot,
    OrgFinding,
)


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

SEVERITY_COLOR = {
    FindingSeverity.CRITICAL: "#7f1d1d",
    FindingSeverity.HIGH: "#b91c1c",
    FindingSeverity.MEDIUM: "#c2410c",
    FindingSeverity.LOW: "#a16207",
    FindingSeverity.INFO: "#1e40af",
}


def _fmt_money_cents(c: int) -> str:
    dollars = c / 100.0
    if dollars >= 1_000_000:
        return f"${dollars / 1_000_000:.2f}M"
    if dollars >= 10_000:
        return f"${dollars / 1_000:.1f}K"
    return f"${dollars:,.0f}"


def _sev_value(f: OrgFinding) -> FindingSeverity:
    if isinstance(f.severity, FindingSeverity):
        return f.severity
    try:
        return FindingSeverity(str(f.severity))
    except Exception:
        return FindingSeverity.INFO


def _cat_value(f: OrgFinding) -> FindingCategory:
    if isinstance(f.category, FindingCategory):
        return f.category
    try:
        return FindingCategory(str(f.category))
    except Exception:
        return FindingCategory.CONFIG_BLOAT


def _render_findings_section(findings: Iterable[OrgFinding]) -> str:
    by_cat: dict[FindingCategory, list[OrgFinding]] = {c: [] for c in CATEGORY_LABELS}
    for f in findings:
        by_cat[_cat_value(f)].append(f)

    sev_rank = {s: i for i, s in enumerate(SEVERITY_ORDER)}
    parts: List[str] = []
    for cat, cat_findings in by_cat.items():
        if not cat_findings:
            continue
        cat_findings.sort(
            key=lambda f: (
                sev_rank.get(_sev_value(f), 99),
                -(f.estimated_annual_savings_cents or 0),
            )
        )
        parts.append(
            f'<section class="category"><h2>{html.escape(CATEGORY_LABELS[cat])}</h2>'
        )
        for f in cat_findings:
            sev = _sev_value(f)
            color = SEVERITY_COLOR[sev]
            savings_html = (
                f'<span class="savings">{_fmt_money_cents(f.estimated_annual_savings_cents)}/yr saved</span>'
                if f.estimated_annual_savings_cents
                else ""
            )
            action_html = (
                f'<p class="action"><strong>Recommended action:</strong> {html.escape(f.recommended_action)}</p>'
                if f.recommended_action
                else ""
            )
            parts.append(f"""
              <article class="finding">
                <header>
                  <span class="severity" style="background-color: {color}">{sev.value.upper()}</span>
                  <h3>{html.escape(f.title)}</h3>
                  {savings_html}
                </header>
                <p>{html.escape(f.description)}</p>
                {action_html}
                <p class="meta">Affected: <strong>{f.affected_count}</strong> &middot; Code: <code>{html.escape(f.code)}</code></p>
              </article>
            """)
        parts.append("</section>")

    if not parts:
        return '<p class="empty">No findings — your org is in good shape.</p>'
    return "\n".join(parts)


def _render_summary_table(snapshot: OrgAnalysisSnapshot) -> str:
    return _render_summary_table_counts(snapshot.findings_by_severity or {})


def _render_summary_table_counts(counts: dict) -> str:
    rows = []
    for s in SEVERITY_ORDER:
        count = counts.get(s.value, 0)
        if not count:
            continue
        rows.append(
            f'<tr><td><span class="severity" style="background-color:{SEVERITY_COLOR[s]}">{s.value.upper()}</span></td>'
            f'<td>{count}</td></tr>'
        )
    if not rows:
        return ""
    return f'<table class="summary"><thead><tr><th>Severity</th><th>Count</th></tr></thead><tbody>{"".join(rows)}</tbody></table>'


def _build_html(
    org_name: str,
    snapshot: OrgAnalysisSnapshot,
    findings: List[OrgFinding],
    brand: Optional["BrandContext"] = None,
) -> str:
    snapshot_at = snapshot.snapshot_at or datetime.now(timezone.utc)
    findings_html = _render_findings_section(findings)
    # Recompute totals from the passed-in findings rather than from the
    # snapshot's stored counts — the caller may have filtered out ignored
    # findings, and the report should reflect what the consultant intends
    # to deliver.
    findings_count = len(findings)
    total_savings_cents = sum(
        (f.estimated_annual_savings_cents or 0) for f in findings
    )
    sev_count: dict[str, int] = {}
    for f in findings:
        sev_val = (
            f.severity.value if isinstance(f.severity, FindingSeverity)
            else str(f.severity)
        )
        sev_count[sev_val] = sev_count.get(sev_val, 0) + 1
    summary_html = _render_summary_table_counts(sev_count)
    total_savings = _fmt_money_cents(total_savings_cents)

    # White-label substitutions: when a brand is set, the report carries
    # the firm's name + logo on the cover and uses the firm accent color
    # for headers / finding rails. Without a brand, the defaults match
    # what the report has always rendered.
    accent = (brand.accent_hex if brand else None) or "#1e1b4b"
    cover_logo_html = (
        f'<img class="firm-logo" src="data:{brand.logo_mime};base64,{brand.logo_b64}" alt="Firm logo" />'
        if (brand and brand.logo_b64) else ""
    )
    firm_byline = (
        f'<div class="firm-byline">Prepared by {html.escape(brand.firm_name)}</div>'
        if (brand and brand.firm_name) else ""
    )
    footer_label = (
        html.escape(brand.firm_name) if (brand and brand.firm_name) else "AccessGraph AI"
    )

    # Executive summary surfaces above the cover-page stats when present.
    exec_summary_html = ""
    if snapshot.executive_summary:
        exec_summary_html = (
            f'<div class="exec-summary">'
            f'<div class="exec-summary-label">Executive summary</div>'
            f'<p>{html.escape(snapshot.executive_summary)}</p>'
            f'</div>'
        )

    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Org Health Report — {html.escape(org_name)}</title>
<style>
  @page {{ size: Letter; margin: 0.6in; }}
  body {{ font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 11pt; line-height: 1.4; }}
  h1 {{ font-size: 22pt; margin: 0 0 0.2em 0; color: {accent}; }}
  h2 {{ font-size: 14pt; margin-top: 1em; color: {accent}; border-bottom: 2px solid {accent}; padding-bottom: 0.15em; }}
  h3 {{ font-size: 11pt; margin: 0 0 0.25em 0; }}
  .cover {{ page-break-after: always; padding-top: 1.2in; }}
  .cover .firm-logo {{ max-height: 64px; max-width: 240px; margin-bottom: 1em; }}
  .cover .org-name {{ font-size: 28pt; font-weight: 700; color: {accent}; margin-bottom: 0.4em; }}
  .cover .subtitle {{ font-size: 14pt; color: #6b7280; }}
  .cover .firm-byline {{ font-size: 10pt; color: #6b7280; margin-top: 0.5em; font-style: italic; }}
  .cover .stat {{ display: inline-block; margin-right: 2em; margin-top: 1.5em; }}
  .cover .stat .label {{ font-size: 9pt; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }}
  .cover .stat .value {{ font-size: 28pt; font-weight: 700; color: {accent}; }}
  .exec-summary {{ margin: 1.5em 0; padding: 1em 1.2em; background: #f4f4f9; border-left: 4px solid {accent}; border-radius: 4px; }}
  .exec-summary-label {{ font-size: 9pt; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin-bottom: 0.4em; }}
  .exec-summary p {{ margin: 0; font-size: 11pt; line-height: 1.55; }}
  .summary {{ width: 60%; border-collapse: collapse; margin: 1em 0; }}
  .summary th, .summary td {{ text-align: left; padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }}
  .severity {{ display: inline-block; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 9pt; font-weight: 600; letter-spacing: 0.04em; }}
  .finding {{ margin: 1em 0 1.4em 0; padding: 0.8em; background: #f9fafb; border-left: 3px solid {accent}; border-radius: 3px; page-break-inside: avoid; }}
  .finding header {{ display: flex; align-items: center; gap: 0.6em; flex-wrap: wrap; margin-bottom: 0.4em; }}
  .finding header h3 {{ flex: 1; }}
  .savings {{ font-weight: 600; color: #059669; font-size: 10pt; }}
  .action {{ font-size: 10pt; }}
  .meta {{ font-size: 9pt; color: #6b7280; margin-top: 0.4em; }}
  code {{ background: #e5e7eb; padding: 1px 4px; border-radius: 2px; font-size: 9pt; }}
  .empty {{ font-style: italic; color: #6b7280; }}
  .category {{ page-break-inside: auto; }}
  footer {{ position: running(footer); font-size: 8pt; color: #9ca3af; text-align: center; }}
  @page {{ @bottom-center {{ content: "{footer_label} — Org Health Report  |  Page " counter(page) " of " counter(pages); font-size: 8pt; color: #9ca3af; }} }}
</style></head>
<body>
  <section class="cover">
    {cover_logo_html}
    <div class="org-name">{html.escape(org_name)}</div>
    <div class="subtitle">Salesforce Org Health Report</div>
    <div class="subtitle">{snapshot_at.strftime('%B %d, %Y')}</div>
    {firm_byline}
    {exec_summary_html}
    <div>
      <div class="stat"><div class="label">Findings</div><div class="value">{findings_count}</div></div>
      <div class="stat"><div class="label">Estimated annual savings</div><div class="value">{total_savings}</div></div>
    </div>
    <div style="margin-top:2em;">{summary_html}</div>
    <p style="margin-top:2em; color:#6b7280; font-size:10pt;">
      This report identifies redundancies, inefficiencies, security
      posture issues, and license-waste opportunities in your Salesforce
      org. Each finding includes recommended next steps and, where
      applicable, an estimated annual savings figure based on the
      configured license price book.
    </p>
  </section>
  <section class="body">
    {findings_html}
  </section>
</body></html>
"""


class BrandContext:
    """Lightweight container passed into the PDF renderer so it can
    white-label the cover page + accent color. None-fields mean
    "use defaults"."""

    __slots__ = ("firm_name", "accent_hex", "logo_mime", "logo_b64")

    def __init__(
        self,
        firm_name: Optional[str] = None,
        accent_hex: Optional[str] = None,
        logo_mime: Optional[str] = None,
        logo_b64: Optional[str] = None,
    ):
        self.firm_name = firm_name
        self.accent_hex = accent_hex
        self.logo_mime = logo_mime
        self.logo_b64 = logo_b64


def build_report_pdf(
    org_name: str,
    snapshot: OrgAnalysisSnapshot,
    findings: List[OrgFinding],
    brand: Optional[BrandContext] = None,
) -> bytes:
    """Render the analyzer report to PDF bytes.

    Imports weasyprint lazily so a missing system dep doesn't break the
    rest of the analyzer's endpoints (the route falls back to a 503).
    """
    from weasyprint import HTML  # type: ignore

    html_str = _build_html(org_name, snapshot, findings, brand=brand)
    return HTML(string=html_str).write_pdf()
