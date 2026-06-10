# Phase 1 Acceptance Matrix

Last updated: 2026-06-09

This matrix maps the final acceptance cases and deliverables from `docs/phase-1-detailed-plan.md` to current worktree evidence. It is intended to be read together with `docs/phase-1-acceptance-report.md`.

## Final Acceptance Cases

| Plan item | Acceptance expectation | Current evidence | Status |
| --- | --- | --- | --- |
| Case 1: create account set A | Account set can be created for the 2026-01 finance flow. | `services/api/tests/apiServer.test.mjs` test `API runs Phase 1 account set to posting and trial balance flow`. | Verified |
| Case 1: create users Zhang San, Li Si, Wang Wu | Maker, reviewer, and poster identities are preserved through the workflow. | Same final-flow test asserts status logs for `zhang-san`, `li-si`, and `wang-wu`; RBAC and login behavior are covered by API and seed tests. | Verified |
| Case 1: create 2026 January period | Period generation opens the first period for voucher processing. | Same final-flow test generates periods and asserts the first period is `open`. | Verified |
| Case 1: create bank and office-expense accounts | Required accounts are maintained before voucher entry. | Same final-flow test creates `1002 Bank Deposits` and `6602 Office Expense`; account import and maintenance tests cover broader account rules. | Verified |
| Case 1: enter voucher debit expense 500, credit bank 500 | Balanced voucher draft can be created. | Same final-flow test creates the two-line voucher with exact 500 debit and 500 credit. | Verified |
| Case 1: upload invoice attachment | Attachment can be uploaded and linked to the voucher. | Same final-flow test uploads local binary content, links it to the voucher, lists linked voucher attachments, and downloads the content. | Verified |
| Case 1: submit, approve, post | Voucher status moves through draft, submitted, approved, and posted. | Same final-flow test asserts response statuses and formal voucher status logs for each transition. | Verified |
| Case 1: query general ledger, detail ledger, account balances, and trial balance | Ledger rows and report totals match the posted voucher. | Same final-flow test asserts general-ledger rows, detail-ledger entries, account-balance rows, and balanced trial-balance totals. | Verified |
| Case 1: audit logs complete | Write operations leave audit evidence. | Same final-flow test asserts attachment-link audit evidence; `voucher status logs record every formal state transition` and other audit regression tests cover lifecycle logging. | Verified |
| Case 2: AI only generates draft suggestions | AI endpoint must not create formal vouchers automatically. | `services/api/tests/apiServer.test.mjs` tests `AI voucher suggestions are dry-run drafts and do not create formal vouchers` and `AI voucher suggestions require dryRun true`. | Verified |
| Case 2: human confirms accounts and converts to formal draft | AI suggestion becomes a voucher only through explicit human conversion. | `AI voucher suggestions convert to formal voucher drafts only after human confirmation` and `plan-compatible AI voucher draft endpoints generate, query, and convert reviewed drafts`. | Verified |
| Case 2: converted voucher still follows validation | Converted vouchers are normal drafts, subject to the same voucher creation and workflow validation. | AI conversion tests create formal drafts only; voucher validation, period-state, account-state, amount-rule, submit, approve, and post tests cover the shared workflow. | Verified |
| Case 2: AI cannot submit, approve, or post | AI APIs do not expose direct workflow mutation. | AI tests assert dry-run and conversion-only behavior; OpenAPI plan-path tests keep planned endpoints explicit and separate from voucher workflow endpoints. | Verified |
| Case 3: account-set 001/002 isolation | Users see and mutate only explicitly granted account sets. | `account-set authorization isolates vouchers between users with the same business permissions`. | Verified |
| Case 3: cross-account-set voucher access returns 403 | Unauthorized cross-scope writes are blocked. | Same authorization test asserts `ACCOUNT_SET_ACCESS_DENIED` with HTTP 403. | Verified |
| Case 3: no cross-account-set data visible | Unauthorized user cannot list another account set's vouchers. | Same authorization test asserts Bob's voucher list is empty. | Verified |
| Case 3: unauthorized attempt audit logged | Scope denial is auditable. | Same authorization test asserts an `account_set.access_denied` audit log for the denied actor and object. | Verified |

## Deliverables

| Deliverable | Current artifact | Verification evidence | Status |
| --- | --- | --- | --- |
| Runnable frontend system | `apps/web` Vite app | `npm run lint --workspace apps/web` and `npm run build --workspace apps/web`; visual smoke screenshots under `docs/qa/phase-1-visual-smoke/screenshots/`. | Verified |
| Runnable backend API | `services/api/src/server.mjs` and API tests | `npm test`; local runtime smoke is documented in the acceptance report. | Verified |
| Database migration | `packages/database/prisma/migrations/20260607120000_phase1_init/migration.sql` | Migration tests, Prisma validation, and documented `prisma migrate deploy` verification. | Verified |
| Initial permission script | `packages/database/scripts/seed-platform.js`; compatibility alias `seed-permissions.js` | `packages/database/tests/seedPlatform.test.mjs`. | Verified |
| Standard account import template | `docs/templates/standard-chart-of-accounts.csv` | Account import regression tests and operation manual import workflow. | Verified |
| Voucher import template | `docs/templates/voucher-import-template.csv` | Template delivered as optional Phase 1 artifact. | Verified |
| API docs | `services/api/openapi.yaml` | OpenAPI contract tests and plan-path regression tests. | Verified |
| Database ER diagram | `docs/phase-1-er-diagram.md` | Acceptance report lists ER diagram artifact. | Verified |
| Operation manual | `docs/phase-1-operation-manual.md` | Covers setup, master data, periods, vouchers, attachments, reports, AI suggestions, audit, and MVP limits. | Verified |
| Test cases | `packages/domain/tests`, `services/api/tests`, `packages/database/tests`, `apps/web/tests` | `npm test` currently passes with 137 tests. | Verified |
| Deployment docs | `docs/phase-1-deployment-manual.md` | Includes environment, migration, seed, run, smoke, verification, and production-hardening notes. | Verified |
| Acceptance report | `docs/phase-1-acceptance-report.md` | Summarizes verified worktree coverage and remaining target-deployment inputs. | Verified |

## Remaining Target-Deployment Inputs

These are not local functional acceptance blockers, but they must be filled by the deployment owner before a production-like rollout:

- Set target-site JWT rotation metadata before enabling `AIS_JWT_PREVIOUS_SECRETS`: approver, expiry, monitoring reference, and rollback reference.
- Confirm the target object-storage verification method. The Phase 1 runtime supports authenticated HTTP `HEAD` with bearer or custom header credentials; providers requiring a cloud SDK or signed request gateway need a deployment-specific adapter or proxy.
