import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/AccountCodeRules.tsx", import.meta.url));

test("account code rules page is reachable from master data navigation", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  assert.match(appSource, /import \{ AccountCodeRules \} from '\.\/pages\/AccountCodeRules';/);
  assert.match(navigationSource, /to: '\/account-code-rules'/);
  assert.match(appSource, /<Route path="\/account-code-rules" element=\{<RequireAuth><AccountCodeRules \/><\/RequireAuth>\} \/>/);
});

test("account code rules page saves planned segment-based rules", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /api\.post\('\/account-code-rules'/);
  assert.match(source, /segments:\s*parseSegments/);
  assert.match(source, /data-testid="account-code-rule-save"/);
  assert.match(source, /4-2-2-2/);
});

test("account code rule preview is an informational result, not a clickable icon", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /title="编码规则预览"/);
  assert.match(source, /description=\{/);
  assert.match(source, /允许的编码长度/);
  assert.match(source, /仅用于预览/);
});
