"""Demo fixture variants: another demo org built from an existing fixture
plus planted differences (roadmap item 9). Synthetic.

lumenvale_uat: "Lumenvale UAT", a sandbox refreshed from Lumenvale and
changed since, with 20 planted differences for the org comparison. Usernames
carry the sandbox suffix ".uat", as Salesforce sandbox usernames do, which
the comparison removes before matching users.

   1  Account.Region__c is Account.Sales_Region__c (renamed; needs mapping)
   2  extra permission set "UAT Tester" (reads Accounts)
   3  flow Case_Triage deactivated
   4  Conga Composer 9.3.0 instead of 9.1.0
   5  Lumenvale Extensions under namespace lvxdev instead of lvx (needs mapping)
   6  validation rule Opportunity.Discount_Cap inactive
   7  validation rule Account.Tax_ID_Format has a different formula
   8  Apex class InvoiceService on API version 61 instead of 58
   9  Apex class UatDataFactory only in UAT
  10  Sales Rep profile can delete Opportunities
  11  Finance Analyst can't edit Account.AnnualRevenue
  12  two users not in UAT
  13  extra role "UAT Testers"
  14  Sales Manager Bundle has no muting set
  15  a user assigned Q3 Promo Pilot only in UAT
  16  Case org-wide default Public Read Only
  17  Tax_ID__c editable on "Account - Sales Layout"
  18  record type Opportunity.Partner_Deal inactive
  19  custom permission UAT_Bypass only in UAT
  20  approval process Invoice_Over_50K inactive
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List


def _where(rows: List[Dict[str, Any]], **match: Any) -> List[Dict[str, Any]]:
    return [r for r in rows if all(r.get(k) == v for k, v in match.items())]


def lumenvale_uat(data: Dict[str, Any]) -> Dict[str, Any]:
    live = data["demo_live"]
    ui, docs = live["ui_access"], live["org_docs"]
    live.pop("kickoff", None)  # a sandbox starts its own history
    data["org_name"] = "Lumenvale UAT"
    for u in data["users"]:
        u["Username"] = f"{u['Username']}.uat"
    # 1 Region__c renamed.
    for obj in live["schema"]:
        if obj["name"] == "Account":
            for f in obj["fields"]:
                if f["name"] == "Region__c":
                    f["name"], f["label"] = "Sales_Region__c", "Sales Region"
    for fp in data["field_permissions"]:
        if fp["Field"] == "Account.Region__c":
            fp["Field"] = "Account.Sales_Region__c"
    # 2 an extra permission set.
    data["permission_sets"].append({"Id": "0PS000000000901DMO", "Name": "UAT_Tester", "Label": "UAT Tester",
                                    "IsOwnedByProfile": False, "ProfileId": None, "Type": "Regular"})
    data["object_permissions"].append({"Id": "110000000000991DMO", "ParentId": "0PS000000000901DMO", "SobjectType": "Account",
                                       "PermissionsRead": True, "PermissionsCreate": False, "PermissionsEdit": False,
                                       "PermissionsDelete": False, "PermissionsViewAllRecords": False,
                                       "PermissionsModifyAllRecords": False})
    # 3 a flow deactivated.
    for f in _where(ui["flows"], api_name="Case_Triage"):
        f["active"] = False
    # 4, 5 packages.
    for p in docs.get("installed_packages", []):
        if p["namespace"] == "APXTConga4":
            p["version"] = "9.3.0"
        if p["namespace"] == "lvx":
            p["namespace"] = "lvxdev"
    # 6, 7 validation rules.
    for r in _where(docs["validation_rules"], object="Opportunity", name="Discount_Cap"):
        r["active"] = False
    for r in _where(docs["validation_rules"], object="Account", name="Tax_ID_Format"):
        r["formula"] = 'AND(NOT(ISBLANK(Tax_ID__c)), LEN(Tax_ID__c) <> 10)'
    # 8, 9 Apex.
    for c in _where(docs["apex_classes"], name="InvoiceService"):
        c["api_version"] = 61.0
    docs["apex_classes"].append({"id": "01p000000000999DMO", "name": "UatDataFactory", "namespace": None, "api_version": 61.0,
                                 "status": "Active", "valid": True, "length": 2400, "sharing": "without sharing"})
    # 10 Sales Rep profile deletes Opportunities; 11 Finance Analyst loses an edit.
    for o in _where(data["object_permissions"], ParentId="0PS000000000007DMO", SobjectType="Opportunity"):
        o["PermissionsDelete"] = True
    for fp in _where(data["field_permissions"], ParentId="0PS000000000001DMO", Field="Account.AnnualRevenue"):
        fp["PermissionsEdit"] = False
    # 12 two users not in UAT (and their assignments).
    gone = {"005000000000398DMO", "005000000000399DMO"}
    data["users"] = [u for u in data["users"] if u["Id"] not in gone]
    data["permission_set_assignments"] = [a for a in data["permission_set_assignments"] if a["AssigneeId"] not in gone]
    # 13 an extra role.
    data["roles"].append({"Id": "00E000000000901DMO", "Name": "UAT Testers", "ParentRoleId": "00E000000000001DMO",
                          "DeveloperName": "UAT_Testers"})
    # 14 no muting set in Sales Manager Bundle.
    data["permission_set_group_components"] = [c for c in data["permission_set_group_components"] if c["Id"] != "0PC000000000004DMO"]
    # 15 an extra assignment.
    data["permission_set_assignments"].append({"Id": "0Pa000000009991DMO", "AssigneeId": "005000000000030DMO",
                                               "PermissionSetId": "0PS000000000033DMO"})
    # 16 Case public read only.
    for o in _where(data["organization_wide_defaults"], SobjectType="Case"):
        o["InternalSharingModel"] = "Read"
    # 17 Tax ID editable on the sales layout.
    sales_layout = next(lay["id"] for lay in ui["layouts"] if lay["name"] == "Account - Sales Layout")
    for item in ui.get("layout_fields", {}).get(sales_layout, []):
        if item["field"] == "Tax_ID__c":
            item["behavior"] = "Edit"
    # 18 a record type inactive.
    for rt in _where(ui["record_types"], object="Opportunity", developer_name="Partner_Deal"):
        rt["active"] = False
    # 19 an extra custom permission; 20 an approval process inactive.
    docs["custom_permissions"].append({"id": "0CP000000000999DMO", "name": "UAT_Bypass", "label": "UAT Bypass",
                                       "namespace": None, "description": "Skips checks during UAT."})
    for p in _where(docs["approval_processes"], api_name="Invoice_Over_50K"):
        p["state"] = "Inactive"
    return data


VARIANTS: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {"lumenvale_uat": lumenvale_uat}
