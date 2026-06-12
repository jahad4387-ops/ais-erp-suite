import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const report = readFileSync(new URL("../phase-7-acceptance-report.md", import.meta.url), "utf8");

test("Phase 7 acceptance report records supply-chain manufacturing rollout gates", () => {
  assert.match(report, /Phase 7/);
  assert.match(report, /End-to-end acceptance/i);
  assert.match(report, /sales order -> shortage analysis -> purchase suggestions -> purchase receipt -> AP suggestion/i);
  assert.match(report, /production plan -> work order -> material requisition -> product receipt -> cost allocation -> cost voucher draft/i);
  assert.match(report, /stock count variance -> adjustment suggestion -> approval -> inventory adjustment -> finance voucher draft/i);
  assert.match(report, /batch exception -> traceability report -> impact scope/i);
  assert.match(report, /period close -> supply-chain close check -> financial close block/i);
  assert.match(report, /finance users cannot execute supply-chain high-risk actions/i);
  assert.match(report, /warehouse users cannot post accounting vouchers/i);
  assert.match(report, /Agent cannot exceed the actor's permissions/i);
  assert.match(report, /high-risk Agent actions require approval before execution/i);
  assert.match(report, /audit evidence/i);
  assert.match(report, /dashboard and workbench APIs/i);
  assert.match(report, /inventory queries use pagination and filters/i);
  assert.match(report, /Agent task queue supports pagination and filters/i);
  assert.match(report, /README\.md/);
  assert.match(report, /\.env\.example/);
  assert.match(report, /OpenAPI/);
  assert.match(report, /npm test/);
  assert.match(report, /npm run build:web/);
  assert.match(report, /git diff --check/);
  assert.doesNotMatch(report, /PHASE7_ACCEPTANCE_TODO/);
});
