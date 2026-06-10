# Phase 1 Operation Manual

Last updated: 2026-06-08

This manual covers the Phase 1 platform setup and general-ledger workflows currently implemented in this worktree.

## 1. Roles And Access

Default local users:

| Username | Password | Purpose |
| --- | --- | --- |
| `system` | `system` | Local administrator and smoke-test user |
| `viewer` | `viewer` | Query-only user |

Use **Platform Management -> User Management** to create users and **Platform Management -> Role Permissions** to create roles. A user receives the permission codes assigned to their role at creation time.

Use **Platform Management -> Role Permissions -> Account Set Grants** to explicitly add a user to an account set. Business permissions alone do not allow a user to see or write another account set's vouchers.

Key Phase 1 permissions include:

- `account_set.create`, `account_set.manage`, `account_set_user.manage`, `account_set.view`
- `period.open`, `period.close`, `period.view`
- `account.create`, `account.view`
- `auxiliary.manage`
- `opening_balance.manage`, `opening_balance.view`
- `voucher.create`, `voucher.submit`, `voucher.approve`, `voucher.reject`, `voucher.void`, `voucher.post`, `voucher.view`
- `attachment.upload`, `attachment.delete`
- `bank_reconciliation.create`, `bank_reconciliation.match`
- `ledger.view`, `report.view`, `audit_log.view`
- `ai.generate_draft`
- `user.manage`, `role.manage`

## 2. Initial Setup Flow

1. Open the web app.
2. Go to **Platform Management -> Account Sets**.
3. Create an account set with code, company name, base currency, accounting standard, start year, and start period.
4. The web flow generates accounting periods after account-set creation.
5. Use **Edit** to maintain account-set name, company, currency, accounting standard, and start period metadata.
6. Select, enable, or disable the account set.

Use **Platform Management -> Deployment Configuration** to check the active deployment mode, platform store mode, database provider/configuration state, and attachment storage state. The page calls `GET /deployment/config` and is intended as a quick readiness check before Phase 1 smoke tests.

After an account set is enabled, Phase 1 blocks start-year/start-period changes, master-data account creation/import, opening-balance changes, and accounting-period regeneration. Disable the account set before changing those initialization records or rebuilding its period structure.

## 3. Master Data

### Chart Of Accounts

Go to **Master Data -> Chart Of Accounts**.

Use **Import Standard** to load the Phase 1 standard account set for the current account set. The page displays the account hierarchy from the account tree endpoint. Use **New Account** to create leaf accounts and **Edit** to maintain account metadata. Required fields:

- account code
- account name
- account type
- normal balance
- whether the account is leaf
- whether manual voucher entry is allowed
- optional cash or bank account flags
- optional required auxiliary codes

Voucher lines can only use enabled leaf accounts that allow manual entry.

Use **Import Preview** to paste CSV-style account rows, preview the parsed result, and then confirm the import through `POST /accounts/import`. Supported columns are `code,name,accountType,normalBalance,isLeaf,isCash,isBank,allowManualEntry`.

Use **Edit** to rename an account, adjust type/balance/flags, change required auxiliary codes, or turn off manual voucher entry. Use **Disable** to stop an account from being used in new voucher workflow, **Enable** to reactivate it, and **Delete** for the Phase 1 soft-delete path when the account has not been referenced by vouchers. Existing draft vouchers that reference a disabled or manual-entry-locked account cannot be submitted until the account is changed or re-enabled.

### Account Code Rules

Go to **Master Data -> Account Code Rules**.

Enter a segment pattern such as `4-2-2-2` and save it. The API stores the rule through `POST /account-code-rules` and uses the cumulative lengths to validate new account codes. For `4-2-2-2`, valid account code lengths are `4`, `6`, `8`, and `10`.

### Auxiliary Accounting

Go to **Master Data -> Auxiliary Accounting**.

Use the three tabs in order:

1. **Auxiliary Types**: create dimensions such as department, employee, customer, supplier, project, or custom.
2. **Auxiliary Items**: create, edit, enable, and disable master records under a type.
3. **Account Binding**: mark an account as requiring an auxiliary dimension.

When an account has a required auxiliary dimension, voucher submission validates that voucher lines include that auxiliary value.

