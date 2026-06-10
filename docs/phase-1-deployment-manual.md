# Phase 1 Deployment Manual

Last updated: 2026-06-08

This document describes how to run and verify the Phase 1 modular-monolith implementation in this worktree.

## 1. Deployment Shape

Phase 1 is deployed as a modular monolith:

- Web app: `apps/web`, React + Vite.
- Local API: `services/api`, Express-style local API entry.
- Domain rules: `packages/domain`.
- Database schema and migrations: `packages/database`, Prisma + SQLite target for Phase 1.

The same codebase is intended to support LAN, private cloud/VPN, and public HTTPS deployments by changing configuration rather than business logic.

## 2. Prerequisites

- Node.js compatible with the installed lockfile.
- npm workspace support.
- Prisma CLI dependencies installed from the repository lockfile.
- SQLite-compatible `DATABASE_URL` for Phase 1 validation.

Install dependencies from the repository root:

```powershell
npm install
```

## 3. Environment

Create a local environment file from `.env.example` or export the variable in the shell:

```powershell
$env:DATABASE_URL='file:./dev.db'
$env:AIS_PLATFORM_STORE='memory'
$env:AIS_DEPLOYMENT_MODE='local'
$env:AIS_JWT_SECRET='replace-with-a-managed-secret'
$env:AIS_JWT_PREVIOUS_SECRETS=''
$env:AIS_JWT_ROTATION_APPROVED_BY=''
$env:AIS_JWT_ROTATION_EXPIRES_AT=''
$env:AIS_JWT_ROTATION_MONITOR_REF=''
$env:AIS_JWT_ROTATION_ROLLBACK_REF=''
$env:AIS_ATTACHMENT_STORAGE_PROVIDER='local'
$env:AIS_ATTACHMENT_STORAGE_ROOT='.\\data\\attachments'
$env:AIS_ATTACHMENT_EXTERNAL_ENDPOINT=''
$env:AIS_ATTACHMENT_EXTERNAL_BUCKET=''
$env:AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF=''
$env:AIS_ATTACHMENT_EXTERNAL_TOKEN=''
$env:AIS_ATTACHMENT_EXTERNAL_API_KEY=''
$env:AIS_ATTACHMENT_RETENTION_DAYS=''
```

For production-like deployments (`AIS_DEPLOYMENT_MODE=production`, `private-cloud`, or `saas`), `AIS_JWT_SECRET` is mandatory and must be loaded from environment-managed secret storage. During JWT rotation, set `AIS_JWT_SECRET` to the new signing secret and put the old signing secret in comma-separated `AIS_JWT_PREVIOUS_SECRETS` for the approved grace window; new tokens are signed only with `AIS_JWT_SECRET`, while existing tokens signed by previous secrets remain valid until the previous-secret list is cleared. Production-like runtime startup requires `AIS_JWT_ROTATION_APPROVED_BY`, future ISO timestamp `AIS_JWT_ROTATION_EXPIRES_AT`, `AIS_JWT_ROTATION_MONITOR_REF`, and `AIS_JWT_ROTATION_ROLLBACK_REF` whenever `AIS_JWT_PREVIOUS_SECRETS` is set. The runtime also accepts the legacy `DEPLOYMENT_MODE` alias for deployment mode. The Phase 1 API hashes passwords in local state, and the Prisma platform persistence slice stores `User.passwordHash` when `AIS_PLATFORM_STORE=prisma` is enabled.

`AIS_PLATFORM_STORE` controls platform storage for identity and account-set scope:

- `memory`: default local MVP mode, using in-process roles/users.
- `prisma`: use Prisma-backed permissions, roles, users, login identity loading, account sets, account-set user grants, accounting periods, chart of accounts, auxiliary accounting master data, opening balances, voucher workflows, posting journal entries, and account-period balances. Run the Phase 1 migration and seed the Phase 1 platform templates before enabling this mode.

`AIS_ATTACHMENT_STORAGE_PROVIDER` controls attachment storage mode:

- `local`: binary uploads with `contentBase64` are stored under `AIS_ATTACHMENT_STORAGE_ROOT`.
- `external`: attachment records reference an externally managed object store through `storageProvider`, `storageKey`, and a `sha256:` checksum; production integrations must upload the object to the target storage service before linking the metadata. Production-like external mode requires `AIS_ATTACHMENT_EXTERNAL_ENDPOINT`, `AIS_ATTACHMENT_EXTERNAL_BUCKET`, `AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF`, and positive integer `AIS_ATTACHMENT_RETENTION_DAYS`. Set `AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF=env:ENV_VAR` to send `Authorization: Bearer $ENV_VAR`, for example `env:AIS_ATTACHMENT_EXTERNAL_TOKEN`; set `AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF=header:x-api-key=env:ENV_VAR` to send a provider-specific header, for example `header:x-api-key=env:AIS_ATTACHMENT_EXTERNAL_API_KEY`. The runtime verifies metadata-only uploads with HTTP `HEAD` against `AIS_ATTACHMENT_EXTERNAL_ENDPOINT/AIS_ATTACHMENT_EXTERNAL_BUCKET/{storageKey}` and compares `content-length` plus `x-ais-sha256-checksum`, `x-amz-meta-sha256`, or `checksum-sha256` when present. The Phase 1 API rejects `contentBase64` in external mode so binary content is not silently written to local disk.

`AIS_ATTACHMENT_STORAGE_ROOT` controls the local filesystem storage root used by the Phase 1 attachment upload API when `contentBase64` is supplied. The default is `services/api/.attachment-storage` for local mode. Production-like deployments must either provide a durable local/private file-store root or set `AIS_ATTACHMENT_STORAGE_PROVIDER=external` with the external endpoint, bucket, credential-reference, and retention configuration above.

