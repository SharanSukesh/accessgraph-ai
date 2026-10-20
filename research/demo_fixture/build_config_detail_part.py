"""Lumenvale fixture part 10 (roadmap item 11, part c): the detail the
documentation workbook reads out of Salesforce metadata. Synthetic.

  - flow_details: element counts and record operations for the 15 flows in
    part 07, using fields that exist in part 08 (Legacy_Region__c is left
    alone: it's the unreferenced cleanup candidate for item 13);
  - layout_fields: the fields on each of the 10 page layouts (parts 07, 09),
    with sections and behavior; Tax_ID__c sits only on the Sales layout, and
    the Case layout goes to every profile though few can read Cases;
  - set_record_types: two permission sets that make record types available
    (Opportunity Partner Deal through Opportunity Approvals, Case Billing
    Inquiry through Case Escalation);
  - approval_steps for the three approval processes in part 09;
  - two external data sources, granted through permission sets.

Writes apps/backend/fixtures/synthetic_mid_market.parts/10-config-detail.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARTS = ROOT / "apps/backend/fixtures/synthetic_mid_market.parts"
OUT = PARTS / "10-config-detail.json"

PPS = {"System Administrator": "0PS000000000011DMO", "Finance Director": "0PS000000000002DMO",
       "Finance Analyst": "0PS000000000001DMO"}
PS = {"Opportunity Approvals": "0PS000000000012DMO", "Case Escalation": "0PS000000000016DMO",
      "Finance Reporting": "0PS000000000022DMO", "Legacy Integration Admin": "0PS000000000028DMO"}


def op(element, operation, obj, fields=(), filters=(), from_variable=None):
    return {"element": element, "operation": operation, "object": obj, "from_variable": from_variable,
            "fields": sorted(fields), "filter_fields": sorted(filters)}


# api name -> (start object, record trigger, element counts, operations, subflows, actions)
FLOWS = {
    "Discount_Approval_Request": (None, None,
        {"variables": 4, "screens": 2, "decisions": 1, "recordLookups": 1, "recordUpdates": 1, "actionCalls": 1},
        [op("Get Opportunity", "Read", "Opportunity", ["Amount", "Discount_Percent__c", "StageName"], ["Id"]),
         op("Save Discount", "Update", "Opportunity", ["Discount_Percent__c", "NextStep"], ["Id"])],
        [], [{"name": "submit", "type": "submit"}]),
    "Refund_Exception": (None, None,
        {"variables": 3, "screens": 2, "decisions": 2, "recordLookups": 1, "recordCreates": 1},
        [op("Get Invoice", "Read", "Invoice__c", ["Amount__c", "Days_Overdue__c", "Account__c"], ["Id"]),
         op("Log Refund Task", "Create", "Task", ["Subject", "WhatId", "OwnerId"])], [], []),
    "New_Opportunity_Wizard": (None, None,
        {"variables": 5, "screens": 3, "decisions": 1, "recordLookups": 1, "recordCreates": 1},
        [op("Get Account", "Read", "Account", ["Name", "Industry", "Segment__c"], ["Id"]),
         op("Create Opportunity", "Create", "Opportunity", ["AccountId", "Amount", "CloseDate", "Name", "StageName"])],
        [], []),
    "Log_Customer_Call": (None, None,
        {"variables": 2, "screens": 1, "recordCreates": 1},
        [op("Create Call", "Create", "Task", ["Subject", "WhoId", "WhatId"])], [], []),
    "Case_Triage": (None, None,
        {"variables": 3, "screens": 2, "decisions": 2, "recordLookups": 1, "recordUpdates": 1},
        [op("Get Case", "Read", "Case", ["Priority", "Product_Area__c", "Status", "Subject"], ["Id"]),
         op("Set Priority", "Update", "Case", ["Priority", "Customer_Sentiment__c"], ["Id"])], [], []),
    "Quote_Builder": (None, None,
        {"variables": 6, "screens": 3, "decisions": 1, "loops": 1, "assignments": 2, "recordLookups": 2, "recordCreates": 1},
        [op("Get Opportunity", "Read", "Opportunity", ["Amount", "Discounted_Amount__c", "Name"], ["Id"]),
         op("Get Account", "Read", "Account", ["Name", "Segment__c"], ["Id"]),
         op("Create Quote", "Create", "Quote", ["Name", "OpportunityId"])], [], []),
    "Lead_Qualification": (None, None,
        {"variables": 3, "screens": 2, "decisions": 2, "recordLookups": 1, "recordUpdates": 1, "subflows": 1},
        [op("Get Lead", "Read", "Lead", ["Company", "Industry", "LeadSource", "Lead_Score__c"], ["Id"]),
         op("Update Score", "Update", "Lead", ["Lead_Score__c"], ["Id"])], ["Update_Territory"], []),
    "Opportunity_Stage_Sync": ("Opportunity", "Update",
        {"variables": 1, "decisions": 1, "recordLookups": 1, "recordUpdates": 1},
        [op("Start", "Trigger condition", "Opportunity", [], ["StageName"]),
         op("Get Account", "Read", "Account", ["Rating"], ["Id"]),
         op("Update Account Rating", "Update", "Account", ["Rating"], ["Id"])], [], []),
    "Case_Assignment_Rules": ("Case", "Create",
        {"decisions": 2, "assignments": 3, "recordUpdates": 1},
        [op("Set Owner", "Update", "Case", ["OwnerId", "Priority"], from_variable=None)], [], []),
    "Account_Owner_Notify": ("Account", "Update",
        {"variables": 1, "decisions": 1, "actionCalls": 1},
        [op("Start", "Trigger condition", "Account", [], ["OwnerId"])], [],
        [{"name": "Account_Owner_Changed", "type": "emailAlert"}]),
    "Nightly_Renewal_Reminders": ("Contract", None,
        {"variables": 2, "loops": 1, "recordLookups": 1, "recordCreates": 1},
        [op("Get Expiring Contracts", "Read", "Contract", ["AccountId", "ContractTerm", "OwnerId"], ["ContractTerm"]),
         op("Create Reminder Tasks", "Create", "Task", [], from_variable="ReminderTasks")], [], []),
    "Order_Event_Handler": (None, None,
        {"variables": 2, "decisions": 1, "recordLookups": 1, "recordUpdates": 1},
        [op("Get Order", "Read", "Order", ["Status", "TotalAmount"], ["OrderNumber"]),
         op("Mark Fulfilled", "Update", "Order", ["Status"], ["Id"])], [], []),
    "Calculate_Commission": (None, None,
        {"variables": 4, "formulas": 2, "assignments": 2, "recordLookups": 1},
        [op("Get Closed Opportunities", "Read", "Opportunity", ["Amount", "CloseDate", "OwnerId"], ["StageName"])],
        [], []),
    "Update_Territory": (None, None,
        {"variables": 2, "decisions": 1, "recordUpdates": 1},
        [op("Set Region", "Update", "Account", ["Region__c"], ["Id"])], [], []),
    "Close_Stale_Cases": ("Case", None,
        {"variables": 1, "recordLookups": 1, "recordUpdates": 1},
        [op("Get Stale Cases", "Read", "Case", ["LastModifiedDate", "Status"], ["Status"]),
         op("Close Cases", "Update", "Case", ["Status"], from_variable=None)], [], []),
}

# Only fields the fixture has access data for (field permissions, or fields that follow object access), so
# "of them, can read the field" means something in the demo.
SECTION_FIELDS = {  # object -> [(section, [(field, behavior)])]
    "Account": [("Account Information", [("Name", "Required"), ("OwnerId", "Edit"), ("Industry", "Edit"),
                                         ("Rating", "Edit")]),
                ("Financials", [("AnnualRevenue", "Edit")])],
    "Opportunity": [("Opportunity Information", [("Name", "Required"), ("OwnerId", "Edit"), ("StageName", "Required"),
                                                 ("Amount", "Edit")]),
                    ("Pricing", [("Discount_Percent__c", "Edit")])],
    "Case": [("Case Information", [("CaseNumber", "Readonly"), ("OwnerId", "Edit"), ("Status", "Required"),
                                   ("Priority", "Edit")])],
}
EXTRA = {  # layout name -> extra (section, field, behavior)
    "Account - Sales Layout": [("Financials", "Tax_ID__c", "Readonly")],
    "Opportunity - Sales Manager Layout": [("Pricing", "CreatedDate", "Readonly")],
    "Case Layout": [("Case Information", "Customer_Sentiment__c", "Readonly")],
}

APPROVAL_STEPS = {
    "Discount_Over_20": [("Sales Director Review", "Sales_Director_Review", "The account's sales director approves."),
                         ("Finance Review over 40%", "Finance_Review_Over_40", "Discounts over 40% also go to finance.")],
    "Invoice_Over_50K": [("Finance Director Approval", "Finance_Director_Approval", None)],
    "Legacy_Contract_Approval": [("Legal Review", "Legal_Review", "Replaced by a flow in 2025.")],
}
EXTERNAL_SOURCES = [  # (id, api name, label, type, granted to)
    ("0XC000000000001DMO", "ERP_Orders", "ERP Orders", "OData4",
     [PPS["System Administrator"], PS["Finance Reporting"], PPS["Finance Director"]]),
    ("0XC000000000002DMO", "Legacy_Archive", "Legacy Archive", "OData", [PS["Legacy Integration Admin"]]),
]


def main() -> int:
    ui = json.loads((PARTS / "07-ui-access.json").read_text())["demo_live"]["ui_access"]
    docs_part = json.loads((PARTS / "09-documentation.json").read_text())["demo_live"]
    flows = {f["api_name"]: f["id"] for f in ui["flows"]}
    assert set(FLOWS) == set(flows), set(flows) ^ set(FLOWS)
    flow_details = {}
    for api, (start, trigger, elements, ops, subflows, actions) in FLOWS.items():
        flow_details[flows[api]] = {"elements": elements, "start_object": start, "record_trigger": trigger,
                                    "operations": ops, "subflows": subflows, "actions": actions}

    layouts = ui["layouts"] + docs_part["ui_access"]["layouts"]
    layout_fields = {}
    for lay in layouts:
        placed = [{"field": f, "behavior": b, "section": sec} for sec, items in SECTION_FIELDS[lay["object"]] for f, b in items]
        if "Legacy" in lay["name"] or "Old" in lay["name"]:
            placed = placed[:3]
        placed += [{"field": f, "behavior": b, "section": sec} for sec, f, b in EXTRA.get(lay["name"], [])]
        layout_fields[lay["id"]] = placed

    procs = {p["api_name"] for p in docs_part["org_docs"]["approval_processes"]}
    assert procs == set(APPROVAL_STEPS), procs

    sea = {}
    for eid, _, _, _, granted in EXTERNAL_SOURCES:
        for parent in granted:
            sea.setdefault(parent, {}).setdefault("ExternalDataSource", []).append(eid)
    part = {
        "_source": "Roadmap item 11 part c. Generated by research/demo_fixture/build_config_detail_part.py; synthetic.",
        "demo_live": {
            "ui_access": {
                "flow_details": flow_details,
                "layout_fields": layout_fields,
                "set_record_types": {PS["Opportunity Approvals"]: {"Opportunity": ["Opportunity.Partner_Deal"]},
                                     PS["Case Escalation"]: {"Case": ["Case.Billing_Inquiry"]}},
                "setup_entity_access": sea,
            },
            "org_docs": {
                "approval_steps": [{"process": proc, "name": n, "api_name": a, "description": d}
                                   for proc, steps in APPROVAL_STEPS.items() for n, a, d in steps],
                "external_data_sources": [{"id": i, "name": a, "label": lab, "namespace": None, "type": t}
                                          for i, a, lab, t, _ in EXTERNAL_SOURCES],
            },
        },
    }
    OUT.write_text(json.dumps(part, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(flow_details)} flows, {len(layout_fields)} layouts, "
          f"{sum(len(v) for v in APPROVAL_STEPS.values())} approval steps")
    return 0


if __name__ == "__main__":
    sys.exit(main())
