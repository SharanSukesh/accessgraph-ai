from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.salesforce.client import SalesforceAPIClient
from app.services.data_quality import DataQualityService


def _field(name, *, custom=False, nillable=True, aggregatable=True, groupable=True, ftype="string"):
    return {
        "name": name,
        "custom": custom,
        "nillable": nillable,
        "aggregatable": aggregatable,
        "groupable": groupable,
        "createable": True,
        "type": ftype,
    }


class FakeClient:
    def __init__(self, fields, total=100, populated=None, cluster_sizes=None):
        self.fields = fields
        self.total = total
        self.populated = populated or {}
        self.cluster_sizes = cluster_sizes or []
        self.requested_fields = None
        self.queries = []

    async def describe_object(self, name):
        return {"fields": self.fields}

    async def count_sobject(self, name):
        return self.total

    async def aggregate_field_populated_counts(self, name, field_names):
        self.requested_fields = list(field_names)
        out = {"__total__": self.total}
        out.update({f: self.populated.get(f, self.total) for f in field_names})
        return out

    async def aggregate_duplicate_cluster_sizes(self, name, key, limit=2000):
        return list(self.cluster_sizes)

    async def query(self, soql):
        self.queries.append(soql)
        return SimpleNamespace(totalSize=0, records=[])


def _service():
    return DataQualityService.__new__(DataQualityService)


@pytest.mark.asyncio
async def test_non_aggregatable_fields_are_not_counted():
    fields = [
        _field("Id"),
        _field("LastModifiedDate"),
        _field("Name", nillable=False),
        _field("Notes__c", custom=True, aggregatable=False, ftype="textarea"),
        _field("Segment__c", custom=True),
    ]
    client = FakeClient(fields, populated={"Segment__c": 40})
    threshold = datetime.now(timezone.utc) - timedelta(days=180)

    result, skip = await _service()._analyze_object(client, "Account", "Account", False, threshold)

    assert skip is None
    assert "Notes__c" not in client.requested_fields
    assert set(client.requested_fields) == {"Name", "Segment__c"}
    assert result.record_count == 100


@pytest.mark.asyncio
async def test_duplicates_are_counted_from_sizes_only():
    fields = [_field("LastModifiedDate"), _field("Name", nillable=False)]
    client = FakeClient(fields, cluster_sizes=[5, 3, 2])
    threshold = datetime.now(timezone.utc) - timedelta(days=180)

    result, _ = await _service()._analyze_object(client, "Account", "Account", False, threshold)

    assert result.duplicate_clusters == 3
    assert result.duplicate_pct == pytest.approx(10.0)
    assert result.evidence["duplicate_cluster_sizes"] == [5, 3, 2]
    assert "duplicate_examples" not in result.evidence


@pytest.mark.asyncio
async def test_ungroupable_key_skips_duplicate_check():
    fields = [_field("LastModifiedDate"), _field("Name", nillable=False, groupable=False)]
    client = FakeClient(fields, cluster_sizes=[9])
    threshold = datetime.now(timezone.utc) - timedelta(days=180)

    result, _ = await _service()._analyze_object(client, "Contact", "Contact", False, threshold)

    assert result.duplicate_clusters == 0
    assert result.evidence["duplicates_checked"] is False


@pytest.mark.asyncio
async def test_duplicate_soql_never_selects_the_key_value():
    captured = []

    async def fake_query(self, soql):
        captured.append(soql)
        return SimpleNamespace(records=[{"cnt": 4}, {"cnt": 2}])

    client = SalesforceAPIClient.__new__(SalesforceAPIClient)
    client.query = fake_query.__get__(client)

    sizes = await client.aggregate_duplicate_cluster_sizes("Contact", "Email")

    assert sizes == [4, 2]
    select_clause = captured[0].split("FROM")[0]
    assert "Email" not in select_clause


@pytest.mark.asyncio
async def test_completeness_falls_back_per_field_when_combined_query_fails():
    calls = []

    async def fake_query(self, soql):
        calls.append(soql)
        if "f_" in soql or "Bad__c" in soql:
            raise RuntimeError("MALFORMED_QUERY")
        if "COUNT(Id) t" in soql:
            return SimpleNamespace(records=[{"t": 10}])
        return SimpleNamespace(records=[{"f": 7}])

    client = SalesforceAPIClient.__new__(SalesforceAPIClient)
    client.query = fake_query.__get__(client)

    out = await client.aggregate_field_populated_counts("Account", ["Name", "Bad__c"])

    assert out == {"__total__": 10, "Name": 7}
