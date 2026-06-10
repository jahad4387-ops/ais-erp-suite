import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const vouchersPath = fileURLToPath(new URL("../src/pages/Vouchers.tsx", import.meta.url));
const entryPath = fileURLToPath(new URL("../src/pages/VoucherEntry.tsx", import.meta.url));

test("draft vouchers can navigate back to voucher entry for editing", () => {
  const appSource = readFileSync(appPath, "utf8");
  const vouchersSource = readFileSync(vouchersPath, "utf8");
  const entrySource = readFileSync(entryPath, "utf8");

  assert.match(appSource, /path="\/vouchers\/:voucherId\/edit"/);
  assert.match(vouchersSource, /to=\{`\/vouchers\/\$\{record\.id\}\/edit`\}/);
  assert.match(entrySource, /useParams/);
  assert.match(entrySource, /api\.get\(`\/vouchers\/\$\{voucherId\}`\)/);
  assert.match(entrySource, /api\.patch\(`\/vouchers\/\$\{voucherId\}`/);
});

test("voucher entry submits auxiliary accounting values on voucher lines", () => {
  const source = readFileSync(entryPath, "utf8");

  assert.match(source, /api\.get\('\/auxiliary-items'\)/);
  assert.match(source, /name=\{\[name,\s*'auxiliaries',\s*auxiliaryCode\]\}/);
  assert.match(source, /auxiliaries:\s*l\.auxiliaries\s*\?\?\s*\{\}/);
});
