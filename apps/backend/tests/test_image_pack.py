"""Image pack (roadmap item 3): every format and layout, sizes and
transparency, no logos or demo label on any image, the Summary slide,
masked names never shown, user-level visuals left out at Metadata only,
and the ZIP / PPTX."""
import io
import zipfile

import pytest
import pytest_asyncio
from PIL import Image

from app.domain.models import Organization
from app.services import privacy_mode
from app.services.data_quality import DataQualityService
from app.services.org_analyzer import OrgAnalyzerService
from app.services.report import image_pack as ip
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401


def _can_render() -> bool:
    try:
        from weasyprint import HTML  # type: ignore
        HTML(string="<p>x</p>").write_pdf()
        return True
    except (ImportError, OSError):
        return False


needs_render = pytest.mark.skipif(not _can_render(), reason="WeasyPrint system libraries not installed")


def _pdf_text(html: str) -> str:
    import pypdfium2 as pdfium
    from weasyprint import HTML  # type: ignore
    doc = pdfium.PdfDocument(HTML(string=html).write_pdf())
    try:
        page = doc[0]
        return page.get_textpage().get_text_range()
    finally:
        doc.close()


async def _analysed(db, org_id):
    await DataQualityService(db, org_id).run(actor_email="test")
    await OrgAnalyzerService(db, org_id).run(actor_email="test")
    return await ip.gather_pack_source(db, org_id)


@pytest.mark.asyncio
async def test_lumenvale_availability(async_db_session, lumenvale):  # noqa: F811
    src = await _analysed(async_db_session, lumenvale[0])
    avail = {v["key"]: v for v in ip.availability(src)}
    for key in ("summary", "health_score", "savings", "risk_distribution", "top_anomalies", "critical_objects",
                "code_coverage", "api_usage"):
        assert avail[key]["available"], (key, avail[key]["note"])
    # Modules that haven't run are skipped with a note, never drawn empty.
    assert not avail["license_fit"]["available"] and avail["license_fit"]["note"] == "Run License Fit first."
    assert not avail["compliance"]["available"] and "compliance" in avail["compliance"]["note"]


@needs_render
@pytest.mark.asyncio
async def test_every_format_and_layout(async_db_session, lumenvale):  # noqa: F811
    src = await _analysed(async_db_session, lumenvale[0])
    shots = {}
    for fmt, transparent, layout in [("png", False, "slide"), ("png", True, "slide"), ("jpeg", False, "slide"),
                                     ("png", False, "crop"), ("png", True, "crop"), ("jpeg", True, "crop")]:
        data = ip.render_visual("code_coverage", src, None, ip.ImageOptions(fmt=fmt, transparent=transparent, layout=layout))
        shots[(fmt, transparent, layout)] = Image.open(io.BytesIO(data))
    slide = shots[("png", False, "slide")]
    assert slide.size == (3840, 2160) and slide.mode == "RGB" and slide.getpixel((5, 5)) == (255, 255, 255)
    clear = shots[("png", True, "slide")]
    assert clear.size == (3840, 2160) and clear.mode == "RGBA" and clear.getpixel((5, 5))[3] == 0
    jpeg = shots[("jpeg", False, "slide")]
    assert jpeg.format == "JPEG" and jpeg.mode == "RGB" and jpeg.size == (3840, 2160)
    crop = shots[("png", False, "crop")]
    assert crop.width < 3840 and crop.height < 2160 and crop.width > 2000
    assert shots[("png", True, "crop")].getpixel((2, 2))[3] == 0
    # JPEG can't be transparent, whatever is asked.
    assert shots[("jpeg", True, "crop")].mode == "RGB"


@needs_render
@pytest.mark.asyncio
async def test_no_logos_or_demo_label_on_any_image(async_db_session, lumenvale):  # noqa: F811
    """The images go into the consultant's own branded slides: no logo, no
    firm name and no "Demo data" label, even when branding has them all."""
    from app.services.org_analyzer_pdf import BrandContext
    src = await _analysed(async_db_session, lumenvale[0])
    assert src.is_demo
    brand = BrandContext(firm_name="Acme Advisory", accent_hex="#123456", logo_mime="image/png", logo_b64="iVBORw0KGgo=",
                         client_logo_mime="image/png", client_logo_b64="iVBORw0KGgo=")
    for key in [v["key"] for v in ip.availability(src) if v["available"]]:
        for layout in ip.LAYOUTS:
            page = ip.page_html(key, src, brand, ip.ImageOptions(layout=layout))
            assert "<img" not in page and "data:image" not in page, (key, layout)
            text = _pdf_text(page)
            assert "Demo data" not in text and "Acme Advisory" not in text, (key, layout)
    assert "#123456" in ip.page_html("health_score", src, brand, ip.ImageOptions())  # the title colour stays


