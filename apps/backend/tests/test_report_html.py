from datetime import datetime, timezone
from types import SimpleNamespace as NS

from app.domain.models import FindingCategory as C, FindingSeverity as S
from app.services.org_analyzer_pdf import _build_html
from app.services.report.context import ReportContext


def _finding(sev, title, savings=None):
    return NS(category=C.CONFIG_BLOAT, severity=sev, title=title, affected_count=1,
              estimated_annual_savings_cents=savings, code="X", description="d", recommended_action=None)


def test_findings_are_ordered_by_severity_then_savings():
    snap = NS(snapshot_at=datetime(2026, 10, 9, tzinfo=timezone.utc), executive_summary=None,
              metrics={"org_health_score": 70}, org_limits={})
    findings = [
        _finding(S.LOW, "low-one"),
        _finding(S.HIGH, "high-small", 100),
        _finding(S.CRITICAL, "critical-one"),
        _finding(S.HIGH, "high-big", 900000),
    ]
    html = _build_html("Org", snap, findings, ctx=ReportContext())
    detail = html[html.index("Detailed findings"):]
    order = [detail.index(t) for t in ["critical-one", "high-big", "high-small", "low-one"]]
    assert order == sorted(order)
    assert "<svg" in html


def test_optional_sections_are_skipped_without_data():
    snap = NS(snapshot_at=datetime(2026, 10, 9, tzinfo=timezone.utc), executive_summary=None,
              metrics={"org_health_score": 90}, org_limits={})
    html = _build_html("Org", snap, [], ctx=ReportContext())
    assert "Access, risk &amp; governance" not in html
    assert "No findings" in html
