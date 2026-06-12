import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`../src/pages/${name}.tsx`, import.meta.url), "utf8");

test("inventory, payroll, and fixed asset pages use Chinese operational labels", () => {
  const inventoryItems = page("InventoryItems");
  const warehouses = page("Warehouses");
  const payrollSetup = page("PayrollSetup");
  const payrollRuns = page("PayrollRuns");
  const fixedAssetSetup = page("FixedAssetSetup");
  const fixedAssets = page("FixedAssets");

  assert.match(inventoryItems, /存货档案/);
  assert.match(inventoryItems, /刷新/);
  assert.match(inventoryItems, /新增/);
  assert.match(warehouses, /仓库档案/);
  assert.match(payrollSetup, /薪资基础设置/);
  assert.match(payrollRuns, /薪资计算/);
  assert.match(fixedAssetSetup, /固定资产基础设置/);
  assert.match(fixedAssets, /固定资产卡片/);

  for (const source of [inventoryItems, warehouses, payrollSetup, payrollRuns, fixedAssetSetup, fixedAssets]) {
    assert.doesNotMatch(source, />Refresh</);
    assert.doesNotMatch(source, />New</);
    assert.doesNotMatch(source, />Add</);
    assert.doesNotMatch(source, /placeholder="Code"/);
    assert.doesNotMatch(source, /placeholder="Name"/);
  }
});

test("report pages and report menu use Chinese operational labels", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const reportTemplates = page("ReportTemplates");
  const reportRuns = page("ReportRuns");
  const reportApprovals = page("ReportApprovals");
  const reportExportCenter = page("ReportExportCenter");
  const managementAnalysis = page("ManagementAnalysis");

  assert.match(app, /报表模板/);
  assert.match(app, /UFO 报表设计/);
  assert.match(app, /报表计算/);
  assert.match(app, /报表审批/);
  assert.match(app, /导出中心/);
  assert.match(app, /经营分析/);
  assert.match(reportTemplates, /报表模板/);
  assert.match(reportTemplates, /单元格属性/);
  assert.match(reportRuns, /报表计算/);
  assert.match(reportApprovals, /报表审批/);
  assert.match(reportExportCenter, /报表导出中心/);
  assert.match(managementAnalysis, /经营分析/);

  for (const source of [app, reportTemplates, reportRuns, reportApprovals, reportExportCenter, managementAnalysis]) {
    assert.doesNotMatch(source, /Report Templates/);
    assert.doesNotMatch(source, /Report Runs/);
    assert.doesNotMatch(source, /Report Approvals/);
    assert.doesNotMatch(source, /Export Center/);
    assert.doesNotMatch(source, /Management Analysis/);
    assert.doesNotMatch(source, />Refresh</);
    assert.doesNotMatch(source, />Add</);
  }
});