@needs_render
@pytest.mark.asyncio
async def test_summary_slide_has_the_key_figures(async_db_session, lumenvale):  # noqa: F811
    from app.services.compliance_scorecard import ComplianceScorecardService
    db = async_db_session
    src = await _analysed(db, lumenvale[0])
    caption, body = ip.build_visual("summary", src)[0]
    text = _pdf_text(ip.page_html("summary", src, None, ip.ImageOptions()))
    m = src.metrics
    savings = sum(f.estimated_annual_savings_cents or 0 for f in src.findings)
    sev = {}
    for f in src.findings:
        sev[ip._value(f.severity)] = sev.get(ip._value(f.severity), 0) + 1
    for expected in (f"{float(m['org_health_score']):.0f}", ip._band(float(m["org_health_score"])), str(len(src.findings)),
                     ip._money(savings), f"{float(m['code_coverage']['org_wide_pct']):g}%",
                     f"{m['api_usage']['peak']['pct_of_limit']:g}%", m["api_usage"]["peak"]["date"]):
        assert expected in text, expected
    for level, n in sev.items():
        assert f"{n} {level.capitalize()}" in text
    names = [a["name"] for a in src.ctx.flagged_access[:3]]
    assert names and all(n in text for n in names)
    high = src.ctx.risk_counts.get("critical", 0) + src.ctx.risk_counts.get("high", 0)
    assert "High-risk users" in text and f"{high:,}" in text
    # Modules that haven't run say so in their tile rather than drop the slide.
    assert "No compliance scorecard run yet." in text and "License Fit not run yet" in text
    await ComplianceScorecardService(db, lumenvale[0]).run("soc2", actor_email="test")
    src = await ip.gather_pack_source(db, lumenvale[0])
    c = src.ctx.compliance[0]
    assert f"{c['passed']} of {c['passed'] + c['failed']}" in _pdf_text(ip.page_html("summary", src, None, ip.ImageOptions()))


