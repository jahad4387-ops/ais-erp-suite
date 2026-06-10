import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const reportPath = fileURLToPath(new URL("../phase-2-acceptance-report.md", import.meta.url));

test("Phase 2 final acceptance report records end-to-end coverage and verification evidence", () => {
  assert.equal(existsSync(reportPath), true, "Phase 2 acceptance report must exist.");

  const report = readFileSync(reportPath, "utf8");
  const requiredEvidence = [
    "Phase 2 Acceptance Report",
    "Last updated: 2026-06-10",
    "Week 1",
    "Week 12",
    "P2P",
    "O2C",
    "source traceability",
    "voucher traceability",
    "provisional variance",
    "credit note",
    "AR/AP Netting",
    "payment freeze",
    "counterparty ledger",
    "GL auxiliary",
    "Agent dry-run",
    "cannot directly post",
    "Verification Evidence",
    "`npm test`",
    "`npm run lint --workspace apps/web`",
    "`npx tsc -b apps/web/tsconfig.json`",
    "`npm run build --workspace apps/web`",
    "0de0782",
    "7615368"
  ];

  for (const evidence of requiredEvidence) {
    assert.match(report, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${evidence} must be recorded.`);
  }
});
