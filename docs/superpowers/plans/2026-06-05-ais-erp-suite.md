# AIS ERP Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete AIS/ERP system matching the textbook function boundary, with safe AI and Agent-assisted operations.

**Architecture:** Start with a modular monorepo: documentation, domain package, API contract, web app shell, desktop migration shell, and AI worker shell. The first executable unit is the domain package so accounting invariants are testable before UI work.

**Tech Stack:** PostgreSQL, TypeScript/NestJS or Spring Boot for API, React for UI, Python/Node for AI worker, Node built-in test runner for the current skeleton.

---

## File Structure

- `README.md`: repository entry point and current validation command.
- `docs/prd.md`: product requirements.
- `docs/traceability-matrix.md`: textbook chapter to product feature mapping.
- `docs/architecture.md`: module boundaries and data principles.
- `docs/agent-operations.md`: safe Agent operation rules.
- `docs/implementation-roadmap.md`: phase plan.
- `services/api/openapi.yaml`: first API contract.
- `services/ai-worker/README.md`: AI worker responsibilities.
- `apps/web/README.md`: web shell responsibilities.
- `apps/desktop/README.md`: desktop migration responsibilities.
- `packages/domain/src/moduleCatalog.mjs`: canonical module list.
- `packages/domain/src/ledger.mjs`: first accounting invariant.
- `packages/domain/tests/*.test.mjs`: executable skeleton tests.

### Task 1: Lock Requirement Assets

**Files:**
- Create: `docs/prd.md`
- Create: `docs/traceability-matrix.md`
- Create: `docs/architecture.md`
- Create: `docs/agent-operations.md`
- Create: `docs/implementation-roadmap.md`

- [ ] **Step 1: Verify PRD sections exist**

Run:

```powershell
Select-String -LiteralPath docs/prd.md -Pattern "总账","采购与付款","销售与收款","存货","薪资","固定资产","会计报表","AI/API/Agent"
```

Expected: each pattern returns at least one line.

- [ ] **Step 2: Verify all textbook chapters are mapped**

Run:

```powershell
Select-String -LiteralPath docs/traceability-matrix.md -Pattern "第 1 章","第 2 章","第 3 章","第 4 章","第 5 章","第 6 章","第 7 章","第 8 章","第 9 章"
```

Expected: nine chapter lines are returned.

- [ ] **Step 3: Commit**

Run:

```powershell
git add docs README.md
git commit -m "docs: define ais erp requirements"
```

Expected: commit succeeds. If `git` is unavailable, install/enable git and rerun this step.

### Task 2: Establish Domain Package

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/src/moduleCatalog.mjs`
- Create: `packages/domain/src/ledger.mjs`
- Create: `packages/domain/tests/moduleCatalog.test.mjs`
- Create: `packages/domain/tests/ledger.test.mjs`

- [ ] **Step 1: Run tests**

Run:

```powershell
node scripts/run-domain-tests.mjs
```

Expected: all tests pass and include module catalog plus voucher balance checks.

- [ ] **Step 2: Add the first domain rule after this skeleton**

Create a test for fiscal period posting locks before implementing posting:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { canPostToPeriod } from "../src/ledger.mjs";

test("posting is blocked for closed periods", () => {
  assert.equal(canPostToPeriod({ status: "closed" }), false);
  assert.equal(canPostToPeriod({ status: "open" }), true);
});
```

- [ ] **Step 3: Implement the rule**

Add this export to `packages/domain/src/ledger.mjs`:

```javascript
export function canPostToPeriod(period) {
  return period?.status === "open";
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
node scripts/run-domain-tests.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add packages/domain
git commit -m "feat: add accounting domain invariants"
```

Expected: commit succeeds.

### Task 3: Build API Contract

**Files:**
- Create: `services/api/openapi.yaml`

- [ ] **Step 1: Validate endpoint coverage by reading the contract**

Run:

```powershell
Select-String -LiteralPath services/api/openapi.yaml -Pattern "/vouchers","/agent-actions","/close/checklist","/procure-to-pay","/order-to-cash","/inventory"
```

