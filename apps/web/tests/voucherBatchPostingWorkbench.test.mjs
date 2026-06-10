import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const vouchersPath = fileURLToPath(new URL("../src/pages/Vouchers.tsx", import.meta.url));

test("voucher management page exposes batch posting workbench controls", () => {
  const source = readFileSync(vouchersPath, "utf8");

  assert.match(source, /api\.post\('\/posting\/post-batch'/);
  assert.match(source, /data-testid="voucher-batch-post"/);
  assert.match(source, /rowSelection=/);
  assert.match(source, /getCheckboxProps/);
});

test("voucher management hides formal write actions for non-open periods", () => {
  const source = readFileSync(vouchersPath, "utf8");

  assert.match(source, /api\.get\(currentAccountSetId \?/);
  assert.match(source, /periodsByKey/);
  assert.match(source, /isVoucherPeriodOpen/);
  assert.match(source, /record\.status !== 'approved' \|\| !isVoucherPeriodOpen\(record\)/);
  assert.match(source, /if \(!isVoucherPeriodOpen\(record\)\) \{/);
});

test("voucher management only shows vouchers for the selected account set", () => {
  const source = readFileSync(vouchersPath, "utf8");

  assert.match(source, /voucher\.accountSetId === currentAccountSetId/);
});

test("voucher management does not expose approval or rejection actions", () => {
  const source = readFileSync(vouchersPath, "utf8");

  assert.doesNotMatch(source, /key: 'approve'/);
  assert.doesNotMatch(source, /key: 'reject'/);
  assert.doesNotMatch(source, /action === 'approve'/);
  assert.doesNotMatch(source, /action === 'reject'/);
});

test("voucher management displays voucher numbers and maker names for users", () => {
  const source = readFileSync(vouchersPath, "utf8");

  assert.match(source, /displayVoucherNo\(record\)/);
  assert.match(source, /api\.get\('\/users'\)\.catch/);
  assert.match(source, /displayActorName/);
});

test("voucher row actions refresh state and guard against duplicate clicks", () => {
  const source = readFileSync(vouchersPath, "utf8");

  assert.match(source, /actionLoadingKey/);
  assert.match(source, /actionInFlightRef/);
  assert.match(source, /fetchSequenceRef/);
  assert.match(source, /requestId !== fetchSequenceRef\.current/);
  assert.match(source, /voucherActionAllowed/);
  assert.match(source, /handleVoucherAction/);
  assert.match(source, /voucherFromActionResult/);
  assert.match(source, /await fetchVouchers\(\)/);
  assert.match(source, /current\.some\(\(item\) => item\.id === updatedVoucher\.id\)/);
  assert.match(source, /\[updatedVoucher, \.\.\.current\]/);
  assert.match(source, /payload\.submittedBy = currentUser/);
  assert.match(source, /payload\.postedBy = currentUser/);
});
