# Phase 6 Acceptance Report

## Scope

Phase 6 turns the Phase 1-5 finance, supply-chain, payroll, fixed-asset, and reporting capabilities into a controlled Agent-ready production workflow. The acceptance scope covers Agent Gateway boundaries, Tool Registry metadata, dry-run only draft generation, local OCR, LLM Draft Adapter integration, master-data matching, approval and replay, tamper-resistant evidence, restore-drill isolation, migration, backup/restore, security events, and frontend observability.

## Accepted Capabilities

- Agent Gateway style write paths enforce account-set scoped idempotency keys with TTL and reject cross-account-set replay using `IDEMPOTENCY_SCOPE_MISMATCH`.
- Tool Registry exposes structured tools, risk levels, approval policies, input schemas, and dry-run invocation boundaries for Agent use instead of relying on UI DOM automation.
- Agent draft generation keeps LLM output in a review queue and never writes directly to formal business records.
- Uploaded attachment evidence is extracted through local OCR before LLM draft generation. The runtime supports `local-ocr-placeholder`, `local-command-ocr`, `local-tesseract`, and injected `configured-local-ocr` adapters.
- `LLM Draft Adapter` is provider-neutral. The runtime supports a local rule-based default and an `openai-compatible` gateway with model, timeout, max token, API key reference, and redaction settings.
- LLM draft failures, schema-invalid output, provider failures, and metrics are captured in `llm_draft_runs` without creating business drafts.
- Draft candidates preserve OCR results, original and reviewed text, `inputSummary`, evidence refs, `matchedMasterData`, `unmatchedItems`, dry-run results, warnings, confidence, review status, rejection status, and conversion status.
- System-side master-data matching resolves model text or codes to official suppliers, customers, inventory items, warehouses, chart accounts, payroll runs, and fixed asset cards before review. Model-generated business IDs are not trusted as final IDs.
- Unmatched fields remain in `unmatchedItems`, and conversion requires `resolvedUnmatchedItems` before saving formal system drafts.
- Agent draft conversion covers purchase orders, sales orders, inventory movements, material requisitions, product receipts, stock counts, master data drafts, payroll allocations, depreciation dry-run drafts, asset changes, vouchers, and report interpretation drafts.
- Agent source context hydration covers orders, warehouse movements, production work orders, vouchers, payroll runs, fixed asset cards, depreciation pages, report runs, and report cells.
- Agent Action lifecycle persists `agent_actions`, approvals, approval progress, evidence references, `evidenceSnapshots`, execution results, reversals, and `agent_replay_events`.
- Agent Action queue supports `page` and `pageSize` pagination, with Prisma/platformStore count and result-window pushdown, so production approval/replay work queues do not require full-list fetches.
- High-risk Agent actions require approval, user token confirmation where configured, and replayable audit events before execution.
- Evidence WORM checks compare attachment status and checksum before every approval and before execution. Tampered evidence blocks the workflow, leaves the action in the previous state, writes `evidence_verification_failed`, and creates a high-severity `security_events` row.
- Restore-drill mode blocks external Agent executions even after approval and writes `restore_drill_outbound_blocked` replay evidence.
- Security events persist permission denials, idempotency anomalies, and evidence verification failures. The `/security/events` API filters by account set, event type, severity, and actor.
- Backup jobs create auditable `backup_jobs` manifests with table counts, attachment hash verification, and checksums.
- Restore jobs create `restore_jobs` dry-run records only inside restore-drill mode, preserving impact scope and blocked outbound channels without overwriting business data.
- Migration jobs persist `migration_jobs`, source summaries, field mappings, source row snapshots, dry-run validation, error reports, and import summaries.
- Migration imports now write approved opening balances, partner master data, and inventory item master data through the platform store.
- The web Agent Center exposes draft generation, OCR review, LLM run history, matched master data, unmatched fields, Agent Action approval, evidence hash state, Replay, and Tool Registry controls.
- The operations workbench exposes backup, restore, migration, restore-drill status, and security audit views. The security audit view surfaces `evidence_verification_failed`, severity, actor, object ID, and JSON payload.

## Verification Evidence

The current automated evidence is distributed across these suites:

- `services/api/tests/apiServer.test.mjs` covers Agent draft generation, OCR/LLM adapters, master-data matching, draft review and conversion, Agent Action approval/replay/reversal, evidence hash tamper blocking, security events, restore-drill isolation, backup/restore, and migration import.
- `services/api/tests/serverConfig.test.mjs` covers runtime production checks for database, attachment storage, local OCR command adapters, OpenAI-compatible LLM adapters, redaction, model configuration, JWT rotation, and desktop Prisma preparation.
- `services/api/tests/openapiContract.test.mjs` covers API contract stability.
- `apps/web/tests/agentCenterAttachmentUpload.test.mjs` covers Agent Center OCR, LLM run history, matched master data, draft conversion, Agent Action replay, evidence hash display, and Tool Registry UI wiring.
- `apps/web/tests/backupRestoreWorkbench.test.mjs` covers backup/restore, migration jobs, security event audit APIs, and evidence tamper event visibility.
- `apps/web/tests/*.test.mjs` covers the full web route and page wiring surface used by Phase 6.

## Verification Gates

The Phase 6 acceptance gate is:

- `cmd /c node --test services/api/tests/apiServer.test.mjs`
- `cmd /c node --test services/api/tests/serverConfig.test.mjs`
- `cmd /c node --test services/api/tests/openapiContract.test.mjs`
- `cmd /c node --test apps/web/tests/*.test.mjs`
- `cmd /c npm run build --workspace apps/web`
- `cmd /c node --test docs/tests/phase6AcceptanceReport.test.mjs`
- `cmd /c git diff --check`

## Residual Risks

- The current performance gate is still represented by API shape, pagination/filter expectations, and focused unit/integration tests. A production-sized 1,000,000-row load test remains a deployment-readiness activity.
- OCR quality depends on the configured local model or command. The system preserves adapters and evidence, but production accuracy must be validated with the actual enterprise OCR model.
- LLM draft quality depends on the configured model and redaction policy. Phase 6 enforces schema, dry-run, master-data matching, and human confirmation so model output remains advisory.
- Full external payment, email, webhook, and bank integrations remain intentionally blocked from Agent direct execution unless later human-token flows are explicitly implemented and tested.

## Acceptance Status

Phase 6 is accepted for the implemented Agent workflow and production-hardening slice once the verification gates above pass in the target branch. No placeholder acceptance marker should remain in the release package.
