"""Writes the Lumenvale fixture part for roadmap item 2 (critical objects,
Data Quality on demo orgs).

Synthetic counts only: per-object record counts, per-field populated
counts, last-modified ages and duplicate cluster sizes. Plants:
  - Legacy_Order__c: 92% of records untouched for two years (stale)
  - Partner_Survey__c: mostly empty (average fill rate about 18%)
  - Account: three fields never populated, and a long-text field
    (Strategy_Notes__c) that SOQL can't aggregate
  - Web_Event__c: about 2,000,000 records, so it is sampled
The three planted custom objects get read access on two permission sets
nobody is assigned to (already reported as unused), so they are in Data
Quality's default scope without changing any user's access.

    python research/demo_fixture/build_data_quality_part.py
"""
import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "apps/backend/fixtures/synthetic_mid_market.parts/02-data-quality.json"
AS_OF = "2026-10-14"
UNUSED_SETS = {"Legacy_Order__c": "0PS000000000034DMO", "Partner_Survey__c": "0PS000000000033DMO",
               "Web_Event__c": "0PS000000000033DMO"}


def f(name, populated_share, *, label=None, type_="string", custom=None, nillable=True, aggregatable=True):
    return {"name": name, "label": label or name.replace("__c", "").replace("_", " "), "type": type_,
            "custom": name.endswith("__c") if custom is None else custom, "nillable": nillable,
            "aggregatable": aggregatable, "groupable": aggregatable, "_share": populated_share}


def ages(rng, total, stale_share_2y=0.0, recent_bias=0.6):
    """Age buckets (days before AS_OF -> count). recent_bias: share modified in the last 90 days."""
    buckets = {}
    old = round(total * stale_share_2y)
    rest = total - old
    recent = round(rest * recent_bias)
    buckets[rng.randint(1, 30)] = recent // 2
    buckets[rng.randint(31, 90)] = recent - recent // 2
    mid = rest - recent
    buckets[rng.randint(91, 170)] = mid // 2
    buckets[rng.randint(200, 600)] = mid - mid // 2
    if old:
        buckets[rng.randint(731, 1400)] = old
    return [[d, c] for d, c in sorted(buckets.items()) if c]


