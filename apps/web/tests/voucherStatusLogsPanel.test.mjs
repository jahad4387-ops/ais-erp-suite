import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const vouchersPath = fileURLToPath(new URL("../src/pages/Vouchers.tsx", import.meta.url));

test("voucher detail expansion loads formal status logs from the API", () => {
  const source = readFileSync(vouchersPath, "utf8");

  assert.match(source, /api\.get\(`\/vouchers\/\$\{voucherId\}\/status-logs`\)/);
  assert.match(source, /data-testid="voucher-status-logs"/);
  assert.match(source, /VoucherStatusLogs/);
});

test("voucher detail expansion displays the AI draft source chain when present", () => {
  const source = readFileSync(vouchersPath, "utf8");

  assert.match(source, /record\.aiDraftId \?\? record\.id/);
});
