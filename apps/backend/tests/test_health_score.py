"""Org Health Score: severity-weighted deductions, capped per family so no
single family of findings can sink the score."""
from types import SimpleNamespace as NS

from app.domain.models import FindingCategory as C, FindingSeverity as S
from app.services.org_analyzer import HEALTH_FAMILY_CAP, health_family, health_score_breakdown


def _f(category, severity, code="X"):
    return NS(category=category, severity=severity, code=code)


def test_one_family_cannot_take_more_than_the_cap():
    licensing = [_f(C.LICENSE_WASTE, S.CRITICAL)] + [_f(C.LICENSE_WASTE, S.HIGH)] * 3  # 15 + 24 = 39
    b = health_score_breakdown(licensing)
    assert b["uncapped_deduction"] == 39 and b["deduction"] == HEALTH_FAMILY_CAP == 20
    assert b["score"] == 80
    assert b["families"][0] == {"family": "licensing", "label": "Licensing", "findings": 4,
                                "deduction": 20, "uncapped_deduction": 39}


def test_families_add_up_and_coverage_is_its_own_family():
    drafts = [
        _f(C.AUTOMATION_HYGIENE, S.HIGH, "ORG_COVERAGE_BELOW_GATE"),
        _f(C.AUTOMATION_HYGIENE, S.MEDIUM, "APEX_LOW_COVERAGE"),
        _f(C.AUTOMATION_HYGIENE, S.MEDIUM, "APEX_COVERAGE_STALE"),
        _f(C.AUTOMATION_HYGIENE, S.MEDIUM, "TRIGGER_MULTI_PER_OBJECT"),
        _f(C.SHARING_POSTURE, S.HIGH), _f(C.USER_ACTIVITY, S.LOW),
        _f(C.CONFIG_BLOAT, S.LOW, "FIELDS_NEVER_POPULATED"), _f(C.DATA_QUALITY, S.MEDIUM),
        _f(C.STORAGE_LIMIT, S.INFO),
    ]
    b = health_score_breakdown(drafts)
    fam = {f["family"]: f["deduction"] for f in b["families"]}
    assert fam == {"code_coverage": 14, "automation": 3, "access": 9, "data_quality": 4, "platform_limits": 0}
    assert b["score"] == 100 - 30
    assert health_family("config_bloat", "PS_UNUSED") == "configuration"


def test_mediocre_coverage_alone_costs_at_most_one_capped_family():
    # Below the gate, many classes under 75%, and figures out of date: 8 + 3 + 3.
    coverage = [_f(C.AUTOMATION_HYGIENE, S.HIGH, "ORG_COVERAGE_BELOW_GATE"),
                _f(C.AUTOMATION_HYGIENE, S.MEDIUM, "APEX_LOW_COVERAGE"),
                _f(C.AUTOMATION_HYGIENE, S.MEDIUM, "APEX_COVERAGE_STALE")]
    assert health_score_breakdown(coverage)["score"] == 86
    # Even if every coverage finding were critical, coverage costs at most 20.
    worst = [_f(C.AUTOMATION_HYGIENE, S.CRITICAL, c) for c in ("ORG_COVERAGE_BELOW_GATE", "APEX_LOW_COVERAGE", "APEX_COVERAGE_STALE")]
    assert health_score_breakdown(worst)["score"] == 80


def test_no_findings_scores_100():
    assert health_score_breakdown([]) == {"score": 100, "deduction": 0, "uncapped_deduction": 0, "families": []}
