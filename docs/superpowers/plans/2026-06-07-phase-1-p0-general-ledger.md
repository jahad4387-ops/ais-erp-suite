# Phase 1 P0 General Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first executable Phase 1 P0 domain core for account sets, accounting periods, voucher approval, posting, journal entries, and trial balance.

**Architecture:** Keep this first increment inside `packages/domain` as deterministic pure functions. API, database migrations, and UI can later call these rules without changing the accounting behavior. Tests document the workflow before implementation.

**Tech Stack:** Node.js ESM modules, `node:test`, `node:assert/strict`.

---

## File Structure

- `packages/domain/src/platform.mjs`: account set and accounting period rules.
- `packages/domain/src/generalLedger.mjs`: account, voucher workflow, posting, balance, and trial balance rules.
- `packages/domain/src/ledger.mjs`: existing voucher balance helpers reused by the general ledger service.
- `packages/domain/tests/platform.test.mjs`: platform domain tests.
- `packages/domain/tests/generalLedger.test.mjs`: general ledger workflow tests.
- `scripts/run-domain-tests.mjs`: imports every domain test file.

### Task 1: Platform Period Core

**Files:**
- Create: `packages/domain/tests/platform.test.mjs`
- Create: `packages/domain/src/platform.mjs`
- Modify: `scripts/run-domain-tests.mjs`

- [x] **Step 1: Write the failing test**

Test account set creation and natural-month period generation.

- [x] **Step 2: Run test to verify it fails**

Run: `node scripts/run-domain-tests.mjs`
Observed: FAIL because `packages/domain/src/platform.mjs` did not exist.

- [x] **Step 3: Write minimal implementation**

Implemented `createAccountSet()`, `generateAccountingPeriods()`, and `canPostToPeriod()`.

- [x] **Step 4: Run test to verify it passes**

Run: `node scripts/run-domain-tests.mjs`
Observed: all tests pass.

### Task 2: Voucher Workflow and Posting Core

**Files:**
- Create: `packages/domain/tests/generalLedger.test.mjs`
- Create: `packages/domain/src/generalLedger.mjs`
- Modify: `scripts/run-domain-tests.mjs`

- [x] **Step 1: Write the failing tests**

Covered these behaviors:

```text
Draft vouchers can be submitted only when balanced and inside an open period.
The voucher creator cannot approve their own voucher.
Approved vouchers post once into journal entries and account period balances.
Trial balance totals remain balanced after posting.
```

- [x] **Step 2: Run tests to verify they fail**

Run: `node scripts/run-domain-tests.mjs`
Observed: FAIL because Phase 1 domain modules did not exist.

- [x] **Step 3: Write minimal implementation**

Implemented:

```text
createAccount
createVoucher
submitVoucher
approveVoucher
postVoucher
buildTrialBalance
```

- [x] **Step 4: Run tests to verify they pass**

Run: `node scripts/run-domain-tests.mjs`
Observed: 10 tests pass.

## Self Review

- Spec coverage: This plan starts the Phase 1 P0 path for account sets, periods, vouchers, approval separation, posting, journal entries, balances, and trial balance.
- Placeholder scan: No task relies on `TBD` or an unspecified behavior.
- Type consistency: Test function names match the implemented exported function names.
