# One-time Production → Local copy

This utility is **manual only**. It is not connected to dev startup, builds,
deployment, application routes, or automatic migrations. Production is never an
import target. No Production maintenance, migration, seed, or SQL execute command
is used. Preserve the current uncommitted application changes separately.

Requirements: Python 3.12+, Node, installed project dependencies, and the current
`wrangler.toml`. The script verifies these exact existing bindings:

| Purpose | Database | ID |
| --- | --- | --- |
| Export source only | `pc-tech-production-db` | `e863e5c3-b60f-48a5-8fdd-862f1ac52eaf` |
| Local target only | `pc-tech-db` | `0d749a66-9654-4767-b56a-afd4f8bcd9a1` |

All snapshots, previous-local backups, stage databases, and reports stay under
git-ignored `.local-logs/production-to-local/`. Restrict this directory to your
Windows account. The complete backup contains sensitive data and authentication
hashes; do not commit, print, email, or place it in a shared directory. Credentials
are never embedded in the utility or logs. `.dev.vars` is not overwritten.

## Export Production, read only

The utility supports a local Cloudflare token in the process environment; do not
put it in a command line. Prefer a token scoped to D1 read access. Run:

```powershell
python -u scripts/copy-production-to-local.py --environment LOCAL --confirm-production-to-local --export-only
```

It constructs only this remote Wrangler operation, with a timestamped output:

```powershell
npx wrangler d1 export pc-tech-production-db --remote --env production --config wrangler.toml --output .local-logs/production-to-local/pc-tech-production-backup-YYYYMMDD-HHMMSS.sql
```

The utility generates a `.manifest.json` beside the SQL with the source database
ID, UTC export time, byte size, and SHA-256. A supplied snapshot must match this
manifest exactly. Do not create a manifest for an unverified dump.

If the workstation has no Cloudflare token, use an isolated GitHub Actions branch
whose **manually dispatched** workflow only exports this database and uploads the
SQL plus manifest as a short-lived private artifact. The one-time run used
`chore/production-snapshot-local-20260923`, overriding the existing dispatchable
`audit-production-data.yml` only on that branch. Neither `main` nor `production`
is changed or deployed. Download and checksum-verify both artifact files into the
private directory; no Cloudflare/GitHub secrets are copied locally. Never trigger
a deployment merely to obtain a backup.

## Initialize and validate staging

Use the actual timestamped snapshot filename:

```powershell
python -u scripts/copy-production-to-local.py --environment LOCAL --confirm-production-to-local --snapshot .local-logs/production-to-local/pc-tech-production-backup-YYYYMMDD-HHMMSS.sql --stage-only
```

The script backs up the existing local SQLite database using SQLite's online
backup API, then initializes a separate local schema using the project's existing
immutable migrations. The exact staging migration command is:

```powershell
node node_modules/wrangler/bin/wrangler.js d1 migrations apply pc-tech-db --local --config wrangler.toml --persist-to .local-logs/production-to-local/run-YYYYMMDD-HHMMSS/stage
```

It aborts on missing/incompatible tables or columns, unknown sensitive columns,
unknown migrations, broken foreign keys, or mismatched row values. An additive
new local table such as FG dispatch history may be empty. The target retains the
current local migration ledger rather than copying the older Production ledger.

Import happens only inside staging, with inventory triggers temporarily removed
and restored in one local transaction. This prevents replaying historical ledger
movements against imported material balances. Primary keys, reference IDs, and
AUTOINCREMENT high-water marks are preserved. Counts and hashes of **all business
column values** are compared, not only sample rows.

## Activate the validated copy

Stop the local backend (`npm run dev`, Ctrl+C) first. The utility refuses activation
while port 8788 responds. The frontend may remain running.

```powershell
python -u scripts/copy-production-to-local.py --environment LOCAL --confirm-production-to-local --snapshot .local-logs/production-to-local/pc-tech-production-backup-YYYYMMDD-HHMMSS.sql
npm run dev
```

This repeats staging validation, then replaces only the resolved local D1 SQLite
file under `.wrangler/state/v3/d1/`. The known Wrangler local binding must produce
the same filename in staging. There is no configurable remote/import target.
The earlier local database remains in `run-*/local-before.sqlite`. Failed
post-install validation automatically restores that backup.

## Authentication and external integrations

- Production `sessions` and `password_setup_tokens` are not imported.
- Production passwords are replaced with unusable random hashes. User IDs,
  roles, permissions, and business references remain intact.
- Matching active local SuperAdmin credentials are preserved from the previous
  local database. If accounts do not match, the script stops instead of silently
  assigning roles or inventing credentials. Use the same existing local login.
- Production maintenance tokens are excluded. Only a local inactive gate is
  initialized, using the existing runtime table definition.
- Local environment file hashes are checked before/after. Production secrets
  are never imported. Zoho Books requests remain GET-only; its OAuth token
  refresh POST is the sole Zoho POST. The utility checks current integration
  entry points and refuses unknown writers or configured local outbound email.
- Production passwords for ordinary users will not log in locally. Use local
  SuperAdmin account management if additional local test logins are needed.

## Read-only validation after import

Before generating new local test data:

```powershell
python -u scripts/copy-production-to-local.py --environment LOCAL --confirm-production-to-local --snapshot .local-logs/production-to-local/pc-tech-production-backup-YYYYMMDD-HHMMSS.sql --validate-local
python tests/productionToLocal.test.py
```

`run-*/report.json` includes all table counts, full-value comparisons, FK checks,
Job → Plan → SO/customer/item reference checks, process/reel checks, FG derived
counts, auth exclusions, local logins retained, and backup paths. This reports the
export point-in-time, not an ongoing sync with later Production changes. External
Zoho IDs and cached references are preserved; no external write is used to verify
them. A later intentional local test mutation will correctly fail snapshot equality.

## Restore previous local state if needed

Stop all local backends. Use the report from the successful import run:

```powershell
python -u scripts/copy-production-to-local.py --environment LOCAL --confirm-production-to-local --restore-from-report .local-logs/production-to-local/run-YYYYMMDD-HHMMSS/report.json
npm run dev
```

The restore mode checks the recorded backup checksum and integrity, resolves the
fixed local target, saves the current local state separately, checkpoints and
closes SQLite, then replaces only that file and its local WAL/SHM sidecars. It
does not contact Production. Alternatively rerun the guarded snapshot import to recreate
the validated local copy. Keep the SQL backup and previous-local SQLite backup
until testing is finished. No recovery step touches Production.
