import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const accountsPath = fileURLToPath(new URL("../src/pages/Accounts.tsx", import.meta.url));

test("chart of accounts page supports import preview before importing rows", () => {
  const source = readFileSync(accountsPath, "utf8");

  assert.match(source, /data-testid="account-import-preview"/);
  assert.match(source, /data-testid="account-import-confirm"/);
  assert.match(source, /importPreviewRows/);
  assert.match(source, /parseImportRows/);
  assert.match(source, /api\.post\('\/accounts\/import'/);
});

test("chart of accounts page supports selectable standard account templates", () => {
  const source = readFileSync(accountsPath, "utf8");

  assert.match(source, /standardAccountTemplates/);
  assert.match(source, /standardImportOpen/);
  assert.match(source, /selectedStandardAccountCodes/);
  assert.match(source, /data-testid="standard-account-import-confirm"/);
  assert.match(source, /小企业会计准则常用科目/);
  assert.doesNotMatch(source, /rows:\s*\[\s*\{\s*code:\s*'1002'/);
});
