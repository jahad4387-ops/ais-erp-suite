# Phase 2 Partner Master Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Phase 2 executable slice: unified customer/supplier partner master data with payment terms, settlement method, tax rate, credit limit, audit trail, API contract, persistence, and web entry points.

**Architecture:** Follow the Phase 1 modular monolith. Add `Partner` as shared Phase 2 master data under each account set so P2P and O2C can both reference the same counterparty record, including `partnerType = customer | supplier | both`. Keep business validation in the API/domain-facing store boundary and expose the same behavior in memory and Prisma-backed runtime modes.

**Tech Stack:** Node.js ESM, `node:test`, Express-style local API adapter, Prisma SQLite schema, React + TypeScript + Ant Design static regression tests.

---

## File Structure

- `services/api/tests/apiServer.test.mjs`: add API behavior tests for partner create/list/update/status and account-set isolation.
- `packages/database/tests/migration.test.mjs`: assert the Phase 2 migration creates `Partner`.
- `packages/database/tests/platformPersistence.test.mjs`: assert Prisma persistence for partners.
- `apps/web/tests/partnerMasterDataPage.test.mjs`: assert supplier/customer routes and API wiring.
- `packages/database/prisma/schema.prisma`: add `Partner` model and `AccountSet.partners`.
- `packages/database/prisma/migrations/20260610090000_phase2_partner_master_data/migration.sql`: add partner table and indexes.
- `packages/database/src/platformPersistence.mjs`: add partner persistence functions.
- `services/api/src/api.mjs`: add `partner.manage` permission, in-memory partner state, validation, routes, and audit logs.
- `services/api/openapi.yaml`: document `/partners` endpoints and `Partner` schemas.
- `apps/web/src/App.tsx`: add supplier/customer navigation and routes.
- `apps/web/src/pages/Partners.tsx`: add reusable supplier/customer list and maintenance page.

### Task 1: API Contract and Behavior Tests

- [x] **Step 1: Write failing tests**

Add tests showing:
- `POST /partners` creates a supplier or customer under the selected account set.
- `GET /partners?partnerType=supplier` returns suppliers and `both` partners.
- `PATCH /partners/{id}` updates credit/payment fields and can disable a partner.
- Users without the partner's account-set grant cannot see or update it.

- [x] **Step 2: Run tests to verify RED**

Run: `npm test`

Expected: FAIL because `/partners` routes do not exist.

### Task 2: Database Persistence

- [x] **Step 1: Write failing migration and persistence tests**

Assert `Partner` exists in migration SQL and Prisma persistence can create/list/update partners by account set.

- [x] **Step 2: Run tests to verify RED**

Run: `npm test`

Expected: FAIL because schema and persistence functions do not exist.

- [x] **Step 3: Implement schema, migration, and persistence**

Add `Partner` with account-set scoped unique code and fields from Phase 2 plan.

- [x] **Step 4: Run tests to verify GREEN**

Run: `npm test`

Expected: partner database tests pass.

### Task 3: API Implementation and OpenAPI

- [x] **Step 1: Implement minimal partner API**

Add permission `partner.manage`, request validation, account-set authorization, audit logs, and route metadata.

- [x] **Step 2: Document contract**

Add OpenAPI paths for create/list/detail/update and schemas with idempotency/risk/agent metadata on writes.

- [x] **Step 3: Run tests to verify GREEN**

Run: `npm test`

Expected: API and OpenAPI tests pass.

### Task 4: Web Entry Points

- [x] **Step 1: Write failing static page tests**

Assert the app has supplier and customer routes, navigation labels, `/partners` API calls, and a detail drawer/table with credit/payment fields.

- [x] **Step 2: Implement reusable partner page**

Create `Partners.tsx` and route it as `/suppliers` and `/customers`.

- [ ] **Step 3: Run web checks**

Run:
- `npm test`
- `npm run lint --workspace apps/web`
- `npm run build --workspace apps/web`

Expected: tests/lint/build pass; Vite large chunk warning is acceptable.

Status: `npm test`, `npm run lint --workspace apps/web`, Prisma schema validation, and `npx tsc -b apps/web/tsconfig.json` pass. Full `npm run build --workspace apps/web` still hits the known sandbox `spawn EPERM`; elevated rerun was blocked by approval/usage limits.

## Self Review

- Spec coverage: Covers Phase 2 week 1 partner/customer/supplier master data and prepares P2P/O2C references.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Uses `Partner`, `partnerType`, `paymentTerms`, `settlementMethod`, `taxRate`, `creditLimit`, and `isEnabled` consistently.
