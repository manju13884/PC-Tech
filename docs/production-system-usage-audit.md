# Production System Usage investigation — 28 September 2026

Read-only [audit run 36423611816](https://github.com/manju13884/PC-Tech/actions/runs/36423611816), completed 12:43 UTC, inspected both the production Pages project configuration and its canonical deployed environment. It emitted only presence flags/types, never secret values. The diagnostic workflow is isolated on `audit/production-system-usage-20260928`; it did not deploy or query application tables.

## Observed results

| Check | Result |
| --- | --- |
| CLOUDFLARE_ACCOUNT_ID configured in Production | NO |
| CLOUDFLARE_API_TOKEN configured in Production | NO |
| Production runtime token can list D1 databases | NO — no runtime token configured; permission capability cannot be tested |
| Production runtime token can retrieve file_size | NO — same prerequisite missing |
| Production runtime token can access GraphQL Analytics | NO — same prerequisite missing |
| Production runtime token can retrieve rowsRead | NO — same prerequisite missing |
| Production runtime token can retrieve rowsWritten | NO — same prerequisite missing |
| Production D1 binding matches the intended database | YES |
| Production D1 limit configuration exists | NO |
| Existing Zoho OAuth/organization/region settings present | YES |

There is no observed Cloudflare permission denial: requests cannot begin until runtime credentials exist. GitHub's deployment credentials are separate and were used only for control-plane inspection. They were not copied into the application.

The monitoring token requires **Account / D1 / Read** and **Account / Account Analytics / Read**, scoped to the intended account. No D1 Write permission is needed. See [D1 REST permissions](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/list/) and [GraphQL token permissions](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/).

## Required Production configuration

Cloudflare dashboard → Workers & Pages → **pc-tech-production** → Settings → Variables and Secrets → **Production**. Add the account ID and a dedicated read-only monitoring token, with the token stored as an encrypted secret. Do not use VITE-prefixed names or copy Dev credentials.

Alternatively, these commands prompt for the values without putting them in command history:

```powershell
npx wrangler pages secret put CLOUDFLARE_ACCOUNT_ID --project-name pc-tech-production --env production
npx wrangler pages secret put CLOUDFLARE_API_TOKEN --project-name pc-tech-production --env production
```

Set the following server-side configuration only if the account is confirmed to use Workers Free. These existing explicit limit variables work with the currently deployed collector:

| Name | Value |
| --- | --- |
| D1_DATABASE_LIMIT_BYTES | 500000000 |
| D1_ACCOUNT_STORAGE_LIMIT_BYTES | 5000000000 |
| D1_DAILY_ROWS_READ_LIMIT | 5000000 |
| D1_DAILY_ROWS_WRITTEN_LIMIT | 100000 |

Use dashboard Text variables or prompt-based Wrangler commands:

```powershell
npx wrangler pages secret put D1_DATABASE_LIMIT_BYTES --project-name pc-tech-production --env production
npx wrangler pages secret put D1_ACCOUNT_STORAGE_LIMIT_BYTES --project-name pc-tech-production --env production
npx wrangler pages secret put D1_DAILY_ROWS_READ_LIMIT --project-name pc-tech-production --env production
npx wrangler pages secret put D1_DAILY_ROWS_WRITTEN_LIMIT --project-name pc-tech-production --env production
```

After deploying the prepared backend changes, `D1_PLAN=free` can supply these defaults instead. Explicit limits override the preset. Paid plans must use their verified applicable limits; monthly included allowances must not be presented as daily hard limits. References: [pricing](https://developers.cloudflare.com/d1/platform/pricing/), [database limits](https://developers.cloudflare.com/d1/platform/limits/).

Optional after deploying the changes: set `D1_DATABASE_ID` to the database UUID already recorded under `[env.production]` in `wrangler.toml`. This enables reuse of REST `file_size` for the current database, with binding metadata fallback. No extra REST call is made.

Redeploy through the existing safeguarded **Deploy PC-Tech Production** workflow after changing runtime configuration. Saving settings does not prove they are present in the active deployment. Recheck deployed configuration, then sign in and Refresh System Usage. Do not bypass authentication for a monitoring probe.

## Sources and remaining verification

- Storage: `GET https://api.cloudflare.com/client/v4/accounts/{account}/d1/database`, paginated, plus `GET .../d1/database/{uuid}` only where listing metadata omits `file_size`. Sum authoritative byte sizes.
- Rows: `POST https://api.cloudflare.com/client/v4/graphql`, `viewer.accounts(accountTag).d1AnalyticsAdaptiveGroups.sum.{rowsRead,rowsWritten}`, UTC midnight through retrieval time, no database dimensions. The `datetimeHour` filter is used in the project's installed Wrangler D1 query; [official D1 documentation](https://developers.cloudflare.com/d1/observability/metrics-analytics/) confirms the dataset and row fields. Live runtime-token schema/permission verification awaits configuration.
- Bound DB fallback: constant `SELECT 1` metadata, no scans of business tables.
- Zoho: existing OAuth `POST https://accounts.zoho.in/oauth/v2/token` and one `GET https://www.zohoapis.in/books/v3/contacts?organization_id=...&per_page=1`. Only quota headers retained; no contacts returned to the browser.

**Can authoritative Zoho usage be retrieved programmatically in Production? Not yet verified.** Real daily-looking quota headers were observed earlier with the local IN integration, but that does not verify Production or constitute a documented Zoho usage API contract. Official [API Usage documentation](https://www.zoho.com/ca/books/help/settings/developer-and-data/api-usage.html) describes the dashboard, not a public usage endpoint. The collector stays unavailable when headers are absent/invalid. Production credentials are present, but the authenticated info-icon reason is still needed to distinguish OAuth, scope, timeout and missing headers. Do not report NO API support merely because a request failed, and do not invent counters.

## Prepared changes and validation

- `functions/lib/systemUsage.ts`: exact missing-credential/permission messages, sanitized Zoho OAuth categories, explicit Free-plan preset, explicit REST current-size mapping with independent binding fallback.
- `.dev.vars.example`: documents optional plan and remote database identity, no values or credentials copied.
- `tests/systemUsage.test.mjs`: covers plan opt-in/overrides, REST reuse/fallback, permission messages and sanitized OAuth errors.
- `docs/system-usage.md` and this report: configuration and verified findings.

No frontend layout changes. No D1 tables or migrations created. No usage counters, snapshots or refresh timestamps persisted. No secrets exposed to the frontend. Existing routes, permissions, authentication and operational integrations are unchanged. The new backend changes are prepared locally; Production remains on `caf604e` until configuration and release verification are completed.
