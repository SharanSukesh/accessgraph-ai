"""Writes the Lumenvale fixture part for roadmap item 8, field metadata: one
describe-shaped result (`GET /sobjects/{name}/describe`, the attributes
Newton keeps) per object the fixture's permissions mention.

Fields per object: a few standard fields, every field the fixture's field
permissions or Data Quality part name (with the Data Quality types), and
the planted ones:
  - two master-detail relationships: Payment__c.Invoice__c -> Invoice__c and
    Compensation__c.Employee__c -> Employee__c (relationshipOrder 0; the
    detail objects have no OwnerId, and the parent's childRelationships
    entry has cascadeDelete);
  - Shield Platform Encryption (describe `encrypted: true`) on two text
    fields, Employee__c.National_ID__c and
    Benefits_Enrollment__c.Medical_Condition__c (not on Base_Salary__c:
    which field types Shield supports isn't checked here, UNVERIFIED);
  - a Classic encrypted field (type encryptedstring):
    Treasury_Account__c.Account_Number__c;
  - three formula fields (calculated, with calculatedFormula):
    Invoice__c.Days_Overdue__c, Opportunity.Discounted_Amount__c and
    Employee__c.Tenure_Years__c;
  - an external id: Legacy_Order__c.Legacy_System_Id__c;
  - two fields the integration user can't see: the describe leaves out
    Compensation__c.Bonus__c and Equity_Grant__c (field-level security),
    and FieldDefinition rows (demo_live.field_definitions) supply them.
    Their DataType strings imitate Setup's wording (UNVERIFIED beyond the
    documented "Text(40)" form).
Lookups between the objects (Contact.AccountId, Case.ContactId,
Incident__c.Case__c, ...) give the ERD something to draw. Key prefixes are
left out. Nothing here feeds the analysis, so the runbook numbers hold.
Deterministic.

    python research/demo_fixture/build_field_metadata_part.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps/backend"))
OUT = ROOT / "apps/backend/fixtures/synthetic_mid_market.parts/08-field-metadata.json"

from app.ingestion.demo_orgs import load_fixture  # noqa: E402

LABELS = {
    "Benefits_Enrollment__c": "Benefits Enrollment", "Change_Request__c": "Change Request",
    "Compensation__c": "Compensation", "Employee__c": "Employee", "Incident__c": "Incident",
    "Invoice__c": "Invoice", "Legacy_Order__c": "Legacy Order", "Partner_Survey__c": "Partner Survey",
    "Payment__c": "Payment", "Performance_Review__c": "Performance Review",
    "Treasury_Account__c": "Treasury Account", "Web_Event__c": "Web Event",
    "CampaignMember": "Campaign Member", "Pricebook2": "Price Book", "Product2": "Product",
}
# Standard name fields (the custom objects all use Name).
NAME_FIELD = {"Case": "CaseNumber", "Contact": "LastName", "Lead": "LastName", "Contract": "ContractNumber",
              "Order": "OrderNumber", "Task": "Subject", "Event": "Subject", "Solution": "SolutionName",
              "CampaignMember": None}
AUTO_NUMBER = {"CaseNumber", "ContractNumber", "OrderNumber"}
DETAIL = {"Payment__c": ("Invoice__c", "Invoice__c"), "Compensation__c": ("Employee__c", "Employee__c")}

TYPES = {  # fields the permissions name, not in the Data Quality part
    "AnnualRevenue": "currency", "Rating": "picklist", "Tax_ID__c": "string", "SerialNumber": "string",
    "Status": "picklist", "Dependents__c": "double", "Medical_Condition__c": "textarea", "Customer_Sentiment__c": "picklist",
    "Bonus__c": "currency", "Equity_Grant__c": "double", "Birthdate": "date", "Home_Address__c": "textarea",
    "ContractTerm": "int", "Payment_Terms__c": "picklist", "Date_of_Birth__c": "date", "Department__c": "picklist",
    "National_ID__c": "string", "Bank_Account_Number__c": "string", "Lead_Score__c": "double",
    "Discount_Percent__c": "percent", "TotalAmount": "currency", "Card_Last4__c": "string",
    "Routing_Number__c": "string", "Manager_Notes__c": "textarea", "Account_Number__c": "string",
    "Phone": "phone", "Email": "email", "Company": "string", "Priority": "picklist", "StageName": "picklist",
    "Amount": "currency", "Industry": "picklist",
}
LOOKUPS = {  # (object, field): (target, label)
    ("Contact", "AccountId"): ("Account", "Account"), ("Opportunity", "AccountId"): ("Account", "Account"),
    ("Case", "AccountId"): ("Account", "Account"), ("Case", "ContactId"): ("Contact", "Contact"),
    ("Contract", "AccountId"): ("Account", "Account"), ("Order", "AccountId"): ("Account", "Account"),
    ("Order", "ContractId"): ("Contract", "Contract"), ("Asset", "AccountId"): ("Account", "Account"),
    ("Asset", "Product2Id"): ("Product2", "Product"), ("Entitlement", "AccountId"): ("Account", "Account"),
    ("Quote", "OpportunityId"): ("Opportunity", "Opportunity"),
    ("CampaignMember", "CampaignId"): ("Campaign", "Campaign"),
    ("CampaignMember", "LeadId"): ("Lead", "Lead"), ("CampaignMember", "ContactId"): ("Contact", "Contact"),
    ("Invoice__c", "Account__c"): ("Account", "Account"),
    ("Benefits_Enrollment__c", "Employee__c"): ("Employee__c", "Employee"),
    ("Performance_Review__c", "Employee__c"): ("Employee__c", "Employee"),
    ("Employee__c", "Manager__c"): ("Employee__c", "Manager"),
    ("Employee__c", "User__c"): ("User", "User"),
    ("Incident__c", "Case__c"): ("Case", "Case"),
    ("Change_Request__c", "Incident__c"): ("Incident__c", "Incident"),
    ("Change_Request__c", "Approver__c"): ("User", "Approver"),
    ("Legacy_Order__c", "Order__c"): ("Order", "Order"),
    ("Treasury_Account__c", "Signatory__c"): ("User", "Signatory"),
    ("Partner_Survey__c", "Account__c"): ("Account", "Account"),
    ("Partner_Survey__c", "Follow_Up_Owner__c"): ("User", "Follow-Up Owner"),
}
PICKLISTS = {
    ("Opportunity", "StageName"): ["Prospecting", "Qualification", "Needs Analysis", "Proposal/Price Quote",
                                   "Negotiation/Review", "Closed Won", "Closed Lost"],
    ("Case", "Status"): ["New", "Working", "Escalated", "Closed"],
    ("Case", "Priority"): ["High", "Medium", "Low"],
    ("Account", "Rating"): ["Hot", "Warm", "Cold"],
    ("Account", "Industry"): ["Technology", "Financial Services", "Healthcare", "Manufacturing", "Retail"],
    ("Lead", "Status"): ["Open - Not Contacted", "Working - Contacted", "Closed - Converted", "Closed - Not Converted"],
    ("Incident__c", "Severity__c"): ["Sev 1", "Sev 2", "Sev 3", "Sev 4"],
    ("Performance_Review__c", "Rating__c"): ["Exceeds", "Meets", "Partially Meets", "Below"],
    ("Benefits_Enrollment__c", "Plan__c"): ["Standard", "Plus", "Family"],
    ("Employee__c", "Department__c"): ["Sales", "Support", "Finance", "Marketing", "Engineering", "People"],
    ("Change_Request__c", "Status__c"): ["Draft", "Submitted", "Approved", "Rejected", "Done"],
    ("Change_Request__c", "Risk_Level__c"): ["Low", "Medium", "High"],
    ("Payment__c", "Method__c"): ["Card", "ACH", "Wire"],
    ("Contract", "Payment_Terms__c"): ["Net 30", "Net 45", "Net 60"],
    ("Case", "Customer_Sentiment__c"): ["Positive", "Neutral", "Negative"],
}
FORMULAS = {
    "Invoice__c": [("Days_Overdue__c", "Days Overdue", "double", "IF(ISBLANK(Due_Date__c), NULL, TODAY() - Due_Date__c)")],
    "Opportunity": [("Discounted_Amount__c", "Discounted Amount", "currency", "Amount * (1 - Discount_Percent__c)")],
    "Employee__c": [("Tenure_Years__c", "Tenure (Years)", "double", "(TODAY() - Hire_Date__c) / 365")],
}
SHIELD = {("Employee__c", "National_ID__c"), ("Benefits_Enrollment__c", "Medical_Condition__c")}
CLASSIC = {("Treasury_Account__c", "Account_Number__c")}
EXTERNAL_ID = {("Legacy_Order__c", "Legacy_System_Id__c")}
HIDDEN = {"Compensation__c": ["Bonus__c", "Equity_Grant__c"]}
FIELD_DEFINITIONS = {"Compensation__c": [
    {"QualifiedApiName": "Name", "Label": "Compensation Name", "DataType": "Text(80)", "Length": 80,
     "Precision": 0, "Scale": 0, "IsCalculated": False, "ReferenceTo": None, "RelationshipName": None},
    {"QualifiedApiName": "Employee__c", "Label": "Employee", "DataType": "Master-Detail(Employee)", "Length": 18,
     "Precision": 0, "Scale": 0, "IsCalculated": False, "ReferenceTo": {"referenceTo": ["Employee__c"]},
     "RelationshipName": "Employee"},
    {"QualifiedApiName": "Bonus__c", "Label": "Bonus", "DataType": "Currency(16, 2)", "Length": 0,
     "Precision": 18, "Scale": 2, "IsCalculated": False, "ReferenceTo": None, "RelationshipName": None},
    {"QualifiedApiName": "Equity_Grant__c", "Label": "Equity Grant", "DataType": "Number(16, 2)", "Length": 0,
     "Precision": 18, "Scale": 2, "IsCalculated": False, "ReferenceTo": None, "RelationshipName": None},
]}
LENGTH = {"string": 255, "textarea": 32768, "phone": 40, "email": 80, "url": 255, "picklist": 255}


def label_of(api: str) -> str:
    return api.removesuffix("__c").replace("_", " ").strip()


def describe_field(obj: str, name: str, ftype: str, label: str | None = None, **extra) -> dict:
    f = {"name": name, "label": label or label_of(name), "type": ftype, "custom": name.endswith("__c"),
         "nillable": True, "createable": True, "defaultedOnCreate": False, "calculated": False}
    if ftype in LENGTH:
        f["length"] = LENGTH[ftype] if ftype != "textarea" or name.endswith("__c") else 255
    if ftype in ("currency", "double", "percent"):
        f["precision"], f["scale"] = 18, 0 if ftype == "double" and name in ("Dependents__c",) else 2
    if (obj, name) in PICKLISTS:
        values = PICKLISTS[(obj, name)]
        f["picklistValues"] = [{"value": v, "label": v, "active": True, "defaultValue": i == 0} for i, v in enumerate(values)]
    if (obj, name) in SHIELD:
        f["encrypted"] = True
    if (obj, name) in CLASSIC:
        f["type"], f["length"] = "encryptedstring", 32
    if (obj, name) in EXTERNAL_ID:
        f["externalId"], f["unique"] = True, True
    f.update(extra)
    return f


def build() -> list:
    data = load_fixture("synthetic_mid_market")
    objects = sorted({r["SobjectType"] for r in data["object_permissions"]})
    dq = {o["name"]: o for o in data["demo_live"]["data_quality"]["objects"]}
    perm_fields: dict = {}
    for r in data["field_permissions"]:
        o, f = r["Field"].split(".", 1)
        perm_fields.setdefault(o, set()).add(f)

    describes = {}
    for obj in objects:
        fields = [describe_field(obj, "Id", "id", "Record ID", nillable=False, createable=False, length=18)]
        name_field = NAME_FIELD.get(obj, "Name")
        if name_field:
            auto = name_field in AUTO_NUMBER
            fields.append(describe_field(obj, name_field, "string", nillable=False, createable=not auto,
                                         defaultedOnCreate=auto, length=80 if not auto else 30,
                                         **({"label": "Last Name"} if name_field == "LastName" else {})))
        if obj in DETAIL:
            parent, fname = DETAIL[obj]
            fields.append(describe_field(obj, fname, "reference", LABELS.get(parent, parent), nillable=False,
                                         referenceTo=[parent], relationshipName=fname.replace("__c", "__r"),
                                         relationshipOrder=0, length=18))
        else:
            fields.append(describe_field(obj, "OwnerId", "reference", "Owner ID", nillable=False, defaultedOnCreate=True,
                                         referenceTo=["Group", "User"], relationshipName="Owner", length=18))
        for (o, fname), (target, label) in sorted(LOOKUPS.items()):
            if o == obj:
                rel = fname.replace("__c", "__r") if fname.endswith("__c") else fname.removesuffix("Id")
                fields.append(describe_field(obj, fname, "reference", label, referenceTo=[target],
                                             relationshipName=rel, length=18))
        seen = {f["name"] for f in fields}
        named = {f["name"]: f["type"] for f in dq.get(obj, {}).get("fields", [])}
        for fname in sorted(perm_fields.get(obj, set()) | set(named)):
            if fname in seen:
                continue
            ftype = named.get(fname) or TYPES.get(fname)
            if ftype is None:
                raise SystemExit(f"no type for {obj}.{fname}")
            if ftype == "reference":
                continue  # every reference is in LOOKUPS
            fields.append(describe_field(obj, fname, ftype))
            seen.add(fname)
        for fname, label, ftype, formula in FORMULAS.get(obj, []):
            fields.append(describe_field(obj, fname, ftype, label, calculated=True, calculatedFormula=formula,
                                         createable=False))
        for fname, ftype in (("CreatedDate", "datetime"), ("LastModifiedDate", "datetime")):
            fields.append(describe_field(obj, fname, ftype, {"CreatedDate": "Created Date"}.get(fname, "Last Modified Date"), nillable=False,
                                         createable=False, defaultedOnCreate=True))
        fields = [f for f in fields if f["name"] not in HIDDEN.get(obj, [])]
        describes[obj] = {"name": obj, "label": LABELS.get(obj, obj), "labelPlural": LABELS.get(obj, obj) + "s",
                          "custom": obj.endswith("__c"), "fields": fields, "childRelationships": []}

    for obj, d in describes.items():
        for f in d["fields"]:
            for target in f.get("referenceTo") or []:
                if target in describes:
                    describes[target]["childRelationships"].append({
                        "childSObject": obj, "field": f["name"],
                        "relationshipName": obj.replace("__c", "s__r") if obj.endswith("__c") else obj + "s",
                        "cascadeDelete": f.get("relationshipOrder") is not None, "restrictedDelete": False,
                    })
    return [describes[o] for o in objects]


def main() -> None:
    part = {"_source": "Roadmap item 8. Generated by research/demo_fixture/build_field_metadata_part.py; synthetic.",
            "demo_live": {"schema": build(), "field_definitions": FIELD_DEFINITIONS}}
    OUT.write_text(json.dumps(part, indent=1) + "\n")
    n = sum(len(d["fields"]) for d in part["demo_live"]["schema"])
    print(f"wrote {OUT.relative_to(ROOT)}: {len(part['demo_live']['schema'])} objects, {n} fields")


if __name__ == "__main__":
    main()
