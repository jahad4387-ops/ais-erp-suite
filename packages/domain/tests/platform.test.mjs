import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccountSet, generateAccountingPeriods } from "../src/platform.mjs";

test("creating an account set captures Phase 1 opening context", () => {
  const accountSet = createAccountSet({
    code: "001",
    name: "Demo Account Set",
    companyName: "Demo Technology Co., Ltd.",
    baseCurrency: "CNY",
    accountingStandard: "Small Business Accounting Standards",
    startYear: 2026,
    startPeriod: 1,
    createdBy: "admin"
  });

  assert.equal(accountSet.status, "draft");
  assert.equal(accountSet.code, "001");
  assert.equal(accountSet.startYear, 2026);
  assert.equal(accountSet.startPeriod, 1);
});

test("generating accounting periods opens only the starting current period", () => {
  const accountSet = createAccountSet({
    code: "001",
    name: "Demo Account Set",
    companyName: "Demo Technology Co., Ltd.",
    baseCurrency: "CNY",
    accountingStandard: "Small Business Accounting Standards",
    startYear: 2026,
    startPeriod: 1,
    createdBy: "admin"
  });

  const periods = generateAccountingPeriods(accountSet);

  assert.equal(periods.length, 12);
  assert.equal(periods.filter((period) => period.isCurrent).length, 1);
  assert.equal(periods[0].status, "open");
  assert.equal(periods[0].isCurrent, true);
  assert.equal(periods[1].status, "unopened");
});
