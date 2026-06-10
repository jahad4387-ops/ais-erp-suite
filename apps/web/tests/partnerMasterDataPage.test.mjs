import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const partnersPagePath = fileURLToPath(new URL("../src/pages/Partners.tsx", import.meta.url));

test("web app exposes Phase 2 supplier and customer master data pages", () => {
  const appSource = readFileSync(appPath, "utf8");
  const partnersSource = readFileSync(partnersPagePath, "utf8");

  assert.match(appSource, /供应商档案/, "Navigation should expose supplier master data.");
  assert.match(appSource, /客户档案/, "Navigation should expose customer master data.");
  assert.match(appSource, /path="\/suppliers"/, "Supplier route should be stable.");
  assert.match(appSource, /path="\/customers"/, "Customer route should be stable.");
  assert.match(partnersSource, /api\.get\(`\/partners\?/, "Partner page should list records through the Phase 2 API.");
  assert.match(partnersSource, /api\.post\('\/partners'/, "Partner page should create records through the Phase 2 API.");
  assert.match(partnersSource, /creditLimit/, "Partner page should show credit limits.");
  assert.match(partnersSource, /paymentTerms/, "Partner page should show payment terms.");
  assert.match(partnersSource, /settlementMethod/, "Partner page should show settlement method.");
});
