import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pages = [
  "../src/pages/Auxiliaries.tsx",
  "../src/pages/OpeningBalances.tsx",
  "../src/pages/VoucherEntry.tsx",
];

test("account selects search by account code and Chinese account name", () => {
  for (const page of pages) {
    const pagePath = fileURLToPath(new URL(page, import.meta.url));
    const source = readFileSync(pagePath, "utf8");

    assert.match(source, /showSearch/);
    assert.match(source, /optionFilterProp="label"/, `${page} should filter account Select options by label`);
    assert.match(source, /label:\s*`\$\{[^}]+\.code\} \$\{[^}]+\.name\}`/);
  }
});
