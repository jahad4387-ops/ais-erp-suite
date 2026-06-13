import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const report = readFileSync(new URL("../phase-6-acceptance-report.md", import.meta.url), "utf8");

test("Phase 6 acceptance report records Agent workflow and production hardening evidence", () => {
  assert.match(report, /Phase 6/);
  assert.match(report, /Agent Gateway/i);
  assert.match(report, /Tool Registry/i);
  assert.match(report, /LLM Draft Adapter/i);
  assert.match(report, /local OCR/i);
  assert.match(report, /openai-compatible/i);
  assert.match(report, /matchedMasterData/);
  assert.match(report, /unmatchedItems/);
  assert.match(report, /evidenceSnapshots/);
  assert.match(report, /evidence_verification_failed/);
  assert.match(report, /security_events/);
  assert.match(report, /restore-drill/i);
  assert.match(report, /migration_jobs/);
  assert.match(report, /backup_jobs/);
  assert.match(report, /restore_jobs/);
  assert.match(report, /agent_replay_events/);
  assert.match(report, /cmd \/c node --test services\/api\/tests\/apiServer\.test\.mjs/);
  assert.match(report, /cmd \/c node --test apps\/web\/tests\/\*\.test\.mjs/);
  assert.match(report, /cmd \/c npm run build --workspace apps\/web/);
  assert.match(report, /cmd \/c git diff --check/);
  assert.doesNotMatch(report, /PHASE6_ACCEPTANCE_TODO/);
});
