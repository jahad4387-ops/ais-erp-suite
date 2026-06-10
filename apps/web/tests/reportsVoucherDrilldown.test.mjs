import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const reportsPath = fileURLToPath(new URL("../src/pages/Reports.tsx", import.meta.url));

test("reports page supports voucher drill-through from sub-ledger rows", () => {
  const source = readFileSync(reportsPath, "utf8");

  assert.match(source, /api\.get\(`\/vouchers\/\$\{voucherId\}`\)/);
  assert.match(source, /data-testid="report-voucher-open"/);
  assert.match(source, /凭证详情/);
});

test("reports page displays business voucher numbers instead of internal voucher ids", () => {
  const source = readFileSync(reportsPath, "utf8");

  assert.match(source, /displayVoucherNo/);
  assert.match(source, /vouchersById/);
  assert.match(source, /title=\{`.*displayVoucherNo\(selectedVoucher\)/);
  assert.doesNotMatch(source, />\s*\{voucherId\}\s*<\/Button>/);
});

test("reports page maps voucher creator ids and usernames to display names", () => {
  const source = readFileSync(reportsPath, "utf8");

  assert.match(source, /currentUsername/);
  assert.match(source, /names\.set\(user\.id, name\)/);
  assert.match(source, /names\.set\(user\.username, name\)/);
  assert.match(source, /names\.set\(currentUsername, currentUserName\)/);
});
