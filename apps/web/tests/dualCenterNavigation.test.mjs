import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));

test("web app centralizes dual-center navigation for finance and supply chain manufacturing", () => {
  assert.equal(existsSync(navigationPath), true, "Navigation configuration should live in src/navigation.tsx.");

  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  assert.match(appSource, /buildMainMenuItems/, "App should build its menu from the centralized navigation config.");
  assert.match(navigationSource, /财务管理中心/, "Navigation should expose the finance management center.");
  assert.match(navigationSource, /供应链制造中心/, "Navigation should expose the supply chain manufacturing center.");

  for (const label of [
    "财务工作台",
    "基础设置",
    "凭证管理",
    "总账管理",
    "应收管理",
    "应付管理",
    "出纳与银行",
    "成本与存货核算",
    "固定资产",
    "薪资核算",
    "财务报表",
    "期末处理",
    "财务审计",
  ]) {
    assert.match(navigationSource, new RegExp(label), `Finance center should include ${label}.`);
  }

  for (const label of [
    "生产工作台",
    "订单管理",
    "APS管理",
    "采购管理",
    "库存管理",
    "生产管理",
    "产品管理",
    "设备管理",
    "委外管理",
    "追溯规则",
    "线边仓管理",
    "统计报表",
    "Agent任务队列",
  ]) {
    assert.match(navigationSource, new RegExp(label), `Supply chain center should include ${label}.`);
  }
});

test("dual-center navigation keeps legacy route compatibility during phase 1", () => {
  assert.equal(existsSync(navigationPath), true, "Navigation configuration should exist before checking routes.");

  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  for (const route of [
    "/purchase-orders",
    "/sales-orders",
    "/purchase-receipts",
    "/sales-deliveries",
    "/inventory-items",
    "/boms",
    "/warehouses",
    "/inventory-movements",
    "/work-orders",
    "/material-requisitions",
    "/product-receipts",
    "/cost-allocations",
    "/cost-voucher-drafts",
    "/inventory-reconciliation",
  ]) {
    const routePattern = new RegExp(`path="${route.replace(/\//g, "\\/")}"`);
    assert.match(appSource, routePattern, `${route} should remain as a stable legacy route.`);
    assert.match(navigationSource, new RegExp(`to: '${route}'`), `${route} should remain reachable from navigation.`);
  }
});
