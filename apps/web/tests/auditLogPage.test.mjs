import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const auditLogsPath = fileURLToPath(new URL("../src/pages/AuditLogs.tsx", import.meta.url));

test("web app exposes the Phase 1 audit log page from navigation", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");
  const auditSource = readFileSync(auditLogsPath, "utf8");

  assert.match(appSource, /from '.\/pages\/AuditLogs'/);
  assert.match(navigationSource, /to: '\/audit-logs'/);
  assert.match(appSource, /<Route path="\/audit-logs" element=\{<RequireAuth><AuditLogs \/><\/RequireAuth>\} \/>/);
  assert.match(auditSource, /api\.get\('\/audit-logs'\)/);
  assert.match(auditSource, /data-testid="audit-log-refresh"/);
});
