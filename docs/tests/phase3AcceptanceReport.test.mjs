import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const report = readFileSync(new URL("../phase-3-acceptance-report.md", import.meta.url), "utf8");

test("Phase 3 final acceptance report records coverage, verification, and Phase 4 limitation", () => {
  assert.match(report, /Phase 3/);
  assert.match(report, /inventory foundation/i);
  assert.match(report, /movement costing/i);
  assert.match(report, /production workflow/i);
  assert.match(report, /cost allocation/i);
  assert.match(report, /cost voucher/i);
  assert.match(report, /inventory reconciliation/i);
  assert.match(report, /PHASE4_SOURCE_MISSING/);
  assert.match(report, /cmd \/c npm test/);
  assert.match(report, /npx prisma validate/);
  assert.match(report, /npm run build --workspace apps\/web/);
});