### Opening Balances

Go to **Master Data -> Opening Balances**.

Enter one opening balance row per account, year, and period. A row can have debit or credit, but not both. The page shows:

- opening debit total
- opening credit total
- difference
- balanced / unbalanced status

Phase 1 expects opening debit total to equal opening credit total before the account set is treated as ready for production use.

## 4. Period Management

Go to **Master Data -> Accounting Periods**.

The page reads periods for the selected account set through `GET /account-sets/{accountSetId}/periods`.

Available actions:

- **Open**: make a period available for voucher operations.
- **Generate P/L**: generate a profit-and-loss carry-forward voucher draft for the period. The default carry-forward account is `3103`.
- **Close**: close a period after checks pass.
- **Lock**: lock a period for read-only use.
- **Set Current**: mark exactly one open period as current.

Period close is blocked while unposted vouchers remain in that period. A generated profit-and-loss carry-forward voucher has source type `period_close` and must still be submitted, approved, and posted before the period can close.

The plan-compatible API path for period-end profit-and-loss transfer is `POST /posting/period-end/transfer-pl`.

Voucher write operations require an open accounting period. Closed or locked periods are read-only for voucher creation, draft update, deletion, and workflow actions.

## 5. Voucher Workflow

Go to **General Ledger -> Voucher Entry** to create a voucher draft.

Voucher entry requires:

- current account set
- voucher date
- at least two lines
- line summary
- leaf account
- debit or credit amount
- balanced debit and credit totals
- required auxiliary values where configured

Each voucher line must use exactly one side: either debit or credit. A line cannot contain both debit and credit, cannot leave both sides empty or zero, and cannot use a negative amount. Drafts may be saved before the whole voucher is balanced, but submission requires total debit to equal total credit.

The API assigns a voucher number automatically when a draft is created. Phase 1 uses `JV-YYYYPP-0001` style numbering within each account set, fiscal year, and period.

Optional attachments can be selected while saving the voucher. The web app reads the selected file, uploads its binary content through the attachment API, and links the stored attachment to the saved voucher.

Go to **General Ledger -> Voucher Management** to process vouchers:

1. Draft or rejected voucher -> submit.
2. Submitted voucher -> approve or reject.
3. Approved voucher -> post.
4. Posted voucher -> create reversal draft if needed.
5. Existing vouchers can be opened by id, copied into a new draft, or deleted through the Phase 1 delete-as-void path.

Expand a voucher row to view voucher lines, attachment count, approval actors, source chain, formal status logs, and linked attachments. Status logs are read from `GET /vouchers/{voucherId}/status-logs`.

Go to **General Ledger -> Voucher Review Workbench** for batch review. The workbench filters vouchers by period, status, maker, and account/summary, then allows selected submitted vouchers to be batch approved or batch rejected with a rejection reason.

Rules:

- The voucher creator cannot approve their own voucher.
- Only draft or rejected vouchers can be edited.
- Only approved vouchers can be posted.
- A posted voucher cannot be posted twice.
- Duplicate post attempts return `VOUCHER_ALREADY_POSTED` and do not add journal entries.
- Draft update supports optimistic locking with `expectedRevision`; stale saves return `VOUCHER_UPDATE_CONFLICT` and the user should refresh before retrying.
- Delete keeps the audit trail by voiding draft, submitted, or rejected vouchers instead of physically removing rows.
- Single-voucher posting is available through `POST /posting/post-voucher/{voucherId}`. Batch posting is available from Voucher Management by selecting approved vouchers and clicking **Batch Post**; it calls `POST /posting/post-batch`.
- Go to **General Ledger -> Posting Batches** to review posting results. The page lists `GET /posting/batches` and opens batch detail through `GET /posting/batches/{postingBatchId}`, including per-voucher success, failure, journal-entry count, and error messages.
- Posted voucher attachments cannot be deleted; add supplemental attachments instead.
- Attachments with `retentionUntil` cannot be deleted before the configured retention window expires.
- Attachment upload calculates or verifies SHA-256 checksums and rejects byte-size mismatches.
- Posting rechecks linked attachment status. Vouchers with linked attachments still in `uploading` or `failed` status cannot be posted until the attachments are available.

