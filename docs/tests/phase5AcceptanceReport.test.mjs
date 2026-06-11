import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const report = readFileSync(new URL("../phase-5-acceptance-report.md", import.meta.url), "utf8");

test("Phase 5 final acceptance report records reporting, snapshot, AI, and permission evidence", () => {
  assert.match(report, /Phase 5/);
  assert.match(report, /UFO-style report templates/i);
  assert.match(report, /Statutory presets/i);
  assert.match(report, /snapshotHash/);
  assert.match(report, /calculatedValue/);
  assert.match(report, /displayFormat/);
  assert.match(report, /report_cell/);
  assert.match(report, /includeUnposted/);
  assert.match(report, /unposted voucher drafts/i);
  assert.match(report, /Closed accounting periods/i);
  assert.match(report, /locked or archived report runs/i);
  assert.match(report, /REPORT_CASH_FLOW_UNASSIGNED/);
  assert.match(report, /contentText/);
  assert.match(report, /AI report interpretations/i);
  assert.match(report, /Management analysis/i);
  assert.match(report, /account-set scoped visibility/i);
  assert.match(report, /cmd \/c npm test/);
  assert.match(report, /git diff --check/);
  assert.doesNotMatch(report, /PHASE5_ACCEPTANCE_TODO/);
});
