"""Excel workbook of the Health Report: the same latest results as the PDF,
plus the per-user rows behind them, for consultants to sort and filter.

Sheets: Summary, Findings, License Fit, Anomalies, User Risk, Sprawl
Summary, Data Quality. A sheet whose module hasn't run says so in a row
rather than staying blank. Names come from the database, which privacy
mode has already masked; per-user sheets are left out at metadata-only.
"""
from __future__ import annotations

import io
import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AccessAnomaly,
    DataQualityRun,
    LicenseFitAssessment,
    ObjectQualityScore,
    OrgAnalysisSnapshot,
    OrgFinding,
    Organization,
    RiskScore,
    UserSnapshot,
)
from app.services import privacy_mode
from app.services.anomaly_detection import ANOMALY_TYPE_LABELS
from app.services.report.context import ReportContext, _value

logger = logging.getLogger(__name__)

SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"]
USD = '"$"#,##0'
USD_CENTS = '"$"#,##0.00'
PCT = '0.0"%"'
HEADER_FILL = PatternFill("solid", fgColor="E8F1EC")
PRICE_NOTE = "Savings use Salesforce's published list prices; negotiated rates replace them where entered."


class Column:
    def __init__(self, title: str, width: int = 14, fmt: Optional[str] = None, wrap: bool = False):
        self.title, self.width, self.fmt, self.wrap = title, width, fmt, wrap


def _safe(value: Any) -> Any:
    # A leading = + - @ in client text would run as a formula in Excel.
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@"):
        return "'" + value
    return value


def _table(ws: Worksheet, columns: Sequence[Column], rows: Iterable[Sequence[Any]], empty: str) -> None:
    """Header row (frozen, filterable), data rows, widths and number formats."""
    for i, col in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=i, value=col.title)
        cell.font = Font(bold=True)
        cell.fill = HEADER_FILL
        ws.column_dimensions[get_column_letter(i)].width = col.width
    n = 1
    for n, row in enumerate(rows, start=2):
        for i, (col, value) in enumerate(zip(columns, row), start=1):
            cell = ws.cell(row=n, column=i, value=_safe(value))
            if col.fmt:
                cell.number_format = col.fmt
            if col.wrap:
                cell.alignment = Alignment(wrap_text=True, vertical="top")
    if n == 1:
        ws.cell(row=2, column=1, value=empty).font = Font(italic=True)
        n = 2
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(columns))}{n}"


def _dollars(cents: Optional[int]) -> Optional[float]:
    return None if cents is None else cents / 100


def _summary(ws: Worksheet, org: Organization, snap: OrgAnalysisSnapshot, findings: List[OrgFinding],
             brand: Dict[str, Any]) -> None:
    from app.services.org_analyzer import _health_band

    metrics = snap.metrics or {}
    score = metrics.get("org_health_score")
    counts = Counter(_value(f.severity) for f in findings)
    rows: List[tuple] = [
        ("Organization", org.name, None),
        ("Run date", (snap.snapshot_at or datetime.now(timezone.utc)).strftime("%Y-%m-%d"), None),
        ("Health score (0-100)", score, "0"),
        ("Health band", _health_band(int(score)) if score is not None else None, None),
        ("Findings", len(findings), "0"),
        *[(f"  {s.capitalize()}", counts.get(s, 0), "0") for s in SEVERITY_ORDER],
        ("Estimated annual savings", _dollars(sum(f.estimated_annual_savings_cents or 0 for f in findings)), USD),
        ("Active users", metrics.get("total_active_users"), "#,##0"),
        ("Prepared by", brand.get("firm_name"), None),
        ("Pricing", PRICE_NOTE, None),
    ]
    if org.is_demo:
        rows.insert(0, ("Demo data", "Synthetic org generated for demonstration, not a real Salesforce org.", None))
    ws.column_dimensions["A"].width = 26
    ws.column_dimensions["B"].width = 70
    for r, (label, value, fmt) in enumerate(rows, start=1):
        ws.cell(row=r, column=1, value=label).font = Font(bold=True)
        cell = ws.cell(row=r, column=2, value=_safe(value))
        if fmt:
            cell.number_format = fmt
            cell.alignment = Alignment(horizontal="left")
    _logos(ws, brand, anchor_row=len(rows) + 2)


def _logos(ws: Worksheet, brand: Dict[str, Any], anchor_row: int) -> None:
    """Client and firm logos under the summary, when uploaded."""
    try:
        from openpyxl.drawing.image import Image
    except Exception:  # noqa: BLE001 — Pillow missing; logos are optional
        return
    col = 1
    for key in ("client_logo_bytes", "logo_bytes"):
        data = brand.get(key)
        if not data:
            continue
        try:
            img = Image(io.BytesIO(data))
            if img.height:
                ratio = 60 / img.height
                img.height, img.width = 60, int(img.width * ratio)
            ws.add_image(img, f"{get_column_letter(col)}{anchor_row}")
            col += 2
        except Exception:  # noqa: BLE001 — an unreadable logo shouldn't fail the export
            logger.warning("workbook: could not embed %s", key)


