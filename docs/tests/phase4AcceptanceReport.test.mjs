import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const report = readFileSync(new URL("../phase-4-acceptance-report.md", import.meta.url), "utf8");

test("Phase 4 final acceptance report records payroll, fixed asset, and Phase 3/4 integration evidence", () => {
  assert.match(report, /Phase 4/);
  assert.match(report, /payroll foundation/i);
  assert.match(report, /payroll workflow/i);
  assert.match(report, /fixed asset foundation/i);
  assert.match(report, /depreciation engine/i);
  assert.match(report, /asset disposal/i);
  assert.match(report, /asset count/i);
  assert.match(report, /fixed asset reconciliation/i);
  assert.match(report, /phase4CostPoolIds/);
  assert.match(report, /phase4_payroll_cost_pool/);
  assert.match(report, /phase4_depreciation_cost_pool/);
  assert.doesNotMatch(report, /PHASE4_SOURCE_MISSING/);
  assert.match(report, /cmd \/c npm test/);
  assert.match(report, /npx prisma validate/);
  assert.match(report, /npm run build --workspace apps\/web/);
});