OBJECTS = [
    # name, label, custom, records, fields, stale share (>2y), recent bias, duplicate clusters
    ("Account", "Account", False, 5200, [
        f("Name", 1.0, nillable=False), f("Industry", 0.82, type_="picklist"), f("Phone", 0.74, type_="phone"),
        f("Website", 0.61, type_="url"), f("Segment__c", 0.88, type_="picklist"), f("Region__c", 0.93, type_="picklist"),
        f("Legacy_Region__c", 0.0, type_="picklist"), f("DUNS_Override__c", 0.0), f("Secondary_SIC__c", 0.0),
        f("Strategy_Notes__c", 0.31, type_="textarea", aggregatable=False),
    ], 0.05, 0.55, [2, 2, 3, 2]),
    ("Contact", "Contact", False, 21400, [
        f("LastName", 1.0, nillable=False), f("Email", 0.86, type_="email"), f("Phone", 0.66, type_="phone"),
        f("Title", 0.71), f("Department", 0.48),
    ], 0.08, 0.5, [2, 2, 2, 3, 2, 2]),
    ("Lead", "Lead", False, 9300, [
        f("LastName", 1.0, nillable=False), f("Company", 1.0, nillable=False), f("Email", 0.79, type_="email"),
        f("LeadSource", 0.64, type_="picklist"), f("Industry", 0.42, type_="picklist"),
    ], 0.12, 0.45, [2, 3, 2]),
    ("Opportunity", "Opportunity", False, 9520, [
        f("Name", 1.0, nillable=False), f("StageName", 1.0, type_="picklist", nillable=False),
        f("CloseDate", 1.0, type_="date", nillable=False), f("Amount", 0.91, type_="currency"),
        f("NextStep", 0.38), f("Forecast_Notes__c", 0.52),
    ], 0.04, 0.6, [2]),
    ("Case", "Case", False, 3213, [
        f("Subject", 0.97), f("Priority", 1.0, type_="picklist"), f("Reason", 0.58, type_="picklist"),
        f("Product_Area__c", 0.77, type_="picklist"),
    ], 0.02, 0.7, []),
    ("Benefits_Enrollment__c", "Benefits Enrollment", True, 760, [
        f("Name", 1.0, nillable=False), f("Plan__c", 0.97, type_="picklist"), f("Effective_Date__c", 0.95, type_="date"),
    ], 0.0, 0.3, []),
    ("Change_Request__c", "Change Request", True, 1140, [
        f("Name", 1.0, nillable=False), f("Status__c", 1.0, type_="picklist"), f("Risk_Level__c", 0.84, type_="picklist"),
        f("Approver__c", 0.69, type_="reference"),
    ], 0.06, 0.5, []),
    ("Compensation__c", "Compensation", True, 412, [
        f("Name", 1.0, nillable=False), f("Base_Salary__c", 1.0, type_="currency"), f("Bonus_Target__c", 0.74, type_="percent"),
    ], 0.0, 0.25, []),
    ("Employee__c", "Employee", True, 420, [
        f("Name", 1.0, nillable=False), f("Hire_Date__c", 0.99, type_="date"), f("Manager__c", 0.93, type_="reference"),
        f("Cost_Center__c", 0.81),
    ], 0.0, 0.35, []),
    ("Incident__c", "Incident", True, 2280, [
        f("Name", 1.0, nillable=False), f("Severity__c", 1.0, type_="picklist"), f("Root_Cause__c", 0.44),
    ], 0.1, 0.5, []),
    ("Invoice__c", "Invoice", True, 14800, [
        f("Name", 1.0, nillable=False), f("Amount__c", 1.0, type_="currency"), f("Due_Date__c", 0.98, type_="date"),
        f("PO_Number__c", 0.57),
    ], 0.2, 0.4, [2, 2]),
    ("Payment__c", "Payment", True, 13950, [
        f("Name", 1.0, nillable=False), f("Amount__c", 1.0, type_="currency"), f("Method__c", 0.88, type_="picklist"),
    ], 0.18, 0.4, []),
    ("Performance_Review__c", "Performance Review", True, 1180, [
        f("Name", 1.0, nillable=False), f("Rating__c", 0.9, type_="picklist"), f("Review_Period__c", 0.96, type_="picklist"),
    ], 0.0, 0.2, []),
    ("Treasury_Account__c", "Treasury Account", True, 36, [
        f("Name", 1.0, nillable=False), f("Bank__c", 1.0), f("Signatory__c", 0.83, type_="reference"),
    ], 0.0, 0.3, []),
    # --- plants
    ("Legacy_Order__c", "Legacy Order", True, 18400, [
        f("Name", 1.0, nillable=False), f("Order_Total__c", 0.97, type_="currency"), f("Ship_Date__c", 0.81, type_="date"),
        f("Legacy_System_Id__c", 0.99),
    ], 0.92, 1.0, [2, 2, 2]),
    ("Partner_Survey__c", "Partner Survey", True, 1250, [
        f("Name", 1.0, nillable=False, custom=False), f("Satisfaction__c", 0.14, type_="picklist"),
        f("Would_Recommend__c", 0.09, type_="picklist"), f("Comments__c", 0.06), f("Follow_Up_Owner__c", 0.03, type_="reference"),
        f("Region__c", 0.21, type_="picklist"), f("Partner_Tier__c", 0.17, type_="picklist"),
    ], 0.0, 0.4, []),
    ("Web_Event__c", "Web Event", True, 2_000_000, [
        f("Name", 1.0, nillable=False), f("Page__c", 0.99), f("Session_Id__c", 0.97), f("Campaign_Code__c", 0.23),
        f("Referrer__c", 0.61, type_="url"),
    ], 0.0, 0.85, []),
]


def main() -> None:
    rng = random.Random(2)
    objects, perms = [], []
    for name, label, custom, records, fields, stale2y, recent, dups in OBJECTS:
        out_fields = []
        for fld in fields:
            share = fld.pop("_share")
            out_fields.append({**fld, "populated": round(records * share)})
        objects.append({"name": name, "label": label, "custom": custom, "record_count": records,
                        "fields": out_fields, "age_buckets": ages(rng, records, stale2y, recent),
                        "duplicate_clusters": dups})
    for i, (obj, ps) in enumerate(UNUSED_SETS.items()):
        perms.append({"Id": f"110000000002{i:03d}DMO", "ParentId": ps, "SobjectType": obj, "PermissionsRead": True,
                      "PermissionsCreate": False, "PermissionsEdit": False, "PermissionsDelete": False,
                      "PermissionsViewAllRecords": False, "PermissionsModifyAllRecords": False})
    part = {
        "_source": "Roadmap item 2. Generated by research/demo_fixture/build_data_quality_part.py; synthetic counts only.",
        "object_permissions": perms,
        "demo_live": {"data_quality": {"as_of": AS_OF, "objects": objects}},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(part, indent=1) + "\n")
    print(f"{len(objects)} objects, {len(perms)} permission rows")


if __name__ == "__main__":
    main()
