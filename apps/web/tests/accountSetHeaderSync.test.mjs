import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const contextPath = fileURLToPath(new URL("../src/context/AppContext.tsx", import.meta.url));
const accountSetsPath = fileURLToPath(new URL("../src/pages/AccountSets.tsx", import.meta.url));
const vouchersPath = fileURLToPath(new URL("../src/pages/Vouchers.tsx", import.meta.url));

test("header organization follows the selected account set company", () => {
  const appSource = readFileSync(appPath, "utf8");
  const contextSource = readFileSync(contextPath, "utf8");
  const accountSetsSource = readFileSync(accountSetsPath, "utf8");
  const vouchersSource = readFileSync(vouchersPath, "utf8");

  assert.match(contextSource, /organization: localStorage\.getItem\('ais\.currentOrganization'\)/);
  assert.match(contextSource, /currentOrganization: accountSet\.organization/);
  assert.match(contextSource, /localStorage\.setItem\('ais\.currentOrganization', nextOrganization\)/);
  assert.doesNotMatch(contextSource, /currentOrganization: '总部'/);

  assert.match(contextSource, /clearCurrentAccountSet: \(\) => void/);
  assert.match(contextSource, /localStorage\.removeItem\('ais\.currentAccountSetId'\)/);
  assert.match(appSource, /clearCurrentAccountSet/);
  assert.match(appSource, /accountSet\.id === currentAccountSetId/);
  assert.match(appSource, /setCurrentAccountSet\(preferred\.id, preferred\.name, preferred\.companyName\)/);
  assert.match(appSource, /currentAccountSetName !== '未选择账套'/);
  assert.match(appSource, /组织：\{currentOrganization \|\| '未选择组织'\}/);
  assert.match(accountSetsSource, /setCurrentAccountSet\(record\.id, record\.name, record\.companyName\)/);
  assert.match(accountSetsSource, /setCurrentAccountSet\(updated\.id, updated\.name, updated\.companyName\)/);
  assert.match(vouchersSource, /setCurrentAccountSet\(accountSet\.id, accountSet\.name, accountSet\.companyName\)/);
});

test("header period follows the selected current accounting period", () => {
  const appSource = readFileSync(appPath, "utf8");
  const contextSource = readFileSync(contextPath, "utf8");

  assert.match(contextSource, /currentYear: period\.year/);
  assert.match(contextSource, /currentPeriod: period\.period/);
  assert.match(contextSource, /setCurrentPeriod: \(year: number, period: number\) => void/);
  assert.match(contextSource, /useCallback/);
  assert.match(contextSource, /setPeriod\(\(currentPeriod\)/);
  assert.match(contextSource, /currentPeriod\.year === year && currentPeriod\.period === periodNo/);
  assert.match(contextSource, /return currentPeriod/);
  assert.match(contextSource, /localStorage\.setItem\('ais\.currentYear'/);
  assert.match(contextSource, /localStorage\.setItem\('ais\.currentPeriod'/);
  assert.match(appSource, /\.get\(`\/account-sets\/\$\{currentAccountSetId\}\/periods`\)/);
  assert.match(appSource, /period\.isCurrent/);
  assert.match(appSource, /setCurrentPeriod\(currentPeriodRecord\.fiscalYear, currentPeriodRecord\.periodNo\)/);
});