## 4. Database Validation

Validate the Prisma schema:

```powershell
cd packages/database
$env:DATABASE_URL='file:./dev.db'
npx prisma validate --schema prisma/schema.prisma
```

Validate the migration SQL against an in-memory SQLite database from the repository root:

```powershell
$python = 'C:/Users/jin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$script = @'
import sqlite3
from pathlib import Path

sql = Path("packages/database/prisma/migrations/20260607120000_phase1_init/migration.sql").read_text(encoding="utf-8-sig")
conn = sqlite3.connect(":memory:")
conn.executescript(sql)
rows = conn.execute("select count(*) from sqlite_master where type='table'").fetchone()[0]
print(rows)
conn.close()
'@
& $python -c $script
```

Expected result: `28`; the `User` table must contain `passwordHash` and no plaintext `password` column, and `AccountSetUser` must contain grant metadata.

Verify Prisma migration deployment in the target runtime:

```powershell
cd packages/database
$env:DATABASE_URL='file:../phase1_migrate_deploy_existing.db'
npx prisma migrate deploy --schema prisma/schema.prisma
```

Expected result: migration `20260607120000_phase1_init` is applied successfully. The current worktree was verified with target-runtime permissions against a temporary SQLite database; the migrated database contained 29 tables including `_prisma_migrations`, `JournalEntry`, and `AccountPeriodBalance`. In the restricted Codex sandbox, schema-engine process startup can fail with `spawn EPERM`; run the deployment command in the target runtime or an approved elevated shell.

## 5. Run Locally

Start the API from the repository root:

```powershell
npm run dev:api
```

Start the web app:

```powershell
npm run dev --workspace apps/web -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173/
```

The Vite dev server proxies `/api` to `http://127.0.0.1:3000`.

## 6. Production Build

Build the web app:

```powershell
npm run build --workspace apps/web
```

Current known warning: Vite reports a large JavaScript chunk after minification. This does not block Phase 1 validation, but code-splitting should be considered before production hardening.

## 7. Verification Gate

Run these checks before accepting a Phase 1 build:

```powershell
npm test
npm run lint --workspace apps/web
npm run build --workspace apps/web
cd packages/database
$env:DATABASE_URL='file:./dev.db'
npx prisma validate --schema prisma/schema.prisma
```

Current expected results:

- `npm test`: 137 tests passing.
- web lint: no errors.
- web build: exit 0 with the known large chunk warning.
- Prisma schema validation: valid schema.

## 8. Smoke Tests

With API and web running:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/api/account-sets
```

Expected result: HTTP `200` for both.

## 9. Seed Data And Permissions

Platform template seed script:

```powershell
cd packages/database
npm run seed:platform
```

The seed is idempotent and includes Phase 1 permission codes and role templates for account sets, periods, accounts, auxiliary accounting, opening balances, vouchers, attachments, bank reconciliation, AI draft generation, audit logs, users, and roles. `npm run seed:permissions` remains as a compatibility alias.

To create the initial Prisma-backed administrator during deployment, generate a password hash and provide the hash to the seed command instead of persisting a plaintext password:

```powershell
cd packages/database
$env:AIS_ADMIN_PASSWORD='replace-with-one-time-admin-password'
npm run admin:hash
```

Copy the generated `sha256:<salt>:<digest>` value into `AIS_ADMIN_PASSWORD_HASH`, then clear `AIS_ADMIN_PASSWORD` from the shell history/environment according to your operations policy:

```powershell
$env:AIS_ADMIN_USERNAME='admin'
$env:AIS_ADMIN_NAME='System Administrator'
$env:AIS_ADMIN_PASSWORD_HASH='sha256:<salt>:<digest>'
npm run seed:platform
```

Optional: set `AIS_ADMIN_ROLE_NAME` to another seeded role template. The default is `System Admin`. The seed rejects an admin username without `AIS_ADMIN_PASSWORD_HASH` so no plaintext password is persisted.

To rotate the administrator password hash, repeat the hash-generation step with the new password, set `AIS_ADMIN_PASSWORD_HASH` to the new hash, and rerun `npm run seed:platform`. The seed is idempotent and updates the existing admin user's `passwordHash` while preserving the seeded role assignment.

## 10. Deployment Modes

### LAN

- Bind the API and web entry to internal addresses only.
- Use internal DNS or static IP access.
- Store attachments on internal object/file storage; local MVP uses `AIS_ATTACHMENT_STORAGE_ROOT`.
- Keep backups inside the organization-controlled network.

### Private Cloud / VPN

- Terminate TLS at a private gateway or reverse proxy.
- Restrict access by VPN and IP allowlists.
- Use managed database backups.
- Keep Agent API access behind the same private boundary.

### Public HTTPS / SaaS

- Require HTTPS.
- Use environment-managed secrets.
- Use tenant/account-set isolation at every data boundary before production use.
- Use managed object storage for attachments.
- Add production observability and backup/restore checks.

## 11. Hardening Items Before Real Production

- Complete production hardening; target-runtime `prisma migrate deploy` has been verified, and platform roles/users/account sets/account-set grants/accounting periods/chart of accounts/auxiliary accounting/opening balances/voucher workflows/posting journal entries/account-period balances already have a Prisma-backed slice.
- Seed production users with password hashes and manage JWT secrets through environment/secret storage with approved rotation metadata and a bounded previous-secret grace window.
- Extend account-set scoped authorization from the platform slice into all persisted general-ledger data boundaries.
- Replace local attachment storage with a target object-storage adapter/service for production scale; the Phase 1 runtime already validates external endpoint, bucket, credential-reference, and retention readiness.
- Add backup, restore, and recovery drills.
- Keep browser visual QA screenshots current for core Phase 1 pages.
