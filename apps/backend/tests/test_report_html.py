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


def test_demo_org_report_is_marked_on_cover_and_every_page():
    snap = NS(snapshot_at=datetime(2026, 10, 9, tzinfo=timezone.utc), executive_summary=None,
              metrics={"org_health_score": 70}, org_limits={})
    demo = _build_html("Lumenvale", snap, [], ctx=ReportContext(), is_demo=True)
    real = _build_html("Lumenvale", snap, [], ctx=ReportContext())
    assert 'class="demo-banner"' in demo and "Demo data" in demo
    assert "· DEMO DATA" in demo
    assert "Demo data" not in real and "DEMO DATA" not in real


def test_compliance_section_is_framed_as_indicators():
    snap = NS(snapshot_at=datetime(2026, 10, 9, tzinfo=timezone.utc), executive_summary=None,
              metrics={"org_health_score": 70}, org_limits={})
    ctx = ReportContext(compliance=[{"framework": "SOX", "score_pct": 80, "passed": 8, "failed": 2, "na": 0}])
    html = _build_html("Org", snap, [], ctx=ctx)
    assert "Compliance Control Indicators" in html
    assert "Not an audit opinion, attestation, or certification." in html


def test_code_coverage_block_states_the_gate_and_staleness():
    from app.services.code_coverage import summarize_coverage
    from app.ingestion.demo_orgs import load_fixture
    from datetime import datetime, timezone

    cov = summarize_coverage(load_fixture("synthetic_mid_market")["demo_live"]["code_coverage"],
                             now=datetime(2026, 10, 14, 9, 0, tzinfo=timezone.utc))
    snap = NS(snapshot_at=datetime(2026, 10, 14, tzinfo=timezone.utc), executive_summary=None,
              metrics={"org_health_score": 70, "code_coverage": cov}, org_limits={})
    html = _build_html("Org", snap, [], ctx=ReportContext())
    assert "<strong>71%</strong>, below the 75% deployment gate" in html
    assert "40 days before this analysis (out of date)" in html
    assert "RenewalService" in html and "Newton never runs tests" in html
