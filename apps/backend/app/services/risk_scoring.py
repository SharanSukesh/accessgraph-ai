"""
Risk Scoring Service — deterministic, explainable per-user access risk.

Every active user gets six factors, each normalised to 0..1 and carrying a
plain-language description plus an evidence list that names the profile,
permission set or permission set group (PSG) granting the access.

    factor                   cap w_i   measures
    privileged_permissions   0.65      severity-weighted system permissions
                                       (Modify All Data, Author Apex, ...)
    sensitive_data_access    0.35      CRUD / View All / Modify All on PII and
                                       financial objects + heuristically
                                       detected sensitive fields (SSN, DOB, ...)
    edit_delete_breadth      0.20      objects the user can edit/delete, as a
                                       percentile against active org users
                                       (only above-median breadth counts)
    peer_deviation           0.35      latest access-category AccessAnomaly
    dormancy_exposure        1.00      no login > 90 days (or never) x how
                                       privileged / sensitive the account is
    unique_access            0.30      sole (or one of two) holder of Delete /
                                       Modify All on an object or of a
                                       critical system permission

Combination is noisy-OR rather than a weighted sum:

    score = 100 * (1 - prod_i (1 - w_i * f_i))

A weighted sum dilutes one critical driver across the other factors (the old
model could not exceed 75). Under noisy-OR each factor alone is worth up to
100 * w_i points, independent drivers compound, and adding a factor can never
lower the score. w_i * f_i is also reported per factor as `impact` — the
score that factor would produce on its own.

Within a factor, multiple items (e.g. several system permissions) are combined
with the same noisy-OR, using per-item severities listed in the tables below
(unique_access takes the max within each kind, since sole holdership of many
critical permissions is usually one fact: the only admin).

Double counting: noisy-OR assumes independent evidence. Object access that is
already implied by an org-wide system permission (View All Data implies View
All on every object, Modify All Data implies Modify All) is scored once, under
privileged_permissions, and excluded from sensitive_data_access,
edit_delete_breadth and unique_access.

Levels (unchanged): LOW < 25, MEDIUM 25-49, HIGH 50-74, CRITICAL >= 75.

Worked examples
    Sales rep (Standard User: API Enabled, Export Reports; edit on Account,
    Contact, Lead, Opportunity; reads Contact.Birthdate; logged in this week)
        privileged 1-(.95)(.88)=0.16 -> 0.11, sensitive 0.33 -> 0.12
        score = 100*(1 - .89*.88) ~ 21  -> LOW
    Same rep, never logged in: dormancy 1.0 * exposure 0.33  ~ 47 -> MEDIUM
    Modify All Data via profile, active, nothing else
        privileged 0.90 -> 0.585          score ~ 58  -> HIGH
    Same user, last login 120 days ago
        dormancy (0.5 + 0.5*30/275) * 0.90 = 0.50
        score = 100*(1 - .415*.50) ~ 79   -> CRITICAL
    System Administrator profile (all privileged perms, Modify All on objects,
    edit on Contact.SSN__c), active: object access is subsumed by Modify All
    Data, sensitive fields 0.44 -> 0.15      score ~ 70  -> HIGH
    Same admin, last login 200 days ago      score ~ 91  -> CRITICAL
    Never-logged-in account holding every critical permission
        privileged ~1.0, dormancy ~1.0    score = 100

Dormancy is skipped org-wide when no active user has a login timestamp (rows
synced before LastLoginDate was captured), rather than flagging everyone.

Admins legitimately hold privileged permissions; the privileged factor flags
`expected_for_role` for System Administrator-type profiles but the inherent
risk is still scored (risk is not wrongdoing).

Data: score_all_users loads every snapshot table for the org once, restricted
to rows written by the latest completed sync where that sync's rows exist
(assignment / PSG rows are upserted and never deleted, so older rows can be
stale), and resolves effective access in memory. Resolution follows the same
rules as EffectiveAccessService (profile-owned PS + direct assignments + PSG
components), in bulk instead of per-user queries, plus PSG muting.
"""
import bisect
import functools
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AccessAnomaly,
    FieldPermissionSnapshot,
    ObjectPermissionSnapshot,
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupComponentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    RiskLevel,
    RiskScore,
    SyncJob,
    SyncStatus,
    UserSnapshot,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Model parameters
# ---------------------------------------------------------------------------

FACTOR_WEIGHTS: Dict[str, float] = {
    "privileged_permissions": 0.65,
    "sensitive_data_access": 0.35,
    "edit_delete_breadth": 0.20,
    "peer_deviation": 0.35,
    "dormancy_exposure": 1.00,
    "unique_access": 0.30,
}

FACTOR_LABELS: Dict[str, str] = {
    "privileged_permissions": "Privileged system permissions",
    "sensitive_data_access": "Sensitive data access",
    "edit_delete_breadth": "Edit / delete breadth",
    "peer_deviation": "Peer deviation",
    "dormancy_exposure": "Dormant privileged account",
    "unique_access": "Sole access",
}

