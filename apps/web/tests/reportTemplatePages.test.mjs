import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/ReportTemplates.tsx", import.meta.url));

test("Phase 5 report template routes are available from the report menu", () => {
  const source = readFileSync(appPath, "utf8");

  assert.match(source, /ReportTemplates/);
  assert.match(source, /UfoReportDesigner/);
  assert.match(source, /to="\/report-templates"/);
  assert.match(source, /to="\/ufo-report-designer"/);
  assert.match(source, /path="\/report-templates"/);
  assert.match(source, /path="\/ufo-report-designer"/);
});

test("Phase 5 report template page wires UFO template CRUD and publish APIs", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /api\.get\(`\/report-templates\?accountSetId=\$\{currentAccountSetId\}`\)/);
  assert.match(source, /api\.post\('\/report-templates'/);
  assert.match(source, /api\.post\(`\/report-templates\/\$\{selectedTemplateId\}\/versions`/);
  assert.match(source, /api\.post\(`\/report-template-versions\/\$\{selectedVersionId\}\/publish`/);
  assert.match(source, /formulaText/);
  assert.match(source, /dependenciesJson/);
  assert.match(source, /displayFormat/);
  assert.match(source, /isEditable/);
  assert.match(source, /BAL\("1001", "2026-06", "debit"\)/);
});
