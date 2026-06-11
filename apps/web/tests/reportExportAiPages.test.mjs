import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/ReportExportCenter.tsx", import.meta.url));

test("Phase 5 report export and AI interpretation route is available from the report menu", () => {
  const source = readFileSync(appPath, "utf8");

  assert.match(source, /ReportExportCenter/);
  assert.match(source, /to="\/report-export-center"/);
  assert.match(source, /path="\/report-export-center"/);
});

test("Phase 5 report export center wires export history and AI interpretation APIs", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /api\.get\(`\/report-exports\?accountSetId=\$\{currentAccountSetId\}`\)/);
  assert.match(source, /api\.post\(`\/report-runs\/\$\{values\.reportRunId\}\/exports`/);
  assert.match(source, /api\.post\(`\/report-runs\/\$\{values\.reportRunId\}\/interpretations`/);
  assert.match(source, /api\.get\(`\/ai-report-interpretations\?reportRunId=\$\{values\.reportRunId\}`\)/);
  assert.doesNotMatch(source, /api\.post\(`\/report-runs\/\$\{reportRunId\}\/exports`/);
  assert.match(source, /keyFindings/);
  assert.match(source, /warnings/);
  assert.match(source, /evidenceRefs/);
  assert.match(source, /sensitiveFieldNotice/);
});
