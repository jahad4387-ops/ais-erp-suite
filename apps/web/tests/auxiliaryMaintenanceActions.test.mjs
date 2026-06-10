import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const auxiliariesPath = fileURLToPath(new URL("../src/pages/Auxiliaries.tsx", import.meta.url));

test("auxiliary accounting page exposes item edit and disable maintenance actions", () => {
  const source = readFileSync(auxiliariesPath, "utf8");

  assert.match(source, /api\.patch\(`\/auxiliary-items\/\$\{[^}]+\.id\}`/);
  assert.match(source, /api\.delete\(`\/auxiliary-items\/\$\{[^}]+\.id\}`/);
  assert.match(source, /data-testid="auxiliary-item-edit"/);
  assert.match(source, /data-testid="auxiliary-item-disable"/);
});
