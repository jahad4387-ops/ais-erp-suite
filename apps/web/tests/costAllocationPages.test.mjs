import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const inputsPath = fileURLToPath(new URL("../src/pages/MockCostInputs.tsx", import.meta.url));
const allocationsPath = fileURLToPath(new URL("../src/pages/CostAllocations.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");
const inputsSource = readFileSync(inputsPath, "utf8");
const allocationsSource = readFileSync(allocationsPath, "utf8");

test("web app exposes Phase 3 mock cost input and allocation pages", () => {
  assert.match(appSource, /path="\/mock-cost-inputs"/, "Mock cost input route should be stable.");
  assert.match(appSource, /path="\/cost-allocations"/, "Cost allocation route should be stable.");
  assert.match(appSource, /to="\/mock-cost-inputs"/, "Mock cost inputs should be reachable from navigation.");
  assert.match(appSource, /to="\/cost-allocations"/, "Cost allocations should be reachable from navigation.");
  assert.match(inputsSource, /api\.get\(`\/mock-cost-inputs\?/, "Mock cost input page should list inputs.");
  assert.match(inputsSource, /api\.post\('\/mock-cost-inputs'/, "Mock cost input page should create inputs.");
  assert.match(inputsSource, /\/mock-cost-inputs\/\$\{[^}]+\.id\}\/lock/, "Mock cost input page should lock inputs.");
  assert.match(allocationsSource, /api\.post\('\/cost-allocations\/dry-run'/, "Allocation page should dry-run.");
  assert.match(allocationsSource, /api\.post\('\/cost-allocations'/, "Allocation page should commit.");
  assert.match(allocationsSource, /PHASE4_SOURCE_MISSING/, "Allocation page should surface Phase 4 limitation warnings.");
});
