# Sales / Lead Management

Lead management provides a paginated pipeline, status filters and totals, follow-ups, history, CSV export and verified Zoho customer conversion.

## Access

SUPERADMIN has automatic access. Grant normal Lead Management menu permissions through the role matrix. ADMIN and SALES use role view/create/edit permissions; ADMIN retains access across coordinators. SALES normally sees assigned leads.

Access Management > Special Permissions lets SUPERADMIN select an active user and grant/revoke:

- Reassign leads (`lead-management:reassign`): for SALES users with Lead Management view/edit access. Applies to accessible leads. ADMIN and SUPERADMIN retain inherited access.
- All leads / companies (`lead-management:view-all`): requires Lead Management menu access. Grants visibility and all applicable lead actions across coordinators, including unassigned leads. Supports other active roles too. New Lead creation retains its normal role permission. Revocation restores normal scope and action permissions on the next request.
- Delete Material Stock Rows (`material-stock:delete`): explicit user permission, requiring Stock Report or Material Stock view access. Existing unused-row and dependency checks still apply. Only SUPERADMIN inherits this permission. Migration 0065 carries existing role deletion access forward as individual grants; new users do not inherit it.

Permission changes record the granting user and timestamp. API operations read the primary database and enforce permissions, ownership/scope, optimistic versions and mutation tokens. User responses are not cached.

## Lead workflow

Company/lead name and city are required. Contact person, address and coordinator are optional for administrator-created leads. A mobile number or email is required. Mobile numbers accept comma-separated values and display one number per line; duplicate checks match individual formatted numbers.

Statuses: New, Contacted, Qualified, Quotation, On Hold, Not Qualified, Converted and Closed. On Hold, Not Qualified and Closed require a reason, up to 2,000 characters. Reasons appear in details, history and exports. On Hold and Not Qualified retain the existing follow-up schedule. Closing or conversion clears it. Later explicitly scheduled activity can make terminal leads eligible for due/overdue counts again.

Qualified/Quotation leads can link to a verified active Zoho Books customer after confirmation. Conversion reads Zoho customer data; it does not create remote customers or Sales Orders. Converted leads cannot be reopened through status updates.

Potential duplicates by company, email or mobile require explicit confirmation, without revealing another user's lead. Atomic guards also reject simultaneous unconfirmed duplicates. Exports follow the same visibility/filter scope, are limited to 5,000 leads and escape spreadsheet formulas.

Dates display as `21 Oct 2026`, with timestamps in IST. The responsive table groups related fields and avoids horizontal scrolling. Actions use the Finished Goods Stock button style.

New history entries show field-level before/after values, coordinator names, status reasons and follow-up notes. Details are attached to the matching update entry in the same transaction. Unchanged fields and internal version/token bookkeeping are omitted. Older version-only entries are identified explicitly because their original field values were not recorded.

## Loading

List data uses one D1 batch after authentication/authorization. Forms request only the lead record; full views load activity and history. Only typed searches are debounced. Initial loads, status changes, paging and refresh start immediately; obsolete requests are cancelled.

## Migrations

Deploy migrations 0062 through 0067 using the existing gated workflow in DEPLOYMENT.md. Do not modify locked migrations.

- 0062 creates lead tables, indexes and history triggers.
- 0063 permits optional contacts/coordinators and adds address, preserving original tables as archives.
- 0064 adds individual special permission grants.
- 0065 extends the grant catalog and converts existing Material Stock deletion access to user grants, retaining the original grant table as an archive.
- 0066 adds On Hold / Not Qualified and status reasons, preserving lead addresses, activities and history in updated tables while retaining originals as archives.
- 0067 adds structured history details.

## Release validation

- 27 lead/special-permission integration tests pass, using isolated SQLite, real session validation, transactions and mocked Zoho calls.
- 9 maintenance/deployment tests pass.
- TypeScript, Vite build, Pages Functions compilation and migration checksum audit pass.
- All 68 migrations apply in sequence to an isolated database with no foreign-key violations.
- Browser fixtures cover lead actions, reason requirements, history changes, user grants/revocation and desktop/mobile overflow.
- The current full suite reports 323 tests: all pass. The seven original baseline failures have been fixed; see regression-test-fixes.md. Local logs are under .local-logs/baseline-fix-*.

Release only to DEV/main when authorized. Use the maintenance gate, backup and health verification in DEPLOYMENT.md. Production deployment requires separate authorization.
