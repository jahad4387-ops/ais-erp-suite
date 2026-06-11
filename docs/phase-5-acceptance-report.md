# Phase 5 Acceptance Report

## Scope

Phase 5 turns the Phase 1-4 accounting and sub-ledger data into an auditable reporting center. The acceptance scope covers UFO-style report templates, formula snapshots, statutory report presets, report review and locking, cash-flow exception blocking, snapshot-based export, AI report interpretation, management analysis, evidence drilldown, and account-set scoped reporting permissions.

## Accepted Capabilities

- Report templates support published immutable versions with multi-sheet UFO layouts, formula cells, display formats, dependencies, and copy-on-revise behavior.
- Statutory presets create the four required legal statements: balance sheet, income statement, cash-flow statement, and owner equity statement.
- Report runs calculate formula snapshots with `snapshotHash`, `calculatedValue`, `displayFormat`, and trace links for account balances and cross-sheet `report_cell` references.
- Formal statutory and cash-flow reports force `includeUnposted` to false so unposted voucher drafts cannot pollute official statements.
- Management simulations may opt in to `includeUnposted` and include unposted voucher lines in simulated report snapshots without mutating official balances.
- Closed accounting periods block report recalculation, and locked or archived report runs render from stored snapshot cells only.
- Cell drilldown exposes formula text, snapshot source balances, ledger entries, vouchers, and cross-sheet trace links.
- Cash-flow reports detect cash or bank journal entries without cash-flow item assignment, highlight `REPORT_CASH_FLOW_UNASSIGNED`, and block review and locking.
- Report exports generate audited Excel/PDF records from stored report cells, include `contentText`, preserve `snapshotHash`, and do not recalculate current balances.
- AI report interpretations require `evidenceRefs` that point to actual cells in the current report run, for example `report_cell:BS!B10`.
- Management analysis covers purchase trend, sales gross margin, inventory turnover, counterparty aging, cash flow, labor cost, depreciation cost, operating overview, warning evidence, and drilldown rows.
- Phase 5 list endpoints for report templates, runs, exports, and AI interpretations enforce account-set scoped visibility when no explicit account set filter is supplied.
- The web app exposes report templates, UFO designer controls, report runs, report approvals, export and AI interpretation, and management analysis routes from the report menu.

## Verification Gates

The Phase 5 acceptance gate is:

- `cmd /c npm test`
- `cmd /c node --test --test-name-pattern="Phase 5" services/api/tests/apiServer.test.mjs`
- `cmd /c node --test apps/web/tests/reportTemplatePages.test.mjs apps/web/tests/reportRunPages.test.mjs apps/web/tests/reportApprovalPages.test.mjs apps/web/tests/reportExportAiPages.test.mjs apps/web/tests/managementAnalysisPage.test.mjs`
- `git diff --check`

The latest full gate passed with 289 tests after the Phase 5 isolation hardening.
