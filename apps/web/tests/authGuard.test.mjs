import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const contextPath = fileURLToPath(new URL("../src/context/AppContext.tsx", import.meta.url));
const apiPath = fileURLToPath(new URL("../src/api.ts", import.meta.url));

test("business pages require an authenticated session", () => {
  const appSource = readFileSync(appPath, "utf8");
  const contextSource = readFileSync(contextPath, "utf8");
  const apiSource = readFileSync(apiPath, "utf8");

  assert.match(contextSource, /isAuthenticated: boolean/);
  assert.match(contextSource, /authStorage\.hasSession\(\)/);
  assert.match(contextSource, /setUser\(null\)/);
  assert.doesNotMatch(contextSource, /setUser\(\{ id: 'system'/);
  assert.doesNotMatch(contextSource, /role: localStorage\.getItem\('ais\.currentUserRole'\) \?\? '系统管理员'/);

  assert.match(appSource, /RequireAuth/);
  assert.match(appSource, /<Navigate to="\/login" replace state=\{\{ from: location \}\}/);
  assert.match(appSource, /if \(!isAuthenticated\) \{\s*return;/);
  assert.match(appSource, /\.get\('\/account-sets'\)/);
  assert.match(appSource, /clearCurrentAccountSet\(\)/);
  assert.match(appSource, /isAuthenticated && \(/);
  assert.match(appSource, /onClick=\{handleLogout\}/);
  assert.doesNotMatch(appSource, /currentUser !== 'system'/);

  assert.match(apiSource, /hasSession\(\)/);
  assert.match(apiSource, /localStorage\.getItem\(USER_KEY\) \?\? ''/);
  assert.doesNotMatch(apiSource, /localStorage\.getItem\(USER_KEY\) \?\? 'system'/);
});
