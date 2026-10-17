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


def test_flagged_anomalies_show_rank_reason_and_risk_without_severity():
    snap = NS(snapshot_at=datetime(2026, 10, 9, tzinfo=timezone.utc), executive_summary=None,
              metrics={"org_health_score": 70}, org_limits={})
    ctx = ReportContext(flagged_access=[
        {"rank": 1, "users_scored": 400, "name": "User 4F2A9C", "reason": "Exclusive access", "base_risk_level": "high"},
        {"rank": 2, "users_scored": 400, "name": "User 77B1D0", "reason": "Role mismatch", "base_risk_level": None},
    ])
    html = _build_html("Org", snap, [], ctx=ctx)
    assert "Flagged access anomalies" in html and "top 2% of 400 users" in html
    assert "#1</td><td>User 4F2A9C</td><td>Exclusive access</td><td>High</td>" in html
    assert "<th>Base risk</th>" in html and "calculated without the anomaly flag" in html
    assert "Not scored" in html
    # Access anomalies carry no severity bar; the login bar appears only with session data.
    assert "Login anomalies" not in html
    with_sessions = _build_html("Org", snap, [], ctx=ReportContext(anomaly_counts={"high": 2}))
    assert "Login anomalies" in with_sessions
