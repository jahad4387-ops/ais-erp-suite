# Phase 4 Acceptance Report

## Scope

Phase 4 extends the Phase 3 inventory and production costing baseline with payroll and fixed asset sub-ledger workflows. The acceptance scope covers the payroll foundation, payroll workflow, fixed asset foundation, depreciation engine, asset disposal, asset count, fixed asset reconciliation, and the month-end handoff back into production cost allocation.

## Accepted Capabilities

- The payroll foundation provides salary item setup, employee payroll profiles, period payroll runs, calculation lines, approval, locking, and payroll voucher draft output.
- The payroll workflow produces locked payroll cost pools that can be consumed by manufacturing cost allocation.
- The fixed asset foundation provides asset categories, depreciation methods, asset cards, asset lifecycle state, and ledger metadata.
- The depreciation engine calculates period depreciation, supports approval and locking, and produces fixed asset depreciation cost pools.
- Asset disposal records the disposal period and stops future depreciation after the disposal month.
- Asset count supports preview, count creation, variance lines, and count status for physical verification.
- Fixed asset reconciliation compares asset cards, ledger entries, depreciation runs, disposals, and counts for period-end review.
- Phase 3 cost allocation now accepts `phase4CostPoolIds` and consumes formal `phase4_payroll_cost_pool` and `phase4_depreciation_cost_pool` sources during month-end costing.

## Verification Gates

The Phase 4 acceptance gate is:

- `cmd /c npm test`
- `npx prisma validate`
- `npm run build --workspace apps/web`

The full engineering gate also includes API contract tests, web lint, TypeScript build, and whitespace checks before committing and pushing to GitHub.
