# System Usage: diagnosis, sources and configuration

The existing Data Management grid, section order and Refresh styling/alignment are preserved. Unavailable cells now offer a small hover/click explanation.

## Confirmed diagnosis

The earlier implementation never inspected Zoho's response headers, suppressed all account monitoring in LOCAL, required unnecessary Pages permission before D1 queries, limited account inventory to one page/40 databases, and collapsed external errors into generic unavailable responses.

Local inspection on 28-Sep-2026 confirmed that both `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are missing from `.dev.vars` and the shell environment. Thus no live Cloudflare permission/query failure has been observed yet: missing configuration prevents requests. They are now supported in LOCAL as well as hosted environments, using only explicitly supplied runtime credentials.

The configured Zoho IN account returned HTTP 200 with `x-rate-limit-limit`, `x-rate-limit-remaining`, and `x-rate-limit-reset` headers. A subsequent live collector verification at 07:53 UTC reported **85 used / 5,000 limit / 4,915 remaining**. These are verification observations, not application constants. The earlier unsupported-source assumption was incorrect.

Current local D1 size still returned **1,024,000 bytes (1.02 MB)** from runtime metadata. The constant query reported zero rows read, zero rows written and no database change. No D1 limits are currently configured; none are guessed.

## Sources and minimum permissions

| Metric | Authoritative source | Access |
| --- | --- | --- |
| Zoho Books API - Today | One `GET /books/v3/contacts?organization_id=...&per_page=1`; quota response headers | Existing OAuth credentials, organization context, `ZohoBooks.contacts.READ` |
| Current D1 database size | Current runtime `DB.prepare('SELECT 1').all().meta.size_after` | Existing DB binding |
| Total D1 storage | Paginated `GET /client/v4/accounts/{account}/d1/database`; `file_size` from listing or `GET .../d1/database/{uuid}` | Account > D1 > Read |
| D1 rows read today | `POST /client/v4/graphql`, `d1AnalyticsAdaptiveGroups.sum.rowsRead` | Account > Account Analytics > Read |
| D1 rows written today | Same GraphQL query, `sum.rowsWritten` | Account > Account Analytics > Read |

The monitoring token needs **D1 Read** and **Account Analytics Read**, restricted to the intended account. Monitoring does **not** need Pages Read or write permissions. Uploading secrets/deploying is a separate administrator operation using the existing deployment login.

Zoho monitoring reuses `getAccessToken` and the existing region selection. Contact bodies are discarded and never returned. Optional OAuth diagnostic suppression applies only to monitoring; existing callers retain their behavior. The monitoring request itself consumes one Books API request; token refresh occurs only when the existing OAuth cache requires it.

Usage is calculated directly from provider headers as `limit - remaining`. Integer/range checks require remaining <= limit and a reset within 24 hours. Books documents a separate 100-per-minute throttle; headers at or below that limit are not labelled as daily usage. The live IN headers were verified, although their complete semantics are not specified in the Books introduction documentation. Missing or unrecognized headers fail closed rather than producing a guessed value. No plan is inferred from the observed limit.

D1 analytics use `Time` variables with `datetimeHour_geq` at UTC midnight and `datetimeHour_leq` at retrieval start, matching the D1 filter mechanism in Cloudflare's Wrangler implementation. No dimensions/database filter are selected, yielding an account-wide aggregate. The current hour contains data ingested so far; analytics may lag. An explicit numeric zero is valid; missing analytics is not assumed zero.

Storage inventory is paginated and UUID-deduplicated. Listing sizes are reused; only missing sizes trigger detail requests, with at most four concurrent requests. Incomplete/changing inventories or missing sizes never produce a partial total. There is no 40-database cap. Cloudflare requests share a ten-second deadline.

## Environment and server-side settings

The badge uses the existing shared deployment map. Current database size uses the actual runtime binding, including LOCAL, unless `D1_DATABASE_ID` explicitly identifies the current remote database: then the collector reuses that database's REST `file_size` from the account inventory. Binding metadata remains the fallback on API failure. Omit `D1_DATABASE_ID` locally. Account metrics independently use that runtime's explicit credentials. Hostnames never select account credentials or substitute production values. Unmapped hosts keep an Unavailable badge, but can read their explicitly configured account metrics.

Required Cloudflare keys:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Optional verified limits, non-negative whole numbers only:
- `D1_DATABASE_LIMIT_BYTES` - current bound database hard limit.
- `D1_ACCOUNT_STORAGE_LIMIT_BYTES` - account-wide storage hard limit.
- `D1_DAILY_ROWS_READ_LIMIT` - daily row-read hard limit.
- `D1_DAILY_ROWS_WRITTEN_LIMIT` - daily row-write hard limit.

Leave unknown/nonfinite limits blank. A paid plan's included monthly allowance is not a daily hard limit. No defaults are assumed unless `D1_PLAN=free` is explicitly set server-side after confirming Workers Free. That preset supplies 500 MB per database, 5 GB account storage, 5,000,000 rows read/day and 100,000 rows written/day. Explicit limit variables override the preset. Remaining requires usage and limit and is clamped at zero. These settings are never stored in D1.

Zoho uses the existing `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORG_ID`, and `ZOHO_REGION=in`; no new Zoho credential or scope is needed. No `VITE_` credentials are permitted. GitHub Actions secrets do not automatically become Pages runtime secrets.

### Local commands

Wrangler reads local secrets from ignored `.dev.vars`; `wrangler secret put` does not set local secrets. Consult `.dev.vars.example` and edit the existing file without overwriting Zoho settings:

```powershell
notepad .dev.vars
npm run dev
```

Add the required keys/verified limits and restart the local backend. Never commit `.dev.vars` or copy production secrets into it automatically.

### Hosted Dev / STAGING

The existing project is `pc-tech`, branch `main`. Its canonical deployment uses the Pages **production** secret slot; this is still PC-Tech Dev, not the separate production application. Commands prompt for values:

```powershell
npx wrangler pages secret put CLOUDFLARE_ACCOUNT_ID --project-name pc-tech --env production
npx wrangler pages secret put CLOUDFLARE_API_TOKEN --project-name pc-tech --env production
```

For each verified finite limit, as applicable:

```powershell
npx wrangler pages secret put D1_DATABASE_LIMIT_BYTES --project-name pc-tech --env production
npx wrangler pages secret put D1_ACCOUNT_STORAGE_LIMIT_BYTES --project-name pc-tech --env production
npx wrangler pages secret put D1_DAILY_ROWS_READ_LIMIT --project-name pc-tech --env production
npx wrangler pages secret put D1_DAILY_ROWS_WRITTEN_LIMIT --project-name pc-tech --env production
```

Preview deployments use the same project with `--env preview`. The current release map has no separate staging project. Pages secret commands do not accept `--env staging` or `--env nonproduction`.

### Production

Only when configuring the separate production application:

```powershell
npx wrangler pages secret put CLOUDFLARE_ACCOUNT_ID --project-name pc-tech-production --env production
npx wrangler pages secret put CLOUDFLARE_API_TOKEN --project-name pc-tech-production --env production
```

For optional verified limits, use the corresponding commands above with `--project-name pc-tech-production --env production`. Redeploy through the appropriate gated workflow after changing runtime secrets. This implementation does not provision credentials or invent limits.

## API and safe diagnostics

`GET /api/system-usage` retains existing session/Data Management permissions, automatic SUPERADMIN access, no-store responses, and rejection of other methods. Each metric returns `available`, `current`, `limit`, `remaining`, `asOf`, and optional `code`, `reason`, `limitReason`. Storage values are bytes. The existing response keys are preserved.

Categories distinguish configuration, authentication (401), permission (403), rate_limit (429), timeout, network, invalid_response, invalid_metadata, incomplete, no_data, unsupported, graphql_query and graphql_error. A GraphQL leaf error does not hide a successful sibling field. UI explanations are fixed sanitized messages.

Logs contain only metric key, fixed category and optional numeric HTTP status. External bodies, messages, URLs, account IDs and credentials are not logged or returned. Provider tasks run concurrently. The client allows 35 seconds for the existing OAuth helper plus the Books request; Cloudflare has its own shorter deadline.

One initial request (deduplicated during React StrictMode effect replay) plus manual Refresh; no polling or persistent snapshots. Failed refreshes retain the previous completed refresh timestamp and show unavailable values.

## Files changed for this correction

- `functions/lib/systemUsage.ts`: collectors, configuration, pagination, limits and safe diagnostics.
- `lib/zoho.ts`: quota-header reader using existing OAuth and optional diagnostic suppression.
- `src/features/system-usage/systemUsageTypes.ts`: availability/category fields.
- `src/features/system-usage/SystemUsage.tsx`: accessible explanations and request timeout.
- `src/features/system-usage/system-usage.css`: explanation affordance only; grid design unchanged.
- `.dev.vars.example`: key reference without credentials.
- `tests/systemUsage.test.mjs`: provider, security, permission and limit regressions.
- `docs/system-usage.md`: diagnosis and setup instructions.

## Read-only guarantees and verification

No D1 tables, migrations, schema changes, counters, stored usage statistics, scheduled snapshots or persistent timestamps. No business-table writes. Existing refresh actions remain separate and unchanged. Cloudflare POST requests are GraphQL queries, not mutations.

Checks: focused monitoring tests, existing deployment-maintenance/customer-cache regressions, frontend production build/type checking, backend type checking, browser refresh/diagnostic/responsive checks, live Zoho headers, and actual local D1 metadata. Live Cloudflare account metrics still require missing runtime credentials; provider-fixture tests are not live-account verification.

## References

- [Zoho Books API limits](https://www.zoho.com/books/api/v3/introduction/) and [Books usage UI](https://www.zoho.com/ca/books/help/settings/developer-and-data/api-usage.html).
- [D1 metadata](https://developers.cloudflare.com/d1/worker-api/return-object/), [database listing](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/list/) and [database details](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/).
- [D1 analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/) and [Wrangler D1 source](https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/src/d1).
- [Analytics token permissions](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/) and [Pages secret commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/).
