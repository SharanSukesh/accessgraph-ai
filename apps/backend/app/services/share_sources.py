"""What granted a record share row, in words (roadmap item 1).

Checked against the v68 (Winter '27) docs:
  - A share row created by Apex with no sharing reason has RowCause "Manual",
    the same as a share a user adds by hand, so Newton can't tell those two
    apart. Manual rows are removed when the record owner changes.
  - Apex managed sharing uses an Apex sharing reason: RowCause holds the
    reason's API name (ending "__c"), and the share survives an owner change.
    Sharing reasons were custom-object only; from API version 68.0 standard
    objects with a share object (AccountShare, OpportunityShare, ...) and a
    Private or Public Read Only org-wide default can have them too, up to 10
    per object. The Apex Developer Guide still says "custom objects only" in
    places.
  - A reason's label is read from the share object's describe (RowCause
    picklist).
"""
from __future__ import annotations

from typing import Dict, Optional

MANUAL_NOTE = (
    "Manual shares include any that Apex code created without a sharing reason: Salesforce records both with the "
    "reason Manual, so they can't be told apart."
)
APEX_NOTE = (
    "Shares with an Apex sharing reason are created by Apex managed sharing. Salesforce allows these reasons on "
    "custom objects and, from API version 68.0, on standard objects such as Account and Opportunity."
)
STANDARD = {
    "Owner": "Record owner",
    "Manual": "Manual share (by a user, or by Apex without a sharing reason)",
    "Rule": "Sharing rule",
    "Team": "Team",
    "ImplicitChild": "Implicit (access to a child record)",
    "ImplicitParent": "Implicit (access to the parent account)",
    "Territory": "Territory",
    "TerritoryRule": "Territory rule",
    "TerritoryManual": "Territory (manual)",
    "Territory2AssociationManual": "Territory (manual)",
    "GuestRule": "Guest user sharing rule",
}


def is_apex_reason(row_cause: Optional[str]) -> bool:
    return bool(row_cause) and row_cause.endswith("__c")


def describe(row_cause: Optional[str], labels: Optional[Dict[str, str]] = None) -> Dict[str, Optional[str]]:
    """{kind, label, reason} for a RowCause value. kind is "apex" for an Apex
    sharing reason, "manual_or_apex" for Manual, else "other"."""
    rc = row_cause or ""
    if is_apex_reason(rc):
        reason = (labels or {}).get(rc) or rc
        return {"kind": "apex", "label": f"Granted by Apex (sharing reason: {reason})", "reason": reason}
    if rc == "Manual":
        return {"kind": "manual_or_apex", "label": STANDARD["Manual"], "reason": None}
    return {"kind": "other", "label": STANDARD.get(rc, rc or "Unknown"), "reason": None}
