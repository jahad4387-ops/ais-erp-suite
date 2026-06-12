import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/PaymentWorkbench.tsx", import.meta.url));

const appSource = readFileSync(appPath, "utf8");
const navigationSource = readFileSync(navigationPath, "utf8");
const pageSource = readFileSync(pagePath, "utf8");

test("payment workbench exposes payment request approval, payment order, and freeze controls", () => {
  assert.match(appSource, /path="\/payment-requests"/, "Payment workbench route should be stable.");
  assert.match(navigationSource, /to: '\/payment-requests'/, "Payment workbench should be reachable from navigation.");
  assert.match(pageSource, /api\.get\(`\/counterparty-ledger\?accountSetId=\$\{currentAccountSetId\}&direction=ap/, "Workbench should load open AP entries.");
  assert.match(pageSource, /api\.post\('\/payment-requests'/, "Workbench should create payment requests.");
  assert.match(pageSource, /api\.post\(`\/payment-requests\/\$\{/, "Workbench should approve payment requests.");
  assert.match(pageSource, /api\.post\('\/supplier-payments'/, "Workbench should create supplier payment orders.");
  assert.match(pageSource, /block-payment/, "Workbench should expose freeze payment control.");
  assert.match(pageSource, /isPaymentBlocked/, "Workbench should show frozen payable entries.");
  assert.match(pageSource, /paymentBlockReason/, "Workbench should show freeze reason.");
});
