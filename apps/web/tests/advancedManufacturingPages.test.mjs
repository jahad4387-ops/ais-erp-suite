import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));

const pages = [
  ["ProductionPlans", "/production-plans", "/production-plans"],
  ["ReworkOrders", "/rework-orders", "/rework-orders"],
  ["OutsourcingOrders", "/outsourcing-orders", "/outsourcing-orders"],
  ["Traceability", "/traceability", "/trace-rules"],
  ["LineSideWarehouses", "/line-side-warehouses", "/line-side-warehouses"]
];

test("Phase 5 advanced manufacturing pages are routed from supply chain manufacturing navigation", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  for (const [componentName, routePath] of pages) {
    const pagePath = fileURLToPath(new URL(`../src/pages/${componentName}.tsx`, import.meta.url));
    assert.equal(existsSync(pagePath), true, `${componentName} page should exist.`);
    assert.match(appSource, new RegExp(`import \\{ ${componentName} \\} from '\\./pages/${componentName}';`));
    assert.match(appSource, new RegExp(`path="${routePath}"`));
  }

  assert.match(navigationSource, /label: 'APS管理'[^}]+to: '\/production-plans'/s);
  assert.match(navigationSource, /label: '返工计划'[^}]+to: '\/rework-orders'/s);
  assert.match(navigationSource, /label: '委外管理'[^}]+to: '\/outsourcing-orders'/s);
  assert.match(navigationSource, /label: '追溯规则'[^}]+to: '\/traceability'/s);
  assert.match(navigationSource, /label: '线边仓管理'[^}]+to: '\/line-side-warehouses'/s);
});

test("Phase 5 advanced manufacturing pages wire their API collections", () => {
  for (const [componentName, _routePath, apiPath] of pages) {
    const pagePath = fileURLToPath(new URL(`../src/pages/${componentName}.tsx`, import.meta.url));
    const source = readFileSync(pagePath, "utf8");
    assert.ok(source.includes(`api.get(\`${apiPath}?accountSetId=`));
    assert.match(source, /currentAccountSetId/);
    assert.match(source, /Table/);
  }

  const planSource = readFileSync(fileURLToPath(new URL("../src/pages/ProductionPlans.tsx", import.meta.url)), "utf8");
  assert.match(planSource, /generate-work-orders/);
  const traceSource = readFileSync(fileURLToPath(new URL("../src/pages/Traceability.tsx", import.meta.url)), "utf8");
  assert.match(traceSource, /\/traceability\/query/);
  const lineSideSource = readFileSync(fileURLToPath(new URL("../src/pages/LineSideWarehouses.tsx", import.meta.url)), "utf8");
  assert.match(lineSideSource, /\/line-side-material-movements/);
});

test("Phase 5 advanced manufacturing pages expose contextual Agent entry points", () => {
  const expectations = [
    ["ProductionPlans", "production_plan", "production_plan_page"],
    ["ReworkOrders", "rework_order", "rework_order_page"],
    ["OutsourcingOrders", "outsourcing_order", "outsourcing_order_page"],
    ["Traceability", "traceability_report", "traceability_page"],
    ["LineSideWarehouses", "line_side_replenishment", "line_side_warehouse_page"]
  ];

  for (const [componentName, draftType, sourceObjectType] of expectations) {
    const pagePath = fileURLToPath(new URL(`../src/pages/${componentName}.tsx`, import.meta.url));
    const source = readFileSync(pagePath, "utf8");
    assert.match(source, /AgentDraftEntryButton/, `${componentName} should expose an Agent entry.`);
    assert.match(source, new RegExp(`draftType="${draftType}"`), `${componentName} should pass ${draftType}.`);
    assert.match(source, new RegExp(`sourceObjectType="${sourceObjectType}"`), `${componentName} should pass ${sourceObjectType}.`);
  }
});
