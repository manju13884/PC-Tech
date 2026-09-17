# Deployment maintenance gate

| Environment | Git branch | Pages project | Checked hostnames |
| --- | --- | --- | --- |
| DEV | `main` | `pc-tech` | `pc-tech.pages.dev` |
| PROD | `production` | `pc-tech-production` | `pc-tech-production.pages.dev`, `polarcanvas.in`, `www.polarcanvas.in` |

Push to the appropriate branch to use its existing GitHub deployment workflow.
Do not use an unguarded Pages upload or dashboard rollback for routine releases.
The two workflows have separate concurrency groups and never cancel a running
release to make room for another one.

## How a release works

1. Validate the explicit Pages project, branch and D1 binding against the target
   allowlist in `scripts/deployment-maintenance.mjs`. Set Pages runtime to fail
   closed so quota exhaustion cannot bypass the middleware.
2. Enable that environment's maintenance record with a release owner, Git SHA
   and one-time health token. Only its SHA-256 hash is stored in D1.
3. Publish an independent, self-contained maintenance Worker to the same Pages
   project. This handles the first rollout, before the old application has
   maintenance middleware, as well as subsequent build failures.
4. Confirm HTTP 503 on every configured hostname and direct routes. Wait 30
   seconds for previously admitted requests, then install/build, create a release
   manifest, back up D1 and run the existing migration steps.
5. Upload the real application. Its Pages middleware still serves maintenance.
6. With a private, read-only probe token, verify release SHA, HTML entrypoints,
   **all** built JS/CSS hashes, `/api/auth/me`'s expected logged-out response, and
   a read-only D1/auth-schema query. Check all target hostnames.
7. Clear maintenance only if checks pass and this release still owns the lock.
   Recheck the public site; re-enable maintenance if public verification fails.

There is no automatic expiry or `always()` cleanup that opens a failed release.
The failure step reports that maintenance stays enabled. If enablement itself
fails, the build/migration/deployment steps do not run.

## Storage, sessions and runtime

No new service, business-table migration, auth changes or test business data is
required. The control script creates **one separate operational table**,
`deployment_maintenance`, in each environment's existing D1 database. Its state
is excluded from business logic and independent between DEV and PROD. Existing
GitHub environment secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are
used; the API token needs Pages Edit and D1 Edit for the corresponding resources.

The Pages middleware reads the primary D1 database before **every** page, asset
and API request. `_routes.json` must continue to include `/*` with no exclusions.
Missing control state or a failed state read returns maintenance, not the app.
Responses use `no-store` to prevent a cached page or asset bypassing the gate.
This adds a Function invocation and D1 read per request, including static assets.
Do not add cache rules that override these responses. Cloudflare-wide outages or
exhausted runtime quotas may produce Cloudflare's error page instead of the
custom page; fail-closed mode prevents exposing the underlying application.

All user API operations are blocked with 503 JSON during maintenance. Health
bypass is restricted to GET `/`, `/deployment.json`, built `/assets/*.js|css`,
`/api/auth/me` and `/api/deployment-health`; it never bypasses write APIs or user
authentication. Tokens are masked in Actions, never put in URLs, and invalidated
on reopen. Session cookies are neither changed nor expired by maintenance.
Existing tabs check every 30 seconds while visible and reload on a maintenance
API response. Already downloaded pages cannot be recalled; the server gate
blocks their subsequent requests. The 30-second drain is not cancellation of
long-running requests already admitted before activation; verify unusual
long-running operations have finished before applying incompatible migrations.

## Manual controls (PowerShell, Node 22.13+)

Use an authorized terminal with the same Cloudflare account/API-token environment
variables as CI. Do not paste tokens into Git or logs. Choose the target explicitly:

```powershell
# DEV only
$target = 'nonproduction'
# For PROD use this instead:
# $target = 'production'
node --experimental-strip-types scripts/deployment-maintenance.mjs status $target
```

To enable on an installed application, set a unique owner, the exact release SHA,
and a cryptographically random token, then run `on` and `confirm`:

```powershell
$env:MAINTENANCE_OWNER = 'manual-' + [guid]::NewGuid().ToString()
$env:DEPLOYMENT_SHA = (git rev-parse HEAD).Trim()
$env:MAINTENANCE_TOKEN = (node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))").Trim()
node --experimental-strip-types scripts/deployment-maintenance.mjs on $target
node --experimental-strip-types scripts/deployment-maintenance.mjs confirm $target
```

The first installation uses the workflow's maintenance-shell upload before
`confirm`; `on` alone cannot install middleware into an old deployment.

