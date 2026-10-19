"""Writes the Lumenvale fixture part for roadmap item 11 (documentation
export): configuration the export documents that the earlier parts don't
plant.

Part a:
  - two page layouts no profile is assigned, so "Unused Layouts" has rows:
    "Account - Legacy Layout" and "Case - Old Support Layout".
Part b (demo_live.org_docs, shaped as services/org_docs.py stores a live
read, plus SetupEntityAccess and profile login restrictions in ui_access):
  - 25 validation rules with formulas across 10 objects, 3 inactive, several
    bypassed by the Bypass_Validation custom permission;
  - picklist values per record type: Opportunity (3 record types, StageName)
    and Case (2 record types, Status and Priority);
  - tab settings for profiles and a few permission sets;
  - 3 Visualforce pages (one on API 29.0) and a component, with page access;
  - 4 static resources; 2 Aura and 5 Lightning web components;
  - 3 custom permissions, granted through profiles and permission sets;
  - 5 apps with who can see them (SetupEntityAccess TabSet);
  - 3 approval processes (one inactive);
  - details for every Apex class and trigger in the code coverage part:
    API version, status, sharing keyword (some "without sharing"), events;
  - buttons and links, list views, field sets;
  - login IP ranges on two profiles and login hours on one (documentation
    IP ranges from RFC 5737).
WebLink DisplayType and LinkType values are written as Salesforce
describes them ("button", "link", "url"); the exact API values are
UNVERIFIED.
Configuration only; nothing here feeds the analysis, so the runbook numbers
hold. Deterministic.

    python research/demo_fixture/build_documentation_part.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/backend/fixtures/synthetic_mid_market.parts/09-documentation.json"
COVERAGE = ROOT / "apps/backend/fixtures/synthetic_mid_market.parts/04-code-coverage.json"
UI = ROOT / "apps/backend/fixtures/synthetic_mid_market.parts/07-ui-access.json"

UNUSED_LAYOUTS = [
    {"id": "00h000000000101DMO", "object": "Account", "name": "Account - Legacy Layout"},
    {"id": "00h000000000102DMO", "object": "Case", "name": "Case - Old Support Layout"},
]

# Profile-owned permission sets 001-011 (build_ui_access_part.py), by profile name.
PROFILES = ["Finance Analyst", "Finance Director", "Marketing Manager", "Marketing User", "Sales Director",
            "Sales Manager", "Sales Rep", "Standard User", "Support Agent", "Support Manager", "System Administrator"]
PPS = {name: f"0PS{n:012d}DMO" for n, name in enumerate(PROFILES, start=1)}
PID = {name: f"00e{n:012d}DMO" for n, name in enumerate(PROFILES, start=1)}
PS = {"Discount Approvals": "0PS000000000039DMO", "Compensation Admin": "0PS000000000029DMO",
      "Legacy Integration Admin": "0PS000000000028DMO", "Invoice Approver": "0PS000000000021DMO",
      "Treasury Data Steward": "0PS000000000032DMO", "HR Records Viewer": "0PS000000000024DMO",
      "Case Escalation": "0PS000000000016DMO", "Campaign Manager": "0PS000000000019DMO"}
SALES = ["Sales Director", "Sales Manager", "Sales Rep"]
SUPPORT = ["Support Agent", "Support Manager"]
FINANCE = ["Finance Analyst", "Finance Director"]
MARKETING = ["Marketing Manager", "Marketing User"]
ADMIN = ["System Administrator"]
BYPASS = "NOT($Permission.Bypass_Validation)"

VALIDATION_RULES = [  # (object, name, active, formula, message, error field)
    ("Account", "Industry_Required", True, f"AND({BYPASS}, ISBLANK(TEXT(Industry)))", "Select an industry.", "Industry"),
    ("Account", "Tax_ID_Format", True, f'AND({BYPASS}, NOT(ISBLANK(Tax_ID__c)), NOT(REGEX(Tax_ID__c, "[0-9]{{2}}-[0-9]{{7}}")))',
     "Tax ID must look like 12-3456789.", "Tax_ID__c"),
    ("Account", "Rating_Hot_Needs_Revenue", True, 'AND(ISPICKVAL(Rating, "Hot"), ISBLANK(AnnualRevenue))',
     "Hot accounts need an annual revenue.", "AnnualRevenue"),
    ("Opportunity", "Close_Date_Not_In_Past", True, f"AND({BYPASS}, ISNEW(), CloseDate < TODAY())",
     "The close date can't be in the past.", "CloseDate"),
    ("Opportunity", "Discount_Cap", True, f"AND({BYPASS}, Discount_Percent__c > 0.4)",
     "Discounts over 40% need the discount approval process.", "Discount_Percent__c"),
    ("Opportunity", "Amount_Required_After_Qualification", True,
     'AND(ISBLANK(Amount), NOT(ISPICKVAL(StageName, "Prospecting")), NOT(ISPICKVAL(StageName, "Qualification")))',
     "Enter an amount once the deal is past qualification.", "Amount"),
    ("Opportunity", "Closed_Lost_Reason", False, 'AND(ISPICKVAL(StageName, "Closed Lost"), ISBLANK(NextStep))',
     "Record why the deal was lost in Next Step.", "NextStep"),
    ("Case", "Billing_Case_Needs_Account", True, 'AND(RecordType.DeveloperName = "Billing_Inquiry", ISBLANK(AccountId))',
     "Billing inquiries need an account.", "AccountId"),
    ("Case", "Escalated_Needs_Priority", True, 'AND(ISPICKVAL(Status, "Escalated"), NOT(ISPICKVAL(Priority, "High")))',
     "Escalated cases must be High priority.", "Priority"),
    ("Case", "Negative_Sentiment_Note", False, 'AND(ISPICKVAL(Customer_Sentiment__c, "Negative"), ISBLANK(Subject))',
     "Add a subject for negative-sentiment cases.", "Subject"),
    ("Lead", "Company_Required", True, f"AND({BYPASS}, ISBLANK(Company))", "Company is required.", "Company"),
    ("Lead", "Lead_Score_Range", True, "OR(Lead_Score__c < 0, Lead_Score__c > 100)", "Lead score must be 0 to 100.",
     "Lead_Score__c"),
    ("Contract", "Term_Positive", True, "ContractTerm <= 0", "The contract term must be at least one month.", "ContractTerm"),
    ("Contract", "Payment_Terms_Required", True, 'AND(ISPICKVAL(Status, "Activated"), ISBLANK(TEXT(Payment_Terms__c)))',
     "Activated contracts need payment terms.", "Payment_Terms__c"),
    ("Invoice__c", "Amount_Positive", True, "Amount__c <= 0", "Invoice amount must be positive.", "Amount__c"),
    ("Invoice__c", "Due_Date_Required", True, f"AND({BYPASS}, ISBLANK(Due_Date__c))", "Enter a due date.", "Due_Date__c"),
    ("Invoice__c", "PO_Number_Format", True, 'AND(NOT(ISBLANK(PO_Number__c)), LEFT(PO_Number__c, 3) <> "PO-")',
     "PO numbers start with PO-.", "PO_Number__c"),
    ("Payment__c", "Payment_Not_Over_Invoice", True, "Amount__c > Invoice__r.Amount__c",
     "A payment can't be more than its invoice.", "Amount__c"),
    ("Payment__c", "Card_Last4_Digits", True, 'AND(NOT(ISBLANK(Card_Last4__c)), NOT(REGEX(Card_Last4__c, "[0-9]{4}")))',
     "Card last 4 must be four digits.", "Card_Last4__c"),
    ("Employee__c", "Hire_Date_Not_Future", True, "Hire_Date__c > TODAY()", "The hire date can't be in the future.", "Hire_Date__c"),
    ("Employee__c", "Manager_Not_Self", True, "Manager__c = Id", "An employee can't be their own manager.", "Manager__c"),
    ("Compensation__c", "Bonus_Target_Range", True, "OR(Bonus_Target__c < 0, Bonus_Target__c > 1)",
     "Bonus target must be between 0% and 100%.", "Bonus_Target__c"),
    ("Compensation__c", "Base_Salary_Required", True, f"AND({BYPASS}, ISBLANK(Base_Salary__c))",
     "Enter a base salary.", "Base_Salary__c"),
    ("Change_Request__c", "High_Risk_Needs_Approver", True, 'AND(ISPICKVAL(Risk_Level__c, "High"), ISBLANK(Approver__c))',
     "High-risk changes need an approver.", "Approver__c"),
    ("Change_Request__c", "Legacy_Freeze", False, 'ISPICKVAL(Status__c, "Submitted")',
     "Change freeze: submissions are closed.", None),
]

STAGES = ["Prospecting", "Qualification", "Needs Analysis", "Proposal/Price Quote", "Negotiation/Review", "Closed Won",
          "Closed Lost"]
RT_PICKLISTS = {
    "Opportunity": {
        "New Business": {"StageName": STAGES},
        "Renewal": {"StageName": ["Needs Analysis", "Proposal/Price Quote", "Negotiation/Review", "Closed Won", "Closed Lost"]},
        "Partner Deal": {"StageName": ["Qualification", "Proposal/Price Quote", "Closed Won", "Closed Lost"]},
    },
    "Case": {
        "Support Request": {"Status": ["New", "Working", "Escalated", "Closed"], "Priority": ["High", "Medium", "Low"]},
        "Billing Inquiry": {"Status": ["New", "Working", "Closed"], "Priority": ["Medium", "Low"]},
    },
}

TABS = {  # tab -> {profile or permission set: visibility}
    "standard-Account": {**{p: "DefaultOn" for p in SALES + ADMIN + FINANCE}, **{p: "DefaultOff" for p in SUPPORT}},
    "standard-Opportunity": {p: "DefaultOn" for p in SALES + ADMIN},
    "standard-Lead": {**{p: "DefaultOn" for p in SALES + MARKETING + ADMIN}},
    "standard-Case": {**{p: "DefaultOn" for p in SUPPORT + ADMIN}, "Sales Manager": "DefaultOff"},
    "standard-Campaign": {**{p: "DefaultOn" for p in MARKETING + ADMIN}, "Campaign Manager": "DefaultOn"},
    "Invoice__c": {**{p: "DefaultOn" for p in FINANCE + ADMIN}, "Invoice Approver": "DefaultOn"},
    "Employee__c": {"System Administrator": "DefaultOn", "HR Records Viewer": "DefaultOn"},
    "Compensation__c": {"System Administrator": "DefaultOff", "Compensation Admin": "DefaultOn"},
    "Treasury_Account__c": {"Finance Director": "DefaultOff", "Treasury Data Steward": "DefaultOn"},
}

VISUALFORCE = [  # (id, kind, name, label, api version, description, granted to)
    ("066000000000001DMO", "Page", "InvoicePrint", "Invoice Print", 58.0, "Printable invoice.",
     FINANCE + ["Invoice Approver"]),
    ("066000000000002DMO", "Page", "QuotePdf", "Quote PDF", 52.0, "Quote rendered as a PDF.", SALES),
    ("066000000000003DMO", "Page", "LegacyTreasuryDashboard", "Legacy Treasury Dashboard", 29.0,
     "Pre-Lightning treasury balances page.", ["Treasury Data Steward"]),
    ("099000000000001DMO", "Component", "AddressBlock", "Address Block", 55.0, "Formatted postal address.", []),
]
STATIC_RESOURCES = [
    ("jquery_3_6", "application/javascript", 89476, "Public", "jQuery for the legacy treasury page."),
    ("lumenvale_logo", "image/png", 18342, "Public", "Logo for PDFs."),
    ("legacy_charts", "application/zip", 412907, "Private", "Charting library for the legacy treasury page."),
    ("invoice_styles", "text/css", 5120, "Private", "Styles for InvoicePrint."),
]
LIGHTNING = [  # (kind, name, label, api version, exposed, description)
    ("Aura", "legacyCaseSidebar", "Legacy Case Sidebar", 44.0, None, "Case console sidebar (Aura)."),
    ("Aura", "quickQuoteAction", "Quick Quote", 50.0, None, "Quick action to start a quote."),
    ("Lightning web component", "invoiceSummary", "Invoice Summary", 62.0, True, "Invoice totals on the account page."),
    ("Lightning web component", "approvalBanner", "Approval Banner", 62.0, True, "Shows pending approvals."),
    ("Lightning web component", "salaryBandBadge", "Salary Band Badge", 64.0, True, "Shows an employee's salary band."),
    ("Lightning web component", "treasuryBalanceCard", "Treasury Balance Card", 60.0, True, "Treasury balances."),
    ("Lightning web component", "caseTimeline", "Case Timeline", 61.0, False, "Used inside other components."),
]
CUSTOM_PERMISSIONS = [  # (id, name, label, description, granted to)
    ("0CP000000000001DMO", "Bypass_Validation", "Bypass Validation", "Skips validation rules that check it, for data loads.",
     ADMIN + ["Legacy Integration Admin"]),
    ("0CP000000000002DMO", "Approve_Large_Discounts", "Approve Large Discounts", "Approves discounts over 20%.",
     ["Sales Director", "Discount Approvals"]),
    ("0CP000000000003DMO", "View_Salary_Bands", "View Salary Bands", "Shows salary bands in the salary band badge.",
     ["Compensation Admin"]),
]
APPS = [  # (id, name, label, description, visible to)
    ("02u000000000001DMO", "Lumenvale_Sales", "Lumenvale Sales", "Sales app.", SALES + ADMIN),
    ("02u000000000002DMO", "Service_Console", "Service Console", "Support console.", SUPPORT + ADMIN),
    ("02u000000000003DMO", "Finance_Hub", "Finance Hub", "Invoices, payments and treasury.", FINANCE + ADMIN),
    ("02u000000000004DMO", "HR_Portal", "HR Portal", "Employees and compensation.",
     ADMIN + ["HR Records Viewer", "Compensation Admin"]),
    ("02u000000000005DMO", "Marketing", "Marketing", "Campaigns and leads.", MARKETING + ADMIN),
]
APPROVALS = [
    ("Discount over 20%", "Discount_Over_20", "Opportunity", "Active", "Total", "Discounts over 20% go to a sales director."),
    ("Invoice over 50K", "Invoice_Over_50K", "Invoice__c", "Active", "Total", "Large invoices need finance director approval."),
    ("Legacy Contract Approval", "Legacy_Contract_Approval", "Contract", "Inactive", "Admin", "Replaced by a flow in 2025."),
]
WEB_LINKS = [  # (object, name, label, link type, display type, open type)
    ("Account", "Open_in_ERP", "Open in ERP", "url", "button", "NewWindow"),
    ("Account", "Credit_Check", "Credit Check", "url", "link", "NewWindow"),
    ("Invoice__c", "Print_Invoice", "Print Invoice", "url", "button", "NewWindow"),
    ("Opportunity", "Request_Discount", "Request Discount", "url", "button", "NoSidebar"),
    ("Case", "Mass_Close", "Mass Close", "url", "massActionButton", "NoSidebar"),
]
LIST_VIEWS = {
    "Account": [("All Accounts", "AllAccounts"), ("My Accounts", "MyAccounts"), ("Hot Prospects", "Hot_Prospects")],
    "Opportunity": [("All Opportunities", "AllOpportunities"), ("Closing This Quarter", "Closing_This_Quarter")],
    "Case": [("All Open Cases", "AllOpenCases"), ("Escalated", "Escalated"), ("Billing Queue", "Billing_Queue")],
    "Lead": [("All Open Leads", "AllOpenLeads"), ("Today's Leads", "TodaysLeads")],
    "Invoice__c": [("All", "All"), ("Overdue", "Overdue")],
    "Employee__c": [("All", "All")],
}
FIELD_SETS = [("Invoice_Summary", "Invoice Summary", "Fields for the invoice summary component."),
              ("Employee_Directory", "Employee Directory", "Fields shown in the HR portal directory.")]
PROFILE_LOGINS = {
    "System Administrator": {"ip_ranges": [{"start": "192.0.2.0", "end": "192.0.2.255", "description": "Office VPN"}]},
    "Finance Director": {"ip_ranges": [{"start": "198.51.100.0", "end": "198.51.100.63", "description": "Finance floor"},
                                       {"start": "203.0.113.10", "end": "203.0.113.20", "description": "Treasury desk"}]},
    "Support Agent": {"hours": {d: {"start": 360, "end": 1260} for d in ("monday", "tuesday", "wednesday", "thursday", "friday")}},
}


def grantee(name: str) -> str:
    return PPS.get(name) or PS[name]


def apex_details(coverage, ui_classes):
    ids = {c["name"]: c["id"] for c in ui_classes}
    classes, triggers = [], []
    n = 100
    for item in coverage:
        name = item["name"]
        if item["type"] == "trigger":
            obj = name.removesuffix("Trigger").replace("TreasuryAccount", "Treasury_Account__c")
            obj = {"Invoice": "Invoice__c", "Commission": "Commission__c", "Shipment": "Shipment__c"}.get(obj, obj)
            triggers.append({"id": f"01q{len(triggers) + 1:012d}DMO", "name": name, "namespace": None, "object": obj,
                             "api_version": 58.0 if obj != "Shipment__c" else 41.0, "status": "Active", "valid": True,
                             "events": ["before insert", "before update", "after insert", "after update"]})
            continue
        if item["is_test"]:
            sharing = "not declared"
        elif name.endswith("Controller") or name.endswith("Service"):
            sharing = "with sharing"
        elif name.endswith("Selector"):
            sharing = "inherited sharing"
        elif name.endswith("Handler") or name in ("ManualShareCleanup", "LegacyInvoiceSync", "TerritoryRebalanceBatch"):
            sharing = "without sharing"
        else:
            sharing = "not declared"
        legacy = name.startswith(("Legacy", "Old", "Manual", "Contest"))
        cid = ids.get(name)
        if cid is None:
            n += 1
            cid = f"01p{n:012d}DMO"
        classes.append({"id": cid, "name": name, "namespace": None, "api_version": 29.0 if legacy else 58.0,
                        "status": "Active", "valid": name != "OldQuotePdfGenerator",
                        "length": (item.get("covered") or 0) * 12 + (item.get("uncovered") or 0) * 12 + 400,
                        "sharing": sharing})
    return classes, triggers


def org_docs(coverage, ui_classes):
    classes, triggers = apex_details(coverage, ui_classes)
    return {
        "notes": [],
        "validation_rules": [
            {"id": f"03d{i:012d}DMO", "object": o, "name": n, "active": a, "description": None, "error_message": m,
             "error_field": f, "formula": fx}
            for i, (o, n, a, fx, m, f) in enumerate(VALIDATION_RULES, start=1)],
        "record_type_picklists": RT_PICKLISTS,
        "tab_settings": [{"parent_id": grantee(who), "tab": tab, "visibility": vis}
                         for tab, by in TABS.items() for who, vis in by.items()],
        "visualforce": [{"id": i, "kind": k, "name": n, "label": lab, "api_version": v, "namespace": None, "description": d}
                        for i, k, n, lab, v, d, _ in VISUALFORCE],
        "static_resources": [{"name": n, "namespace": None, "content_type": t, "size": s, "cache_control": c, "description": d}
                             for n, t, s, c, d in STATIC_RESOURCES],
        "lightning_components": [{"kind": k, "name": n, "label": lab, "api_version": v, "namespace": None, "exposed": e,
                                  "description": d} for k, n, lab, v, e, d in LIGHTNING],
        "custom_permissions": [{"id": i, "name": n, "label": lab, "namespace": None, "description": d}
                               for i, n, lab, d, _ in CUSTOM_PERMISSIONS],
        "apps": [{"id": i, "name": n, "label": lab, "namespace": None, "description": d} for i, n, lab, d, _ in APPS],
        "approval_processes": [{"name": n, "api_name": a, "object": o, "state": s, "lock_type": lt, "description": d}
                               for n, a, o, s, lt, d in APPROVALS],
        "apex_classes": classes,
        "apex_triggers": triggers,
        "coverage": [{"name": i["name"], "type": i["type"], "covered": i.get("covered"), "uncovered": i.get("uncovered"),
                      "is_test": i.get("is_test")} for i in coverage],
        "web_links": [{"object": o, "name": n, "label": lab, "link_type": lt, "display_type": dt, "open_type": ot}
                      for o, n, lab, lt, dt, ot in WEB_LINKS],
        "list_views": [{"object": o, "name": n, "api_name": a} for o, views in LIST_VIEWS.items() for n, a in views],
        "field_sets": [{"name": n, "label": lab, "description": d} for n, lab, d in FIELD_SETS],
    }


def setup_entity_access():
    out = {}
    for kind, rows in (("ApexPage", [(i, g) for i, _, _, _, _, _, g in VISUALFORCE]),
                       ("CustomPermission", [(i, g) for i, _, _, _, g in CUSTOM_PERMISSIONS]),
                       ("TabSet", [(i, g) for i, _, _, _, g in APPS])):
        for eid, granted in rows:
            for who in granted:
                out.setdefault(grantee(who), {}).setdefault(kind, []).append(eid)
    return out


def main() -> None:
    coverage = json.loads(COVERAGE.read_text())["demo_live"]["code_coverage"]["items"]
    ui_classes = json.loads(UI.read_text())["demo_live"]["ui_access"]["apex_classes"]
    part = {"_source": "Roadmap item 11. Generated by research/demo_fixture/build_documentation_part.py; synthetic.",
            "demo_live": {
                "ui_access": {"layouts": UNUSED_LAYOUTS, "setup_entity_access": setup_entity_access(),
                              "profile_logins": {PID[p]: v for p, v in PROFILE_LOGINS.items()}},
                "org_docs": org_docs(coverage, ui_classes)}}
    OUT.write_text(json.dumps(part, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(VALIDATION_RULES)} validation rules")


if __name__ == "__main__":
    sys.exit(main())
