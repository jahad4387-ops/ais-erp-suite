import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/PostingBatches.tsx", import.meta.url));

test("posting batch results page is reachable from general-ledger navigation", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  assert.match(appSource, /import \{ PostingBatches \} from '\.\/pages\/PostingBatches';/);
  assert.match(navigationSource, /to: '\/posting\/batches'/);
  assert.match(appSource, /<Route path="\/posting\/batches" element=\{<RequireAuth><PostingBatches \/><\/RequireAuth>\} \/>/);
});

test("posting batch results page lists batches and loads batch detail", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /api\.get\('\/posting\/batches'\)/);
  assert.match(source, /api\.get\(`\/posting\/batches\/\$\{[^}]+\.id\}`\)/);
  assert.match(source, /data-testid="posting-batch-results"/);
  assert.match(source, /data-testid="posting-batch-detail"/);
});