def _findings(ws: Worksheet, findings: List[OrgFinding]) -> None:
    ordered = sorted(findings, key=lambda f: (
        SEVERITY_ORDER.index(_value(f.severity)) if _value(f.severity) in SEVERITY_ORDER else 99,
        -(f.estimated_annual_savings_cents or 0),
        -(f.affected_count or 0),
    ))
    _table(ws, [
        Column("Severity", 11), Column("Category", 16), Column("Code", 26), Column("Finding", 50, wrap=True),
        Column("Affected", 10, "#,##0"), Column("Est. annual savings", 18, USD),
        Column("Description", 70, wrap=True), Column("Recommended action", 60, wrap=True),
    ], (
        (_value(f.severity), _value(f.category), f.code, f.title, f.affected_count,
         _dollars(f.estimated_annual_savings_cents), f.description, f.recommended_action)
        for f in ordered
    ), "No findings in this run.")


async def _license_fit(ws: Worksheet, db: AsyncSession, ctx: ReportContext, users_allowed: bool) -> None:
    columns = [
        Column("User", 24), Column("Username", 30), Column("Profile", 22), Column("Department", 16),
        Column("Current licence", 22), Column("Current $/month", 15, USD_CENTS), Column("Fit", 14),
        Column("Recommended", 28), Column("Recommended $/month", 18, USD_CENTS),
        Column("Annual savings", 15, USD), Column("Days since login", 15, "#,##0"), Column("Confidence", 12),
    ]
    if not users_allowed:
        return _table(ws, columns, [], "Not available at this org's privacy level (metadata only).")
    run = ctx.license_fit
    rows = [] if run is None else (await db.execute(
        select(LicenseFitAssessment)
        .where(LicenseFitAssessment.run_id == run.id)
        .order_by(desc(LicenseFitAssessment.annual_savings_cents), LicenseFitAssessment.user_name)
    )).scalars().all()
    _table(ws, columns, (
        (a.user_name, a.user_username, a.user_profile_name, a.user_department, a.current_license_name,
         _dollars(a.current_monthly_cost_cents), a.fit_category, a.recommended_license_name,
         _dollars(a.recommended_monthly_cost_cents), _dollars(a.annual_savings_cents), a.days_since_login,
         a.confidence)
        for a in rows
    ), "License Fit has not been run for this org yet." if run is None else "No users assessed.")


async def _anomalies(ws: Worksheet, db: AsyncSession, org_id: str, users_allowed: bool) -> None:
    columns = [
        Column("Rank", 7, "0"), Column("User", 24), Column("Category", 11), Column("Type", 24),
        Column("Risk level", 11), Column("Session severity", 15),
        Column("Anomaly score", 14, "0.000"), Column("Reasons", 100, wrap=True),
    ]
    if not users_allowed:
        return _table(ws, columns, [], "Not available at this org's privacy level (metadata only).")
    rows = (await db.execute(
        select(AccessAnomaly, UserSnapshot.name)
        .join(UserSnapshot, (UserSnapshot.salesforce_id == AccessAnomaly.user_id)
              & (UserSnapshot.organization_id == AccessAnomaly.organization_id))
        .where(AccessAnomaly.organization_id == org_id)
    )).all()
    levels = {r.entity_id: _value(r.risk_level) for r in await _latest_risks(db, org_id)}
    # Access anomalies by rank, then session anomalies by score.
    rows = sorted(rows, key=lambda r: (
        r[0].category == "session", (r[0].peer_stats or {}).get("rank") or 10**9, -(r[0].anomaly_score or 0)))
    _table(ws, columns, (
        ((a.peer_stats or {}).get("rank"), name, a.category or "access",
         ANOMALY_TYPE_LABELS.get((a.peer_stats or {}).get("anomaly_type"), "") if a.category != "session" else "Session",
         (levels.get(a.user_id) or '').capitalize() or None,
         _value(a.severity) if a.category == "session" else None,
         a.anomaly_score, "\n".join(a.reasons or []))
        for a, name in rows
    ), "No anomalies flagged.")


async def _latest_risks(db: AsyncSession, org_id: str) -> List[RiskScore]:
    latest = (
        select(RiskScore.entity_id, func.max(RiskScore.calculated_at).label("at"))
        .where(RiskScore.organization_id == org_id, RiskScore.entity_type == "user")
        .group_by(RiskScore.entity_id)
        .subquery()
    )
    return list((await db.execute(
        select(RiskScore).join(latest, (RiskScore.entity_id == latest.c.entity_id) & (RiskScore.calculated_at == latest.c.at))
        .where(RiskScore.organization_id == org_id)
    )).scalars().all())


