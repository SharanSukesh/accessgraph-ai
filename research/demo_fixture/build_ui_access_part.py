"""Writes the Lumenvale fixture part for roadmap item 1, phase 1: page
layouts, Lightning record pages, and the Apex classes and flows each user
can run.

Synthetic, to the roadmap's spec:
  - record types: 3 on Opportunity, 2 on Case;
  - page layouts per profile and record type (Account, Opportunity, Case),
    and the record types each profile can use;
  - 4 Lightning record pages: Opportunity and Case org defaults, a
    "Lumenvale Sales" app default for Opportunity, and an app + record type
    (Renewal) + profile (Sales Manager) override;
  - 20 Apex classes (names from the code coverage part) and 15 flows of
    several types, granted through profiles, permission sets and groups;
  - two flows that require explicit access: one granted only through the
    Sales Manager Bundle (via a new, empty "Discount Approvals" set that is
    in that bundle and assigned to nobody directly), one through the
    Support Manager profile.
The new set grants no object or field access, so no analysis changes; the
runbook tests check the numbers. Deterministic.

    python research/demo_fixture/build_ui_access_part.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/backend/fixtures/synthetic_mid_market.parts/07-ui-access.json"
COVERAGE = ROOT / "apps/backend/fixtures/synthetic_mid_market.parts/04-code-coverage.json"


def sfid(prefix: str, n: int) -> str:
    return f"{prefix}{n:012d}DMO"


P = {name: f"00e{n:012d}DMO" for n, name in enumerate([
    "Finance Analyst", "Finance Director", "Marketing Manager", "Marketing User", "Sales Director", "Sales Manager",
    "Sales Rep", "Standard User", "Support Agent", "Support Manager", "System Administrator"], start=1)}
PROFILE_SET = {name: f"0PS{int(pid[3:15]):012d}DMO" for name, pid in P.items()}  # profile-owned sets 001-011
SALES = ["Sales Director", "Sales Manager", "Sales Rep"]
SUPPORT = ["Support Agent", "Support Manager"]
DISCOUNT_SET = sfid("0PS", 39)
SALES_MANAGER_BUNDLE = "0PG000000000001DMO"
PS = {"Opportunity_Approvals": sfid("0PS", 12), "Quote_Manager": sfid("0PS", 13), "Lead_Conversion": sfid("0PS", 14),
      "Case_Escalation": sfid("0PS", 16), "Finance_Reporting": sfid("0PS", 22), "Campaign_Manager": sfid("0PS", 19)}


def main() -> None:
    rt = {}
    record_types = []
    for i, (obj, dev, label) in enumerate([
        ("Opportunity", "New_Business", "New Business"), ("Opportunity", "Renewal", "Renewal"),
        ("Opportunity", "Partner_Deal", "Partner Deal"), ("Case", "Support_Request", "Support Request"),
        ("Case", "Billing_Inquiry", "Billing Inquiry")], start=1):
        rt[dev] = sfid("012", i)
        record_types.append({"id": rt[dev], "object": obj, "developer_name": dev, "name": label, "active": True})

    lay = {}
    layouts = []
    for i, (obj, name) in enumerate([
        ("Account", "Account Layout"), ("Account", "Account - Sales Layout"), ("Opportunity", "Opportunity Layout"),
        ("Opportunity", "Opportunity - Renewal Layout"), ("Opportunity", "Opportunity - Partner Layout"),
        ("Opportunity", "Opportunity - Sales Manager Layout"), ("Case", "Case Layout"), ("Case", "Case - Billing Layout")],
            start=1):
        lay[name] = sfid("00h", i)
        layouts.append({"id": lay[name], "object": obj, "name": name})

    profile_layouts = []
    for prof, pid in P.items():
        sales, support = prof in SALES, prof in SUPPORT
        profile_layouts.append({"profile_id": pid, "object": "Account", "record_type_id": None,
                                "layout_id": lay["Account - Sales Layout" if sales else "Account Layout"]})
        for dev in ("New_Business", "Renewal", "Partner_Deal"):
            if prof in ("Sales Manager", "Sales Director") and dev == "New_Business":
                name = "Opportunity - Sales Manager Layout"
            elif sales and dev == "Renewal":
                name = "Opportunity - Renewal Layout"
            elif sales and dev == "Partner_Deal":
                name = "Opportunity - Partner Layout"
            else:
                name = "Opportunity Layout"
            profile_layouts.append({"profile_id": pid, "object": "Opportunity", "record_type_id": rt[dev], "layout_id": lay[name]})
        for dev in ("Support_Request", "Billing_Inquiry"):
            name = "Case - Billing Layout" if (support and dev == "Billing_Inquiry") else "Case Layout"
            profile_layouts.append({"profile_id": pid, "object": "Case", "record_type_id": rt[dev], "layout_id": lay[name]})

    # Record types each profile can use (read live from Profile.Metadata).
    visibility = {}
    for prof, pid in P.items():
        opp = ["New_Business", "Renewal", "Partner_Deal"] if prof in SALES or prof == "System Administrator" else ["New_Business"]
        case = ["Support_Request", "Billing_Inquiry"] if prof in SUPPORT or prof == "System Administrator" else ["Support_Request"]
        visibility[pid] = {
            "Opportunity": {"available": [f"Opportunity.{d}" for d in opp], "default": "Opportunity.New_Business"},
            "Case": {"available": [f"Case.{d}" for d in case], "default": "Case.Support_Request"},
        }

    pages = [
        {"id": sfid("0M0", 1), "developer_name": "Opportunity_Record_Page", "label": "Opportunity Record Page", "object": "Opportunity"},
        {"id": sfid("0M0", 2), "developer_name": "Opportunity_Sales_Record_Page", "label": "Opportunity (Sales app)", "object": "Opportunity"},
        {"id": sfid("0M0", 3), "developer_name": "Opportunity_Renewal_Sales_Manager", "label": "Renewal, Sales Manager", "object": "Opportunity"},
        {"id": sfid("0M0", 4), "developer_name": "Case_Record_Page", "label": "Case Record Page", "object": "Case"},
    ]
    org_defaults = {"Opportunity": {"Large": "Opportunity_Record_Page", "Small": "Opportunity_Record_Page"},
                    "Case": {"Large": "Case_Record_Page", "Small": "Case_Record_Page"}}
    apps = [
        {"id": sfid("02u", 1), "developer_name": "Lumenvale_Sales", "label": "Lumenvale Sales", "overrides": [
            {"object": "Opportunity", "form_factor": "Large", "page": "Opportunity_Sales_Record_Page",
             "record_type": None, "profile": None},
            {"object": "Opportunity", "form_factor": "Large", "page": "Opportunity_Renewal_Sales_Manager",
             "record_type": "Opportunity.Renewal", "profile": "Sales Manager"},
        ]},
        {"id": sfid("02u", 2), "developer_name": "Lumenvale_Service", "label": "Lumenvale Service", "overrides": []},
    ]

    cov = json.loads(COVERAGE.read_text())["demo_live"]["code_coverage"]["items"]
    names = [i["name"] for i in cov if i["type"] == "class" and not i.get("is_test")][:20]
    classes = [{"id": sfid("01p", n), "name": name, "namespace": None} for n, name in enumerate(names, start=1)]
    cid = {c["name"]: c["id"] for c in classes}

    flow_specs = [
        ("Discount_Approval_Request", "Discount Approval Request", "Flow", None, True),
        ("Refund_Exception", "Refund Exception", "Flow", None, True),
        ("New_Opportunity_Wizard", "New Opportunity Wizard", "Flow", None, False),
        ("Log_Customer_Call", "Log a Customer Call", "Flow", None, False),
        ("Case_Triage", "Case Triage", "Flow", None, False),
        ("Quote_Builder", "Quote Builder", "Flow", None, False),
        ("Lead_Qualification", "Lead Qualification", "Flow", None, False),
        ("Opportunity_Stage_Sync", "Opportunity Stage Sync", "AutoLaunchedFlow", "RecordAfterSave", False),
        ("Case_Assignment_Rules", "Case Assignment", "AutoLaunchedFlow", "RecordBeforeSave", False),
        ("Account_Owner_Notify", "Account Owner Notification", "AutoLaunchedFlow", "RecordAfterSave", False),
        ("Nightly_Renewal_Reminders", "Nightly Renewal Reminders", "AutoLaunchedFlow", "Scheduled", False),
        ("Order_Event_Handler", "Order Event Handler", "AutoLaunchedFlow", "PlatformEvent", False),
        ("Calculate_Commission", "Calculate Commission", "AutoLaunchedFlow", None, False),
        ("Update_Territory", "Update Territory", "AutoLaunchedFlow", None, False),
        ("Close_Stale_Cases", "Close Stale Cases", "AutoLaunchedFlow", "Scheduled", False),
    ]
    flows = [{"id": sfid("300", n), "api_name": api, "label": label, "process_type": pt, "trigger_type": trig,
              "active": True, "restricted": restricted}
             for n, (api, label, pt, trig, restricted) in enumerate(flow_specs, start=1)]
    fid = {f["api_name"]: f["id"] for f in flows}

    def grant(sea, parent, kind, ids):
        sea.setdefault(parent, {}).setdefault(kind, [])
        sea[parent][kind] = sorted(set(sea[parent][kind]) | set(ids))

    sea: dict = {}
    sales_classes = [cid[n] for n in names if n.startswith(("Opportunity", "Quote", "Account", "Lead", "Territory", "Commission", "Renewal"))]
    support_classes = [cid[n] for n in names if n.startswith(("Case",))]
    grant(sea, PROFILE_SET["System Administrator"], "ApexClass", [c["id"] for c in classes])
    grant(sea, PROFILE_SET["System Administrator"], "FlowDefinition",
          [f["id"] for f in flows if f["api_name"] != "Discount_Approval_Request"])
    for prof in SALES:
        grant(sea, PROFILE_SET[prof], "ApexClass", sales_classes)
        grant(sea, PROFILE_SET[prof], "FlowDefinition", [fid["New_Opportunity_Wizard"], fid["Log_Customer_Call"]])
    for prof in SUPPORT:
        grant(sea, PROFILE_SET[prof], "ApexClass", support_classes)
        grant(sea, PROFILE_SET[prof], "FlowDefinition", [fid["Case_Triage"], fid["Log_Customer_Call"]])
    grant(sea, PROFILE_SET["Support Manager"], "FlowDefinition", [fid["Refund_Exception"]])
    grant(sea, PS["Quote_Manager"], "FlowDefinition", [fid["Quote_Builder"]])
    grant(sea, PS["Quote_Manager"], "ApexClass", [cid[n] for n in names if n.startswith("Quote")])
    grant(sea, PS["Lead_Conversion"], "FlowDefinition", [fid["Lead_Qualification"]])
    grant(sea, PS["Case_Escalation"], "ApexClass", [cid[n] for n in names if n.startswith("Case")])
    grant(sea, DISCOUNT_SET, "FlowDefinition", [fid["Discount_Approval_Request"]])

    run_flows = {PROFILE_SET[p]: p in ("System Administrator", "Sales Manager", "Sales Director", "Support Manager")
                 for p in P}
    run_flows[PS["Opportunity_Approvals"]] = True

    part = {
        "_source": "Roadmap item 1 (phase 1). Generated by research/demo_fixture/build_ui_access_part.py; synthetic.",
        "permission_sets": [{
            "Id": DISCOUNT_SET, "Name": "Discount_Approvals", "Label": "Discount Approvals", "IsOwnedByProfile": False,
            "ProfileId": None, "Type": "Regular",
        }],
        "permission_set_group_components": [{
            "Id": sfid("0PC", 901), "PermissionSetGroupId": SALES_MANAGER_BUNDLE, "PermissionSetId": DISCOUNT_SET,
        }],
        "demo_live": {"ui_access": {
            "record_types": record_types,
            "layouts": layouts,
            "profile_layouts": profile_layouts,
            "record_type_visibility": visibility,
            "record_type_visibility_note": "Record types available to the profile, from its metadata. Record types granted by permission sets aren't read.",
            "flexipages": pages,
            "org_default_pages": org_defaults,
            "apps": apps,
            "apex_classes": classes,
            "flows": flows,
            "setup_entity_access": sea,
            "run_flows": run_flows,
        }},
    }
    OUT.write_text(json.dumps(part, indent=1) + "\n")
    print(f"{len(record_types)} record types, {len(layouts)} layouts, {len(pages)} pages, {len(classes)} classes, "
          f"{len(flows)} flows, {sum(len(v.get('ApexClass', [])) + len(v.get('FlowDefinition', [])) for v in sea.values())} grants")


if __name__ == "__main__":
    main()