# PermissionSet.Permissions<Name> -> (label, tier, severity 0..1)
PRIVILEGED_PERMISSIONS: Dict[str, Tuple[str, str, float]] = {
    # critical: full data or platform control, or the ability to grant it
    "ModifyAllData": ("Modify All Data", "critical", 0.90),
    "ViewAllData": ("View All Data", "critical", 0.70),
    "ModifyMetadata": ("Modify Metadata Through Metadata API Functions", "critical", 0.65),
    "AuthorApex": ("Author Apex", "critical", 0.65),
    "ManageUsers": ("Manage Users", "critical", 0.65),
    "ManageProfilesPermissionsets": ("Manage Profiles and Permission Sets", "critical", 0.65),
    "ManageEncryptionKeys": ("Manage Encryption Keys", "critical", 0.60),
    "AssignPermissionSets": ("Assign Permission Sets", "critical", 0.55),
    "ManageInternalUsers": ("Manage Internal Users", "critical", 0.55),
    # high: broad configuration, sharing, credential or mass-data power
    "CustomizeApplication": ("Customize Application", "high", 0.40),
    "BulkApiHardDelete": ("Bulk API Hard Delete", "high", 0.40),
    "ManageSharing": ("Manage Sharing", "high", 0.35),
    "ResetPasswords": ("Reset User Passwords and Unlock Users", "high", 0.35),
    "ViewEncryptedData": ("View Encrypted Data", "high", 0.35),
    "ManageAuthProviders": ("Manage Auth. Providers", "high", 0.35),
    "ManageRemoteAccess": ("Manage Connected Apps", "high", 0.35),
    "ManageRoles": ("Manage Roles", "high", 0.30),
    "ManageDataIntegrations": ("Manage Data Integrations", "high", 0.30),
    # Export Reports ships on the Standard User profile, so it is weighted at
    # the bottom of its tier to keep ordinary users out of MEDIUM.
    "ExportReport": ("Export Reports", "high", 0.12),
    # medium: reconnaissance / channel permissions
    "ViewSetup": ("View Setup and Configuration", "medium", 0.10),
    "ViewAllUsers": ("View All Users", "medium", 0.10),
    "TransferAnyEntity": ("Transfer Record", "medium", 0.10),
    "PasswordNeverExpires": ("Password Never Expires", "medium", 0.10),
    "ApiEnabled": ("API Enabled", "medium", 0.05),
}

# Standard objects that routinely hold PII or financial data:
# API name -> (data class, sensitivity weight 0..1)
SENSITIVE_OBJECTS: Dict[str, Tuple[str, float]] = {
    "Individual": ("personal data & consent", 0.8),
    "Contact": ("personal data", 0.7),
    "Contract": ("financial / legal", 0.6),
    "Lead": ("personal data", 0.6),
    "Account": ("customer & financial", 0.5),
    "Case": ("customer communications", 0.5),
    "Opportunity": ("financial", 0.5),
    "Order": ("financial", 0.5),
    "User": ("employee personal data", 0.5),
    "Quote": ("financial", 0.4),
}
CUSTOM_SENSITIVE_OBJECT_WEIGHT = 0.6

# Object-level access level (before multiplying by object sensitivity).
# Plain CRUD on CRM objects is everyday work bounded by record sharing; View
# All / Modify All bypass sharing entirely, hence the step change.
_R, _C, _E, _D, _VA, _MA = 1, 2, 4, 8, 16, 32
OBJECT_ACCESS_LEVELS: Sequence[Tuple[int, str, float]] = (
    (_MA, "Modify All", 0.85),
    (_VA, "View All", 0.60),
    (_D, "Delete", 0.20),
    (_E, "Edit", 0.12),
    (_C, "Create", 0.12),
    (_R, "Read", 0.05),
)
FIELD_READ_LEVEL = 0.15
FIELD_EDIT_LEVEL = 0.25

# Sensitive-name patterns, matched against tokenised API names
# (SocialSecurityNumber__c -> social security number). A trailing * is a
# prefix match on that token; other tokens must match exactly.
# (pattern, category, severity)
SENSITIVE_NAME_PATTERNS: Sequence[Tuple[str, str, float]] = (
    ("ssn", "government ID", 1.0),
    ("social security*", "government ID", 1.0),
    ("social insurance*", "government ID", 1.0),
    ("tax id*", "government ID", 1.0),
    ("taxid*", "government ID", 1.0),
    ("tax number", "government ID", 1.0),
    ("tax identification*", "government ID", 1.0),
    ("national id*", "government ID", 1.0),
    ("passport*", "government ID", 1.0),
    ("license number", "government ID", 1.0),
    ("licence number", "government ID", 1.0),
    ("driver* license*", "government ID", 1.0),
    ("driver* licence*", "government ID", 1.0),
    ("bank*", "financial", 1.0),
    ("iban", "financial", 1.0),
    ("routing number", "financial", 1.0),
    ("routing code", "financial", 1.0),
    ("swift", "financial", 1.0),
    ("credit card*", "financial", 1.0),
    ("card number", "financial", 1.0),
    ("cvv", "financial", 1.0),
    ("cvc", "financial", 1.0),
    ("salary", "financial", 1.0),
    ("salaries", "financial", 1.0),
    ("compensation", "financial", 1.0),
    ("wage*", "financial", 1.0),
    ("payroll*", "financial", 1.0),
    ("credit score*", "financial", 1.0),
    ("credit*", "financial", 0.6),
    ("income", "financial", 0.6),
    ("account number", "financial", 0.5),
    ("health condition*", "health", 1.0),
    ("health record*", "health", 1.0),
    ("health insurance", "health", 1.0),
    ("health status", "health", 1.0),
    ("medical*", "health", 1.0),
    ("diagnos*", "health", 1.0),
    ("medication*", "health", 1.0),
    ("prescription*", "health", 1.0),
    ("disabilit*", "health", 1.0),
    ("allerg*", "health", 1.0),
    ("patient*", "health", 1.0),
    ("password*", "credential", 1.0),
    ("passwd", "credential", 1.0),
    ("secret*", "credential", 1.0),
    ("token", "credential", 1.0),
    ("api key", "credential", 1.0),
    ("apikey", "credential", 1.0),
    ("private key", "credential", 1.0),
    ("dob", "demographic", 0.6),
    ("birth*", "demographic", 0.6),
    ("gender*", "demographic", 0.6),
    ("sex", "demographic", 0.6),
    ("ethnic*", "demographic", 0.6),
    ("race", "demographic", 0.6),
    ("religio*", "demographic", 0.6),
    ("marital*", "demographic", 0.6),
    ("sexual orientation", "demographic", 0.6),
    ("citizenship", "demographic", 0.6),
)
# Extra terms that mark a custom *object* (not field) as sensitive.
SENSITIVE_OBJECT_TERMS: Sequence[Tuple[str, str, float]] = (
    ("payment*", "financial", 1.0),
    ("invoice*", "financial", 1.0),
    ("employee*", "personal data", 1.0),
)

