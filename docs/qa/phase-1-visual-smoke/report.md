# Phase 1 Visual Smoke QA Report

- Target URL: http://127.0.0.1:5173/
- Session: ais-phase1
- Date: 2026-06-08
- Scope: Phase 1 ERP web console core pages and workflows

## Summary

- Status: Completed for current MVP UI surface
- Pages checked: 14 routes plus two regression screenshots
- Issues found: 1
- Issues fixed: 1
- Runtime errors after fix: none observed through `agent-browser errors`

## Pages Checked

- [00 Dashboard](screenshots/00-dashboard-annotated.png)
- [01 Login](screenshots/01-login-annotated.png)
- [02 Account Sets](screenshots/02-account-sets-annotated.png)
- [03 Accounts](screenshots/03-accounts-annotated.png)
- [04 Periods](screenshots/04-periods-annotated.png)
- [05 Auxiliaries](screenshots/05-auxiliaries-annotated.png)
- [06 Opening Balances](screenshots/06-opening-balances-annotated.png)
- [07 Users and Roles](screenshots/07-users-annotated.png)
- [08 Vouchers](screenshots/08-vouchers-annotated.png)
- [09 Voucher Entry](screenshots/09-voucher-entry-annotated.png)
- [10 Reports Trial Balance Route](screenshots/10-reports-trial-balance-annotated.png)
- [11 Reports General Ledger Route](screenshots/11-reports-ledger-annotated.png)
- [12 Bank Reconciliation](screenshots/12-bank-reconciliation-annotated.png)
- [13 Agent Center](screenshots/13-agent-annotated.png)
- [14 Dashboard Clean Session After Fix](screenshots/14-dashboard-clean-annotated.png)
- [15 Voucher Entry Binary Upload Control](screenshots/15-voucher-entry-binary-upload-annotated.png)

## Issues

### ISSUE-001: Ant Design v6 deprecated props emitted console warnings

- Severity: Low
- Type: Frontend compatibility / console cleanliness
- Evidence: Initial dashboard and route console output showed deprecated `Space.direction`, `Alert.message`, and `Statistic.valueStyle` warnings.
- Fix: Replaced deprecated props with Ant Design v6-compatible `Space.orientation`, `Alert.title`, and `Statistic.styles.content`.
- Regression: Added `apps/web/tests/antdCompatibility.test.mjs` to prevent reintroducing the deprecated props.
- Verification: Fresh `ais-phase1-clean` browser session on `http://127.0.0.1:5173/` showed no AntD warnings and no runtime errors.