@pytest.mark.asyncio
async def test_summary_hides_user_tiles_at_metadata_only(async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org = await db.get(Organization, lumenvale[0])
    await OrgAnalyzerService(db, lumenvale[0]).run(actor_email="test")
    privacy_mode.set_privacy(org, privacy_mode.METADATA_ONLY, False, "test")
    await db.flush()
    src = await ip.gather_pack_source(db, lumenvale[0])
    _caption, body = ip.build_visual("summary", src)[0]
    assert body.count(ip._esc(ip.USERS_HIDDEN)) == 2 and "License Fit left out" in body
    assert "#1" not in body


@needs_render
@pytest.mark.asyncio
async def test_footer_only_when_the_org_name_is_asked_for(client, async_db_session, lumenvale):  # noqa: F811
    src = await _analysed(async_db_session, lumenvale[0])
    for key in ("summary", "health_score"):
        plain = ip.page_html(key, src, None, ip.ImageOptions())
        assert 'class="foot"' not in plain and src.org_name not in _pdf_text(plain), key
        named = ip.page_html(key, src, None, ip.ImageOptions(org_name=True))
        assert src.org_name in _pdf_text(named), key
    org_id, cookie = lumenvale
    r = await client.get(f"/orgs/{org_id}/image-pack/health_score", params={"org_name": "true"}, cookies=cookie)
    assert r.status_code == 200
    r = await client.post(f"/orgs/{org_id}/image-pack", cookies=cookie,
                          json={"visuals": ["summary"], "layouts": ["slide"], "pptx": True, "images": False, "org_name": True})
    assert r.status_code == 200
    # The demo markers stay off the images but in the files: the name prefix and the speaker notes.
    from pptx import Presentation
    deck = Presentation(io.BytesIO(r.content))
    assert "Demo data" in deck.slides[0].notes_slide.notes_text_frame.text


@pytest_asyncio.fixture
async def masked_lumenvale(async_db_session, lumenvale):  # noqa: F811
    """Lumenvale switched to Masked: the purge aliases every stored user, as
    it does for a client org. (A demo org's sync loads the fixture as is.)"""
    from app.services.privacy_purge import enforce_privacy_mode
    org = await async_db_session.get(Organization, lumenvale[0])
    privacy_mode.set_privacy(org, privacy_mode.MASKED, True, "test")
    await enforce_privacy_mode(async_db_session, org)
    await async_db_session.flush()
    return lumenvale


@needs_render
@pytest.mark.asyncio
async def test_masked_names_never_appear(async_db_session, masked_lumenvale):
    src = await _analysed(async_db_session, masked_lumenvale[0])
    names = [a["name"] for a in src.ctx.flagged_access]
    assert names and all(n.startswith("User ") for n in names)
    text = _pdf_text(ip.page_html("top_anomalies", src, None, ip.ImageOptions()))
    summary = _pdf_text(ip.page_html("summary", src, None, ip.ImageOptions()))
    assert names[0] in text and names[0] in summary
    # Real names from the fixture (the top-ranked anomalies on the unmasked org).
    for real in ("Mina Tanaka", "Hayden Galloway", "Ayla Zielinski", "Jun Jovanovic", "Dmitri Fennimore"):
        assert real not in text and real not in summary
    api = _pdf_text(ip.page_html("api_usage", src, None, ip.ImageOptions()))
    assert "Ayla Zielinski" not in api


@pytest.mark.asyncio
async def test_metadata_only_leaves_user_level_visuals_out(async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org = await db.get(Organization, lumenvale[0])
    await OrgAnalyzerService(db, lumenvale[0]).run(actor_email="test")
    privacy_mode.set_privacy(org, privacy_mode.METADATA_ONLY, False, "test")
    await db.flush()
    src = await ip.gather_pack_source(db, lumenvale[0])
    avail = {v["key"]: v for v in ip.availability(src)}
    for key in ("risk_distribution", "top_anomalies", "license_fit"):
        assert not avail[key]["available"] and avail[key]["note"] == ip.USERS_HIDDEN
    assert avail["health_score"]["available"]


@needs_render
@pytest.mark.asyncio
async def test_zip_and_pptx(async_db_session, lumenvale):  # noqa: F811
    from pptx import Presentation

    src = await _analysed(async_db_session, lumenvale[0])
    data, media, skipped = ip.build_pack(["summary", "health_score", "api_usage", "compliance"], src, None,
                                         ip.ImageOptions(fmt="png", transparent=True), ["slide", "crop"], pptx=True)
    assert media == "application/zip" and [s["key"] for s in skipped] == ["compliance"]
    z = zipfile.ZipFile(io.BytesIO(data))
    assert sorted(z.namelist()) == sorted([
        "demo-summary-slide.png", "demo-summary-crop.png",
        "demo-health-score-slide.png", "demo-health-score-crop.png", "demo-api-usage-slide.png",
        "demo-api-usage-crop.png", "demo-visuals.pptx", "skipped.txt", "DEMO-DATA.txt",
    ])
    assert "Compliance control indicators" in z.read("skipped.txt").decode()
    deck = Presentation(io.BytesIO(z.read("demo-visuals.pptx")))
    assert len(deck.slides) == 3 and (deck.slide_width, deck.slide_height) == (12192000, 6858000)
    assert "Demo data" in deck.slides[0].notes_slide.notes_text_frame.text

    alone, media, _ = ip.build_pack(["savings"], src, None, ip.ImageOptions(), [], images=False, pptx=True)
    assert media.endswith("presentationml.presentation") and len(Presentation(io.BytesIO(alone)).slides) == 1
    with pytest.raises(ValueError):
        ip.build_pack(["compliance"], src, None, ip.ImageOptions(), ["slide"])


@needs_render
@pytest.mark.asyncio
async def test_routes(client, async_db_session, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    await _analysed(async_db_session, org_id)
    listing = (await client.get(f"/orgs/{org_id}/image-pack", cookies=cookie)).json()
    assert listing["is_demo"] and len(listing["visuals"]) == len(ip.VISUALS)

    r = await client.get(f"/orgs/{org_id}/image-pack/summary", cookies=cookie)
    assert r.status_code == 200 and 'filename="demo-summary-slide.png"' in r.headers["content-disposition"]
    assert Image.open(io.BytesIO(r.content)).size == (3840, 2160)
    r = await client.get(f"/orgs/{org_id}/image-pack/health_score", params={"format": "jpeg", "layout": "crop"}, cookies=cookie)
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert 'filename="demo-health-score-crop.jpg"' in r.headers["content-disposition"]
    r = await client.get(f"/orgs/{org_id}/image-pack/compliance", cookies=cookie)
    assert r.status_code == 409 and "compliance" in r.json()["detail"]
    assert (await client.get(f"/orgs/{org_id}/image-pack/nope", cookies=cookie)).status_code == 404
    assert (await client.get(f"/orgs/{org_id}/image-pack/health_score", params={"format": "gif"},
                             cookies=cookie)).status_code == 400

    r = await client.post(f"/orgs/{org_id}/image-pack", cookies=cookie,
                          json={"visuals": ["health_score"], "format": "png", "layouts": ["slide"]})
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    assert zipfile.ZipFile(io.BytesIO(r.content)).namelist()[0] == "demo-health-score-slide.png"
    # No access without a session.
    assert (await client.get(f"/orgs/{org_id}/image-pack")).status_code in (401, 403)

