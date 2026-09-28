# System Usage

Configurations → Data Management displays System Usage before the existing Zoho refresh section. The five rows load on entry and on manual Refresh only. React StrictMode's effect replay shares the initial request; there is no polling, scheduled task, persistent cache, or usage history.

## Endpoint and authorization

`GET /api/system-usage` uses the existing session authentication and Data Management menu permission. SUPERADMIN automatically has access. Other users require an existing Data Management permission, matching the current menu-access predicate. Unauthenticated requests receive 401, unauthorized requests 403, other methods 405. Responses are `Cache-Control: no-store`. Upstream credentials, identifiers, response bodies and errors are not returned or logged.

The response contains `environment`, `refreshedAt`, and five entries under `metrics`. Each entry contains `current`, `limit`, `remaining`, `asOf`, and optional safe reasons. Unknown numbers and retrieval timestamps are null, rendered as **Unavailable**, never zero. `refreshedAt` is the last completed monitoring request; `asOf` is each successful metric's retrieval time, not a promise of real-time analytics ingestion. A failed refresh displays unavailable values and keeps the prior completed refresh timestamp.

## Files

- `src/Dashboard.tsx`: inserts the section above existing content.
- `src/features/system-usage/SystemUsage.tsx`: grid and initial/manual refresh behavior.
- `src/features/system-usage/system-usage.css`: scoped compact styling.
- `src/features/system-usage/systemUsageTypes.ts`: sanitized response contract.
- `src/features/system-usage/systemUsageFormatting.ts`: counts, storage and IST timestamps.
- `functions/api/system-usage.ts`: authenticated read-only endpoint.
- `functions/lib/systemUsage.ts`: metadata/analytics collection and safe fallbacks.
- `lib/deploymentTargets.ts` and `scripts/deployment-maintenance.mjs`: share the existing deployment map unchanged.
- `tests/systemUsage.test.mjs`: monitoring regression tests.
- `docs/system-usage.md`: operation, availability and verification notes.

The earlier shared header-gap and Data Management heading edits remain in the working tree; System Usage does not alter them.

## Sources and support

| Metric | Source | Availability |
| --- | --- | --- |
| Zoho Books API – Today | No verified daily-usage API in the existing Books integration | Unavailable. No speculative API requests or counters are added. |
| PC-Tech D1 Database Size | Current runtime `DB` binding, `SELECT 1` result's `meta.size_after` | Actual size in bytes, including local D1 when metadata is returned. Constant query, no business table scan. |
| Total D1 Database Size | Cloudflare REST list databases, then database `file_size` metadata | Available with a verified account/target and complete metadata. Sum includes every database in the configured account. |
| D1 Rows Read – Today | Cloudflare GraphQL `d1AnalyticsAdaptiveGroups.sum.rowsRead` | Account-wide aggregate for the current UTC date, subject to analytics permissions and ingestion delay. |
| D1 Rows Written – Today | Cloudflare GraphQL `d1AnalyticsAdaptiveGroups.sum.rowsWritten` | Same scope and window as reads. |

All limits and remaining values are currently **Unavailable**: the configured sources do not confirm the applicable subscription/entitlements. Free-tier examples and paid included allowances are not treated as confirmed limits. Do not insert guessed plan limits. Zoho's usage page is available in its own web UI, but is not used as an undocumented scraping/API source here.

Total storage never reports a partial sum. The full account inventory must fit in one metadata listing and contain no duplicate/missing database identifiers or missing sizes. Work is bounded to 40 databases, four simultaneous detail requests and a shared ten-second external deadline; larger/incomplete inventories display Unavailable. Empty analytics responses are unavailable rather than assumed zero. An explicit numeric zero is valid. Metadata and analytics tasks run concurrently and fail independently of current-binding size.

## Environments and credentials

The pre-existing release target map has been moved without value changes from `scripts/deployment-maintenance.mjs` to `lib/deploymentTargets.ts`. Both the release script and monitoring use that single map. No new environment selector or database identifier configuration is introduced.

- Loopback/private-network local hosts display LOCAL and never make remote monitoring calls, even if remote credentials are present.
- The configured nonproduction canonical origin displays STAGING; configured production origins display PRODUCTION.
- Unmapped custom/preview hosts display environment Unavailable and do not query a remote account. Add a properly validated deployment target to the shared configuration before supporting a new environment; do not infer production from an unknown hostname.
- Current database size always uses the actual `DB` runtime binding, never a REST request to a selected remote database.
- Before any account inventory or analytics query, monitoring checks the configured Cloudflare account's Pages project, canonical branch and production binding against the existing release target. A mismatch disables account monitoring.
- Account totals can include multiple environments **in the same account**, as requested; the UI identifies this scope. A staging call validates the staging target and does not fall back to the production target or credentials.

For hosted account metrics, configure **server-side Pages runtime** secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for that deployment environment. Existing GitHub Actions secrets are not automatically runtime secrets. Use a token scoped to the intended account with:

- Cloudflare Pages Read (validate project/branch/binding).
- D1 Read (database inventory and size metadata).
- Account Analytics Read (daily read/write aggregates).

No new Zoho scopes or credentials are needed. Local `.dev.vars` currently has no Cloudflare monitoring token/account, and local mode would suppress remote calls regardless. This change does not provision secrets, change account permissions or deploy the application.

## Read-only guarantees

No tables, migrations, schema changes, counters, snapshots, histories or stored timestamps are introduced. System Usage issues existing auth/permission SELECTs and one constant D1 SELECT, with no D1 writes. The existing maintenance middleware also performs its existing read. All external operations read metadata/analytics; GraphQL uses HTTP POST for a query, never a mutation. Existing Data Management refresh operations are unchanged and remain separate from monitoring.

## References

- [D1 return metadata](https://developers.cloudflare.com/d1/worker-api/return-object/) — `size_after`.
- [D1 REST list](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/list/) and [database metadata](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/) — inventory and `file_size`.
- [D1 analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) — aggregates and UTC daily windows.
- [Analytics token permissions](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/).
- [Zoho Books usage UI](https://www.zoho.com/ca/books/help/settings/developer-and-data/api-usage.html) and [API introduction](https://www.zoho.com/books/api/v3/introduction/).

## Checks

- `node --test tests/systemUsage.test.mjs`: authorization, read-only queries, environments, credential containment, complete account sums, partial source failures, unavailable vs zero, formatting.
- `node --experimental-strip-types --test tests/deploymentMaintenance.test.ts`: shared deployment-target extraction preserves release behavior.
- `npm run build`: frontend type checking and production bundle.
- Backend type check with the existing Cloudflare Workers types.
- Local browser check with mocked source responses: five rows and placement, original refresh controls, desktop/mobile widths, StrictMode single fetch, manual refresh, timestamp updates, failed refresh and recovery, duplicate-click protection, no automatic refresh.
- Local Miniflare runtime binding check returned `size_after: 1024000`, `rows_read: 0`, `rows_written: 0`, `changed_db: false`. Wrangler's CLI strips this metadata, so the runtime binding was checked directly. The running local endpoint also returned 401 without a session.
- Remote Cloudflare/Zoho metrics cannot be live-verified without runtime monitoring credentials and a documented Zoho usage endpoint respectively.
