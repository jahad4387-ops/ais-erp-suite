import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/VoucherReview.tsx", import.meta.url));

test("voucher review workbench is reachable from general-ledger navigation", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  assert.match(appSource, /import \{ VoucherReview \} from '\.\/pages\/VoucherReview';/);
  assert.match(navigationSource, /to: '\/vouchers\/review'/);
  assert.match(appSource, /<Route path="\/vouchers\/review" element=\{<RequireAuth><VoucherReview \/><\/RequireAuth>\} \/>/);
});

test("voucher review workbench supports planned filters and batch actions", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /api\.get\('\/vouchers'\)/);
  assert.match(source, /api\.post\(`\/vouchers\/\$\{voucherId\}\/approve`/);
  assert.match(source, /api\.post\(`\/vouchers\/\$\{voucherId\}\/reject`/);
  assert.match(source, /data-testid="voucher-review-batch-approve"/);
  assert.match(source, /data-testid="voucher-review-batch-reject"/);
  assert.match(source, /periodFilter/);
  assert.match(source, /statusFilter/);
  assert.match(source, /makerFilter/);
  assert.match(source, /accountFilter/);
  assert.match(source, /reviewActionInFlightRef/);
  assert.match(source, /reviewActionLoading/);
  assert.match(source, /await fetchVouchers\(\)/);
  assert.match(source, /requestId !== fetchSequenceRef\.current/);
});

test("voucher review workbench hides batch review actions for non-open periods", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /api\.get\(currentAccountSetId \?/);
  assert.match(source, /periodsByKey/);
  assert.match(source, /isVoucherPeriodOpen/);
  assert.match(source, /disabled: !canReviewVoucher\(record\)/);
});

test("voucher review workbench prevents users from reviewing their own vouchers", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /canReviewVoucher/);
  assert.match(source, /voucher\.createdBy !== currentUser/);
  assert.match(source, /vouchers\.some\(\(voucher\) => voucher\.id === voucherId && canReviewVoucher\(voucher\)\)/);
});

test("voucher review workbench displays business voucher numbers and maker names", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /displayVoucherNo\(record\)/);
  assert.match(source, /api\.get\('\/users'\)\.catch/);
  assert.match(source, /displayActorName/);
});
