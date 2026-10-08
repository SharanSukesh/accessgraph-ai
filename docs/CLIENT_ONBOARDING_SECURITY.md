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

Newton changes nothing in Salesforce unless an engagement admin explicitly
turns on **write-back** for that org (see section 5).

## 2. Use a dedicated integration user (recommended)

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
   - *View All Data*: needed for Data Quality and record counts to cover
     every record. Without it, those numbers reflect only records the
     integration user can see. Newton still only runs aggregate queries.
   - *Login history*: Salesforce restricts LoginHistory to users with
     user-management rights in many orgs. If the integration user can't
     read it, Newton skips login-anomaly detection; everything else works.
     Confirm on the first sync and record the decision.
5. **Restrict the connected app** (Setup > Connected Apps > Manage):
   set *Permitted Users* to "Admin approved users are pre-authorized" and
   pre-authorize only the Newton Read Only permission set. Optionally
   restrict login IP ranges for the integration user to our egress IPs.

## 3. Connect

In Newton: **Client orgs > Connect production org** (or *Connect sandbox*),
then log in to Salesforce **as the integration user**. Newton requests
only the `api` and `refresh_token` scopes.

After connecting, the org list shows who the org is connected as. A
warning appears if it is connected as a user with elevated permissions
(Modify All Data, Manage Users, Customize Application, Author Apex, Manage
Profiles and Permission Sets) or without an integration licence.

## 4. During the engagement

- Only Newton staff granted this client org can open it. Viewers and
  auditors are read-only; only Newton admins can delete data or change
  write-back.
- Every sign-in, sync, export, write-back and deletion is audit-logged.

## 5. Write-back (off by default)

Three optional changes are possible: set a user's Manager, set a user's
Delegated Approver, and deactivate users flagged as unused licence
holders. To allow them:

1. Get the client's written approval (SOW clause or email) naming the
   change type.
2. Temporarily grant the integration user **Manage Users**.
3. In Newton, a Newton admin enables write-back on the org's
   *Privacy & Data* page and records where the approval lives.
4. Afterwards, disable write-back and remove Manage Users.

## 6. Ending the engagement

1. In Newton, an admin deletes the client org (*Privacy & Data > Delete
   all data*). This revokes Newton's OAuth grant in Salesforce and deletes
   everything Newton holds for the org.
2. The client deactivates the integration user and removes the connected
   app authorisation.
3. Send the client the deletion confirmation (date, who, record counts).