DORMANCY_THRESHOLD_DAYS = 90
DORMANCY_FULL_DAYS = 365
MIN_USERS_FOR_UNIQUE = 3
MIN_USERS_FOR_PAIR = 10
# (key kind) -> value when the user is the sole holder; half when one of two.
UNIQUE_VALUES = {"perm": 0.7, "modify_all": 0.5, "delete": 0.3}
ANOMALY_SEVERITY_VALUES = {"critical": 1.0, "high": 0.75, "medium": 0.5, "low": 0.3, "info": 0.1}
MAX_EVIDENCE = 8
_ADMIN_PROFILE_RE = re.compile(r"\b(system\s*admin(istrator)?|sys\.?\s*admin)\b", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def noisy_or(values: Iterable[float]) -> float:
    """1 - prod(1 - v), with each v clamped to 0..1."""
    remaining = 1.0
    for v in values:
        remaining *= 1.0 - min(max(v, 0.0), 1.0)
    return 1.0 - remaining


def combine_factors(factors: Iterable[Tuple[float, float]]) -> float:
    """Noisy-OR combination of (weight, score) pairs, returned on 0..100."""
    return 100.0 * noisy_or(w * f for w, f in factors)


def determine_risk_level(score: float) -> RiskLevel:
    if score >= 75:
        return RiskLevel.CRITICAL
    if score >= 50:
        return RiskLevel.HIGH
    if score >= 25:
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


def tokenize_api_name(name: str) -> List[str]:
    """`ns__Social_SecurityNumber__c` -> ['social', 'security', 'number']."""
    base = name.rsplit(".", 1)[-1]
    parts = base.split("__")
    if len(parts) >= 2 and parts[-1].lower() in ("c", "pc", "r", "s", "x", "mdt", "e", "b"):
        parts = parts[:-1]
    if len(parts) >= 2:
        parts = parts[1:]  # drop namespace prefix
    base = "_".join(parts)
    base = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", base)
    base = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", base)
    return [t for t in re.split(r"[^a-z0-9]+", base.lower()) if t]


def _compile(patterns: Sequence[Tuple[str, str, float]]):
    compiled = []
    for pattern, category, severity in patterns:
        tokens = []
        for tok in pattern.split():
            tokens.append((tok.rstrip("*"), tok.endswith("*")))
        compiled.append((pattern, tokens, category, severity))
    return compiled


_FIELD_PATTERNS = _compile(SENSITIVE_NAME_PATTERNS)
_OBJECT_PATTERNS = _compile(tuple(SENSITIVE_NAME_PATTERNS) + tuple(SENSITIVE_OBJECT_TERMS))


def _match_tokens(words: List[str], compiled) -> Optional[Tuple[str, float]]:
    """Return (category, severity) of the most severe matching pattern."""
    best: Optional[Tuple[str, float]] = None
    for _, tokens, category, severity in compiled:
        n = len(tokens)
        for i in range(len(words) - n + 1):
            if all(
                words[i + j].startswith(t) if prefix else words[i + j] == t
                for j, (t, prefix) in enumerate(tokens)
            ):
                if best is None or severity > best[1]:
                    best = (category, severity)
                break
    return best


@functools.lru_cache(maxsize=65536)
def classify_sensitive_field(field_api_name: str) -> Optional[Tuple[str, float]]:
    """Heuristic: (category, severity) if the field name looks sensitive."""
    return _match_tokens(tokenize_api_name(field_api_name), _FIELD_PATTERNS)


@functools.lru_cache(maxsize=16384)
def classify_sensitive_object(object_api_name: str) -> Optional[Tuple[str, float]]:
    """(data class, sensitivity weight) for default or name-matched objects."""
    if object_api_name in SENSITIVE_OBJECTS:
        return SENSITIVE_OBJECTS[object_api_name]
    if "__" not in object_api_name:
        return None  # only custom objects get the name heuristic
    match = _match_tokens(tokenize_api_name(object_api_name), _OBJECT_PATTERNS)
    if match:
        return match[0], CUSTOM_SENSITIVE_OBJECT_WEIGHT * match[1]
    return None


_LEVEL_BY_BIT = {bit: level for bit, _, level in OBJECT_ACCESS_LEVELS}


def _object_level(mask: int) -> Tuple[int, str, float]:
    """Highest access level in a CRUD/VA/MA bitmask: (bit, label, level)."""
    for bit, label, level in OBJECT_ACCESS_LEVELS:
        if mask & bit:
            return bit, label, level
    return 0, "None", 0.0


def _flag(raw: Dict, key: str) -> bool:
    value = raw.get(key)
    return value is True or (isinstance(value, str) and value.lower() == "true")


def _source_phrase(src: Dict) -> str:
    kind = {
        "profile": "profile",
        "permission_set": "permission set",
        "permission_set_group": "permission set group",
    }.get(src.get("type"), "grant")
    return f"{kind} '{src.get('name')}'"


def _sources_phrase(sources: List[Dict]) -> str:
    if not sources:
        return "an unknown grant"
    phrase = _source_phrase(sources[0])
    if len(sources) > 1:
        phrase += f" and {len(sources) - 1} other grant{'s' if len(sources) > 2 else ''}"
    return phrase


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


# ---------------------------------------------------------------------------
# In-memory org model
# ---------------------------------------------------------------------------


@dataclass
class _Bundle:
    """Permissions granted by one source (a PS, or a PSG net of muting)."""
    sys_perms: frozenset = frozenset()
    objects: Dict[str, int] = field(default_factory=dict)
    fields: Dict[str, int] = field(default_factory=dict)  # sensitive only; bit 1 read, 2 edit


@dataclass
class _UserAccess:
    sys_perms: Dict[str, List[Dict]] = field(default_factory=dict)
    objects: Dict[str, int] = field(default_factory=dict)
    object_sources: Dict[str, List[Tuple[Dict, int]]] = field(default_factory=dict)
    fields: Dict[str, int] = field(default_factory=dict)
    field_sources: Dict[str, List[Dict]] = field(default_factory=dict)
    profile_name: Optional[str] = None
    profile_sys_perms: frozenset = frozenset()

    def sources_for_object(self, obj: str, bits: int) -> List[Dict]:
        return [src for src, mask in self.object_sources.get(obj, []) if mask & bits]


@dataclass
class _OrgContext:
    org_id: str
    now: datetime
    users: List[UserSnapshot]
    ps_by_id: Dict[str, PermissionSetSnapshot]
    profile_names: Dict[str, str]
    profile_ps: Dict[str, str]
    psg_by_id: Dict[str, PermissionSetGroupSnapshot]
    psg_components: Dict[str, List[str]]
    assignments: Dict[str, List[str]]
    obj_perms: Dict[str, Dict[str, int]]
    field_perms: Dict[str, Dict[str, int]]
    field_meta: Dict[str, Tuple[str, float]]
    anomalies: Dict[str, AccessAnomaly]
    _bundle_cache: Dict[str, _Bundle] = field(default_factory=dict)
    _access_cache: Dict[str, _UserAccess] = field(default_factory=dict)

    @property
    def active_users(self) -> List[UserSnapshot]:
        return [u for u in self.users if u.is_active]

    def _ps_bundle(self, ps_id: str) -> _Bundle:
        ps = self.ps_by_id.get(ps_id)
        raw = (ps.raw_data or {}) if ps else {}
        perms = frozenset(
            name for name in PRIVILEGED_PERMISSIONS if _flag(raw, f"Permissions{name}")
        )
        return _Bundle(
            sys_perms=perms,
            objects=self.obj_perms.get(ps_id, {}),
            fields=self.field_perms.get(ps_id, {}),
        )

    def bundle(self, grant_id: str) -> _Bundle:
        cached = self._bundle_cache.get(grant_id)
        if cached is not None:
            return cached
        if grant_id not in self.psg_by_id:
            bundle = self._ps_bundle(grant_id)
        else:
            granted, muted = [], []
            for comp_id in self.psg_components.get(grant_id, []):
                comp = self.ps_by_id.get(comp_id)
                (muted if comp is not None and comp.is_muting else granted).append(self._ps_bundle(comp_id))
            sys_perms = frozenset().union(*(b.sys_perms for b in granted)) if granted else frozenset()
            objects: Dict[str, int] = {}
            fields: Dict[str, int] = {}
            for b in granted:
                for k, v in b.objects.items():
                    objects[k] = objects.get(k, 0) | v
                for k, v in b.fields.items():
                    fields[k] = fields.get(k, 0) | v
            for m in muted:
                sys_perms = sys_perms - m.sys_perms
                for k, v in m.objects.items():
                    if k in objects:
                        objects[k] &= ~v
                for k, v in m.fields.items():
                    if k in fields:
                        fields[k] &= ~v
            bundle = _Bundle(sys_perms=sys_perms, objects=objects, fields=fields)
        self._bundle_cache[grant_id] = bundle
        return bundle

    def _sources(self, user: UserSnapshot) -> List[Tuple[str, Dict]]:
        out: List[Tuple[str, Dict]] = []
        seen = set()
        profile_name = self.profile_names.get(user.profile_id or "")
        profile_ps_id = self.profile_ps.get(user.profile_id or "")
        if profile_ps_id:
            seen.add(profile_ps_id)
            ps = self.ps_by_id[profile_ps_id]
            out.append((profile_ps_id, {"type": "profile", "name": profile_name or ps.label}))
        for grant_id in self.assignments.get(user.salesforce_id, []):
            if grant_id in seen:
                continue
            seen.add(grant_id)
            if grant_id in self.psg_by_id:
                psg = self.psg_by_id[grant_id]
                out.append((grant_id, {"type": "permission_set_group", "name": psg.master_label}))
                continue
            ps = self.ps_by_id.get(grant_id)
            if ps is None:
                if grant_id in self.obj_perms or grant_id in self.field_perms:
                    out.append((grant_id, {"type": "permission_set", "name": grant_id}))
                continue
            if ps.is_muting:
                continue
            if ps.is_owned_by_profile:
                name = self.profile_names.get(ps.profile_id or "") or ps.label
                out.append((grant_id, {"type": "profile", "name": name}))
            elif ps.ps_type == "Group":
                out.append((grant_id, {"type": "permission_set_group", "name": ps.label}))
            else:
                out.append((grant_id, {"type": "permission_set", "name": ps.label or ps.name}))
        return out

    def access(self, user: UserSnapshot) -> _UserAccess:
        cached = self._access_cache.get(user.salesforce_id)
        if cached is not None:
            return cached
        ua = _UserAccess(profile_name=self.profile_names.get(user.profile_id or ""))
        profile_ps_id = self.profile_ps.get(user.profile_id or "")
        if profile_ps_id:
            ua.profile_sys_perms = self.bundle(profile_ps_id).sys_perms
        for grant_id, src in self._sources(user):
            b = self.bundle(grant_id)
            for perm in b.sys_perms:
                ua.sys_perms.setdefault(perm, []).append(src)
            for obj, mask in b.objects.items():
                if not mask:
                    continue
                ua.objects[obj] = ua.objects.get(obj, 0) | mask
                ua.object_sources.setdefault(obj, []).append((src, mask))
            for fld, mask in b.fields.items():
                if not mask:
                    continue
                ua.fields[fld] = ua.fields.get(fld, 0) | mask
                ua.field_sources.setdefault(fld, []).append(src)
        self._access_cache[user.salesforce_id] = ua
        return ua


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class RiskScoringService:
    """Calculate per-user risk scores (see module docstring for the model)."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.weights = dict(FACTOR_WEIGHTS)

    # ---- public API -------------------------------------------------------

    async def score_user_risk(self, org_id: str, user_sf_id: str) -> RiskScore:
        """Score one user (org-relative factors still need the org context)."""
        ctx = await self._load_org_context(org_id)
        user = next((u for u in ctx.users if u.salesforce_id == user_sf_id), None)
        if user is None:
            raise ValueError(f"User not found: {user_sf_id}")
        org_stats = self._org_stats(ctx)
        risk_score = self._build_risk_score(ctx, org_stats, user)
        self.db.add(risk_score)
        await self.db.commit()
        logger.info("Risk score for %s: %.1f (%s)", user.name, risk_score.risk_score, risk_score.risk_level.value)
        return risk_score

    score_user = score_user_risk

    async def score_all_users(self, org_id: str) -> List[RiskScore]:
        """Score every active user, replacing the org's previous user scores."""
        await self.db.execute(
            delete(RiskScore).where(
                RiskScore.organization_id == org_id,
                RiskScore.entity_type == "user",
            )
        )
        await self.db.commit()

        ctx = await self._load_org_context(org_id)
        org_stats = self._org_stats(ctx)
        scores: List[RiskScore] = []
        for user in ctx.active_users:
            try:
                scores.append(self._build_risk_score(ctx, org_stats, user))
            except Exception as e:  # noqa: BLE001 — one bad user must not sink the run
                logger.error("Failed to score user %s: %s", user.name, e, exc_info=True)

        if scores:
            self.db.add_all(scores)
        await self.db.commit()
        logger.info("Scored %d users for org %s", len(scores), org_id)
        return scores

    # ---- loading ----------------------------------------------------------

    async def _latest_sync_id(self, org_id: str) -> Optional[str]:
        result = await self.db.execute(
            select(SyncJob.id)
            .where(
                SyncJob.organization_id == org_id,
                SyncJob.status.in_([SyncStatus.COMPLETED, SyncStatus.PARTIAL]),
                SyncJob.completed_at.isnot(None),
            )
            .order_by(SyncJob.completed_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _load_rows(self, model, org_id: str, sync_id: Optional[str]) -> list:
        rows = (await self.db.execute(select(model).where(model.organization_id == org_id))).scalars().all()
        if sync_id and any(r.sync_job_id == sync_id for r in rows):
            rows = [r for r in rows if r.sync_job_id == sync_id]
        return list(rows)

    async def _load_org_context(self, org_id: str) -> _OrgContext:
        sync_id = await self._latest_sync_id(org_id)

        users = await self._load_rows(UserSnapshot, org_id, sync_id)
        permission_sets = await self._load_rows(PermissionSetSnapshot, org_id, sync_id)
        assignments = await self._load_rows(PermissionSetAssignmentSnapshot, org_id, sync_id)
        psgs = await self._load_rows(PermissionSetGroupSnapshot, org_id, sync_id)
        components = await self._load_rows(PermissionSetGroupComponentSnapshot, org_id, sync_id)
        profiles = (
            await self.db.execute(
                select(ProfileSnapshot.salesforce_id, ProfileSnapshot.name).where(
                    ProfileSnapshot.organization_id == org_id
                )
            )
        ).all()

        obj_perms: Dict[str, Dict[str, int]] = {}
        obj_rows = await self.db.execute(
            select(
                ObjectPermissionSnapshot.parent_id,
                ObjectPermissionSnapshot.sobject_type,
                ObjectPermissionSnapshot.permissions_read,
                ObjectPermissionSnapshot.permissions_create,
                ObjectPermissionSnapshot.permissions_edit,
                ObjectPermissionSnapshot.permissions_delete,
                ObjectPermissionSnapshot.permissions_view_all_records,
                ObjectPermissionSnapshot.permissions_modify_all_records,
            ).where(ObjectPermissionSnapshot.organization_id == org_id)
        )
        for parent_id, obj, r, c, e, d, va, ma in obj_rows:
            mask = (_R if r else 0) | (_C if c else 0) | (_E if e else 0) | (_D if d else 0) \
                | (_VA if va else 0) | (_MA if ma else 0)
            if mask:
                per_ps = obj_perms.setdefault(parent_id, {})
                per_ps[obj] = per_ps.get(obj, 0) | mask

        # Field permissions can run to millions of rows; keep only the ones
        # whose name matches a sensitive pattern (classified once per name).
        field_perms: Dict[str, Dict[str, int]] = {}
        field_meta: Dict[str, Tuple[str, float]] = {}
        classified: Dict[str, Optional[Tuple[str, float]]] = {}
        field_rows = await self.db.execute(
            select(
                FieldPermissionSnapshot.parent_id,
                FieldPermissionSnapshot.field,
                FieldPermissionSnapshot.permissions_read,
                FieldPermissionSnapshot.permissions_edit,
            ).where(FieldPermissionSnapshot.organization_id == org_id)
        )
        for parent_id, fld, r, e in field_rows:
            if fld not in classified:
                classified[fld] = classify_sensitive_field(fld)
            meta = classified[fld]
            if meta is None or not (r or e):
                continue
            field_meta[fld] = meta
            per_ps = field_perms.setdefault(parent_id, {})
            per_ps[fld] = per_ps.get(fld, 0) | (1 if r else 0) | (2 if e else 0)

        anomaly_rows = (
            await self.db.execute(
                select(AccessAnomaly).where(
                    AccessAnomaly.organization_id == org_id,
                    AccessAnomaly.category == "access",
                )
            )
        ).scalars().all()
        anomalies: Dict[str, AccessAnomaly] = {}
        for a in anomaly_rows:
            prev = anomalies.get(a.user_id)
            if prev is None or (a.detected_at and prev.detected_at and a.detected_at > prev.detected_at):
                anomalies[a.user_id] = a

        assignment_map: Dict[str, List[str]] = {}
        for a in assignments:
            assignment_map.setdefault(a.assignee_id, []).append(a.permission_set_id)
        component_map: Dict[str, List[str]] = {}
        for c in components:
            component_map.setdefault(c.permission_set_group_id, []).append(c.permission_set_id)

        return _OrgContext(
            org_id=org_id,
            now=datetime.now(timezone.utc),
            users=users,
            ps_by_id={ps.salesforce_id: ps for ps in permission_sets},
            profile_names={pid: name for pid, name in profiles},
            profile_ps={
                ps.profile_id: ps.salesforce_id
                for ps in permission_sets
                if ps.is_owned_by_profile and ps.profile_id
            },
            psg_by_id={g.salesforce_id: g for g in psgs},
            psg_components=component_map,
            assignments=assignment_map,
            obj_perms=obj_perms,
            field_perms=field_perms,
            field_meta=field_meta,
            anomalies=anomalies,
        )

    # ---- org-wide statistics ---------------------------------------------

    def _org_stats(self, ctx: _OrgContext) -> Dict:
        active = ctx.active_users
        breadth_counts: List[int] = []
        holders: Dict[Tuple[str, str], int] = {}
        mad_holders = 0
        for user in active:
            ua = ctx.access(user)
            breadth_counts.append(sum(1 for m in ua.objects.values() if m & (_E | _D | _MA)))
            if "ModifyAllData" in ua.sys_perms:
                mad_holders += 1
            for perm in ua.sys_perms:
                if PRIVILEGED_PERMISSIONS[perm][1] == "critical":
                    holders[("perm", perm)] = holders.get(("perm", perm), 0) + 1
            if "ModifyAllData" in ua.sys_perms:
                continue  # implied object holdings are added via mad_holders
            for obj, mask in ua.objects.items():
                if mask & _MA:
                    holders[("modify_all", obj)] = holders.get(("modify_all", obj), 0) + 1
                if mask & (_D | _MA):
                    holders[("delete", obj)] = holders.get(("delete", obj), 0) + 1
        breadth_counts.sort()
        return {
            # Rows synced before LastLoginDate was captured have no login data
            # at all; treating them as "never logged in" would flag everyone.
            "login_data_available": any(u.last_login_at is not None for u in active),
            "n_active": len(active),
            "breadth_sorted": breadth_counts,
            "holders": holders,
            "mad_holders": mad_holders,
        }

    # ---- factors ----------------------------------------------------------

    def _is_admin_profile(self, ua: _UserAccess) -> bool:
        if ua.profile_name and _ADMIN_PROFILE_RE.search(ua.profile_name):
            return True
        return {"ModifyAllData", "CustomizeApplication", "ManageUsers"} <= ua.profile_sys_perms

    def _factor(self, key: str, score: float, description: str, evidence: List[Dict], headline: str = "", **extra) -> Dict:
        weight = self.weights[key]
        score = round(min(max(score, 0.0), 1.0), 4)
        return {
            "factor": key,
            "label": FACTOR_LABELS[key],
            "score": score,
            "weight": weight,
            "impact": round(100 * weight * score, 1),
            "description": description,
            "evidence": evidence[:MAX_EVIDENCE],
            "evidence_total": len(evidence),
            "headline": headline,
            **extra,
        }

    def _privileged_factor(self, ua: _UserAccess) -> Dict:
        expected = self._is_admin_profile(ua)
        held = sorted(
            ((perm, *PRIVILEGED_PERMISSIONS[perm], srcs) for perm, srcs in ua.sys_perms.items()),
            key=lambda t: -t[3],
        )
        score = noisy_or(sev for _, _, _, sev, _ in held)
        evidence = [
            {
                "label": label,
                "permission": perm,
                "severity": tier,
                "granted_by": srcs,
                "expected_for_role": expected,
            }
            for perm, label, tier, sev, srcs in held
        ]
        if not held:
            return self._factor("privileged_permissions", 0.0, "No privileged system permissions.", [], expected_for_role=expected)
        n_crit = sum(1 for t in held if t[2] == "critical")
        names = ", ".join(t[1] for t in held[:3]) + (", ..." if len(held) > 3 else "")
        description = f"Holds {_plural(len(held), 'privileged system permission')}"
        if n_crit:
            description += f" ({n_crit} critical)"
        description += f": {names}."
        if expected:
            description += " Expected for an administrator profile, but still high inherent risk."
        top = held[0]
        headline = f"holds {top[1]} via {_sources_phrase(top[4])}"
        if len(held) > 1:
            headline += f" plus {_plural(len(held) - 1, 'other privileged permission')}"
        return self._factor(
            "privileged_permissions", score, description, evidence, headline, expected_for_role=expected,
        )

    def _sensitive_factor(self, ctx: _OrgContext, ua: _UserAccess) -> Dict:
        implied, implied_by = 0.0, None
        if "ModifyAllData" in ua.sys_perms:
            implied, implied_by = _LEVEL_BY_BIT[_MA], "Modify All Data"
        elif "ViewAllData" in ua.sys_perms:
            implied, implied_by = _LEVEL_BY_BIT[_VA], "View All Data"

        items: List[Tuple[float, Dict]] = []
        for obj, mask in ua.objects.items():
            cls = classify_sensitive_object(obj)
            if cls is None:
                continue
            data_class, weight = cls
            top_bit, access_label, level = _object_level(mask)
            residual = level - implied
            if residual <= 0:
                continue
            items.append((weight * residual, {
                "label": f"{access_label} on {obj}",
                "kind": "object",
                "object": obj,
                "access": access_label,
                "category": data_class,
                "severity": "high" if level >= 0.6 else ("medium" if level >= 0.2 else "low"),
                "granted_by": ua.sources_for_object(obj, top_bit),
            }))
        for fld, mask in ua.fields.items():
            category, severity = ctx.field_meta[fld]
            can_edit = bool(mask & 2)
            value = severity * (FIELD_EDIT_LEVEL if can_edit else FIELD_READ_LEVEL)
            items.append((value, {
                "label": f"{'Edit' if can_edit else 'Read'} {fld}",
                "kind": "field",
                "field": fld,
                "access": "Edit" if can_edit else "Read",
                "category": category,
                "severity": "high" if severity >= 1.0 else "medium",
                "granted_by": ua.field_sources.get(fld, []),
            }))
        items.sort(key=lambda t: -t[0])
        score = noisy_or(v for v, _ in items)
        evidence = [e for _, e in items]

        n_obj = sum(1 for e in evidence if e["kind"] == "object")
        n_fld = len(evidence) - n_obj
        bypass = sum(1 for e in evidence if e["kind"] == "object" and e["access"] in ("View All", "Modify All"))
        if not evidence:
            description = "No access to sensitive objects or fields beyond what is scored elsewhere."
        else:
            parts = []
            if n_obj:
                part = f"access to {_plural(n_obj, 'sensitive object')}"
                if bypass:
                    part += f" ({bypass} with View All / Modify All, bypassing sharing)"
                parts.append(part)
            if n_fld:
                n_edit = sum(1 for e in evidence if e["kind"] == "field" and e["access"] == "Edit")
                parts.append(f"{_plural(n_fld, 'sensitive field')} ({n_edit} editable)")
            description = "Has " + " and ".join(parts) + "."
        if implied_by:
            description += f" Object access implied by {implied_by} is scored under privileged permissions."

        headline = ""
        if evidence:
            top = evidence[0]
            if top["kind"] == "object":
                headline = f"has {top['access']} on {top['object']} via {_sources_phrase(top['granted_by'])}"
            else:
                verb = "edit" if top["access"] == "Edit" else "read"
                headline = f"can {verb} {top['category']} field {top['field']} via {_sources_phrase(top['granted_by'])}"
        return self._factor("sensitive_data_access", score, description, evidence, headline)

    def _breadth_factor(self, ua: _UserAccess, org_stats: Dict) -> Dict:
        key = "edit_delete_breadth"
        count = sum(1 for m in ua.objects.values() if m & (_E | _D | _MA))
        sorted_counts = org_stats["breadth_sorted"]
        n = len(sorted_counts)
        median = sorted_counts[n // 2] if n else 0
        if "ModifyAllData" in ua.sys_perms:
            return self._factor(
                key, 0.0,
                f"Can edit or delete {_plural(count, 'object')} explicitly; edit/delete on every object is "
                "implied by Modify All Data and scored under privileged permissions.",
                [],
            )
        if count == 0 or n == 0:
            return self._factor(key, 0.0, "Cannot edit or delete any object.", [])
        below = bisect.bisect_left(sorted_counts, count)
        equal = bisect.bisect_right(sorted_counts, count) - below
        percentile = (below + 0.5 * equal) / n
        score = max(0.0, (percentile - 0.5) / 0.5)
        deletable = sorted(
            (obj for obj, m in ua.objects.items() if m & (_D | _MA)),
            key=lambda o: (classify_sensitive_object(o) is None, o),
        )
        evidence = [
            {
                "label": f"Delete on {obj}",
                "kind": "object",
                "object": obj,
                "granted_by": ua.sources_for_object(obj, _D | _MA),
            }
            for obj in deletable
        ]
        description = (
            f"Can edit or delete {_plural(count, 'object')} ({len(deletable)} with delete); "
            f"org median is {median}, placing this user above {percentile * 100:.0f}% of active users."
        )
        headline = f"can edit or delete {_plural(count, 'object')}, more than {percentile * 100:.0f}% of users"
        return self._factor(key, score, description, evidence, headline, percentile=round(percentile, 3))

    def _peer_factor(self, ctx: _OrgContext, user: UserSnapshot) -> Dict:
        key = "peer_deviation"
        anomaly = ctx.anomalies.get(user.salesforce_id)
        if anomaly is None:
            return self._factor(key, 0.0, "Access pattern is in line with peers (no anomaly flagged).", [])
        severity = anomaly.severity.value if hasattr(anomaly.severity, "value") else str(anomaly.severity)
        sev_value = ANOMALY_SEVERITY_VALUES.get(severity, 0.3)
        score = 0.5 * sev_value + 0.5 * min(max(anomaly.anomaly_score or 0.0, 0.0), 1.0)
        evidence = [{"label": reason, "kind": "anomaly"} for reason in (anomaly.reasons or [])]
        description = (
            f"Flagged as a {severity}-severity access outlier versus peers "
            f"(anomaly score {anomaly.anomaly_score:.2f})."
        )
        headline = f"was flagged as a {severity}-severity access outlier versus peers"
        return self._factor(key, score, description, evidence, headline)

    def _dormancy_factor(
        self, ctx: _OrgContext, org_stats: Dict, user: UserSnapshot, priv: Dict, sens: Dict, ua: _UserAccess,
    ) -> Dict:
        key = "dormancy_exposure"
        if not org_stats["login_data_available"]:
            return self._factor(key, 0.0, "Login history not available for this org yet.", [])
        last_login = user.last_login_at
        if last_login is not None and last_login.tzinfo is None:
            last_login = last_login.replace(tzinfo=timezone.utc)
        days = (ctx.now - last_login).days if last_login else None

        created = None
        raw_created = (user.raw_data or {}).get("CreatedDate") if isinstance(user.raw_data, dict) else None
        if raw_created:
            try:
                created = datetime.fromisoformat(str(raw_created).replace("Z", "+00:00").replace("+0000", "+00:00"))
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
            except ValueError:
                created = None

        if days is None:
            if created is not None and (ctx.now - created).days < DORMANCY_THRESHOLD_DAYS:
                return self._factor(key, 0.0, "New account that has not logged in yet (within grace period).", [])
            dormancy, when = 1.0, "has never logged in"
        elif days < DORMANCY_THRESHOLD_DAYS:
            return self._factor(key, 0.0, f"Active: last login {_plural(days, 'day')} ago.", [], days_since_login=days)
        else:
            span = DORMANCY_FULL_DAYS - DORMANCY_THRESHOLD_DAYS
            dormancy = 0.5 + 0.5 * min(1.0, (days - DORMANCY_THRESHOLD_DAYS) / span)
            when = f"has not logged in for {days} days"

        exposure = max(priv["score"], sens["score"], 0.05 if ua.objects or ua.sys_perms else 0.0)
        basis = "privileged permissions" if priv["score"] >= sens["score"] else "sensitive data access"
        score = dormancy * exposure
        evidence = [
            {
                "label": "Never logged in" if days is None else f"Last login {days} days ago",
                "kind": "login",
                "detail": last_login.date().isoformat() if last_login else None,
            },
            {
                "label": f"Exposure from {basis}",
                "kind": "exposure",
                "detail": f"{exposure:.2f} of 1.00",
            },
        ]
        description = (
            f"Active account that {when} while retaining access "
            f"(exposure {exposure:.2f} from {basis}). Dormant accounts are prime takeover targets."
        )
        return self._factor(key, score, description, evidence, when, days_since_login=days)

    def _unique_factor(self, ua: _UserAccess, org_stats: Dict) -> Dict:
        key = "unique_access"
        n_active = org_stats["n_active"]
        if n_active < MIN_USERS_FOR_UNIQUE:
            return self._factor(key, 0.0, "Org too small for sole-access analysis.", [])
        holders = org_stats["holders"]
        mad = org_stats["mad_holders"]
        allow_pair = n_active >= MIN_USERS_FOR_PAIR

        items: List[Tuple[float, Dict]] = []

        def consider(kind: str, target: str, count: int, label: str, sources: List[Dict]):
            if count == 1:
                value, who = UNIQUE_VALUES[kind], "Only user"
            elif count == 2 and allow_pair:
                value, who = UNIQUE_VALUES[kind] / 2, "One of two users"
            else:
                return
            items.append((value, {
                "label": f"{who} with {label}",
                "kind": kind,
                "target": target,
                "holders": count,
                "granted_by": sources,
            }))

        for perm, srcs in ua.sys_perms.items():
            name, tier, _ = PRIVILEGED_PERMISSIONS[perm]
            if tier == "critical":
                consider("perm", perm, holders.get(("perm", perm), 0), name, srcs)
        if "ModifyAllData" not in ua.sys_perms:
            for obj, mask in ua.objects.items():
                if mask & _MA:
                    consider("modify_all", obj, holders.get(("modify_all", obj), 0) + mad,
                             f"Modify All on {obj}", ua.sources_for_object(obj, _MA))
                elif mask & _D:
                    consider("delete", obj, holders.get(("delete", obj), 0) + mad,
                             f"Delete on {obj}", ua.sources_for_object(obj, _D))
        items.sort(key=lambda t: -t[0])
        # Sole holdership of several critical perms is usually one fact (the
        # only admin), so items combine as max within a kind, noisy-OR across.
        per_kind: Dict[str, float] = {}
        for value, e in items:
            per_kind[e["kind"]] = max(per_kind.get(e["kind"], 0.0), value)
        score = noisy_or(per_kind.values())
        evidence = [e for _, e in items]
        if not evidence:
            return self._factor(key, 0.0, "No access that is held by only one or two users.", [])
        sole = sum(1 for e in evidence if e["holders"] == 1)
        description = (
            f"Sole holder of {_plural(sole, 'capability')}"
            + (f", one of two holders of {len(evidence) - sole}" if len(evidence) - sole else "")
            + ". Losing or compromising this account has no fallback (key-person risk)."
        )
        top = evidence[0]
        headline = ("is the only user" if top["holders"] == 1 else "is one of two users") + \
            " with " + top["label"].split(" with ", 1)[1]
        return self._factor(key, score, description, evidence, headline)

    # ---- assembly ---------------------------------------------------------

    def compute_factors(self, ctx: _OrgContext, org_stats: Dict, user: UserSnapshot) -> List[Dict]:
        ua = ctx.access(user)
        priv = self._privileged_factor(ua)
        sens = self._sensitive_factor(ctx, ua)
        breadth = self._breadth_factor(ua, org_stats)
        peer = self._peer_factor(ctx, user)
        dormancy = self._dormancy_factor(ctx, org_stats, user, priv, sens, ua)
        unique = self._unique_factor(ua, org_stats)
        return [priv, sens, breadth, peer, dormancy, unique]

    def _build_risk_score(self, ctx: _OrgContext, org_stats: Dict, user: UserSnapshot) -> RiskScore:
        factors = self.compute_factors(ctx, org_stats, user)
        total = round(combine_factors((f["weight"], f["score"]) for f in factors), 1)
        level = determine_risk_level(total)
        return RiskScore(
            organization_id=ctx.org_id,
            entity_type="user",
            entity_id=user.salesforce_id,
            risk_score=total,
            risk_level=level,
            factors=factors,
            reason_text=self._generate_reason_text(factors),
            calculated_at=ctx.now,
        )

    def _generate_reason_text(self, factors: List[Dict]) -> str:
        drivers = sorted(
            (f for f in factors if f["impact"] >= 5 and f.get("headline")),
            key=lambda f: -f["impact"],
        )[:2]
        if not drivers:
            return (
                "No significant risk drivers across privileged permissions, sensitive data, "
                "access breadth, peer deviation, dormancy or sole access."
            )
        text = "; ".join(d["headline"] for d in drivers)
        text = text[0].upper() + text[1:] + "."
        if drivers[0]["factor"] == "privileged_permissions" and drivers[0].get("expected_for_role"):
            text += " This is expected for an administrator profile, but the account remains a high-value target."
        return text
