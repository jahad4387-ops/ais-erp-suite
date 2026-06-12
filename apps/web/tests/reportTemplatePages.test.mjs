import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/ReportTemplates.tsx", import.meta.url));

test("Phase 5 report template routes are available from the report menu", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  assert.match(appSource, /ReportTemplates/);
  assert.match(appSource, /UfoReportDesigner/);
  assert.match(navigationSource, /to: '\/report-templates'/);
  assert.match(navigationSource, /to: '\/ufo-report-designer'/);
  assert.match(appSource, /path="\/report-templates"/);
  assert.match(appSource, /path="\/ufo-report-designer"/);
});

test("Phase 5 report template page wires UFO template CRUD and publish APIs", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /api\.get\(`\/report-templates\?accountSetId=\$\{currentAccountSetId\}`\)/);
  assert.match(source, /api\.post\('\/report-templates'/);
  assert.match(source, /api\.post\('\/report-templates\/statutory-presets'/);
  assert.match(source, /api\.post\(`\/report-templates\/\$\{selectedTemplateId\}\/versions`/);
  assert.match(source, /api\.post\(`\/report-template-versions\/\$\{selectedVersionId\}\/publish`/);
  assert.match(source, /formulaText/);
  assert.match(source, /dependenciesJson/);
  assert.match(source, /displayFormat/);
  assert.match(source, /isEditable/);
  assert.match(source, /BAL\("1001", "2026-06", "debit"\)/);
  assert.match(source, /STAT-BS/);
  assert.match(source, /STAT-IS/);
  assert.match(source, /STAT-CF/);
  assert.match(source, /STAT-OE/);
});

test("Phase 5 UFO designer exposes Excel-like editing panels", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /data-testid="ufo-sheet-tabs"/);
  assert.match(source, /data-testid="ufo-format-toolbar"/);
  assert.match(source, /data-testid="ufo-formula-bar"/);
  assert.match(source, /data-testid="ufo-grid"/);
  assert.match(source, /data-testid="ufo-cell-properties"/);
  assert.match(source, /data-testid="ufo-validation-panel"/);
  assert.match(source, /sheetCode/);
  assert.match(source, /sheetName/);
  assert.match(source, /rowCount/);
  assert.match(source, /columnCount/);
  assert.match(source, /displayFormat/);
  assert.match(source, /isEditable/);
  assert.match(source, /dependenciesJson/);
});