Expected: each endpoint family is present.

- [ ] **Step 2: Harden the OpenAPI contract before implementation**

Add contract details to `services/api/openapi.yaml` before backend or frontend implementation starts:

```text
requestBody for each write endpoint
response schemas for success and error cases
components.schemas for account sets, periods, vouchers, voucher lines, attachments, reports, AgentAction, EvidenceRef, AuditRef, ErrorResponse
Idempotency-Key header on all state-changing endpoints
x-permission, x-risk-level, and x-agent-allowed metadata
dryRun, evidenceRefs, approvalRequired, and idempotencyKey fields for Agent-facing workflows
```

Run:

```powershell
Select-String -LiteralPath services/api/openapi.yaml -Pattern "requestBody","schemas:","Idempotency-Key","x-permission","x-risk-level","ErrorResponse"
```

Expected: each contract-hardening marker is present.

- [ ] **Step 3: Add API implementation after choosing backend stack**

If using NestJS, create modules named:

```text
PlatformModule
GeneralLedgerModule
ProcureToPayModule
OrderToCashModule
InventoryModule
PayrollModule
FixedAssetsModule
ReportingModule
AgentActionsModule
```

Each module must expose service methods that match `services/api/openapi.yaml`.

- [ ] **Step 4: Commit**

Run:

```powershell
git add services/api
git commit -m "docs: add first api contract"
```

Expected: commit succeeds.

### Task 4: Create Web and AI Worker Shells

**Files:**
- Create: `apps/web/README.md`
- Create: `apps/desktop/README.md`
- Create: `services/ai-worker/README.md`

- [ ] **Step 1: Confirm shell responsibilities**

Run:

```powershell
Select-String -LiteralPath apps/web/README.md,apps/desktop/README.md,services/ai-worker/README.md -Pattern "职责","不负责","下一步"
```

Expected: each shell states responsibilities, exclusions, and next steps.

- [ ] **Step 2: Commit**

Run:

```powershell
git add apps services/ai-worker
git commit -m "chore: add app and ai worker shells"
```

Expected: commit succeeds.

### Task 5: Implement Platform and General Ledger MVP

**Files:**
- Create later: `services/api/src/platform/*`
- Create later: `services/api/src/general-ledger/*`
- Create later: `apps/web/src/features/general-ledger/*`

- [ ] **Step 1: Write tests for account sets and periods**

Expected behaviors:

```text
Creating an account set creates an initial open fiscal year.
Posting is allowed only in open periods.
Closing a period is blocked when unposted vouchers exist.
```

- [ ] **Step 2: Write tests for vouchers**

Expected behaviors:

```text
Voucher lines must balance.
Draft vouchers do not affect ledger balances.
Posted vouchers create immutable ledger entries.
Reversal creates a new voucher instead of editing posted entries.
```

- [ ] **Step 3: Implement services and API**

Implement:

```text
POST /account-sets
GET /periods
POST /vouchers
POST /vouchers/{id}/submit
POST /vouchers/{id}/approve
POST /vouchers/{id}/post
POST /vouchers/{id}/reverse
GET /ledger/trial-balance
GET /ledger/detail-ledger
```

- [ ] **Step 4: Run tests and manual ledger scenario**

Scenario:

```text
Create account set.
Create cash and revenue accounts.
Create balanced voucher: Dr cash 100, Cr revenue 100.
Approve and post voucher.
Trial balance total debit equals total credit.
Detail ledger shows source voucher.
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add services/api apps/web packages/domain
git commit -m "feat: implement platform and general ledger mvp"
```

Expected: commit succeeds.

## Self Review

- Spec coverage: the plan starts with all textbook chapters and then moves into executable domain, API, web, desktop, and AI worker shells.
- Placeholder scan: no `TBD` or `TODO` placeholders are used.
- Type consistency: current executable names are `moduleCatalog.mjs`, `ledger.mjs`, `isVoucherBalanced`, and `listRequiredModules`.