After a healthy upload, these commands separately check and reopen:

```powershell
node --experimental-strip-types scripts/deployment-maintenance.mjs health $target
node --experimental-strip-types scripts/deployment-maintenance.mjs off $target
node --experimental-strip-types scripts/deployment-maintenance.mjs normal $target
```

`off` repeats all health checks. It is safe to stop after `health`: maintenance
remains enabled. A failed/cancelled run holds its lock; a new run fails rather
than silently taking ownership and reopening it.

## Recovery after a successful deployment that stayed closed

Ensure the failed workflow has stopped. Run `status` for the correct target and
copy its owner and expected commit. Recover ownership without opening the site:

```powershell
$env:MAINTENANCE_PREVIOUS_OWNER = '<owner from status>'
$env:MAINTENANCE_OWNER = 'recovery-' + [guid]::NewGuid().ToString()
$env:DEPLOYMENT_SHA = '<full deployed commit from status>'
$env:MAINTENANCE_TOKEN = (node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))").Trim()
node --experimental-strip-types scripts/deployment-maintenance.mjs recover $target
node --experimental-strip-types scripts/deployment-maintenance.mjs off $target
node --experimental-strip-types scripts/deployment-maintenance.mjs normal $target
```

If health fails, keep maintenance on and repair the failed step. If the maintenance
shell is still deployed, first build/upload the actual application and complete
the target's backup/migration steps from its workflow. Use `stamp $target` after
`npm run build`, before uploading `dist`; the SHA must match the code being built.
Use only `pc-tech`/`main` for DEV and `pc-tech-production`/`production` for PROD.
Then retry `off`. The shell deliberately does not respond to the off flag, so an
empty/failed application cannot accidentally reopen. Do not roll back to a build
without this middleware while the flag is active.

## Emergency manual disable

Prefer checked recovery above. Only after independently verifying the deployed
application and migrations, an operator can override the health gate:

```powershell
# Use the CURRENT owner shown by status (or your recovery owner).
$env:MAINTENANCE_OWNER = '<current owner>'
$env:MAINTENANCE_CONFIRM = 'pc-tech' # PROD: 'pc-tech-production'
node --experimental-strip-types scripts/deployment-maintenance.mjs emergency-off $target
```

This is an explicit emergency override, not part of CI. It cannot remove an
independently deployed maintenance shell: restore the actual application first.
Review the Actions audit trail and verify all public hostnames immediately.

## Verification and rollout

Run `node --experimental-strip-types --test tests/deploymentMaintenance.test.ts`,
`npm run build`, and `npx wrangler pages functions build` before promotion.
Tests cover direct URLs, sessions, blocked writes, token scope, primary reads,
failure isolation, release/asset/auth/database checks, and workflow ordering.
Deploy to DEV first and exercise a failed build/recovery before production.
During each rollout, verify the maintenance screen, Retry, API 503s, and the
other environment remaining available. Production checks include both custom
domains. Live maintenance drills are not part of the local test suite.

References: [Pages middleware](https://developers.cloudflare.com/pages/functions/middleware/),
[Pages routing and fail-closed mode](https://developers.cloudflare.com/pages/functions/routing/),
[D1 primary sessions](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Local development and existing backend

Local D1 remains isolated: `npm run db:migrate:dev` audits and applies additive,
checksum-locked migrations locally. Never use `--remote` for local validation.
For a local Pages preview, create the operational table with the schema in the
control script and an inactive row (`id=1, active=0`, remaining text fields empty).
An uninitialized local Pages preview deliberately shows maintenance. The Vite
frontend development server itself does not execute Pages middleware.

Remote database mappings are distinct:

- Non-production: `pc-tech-db`, `0d749a66-9654-4767-b56a-afd4f8bcd9a1`.
- Production: `pc-tech-production-db`, `e863e5c3-b60f-48a5-8fdd-862f1ac52eaf`.

Use `npm run db:migrations:list:nonproduction` or
`npm run db:migrations:list:production` to inspect pending remote migrations.
Run their corresponding `db:migrate:*` commands only as part of the authorized
target release with maintenance enabled and a verified database backup. Existing
migration files/checksums must not be edited.

The separate local Zoho backend setup is unchanged: create `.env` from
`.env.example`, install dependencies, and run `node server/start-zoho-api.js`
(port 4001 by default). If using a separate API subdomain, retain its DNS record
and configure its CORS origin to the deployed frontend, such as
`https://www.polarcanvas.in`. This Pages gate protects Pages-hosted traffic;
direct traffic to any independently hosted backend needs its own gate.
