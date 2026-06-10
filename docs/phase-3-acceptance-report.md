# Phase 3 Acceptance Report

Phase 3 closes the inventory, production, and self-test costing loop for the AIS ERP suite. The implementation is split into the following acceptance areas:

- inventory foundation: inventory items, BOM maintenance, warehouses, locations, opening balances, and inventory trial-balance checks.
- movement costing: inbound and outbound stock movements, transfers, stock count preview, moving-average costing, FIFO layers, and zero-residual handling.
- production workflow: work orders, release and close controls, material requisitions, direct-material issue costing, and finished-goods receipts.
- cost allocation: locked mock/manual production cost inputs, dry-run allocation, committed allocation, finished-goods inventory cost adjustments, and warning propagation.
- cost voucher: draft voucher generation from committed Phase 3 cost allocations, two-sided accounting draft lines, audit logging, and `approvalRequired` human review.
- inventory reconciliation: period inventory balance total, cost adjustment total, difference reporting, and item-level reconciliation rows.

## Acceptance Notes

The Phase 3 self-test costing path intentionally uses mock/manual cost inputs. Formal payroll, depreciation, and manufacturing overhead source integrations remain Phase 4 scope. The system carries `PHASE4_SOURCE_MISSING` on affected allocations and cost voucher drafts so downstream users can see that the cost source is not yet a formal sub-ledger feed.

Cost voucher drafts are not posted automatically. They are created as draft payloads for human review and future Phase 4 posting integration.

## Verification Commands

The Phase 3 final gate is verified with:

- `cmd /c npm test`
- `npx prisma validate --schema prisma/schema.prisma`
- `npm run lint --workspace apps/web`
- `npx tsc -b apps/web/tsconfig.json`
- `npm run build --workspace apps/web`
- `git diff --check`
