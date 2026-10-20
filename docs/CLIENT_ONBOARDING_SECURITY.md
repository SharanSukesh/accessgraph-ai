# Connecting a client org to Newton safely

For the client's Salesforce administrator and our engagement lead. Follow
this before the first sync on every engagement.

## 1. What Newton needs, and what it doesn't

Newton reads configuration (profiles, permission sets, sharing, flows,
packages, reports, licenses), the client's Salesforce **users** (name,
email, title, department, manager, last login), 90 days of login history,
and 30 days of Setup Audit Trail. For data-quality scoring it runs
**aggregate** queries only (counts, fill rates, duplicate cluster sizes);
the contents of business records are never returned to Newton.

It also reads how pages and automation are assigned (no new permission):
page layout and record type assignments per profile, Lightning record page
assignments (org default, app default, app + record type + profile), Apex
classes and flows with the profiles and permission sets that grant them,
the Run Flows permission and the Flow User setting, and the labels of the
Account and Opportunity sharing reasons. Profile, flow and app details are
read one record per query, so Newton caps them (150 profiles, 150 flows, 60
apps) and says on screen when it stopped. UNVERIFIED: whether View Setup and
Configuration alone is enough for those per-record metadata reads; if one is
refused, that part is skipped and the screen says what wasn't read.

For the Schema pages it reads field metadata (no new permission): for each
object the org's permissions mention, the object's describe (field types,
lengths, formulas, picklist values, lookups and master-detail
relationships, and whether a field is Shield or Classic encrypted) and its
FieldDefinition rows from the Tooling API. That's two API calls per object
per sync, at most 500 objects. Salesforce's describe returns only the
fields the integration user can see, so for fields hidden from it Newton
shows the type from FieldDefinition and says that encryption, formula
text, picklist values and whether the field is required aren't known.
Granting the integration user Read on those fields would fill the gaps,
but it also lets it read their values, so Newton doesn't ask for it.
UNVERIFIED: that FieldDefinition lists fields hidden by field-level
security; check in a developer org.

For the Org documentation workbook it reads more configuration (no new
permission): validation rules with their formulas (one query per rule, at
most 300 formulas per sync), picklist values per record type (one layout
describe per object with record types), tab visibility per profile and
permission set, Visualforce pages and components, static resources (name,
type and size, never the file), Aura and Lightning web component bundles
(names, never the code), custom permissions, apps and who can see them,
approval processes (name, object, state; not their steps), Apex trigger
details, buttons and links, list views, field sets, and each profile's
login IP ranges and login hours. To record whether an Apex class runs
"with sharing", "without sharing" or "inherited sharing", Newton reads the
class body and keeps only that keyword, never the code (UNVERIFIED, as for
API usage: whether the bodies are readable with the permissions above; if
not, the sharing column is empty).

It also documents in more detail, with no new permission:
- **Flows:** for the active version of each flow (at most 150), it reads the element counts and the objects and fields each flow reads or writes. These come from the flow metadata Newton already reads to see who can run it.
- **Page layouts:** the fields placed on each page layout, one query per layout, at most 300.
- **Approval processes:** each approval process's steps, by name. Not the entry criteria or approvers: those need the Metadata API, which isn't confirmed to work with these permissions.
- **External data sources:** name, label and type, never the endpoint, plus which profiles and permission sets can use each.
- **Record types per permission set:** the record types each permission set makes available, read from the set's metadata, one query per set, at most 200. UNVERIFIED: whether that read works with these permissions. Newton stops at the first failure and the workbook says the column wasn't read.

**Custom metadata records are off by default.** Their values can hold
configuration a client treats as confidential, such as endpoints, the
credential each integration uses, and thresholds. Every sync lists the
org's custom metadata types (API name and label, from the global describe),
never their records. An engagement admin can turn on individual types on
the org's Privacy & Data page; the change is audit-logged with who made it
and when. From the next sync Newton reads only those types' records, with
their custom fields (at most 25 types and 2,000 records per type), and shows
them in the Org documentation workbook. Turning a type off deletes its
stored records from Newton straight away. Reading them needs no new
permission.

Newton changes nothing in Salesforce unless an engagement admin explicitly
turns on **write-back** for that org (see section 6).

## 2. Agree the privacy level

