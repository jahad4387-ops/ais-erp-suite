import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/ReceiptWorkbench.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");
const pageSource = readFileSync(pagePath, "utf8");

test("receipt workbench exposes customer receipts, prepayments, credit exposure, and collection plans", () => {
  assert.match(appSource, /path="\/customer-receipts"/, "Receipt workbench route should be stable.");
  assert.match(appSource, /to="\/customer-receipts"/, "Receipt workbench should be reachable from navigation.");
  assert.match(pageSource, /api\.get\(`\/counterparty-ledger\?accountSetId=\$\{currentAccountSetId\}&direction=ar/, "Workbench should load open AR entries.");
  assert.match(pageSource, /api\.get\(`\/collection-plans\?accountSetId=\$\{currentAccountSetId\}/, "Workbench should load collection plans.");
  assert.match(pageSource, /api\.get\(`\/credit-exposures\?accountSetId=\$\{currentAccountSetId\}/, "Workbench should load credit exposure.");
  assert.match(pageSource, /api\.get\(`\/ar-settlements\?accountSetId=\$\{currentAccountSetId\}/, "Workbench should load AR settlements.");
  assert.match(pageSource, /api\.post\('\/customer-receipts'/, "Workbench should create customer receipts.");
  assert.match(pageSource, /api\.post\('\/ar-settlements'/, "Workbench should create AR settlements.");
  assert.match(pageSource, /receiptType/, "Workbench should distinguish receipts and prepayments.");
  assert.match(pageSource, /ar_ap_netting/, "Workbench should expose AR/AP netting.");
  assert.match(pageSource, /voucherDraft/, "Workbench should expose voucher draft previews.");
  assert.match(pageSource, /availableCredit/, "Workbench should show available credit.");
});