## 6. Ledger And Reports

Go to **Reports** for:

- general ledger
- sub-ledger / detail ledger
- account balances
- trial balance

The report page reads the Phase 1 planned endpoints: `GET /ledger/general-ledger`, `GET /ledger/sub-ledger`, `GET /reports/account-balances`, and `GET /reports/trial-balance`.

Use **Export CSV** to download the currently active report tab. Exported amounts come from the same rows shown on screen.

In the sub-ledger tab, click a voucher id to open its voucher detail and line entries.

## 7. Bank Reconciliation

Go to **General Ledger -> Bank Reconciliation**.

The Phase 1 bank reconciliation workflow imports bank statement rows, creates a reconciliation run, and matches unreconciled statement rows to posted bank journal entries by account set, period, bank account, date, and amount. Matched statement rows move to `reconciled`, and reconciliation actions are written to the audit log.

The plan-compatible API paths are `POST /bank/statements`, `GET /bank/statements`, `POST /bank/reconcile`, and `POST /bank/reconcile/auto`.

## 8. AI Voucher Suggestions

Go to **Agent Center**.

Flow:

1. Enter business text and optional evidence references.
2. Generate an AI voucher suggestion.
3. Review risk level, confidence, warnings, evidence references, and draft lines.
4. Confirm conversion to create a formal voucher draft.

AI suggestions are always dry-run first. AI does not directly create posted vouchers, submit vouchers, approve vouchers, or post vouchers.

The plan-compatible API paths are `POST /ai/voucher-drafts`, `GET /ai/voucher-drafts/{aiSuggestionId}`, and `POST /ai/voucher-drafts/{aiSuggestionId}/convert-to-voucher`.

## 9. Audit Logs

State-changing actions write audit logs in the local API state. Phase 1 includes audit coverage for account sets, account-set access denial attempts, periods, accounts, roles, users, auxiliary records, opening balances, vouchers, attachments, and AI conversion.

Go to **Platform Management -> Audit Logs** to query audit records. The page reads `GET /audit-logs` and supports filtering by actor, module, and action.

## 10. Known MVP Limits

- Default local mode remains in-memory for quick MVP smoke tests.
- Platform roles, users, login identity, account sets, account-set user grants, accounting periods, chart of accounts, auxiliary accounting master data, opening balances, voucher workflows, posting journal entries, account-period balances, bank statement rows, and bank reconciliation runs can use the Prisma persistence slice when `AIS_PLATFORM_STORE=prisma`.
- JWT signing uses `AIS_JWT_SECRET` when configured, production-like deployment modes fail startup if the managed JWT secret is missing, and `AIS_JWT_PREVIOUS_SECRETS` can keep old tokens valid during an approved rotation grace window. When previous secrets are set in production-like modes, startup requires rotation approver, future expiry, monitoring reference, and rollback reference metadata. The database package includes `npm run admin:hash` to generate seed-compatible administrator password hashes for initial setup or rotation; site-specific approver identity, monitoring target, and rollout window values remain deployment tasks.
- Attachment upload stores binary content in the configured local attachment storage root for MVP deployments. Production-like deployment modes require either an explicit local/private storage root or `AIS_ATTACHMENT_STORAGE_PROVIDER=external` with endpoint, bucket, credential-reference, and retention-day configuration for target object-storage metadata integration. The Phase 1 API writes `retentionUntil` from `AIS_ATTACHMENT_RETENTION_DAYS` and blocks deletion before that window expires. In external mode, upload the binary object to the target storage service first and submit only `storageProvider` / `storageKey` metadata plus a `sha256:` checksum to Phase 1; runtime metadata uploads are verified against the configured object-storage endpoint before the attachment record is accepted. `AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF=env:ENV_VAR` adds a bearer token from that environment variable to the verification request; `header:x-api-key=env:ENV_VAR` adds a provider-specific API-key header.
- Persisted account-set scoped authorization currently covers account-set grants and voucher visibility/write checks exposed through the Phase 1 API; broader cross-module persisted policy hardening remains a production-hardening task.
- Browser visual QA screenshots still need to be captured in the target browser workflow.