Choose one per client org when connecting (an admin can change it later
on the org's *Privacy & Data* page):

| Level | Salesforce users | Login history | Setup Audit Trail | What's unavailable |
|---|---|---|---|---|
| **Full** | Names, emails, titles stored | 90 days, with city/country and device | Who + description text | Nothing |
| **Masked users** | Pulled, but names, emails and usernames are replaced with a stable alias (e.g. "User 4F2A9C") before anything is stored. The Salesforce user ID is kept so the client can look people up in their own org | Country only | Who (as alias) + section; no description text | Nothing; findings show aliases |
| **Metadata only** | Not pulled | Not pulled | Not pulled | User risk, anomalies, licence fit, equity, restructure, org chart, change risk. Data Quality only if the client also allows *aggregate record statistics* (counts, never values) |

Tightening the level later masks or deletes what Newton already holds for
that org immediately. Loosening it takes effect at the next sync.

## 3. Use a dedicated integration user (recommended)

Do not connect Newton as a named System Administrator. A refresh token
issued to an administrator carries that administrator's full power for as
long as it is valid.

1. **Create the user.** Use the *Salesforce Integration* user license
   with the *Minimum Access - API Only Integrations* profile (available in
   Enterprise, Unlimited and Performance editions; recent orgs include
   several of these licences at no cost). Name it e.g. `newton.integration@<client domain>`.
2. **Assign the *Salesforce API Integration* permission set license.**
3. **Create a permission set "Newton Read Only"** with these system
   permissions and assign it to the user:
   - API Enabled
   - View Setup and Configuration (permission metadata, Setup Audit Trail)
   - View Roles and Role Hierarchy
   - View All Users
   - View All Profiles (if shown in the org)
4. **Optional, decide with the client:**
   - *Read and View All on the objects Data Quality scores* (default:
     Account, Contact, Opportunity, Lead, Case; add any custom objects the
     client wants scored). This is the per-object "View All" permission,
     not the org-wide *View All Data*, which Newton doesn't need. Without
     it, Data Quality and record-access counts cover only records the
     integration user can see, and Newton labels them "Based on records
     the integration user can see". If the client prefers, View All Data
     also works. Newton only runs aggregate queries (counts); for very
     large objects it counts over the first records in Id order and
     labels those figures as estimates. Long and rich text fields can't
     be counted without reading their contents, so Newton lists them as
     not counted.
   - *View Event Log Files* (for the Health Report's "API usage by
     source"): lets Newton read the free API Total Usage event log, which
     Salesforce keeps for one day. Newton counts its rows per day,
     connected app, user and API type and keeps only those counts, never
     the rows or the user names in them. For the API Usage page it also
     counts the resource and object each request names, without query
     strings, record ids or values; an Apex REST request is kept only as
     the `@RestResource` class it reaches. To find those classes Newton
     reads Apex class bodies (the same ApexClass object it already counts)
     and keeps only each class's name and URL mapping, never the code.
     UNVERIFIED: whether the bodies are readable with the permissions
     above; if not, the endpoints are shown without their classes.
     Without the permission, the card says why and
     shows the org's daily total from the limits API and connected apps
     with their last-used dates. Salesforce documents the permission as
     View Event Log Files plus API Enabled. UNVERIFIED: whether it can be
     granted to a user on the Salesforce Integration licence; check in a
     developer org before recommending it.
   - *Login history*: Salesforce restricts LoginHistory to users with
     user-management rights in many orgs. If the integration user can't
     read it, Newton skips login-anomaly detection; everything else works.
     Confirm on the first sync and record the decision.
5. **Restrict the connected app** (Setup > Connected Apps > Manage):
   set *Permitted Users* to "Admin approved users are pre-authorized" and
   pre-authorize only the Newton Read Only permission set. Optionally
   restrict login IP ranges for the integration user to our egress IPs.

## 4. Connect

In Newton: **Client orgs > Connect production org** (or *Connect sandbox*),
then log in to Salesforce **as the integration user**. Newton requests
only the `api` and `refresh_token` scopes.

After connecting, the org list shows who the org is connected as. A
warning appears if it is connected as a user with elevated permissions
(Modify All Data, Manage Users, Customize Application, Author Apex, Manage
Profiles and Permission Sets) or without an integration licence.

## 5. During the engagement

- Only Newton staff granted this client org can open it. Viewers and
  auditors are read-only; only Newton admins can delete data or change
  write-back.
- Every sign-in, sync, export, write-back and deletion is audit-logged.

## 6. Write-back (off by default)

Three optional changes are possible: set a user's Manager, set a user's
Delegated Approver, and deactivate users flagged as unused licence
holders. To allow them:

1. Get the client's written approval (SOW clause or email) naming the
   change type.
2. Temporarily grant the integration user **Manage Users**.
3. In Newton, a Newton admin enables write-back on the org's
   *Privacy & Data* page and records where the approval lives.
4. Afterwards, disable write-back and remove Manage Users.

## 7. Ending the engagement

1. In Newton, an admin deletes the client org (*Privacy & Data > Delete
   all data*). This revokes Newton's OAuth grant in Salesforce and deletes
   everything Newton holds for the org.
2. The client deactivates the integration user and removes the connected
   app authorisation.
3. Send the client the deletion confirmation (date, who, record counts).