async def _user_risk(ws: Worksheet, db: AsyncSession, org_id: str, users_allowed: bool) -> None:
    columns = [
        Column("User", 24), Column("Title", 26), Column("Department", 16), Column("Risk score", 11, "0"),
        Column("Risk level", 11), Column("Main reason", 100, wrap=True),
    ]
    if not users_allowed:
        return _table(ws, columns, [], "Not available at this org's privacy level (metadata only).")
    latest = (
        select(RiskScore.entity_id, func.max(RiskScore.calculated_at).label("at"))
        .where(RiskScore.organization_id == org_id, RiskScore.entity_type == "user")
        .group_by(RiskScore.entity_id)
        .subquery()
    )
    rows = (await db.execute(
        select(RiskScore, UserSnapshot)
        .join(latest, (RiskScore.entity_id == latest.c.entity_id) & (RiskScore.calculated_at == latest.c.at))
        .join(UserSnapshot, (UserSnapshot.salesforce_id == RiskScore.entity_id)
              & (UserSnapshot.organization_id == org_id), isouter=True)
        .where(RiskScore.organization_id == org_id)
        .order_by(RiskScore.risk_score.desc())
    )).all()
    _table(ws, columns, (
        ((u.name if u else None) or r.entity_id, u.title if u else None, u.department if u else None,
         r.risk_score, _value(r.risk_level), r.reason_text)
        for r, u in rows
    ), "Risk scores have not been calculated for this org yet.")


def _sprawl(ws: Worksheet, ctx: ReportContext) -> None:
    rows: List[tuple] = []

    def add(name: str, run: Any, tiers: List[tuple]) -> None:
        if run is None:
            rows.append((name, "Not run yet", None))
            return
        for label, attr in tiers:
            rows.append((name, label, getattr(run, attr, None) or 0))

    add("Automations", ctx.automation, [
        ("Total", "items_total"), ("Needs attention", "items_needs_attention"), ("Orphaned", "items_orphaned"),
        ("Inactive", "items_inactive"), ("Unchanged 12+ months", "items_unchanged"), ("Active", "items_active")])
    add("Reports & dashboards", ctx.reports, [
        ("Total", "items_total"), ("Orphaned", "items_orphaned"), ("Duplicate", "items_duplicate"),
        ("Unused 12+ months", "items_zombie"), ("Usage unknown", "items_unknown_usage"), ("In use", "items_live")])
    add("Installed packages", ctx.packages, [
        ("Total", "packages_total"), ("Unused", "packages_unused"), ("Under-used", "packages_underused"),
        ("Active", "packages_active")])
    add("Integrations", ctx.integrations, [
        ("Total", "items_total"), ("Broken", "items_broken"), ("Stale", "items_stale"),
        ("Unknown", "items_unknown"), ("Healthy", "items_healthy")])
    _table(ws, [Column("Inventory", 22), Column("Status", 22), Column("Items", 10, "#,##0")], rows,
           "No sprawl analysis has been run for this org yet.")


async def _data_quality(ws: Worksheet, db: AsyncSession, org_id: str) -> None:
    run = (await db.execute(
        select(DataQualityRun).where(DataQualityRun.organization_id == org_id)
        .order_by(desc(DataQualityRun.snapshot_at)).limit(1)
    )).scalar_one_or_none()
    rows = [] if run is None else (await db.execute(
        select(ObjectQualityScore).where(ObjectQualityScore.run_id == run.id)
        .order_by(ObjectQualityScore.score.asc())
    )).scalars().all()
    _table(ws, [
        Column("Object", 28), Column("API name", 28), Column("Records", 12, "#,##0"), Column("Score", 9, "0"),
        Column("Completeness", 13, PCT), Column("Duplicates", 11, PCT), Column("Stale", 9, PCT),
        Column("Fields with gaps", 15, "#,##0"),
    ], (
        (o.object_label, o.object_name, o.record_count, o.score, o.completeness_pct, o.duplicate_pct,
         o.staleness_pct, o.fields_with_gaps)
        for o in rows
    ), "Data Quality has not been run for this org yet." if run is None else "No objects analysed.")


async def build_report_workbook(
    db: AsyncSession,
    org: Organization,
    snapshot: OrgAnalysisSnapshot,
    findings: List[OrgFinding],
    ctx: ReportContext,
    brand: Optional[Dict[str, Any]] = None,
) -> bytes:
    users_allowed = privacy_mode.allows(org, privacy_mode.USER_RECORDS)
    wb = Workbook()
    _summary(wb.active, org, snapshot, findings, brand or {})
    wb.active.title = "Summary"
    _findings(wb.create_sheet("Findings"), findings)
    await _license_fit(wb.create_sheet("License Fit"), db, ctx, users_allowed)
    await _anomalies(wb.create_sheet("Anomalies"), db, org.id, users_allowed)
    await _user_risk(wb.create_sheet("User Risk"), db, org.id, users_allowed)
    _sprawl(wb.create_sheet("Sprawl Summary"), ctx)
    await _data_quality(wb.create_sheet("Data Quality"), db, org.id)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
