# Phase 3 Inventory Production Costing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 3 inventory, production, costing, and inventory-to-GL reconciliation according to `docs/phase-3-detailed-plan.md`.

**Architecture:** Extend the existing modular-monolith MVP pattern: in-memory API behavior first, Prisma schema/migration contract coverage, OpenAPI contract coverage, and web route wiring tests. Keep Phase 4 labor/depreciation integration behind mock/manual cost-input contracts until Phase 4 is implemented.

**Tech Stack:** Node test runner, Express-style local API in `services/api/src/api.mjs`, Prisma SQLite schema/migrations, React + Ant Design web app, static frontend regression tests.

---

## File Map

- `services/api/src/api.mjs`: Phase 3 permissions, in-memory state, business rules, and routes.
- `services/api/tests/apiServer.test.mjs`: API behavior tests for each Phase 3 slice.
- `services/api/tests/openapiContract.test.mjs`: OpenAPI path/schema/metadata checks.
- `services/api/openapi.yaml`: API contract for frontend and Agent tooling.
- `packages/database/prisma/schema.prisma`: Phase 3 persistence model declarations.
- `packages/database/prisma/migrations/*_phase3_*`: Phase 3 migration SQL slices.
- `packages/database/tests/migration.test.mjs`: migration contract tests.
- `apps/web/src/App.tsx`: stable navigation and routes.
- `apps/web/src/pages/*.tsx`: Phase 3 page shells wired to real API paths.
- `apps/web/tests/*.test.mjs`: static UI route/API wiring regressions.
- `scripts/run-domain-tests.mjs`: include any new test files.
- `docs/phase-3-acceptance-report.md`: final acceptance evidence in Week 12.

## Slice 1: Inventory Foundation, BOM, Warehouses, Opening Balances

- [ ] **Step 1: Write failing migration tests**

Add tests that require `InventoryItem`, `Bom`, `BomLine`, `Warehouse`, `WarehouseLocation`, `InventoryOpeningBalance`, `InventoryBatch`, and `InventorySerial` tables. Assert batch-managed items cannot use moving average by contract metadata fields.

- [ ] **Step 2: Write failing API tests**

Add a test named `Phase 3 inventory foundation manages items, BOMs, warehouses, and opening balances` that:

- creates an account set and grants `inventory_item.manage`, `bom.manage`, `warehouse.manage`, and `inventory_balance.manage`;
- creates a raw material with `costMethod: "fifo"` and batch tracking;
- rejects a batch-tracked item with `costMethod: "moving_average"`;
- creates a manufactured product and BOM with component yield/scrap fields;
- creates a warehouse and location;
- records opening quantity and amount with batch/location dimensions;
- returns trial totals from `/inventory-opening-balances/trial-balance`.

- [ ] **Step 3: Implement minimal API and schema**

Add in-memory maps, permission mapping, route handlers, Prisma models, and SQL migration for the tested objects.

- [ ] **Step 4: Wire OpenAPI and web shells**

Document `/inventory-items`, `/boms`, `/warehouses`, `/inventory-opening-balances`, and `/inventory-opening-balances/trial-balance`. Add web pages for inventory items, BOM maintenance, warehouse/location, and inventory opening balances.

- [ ] **Step 5: Verify and commit**

Run `npm test`, web lint, Prisma validate, TypeScript build, web build, and `git diff --check`. Commit as `feat: add phase 3 inventory foundation`.

## Slice 2: Stock Movements, Transfers, Stock Count, Cost Algorithms

- [ ] **Step 1: Write failing API tests**

Cover normal inbound/outbound stock movements, transfer out/in, stock count adjustment preview, moving-average issue cost, FIFO issue cost, and zero-quantity residual value adjustment.

- [ ] **Step 2: Implement movement ledger**

Add `InventoryMovement`, `InventoryBalance`, `InventoryCostLayer`, `InventoryTransfer`, `StockCount`, and `StockCountLine` models/routes. Keep algorithms deterministic and small: moving average uses current balance value/quantity; FIFO consumes oldest open cost layers.

- [ ] **Step 3: Wire OpenAPI and web shells**

Document movement, transfer, count, balance, and inventory sub-ledger endpoints. Add pages for stock movements, transfers, stock counts, and stock ledger query.

- [ ] **Step 4: Verify and commit**

Run full verification. Commit as `feat: add phase 3 stock movement costing`.

## Slice 3: Work Orders, Material Requisition, Finished-Goods Receipt

- [ ] **Step 1: Write failing API tests**

Cover work-order creation from a BOM, release/close status flow, material requisition that consumes raw material stock and stores direct material cost, and finished-goods receipt that increases finished goods quantity with cost status.

- [ ] **Step 2: Implement production routes**

Add `WorkOrder`, `MaterialRequisition`, `MaterialRequisitionLine`, `ProductReceipt`, and `ProductReceiptLine`. Enforce account-set access, open-period checks, and source traceability.

- [ ] **Step 3: Wire OpenAPI and web shells**

Document `/work-orders`, `/material-requisitions`, and `/product-receipts`. Add production workbench and requisition/receipt pages.

- [ ] **Step 4: Verify and commit**

Run full verification. Commit as `feat: add phase 3 production workflow`.

## Slice 4: Mock Cost Inputs, Allocation Engine, Zero Residual Carry-Forward

- [ ] **Step 1: Write failing API tests**

Cover manual/mock cost input creation with `sourceType`, locked period/work-order linkage, dry-run allocation while Phase 4 source is missing, committed allocation only when cost inputs are locked, and zero-quantity residual value adjustment lines.

- [ ] **Step 2: Implement allocation engine**

Add `MockCostInput`, `CostAllocation`, `CostAllocationLine`, and `InventoryCostAdjustment`. Allocation distributes direct labor/depreciation/manufacturing overhead by planned or completed output quantity. Keep Phase 4 lock status explicit in result warnings.

- [ ] **Step 3: Wire OpenAPI and web shells**

Document `/mock-cost-inputs`, `/cost-allocations`, `/cost-allocations/dry-run`, and `/inventory-cost-adjustments`. Add cost calculation workbench page with prerequisite checks.

- [ ] **Step 4: Verify and commit**

Run full verification. Commit as `feat: add phase 3 cost allocation engine`.

## Slice 5: Cost Vouchers, Inventory Reconciliation, Acceptance Report

- [ ] **Step 1: Write failing end-to-end tests**

Cover the Phase 3 acceptance path: opening stock -> material issue -> mock locked labor/depreciation -> allocation -> finished goods receipt -> cost voucher draft -> inventory sub-ledger/balance reconciliation.

- [ ] **Step 2: Implement voucher draft and reconciliation endpoints**

Add `/cost-voucher-drafts`, `/inventory-reconciliation`, and links from inventory documents to voucher draft metadata. Use Phase 1 voucher draft shape and keep formal posting under human review.

- [ ] **Step 3: Add final acceptance report**

Create `docs/phase-3-acceptance-report.md` with verification evidence, completed commit list, residual Phase 4 dependency statement, and acceptance matrix.

- [ ] **Step 4: Verify and commit**

Run full verification. Commit as `test: add phase 3 end-to-end acceptance evidence`, push to GitHub, and confirm clean `main...origin/main`.

## Verification Gate For Every Slice

- `npm test`
- `npm run lint --workspace apps/web`
- `DATABASE_URL=file:./dev.db npx prisma validate --schema prisma/schema.prisma` from `packages/database`
- `npx tsc -b apps/web/tsconfig.json`
- `npm run build --workspace apps/web`
- `git diff --check`
