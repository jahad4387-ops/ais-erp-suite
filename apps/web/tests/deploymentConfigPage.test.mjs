import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/DeploymentConfig.tsx", import.meta.url));

test("deployment config page is reachable from platform management navigation", () => {
  const source = readFileSync(appPath, "utf8");

  assert.match(source, /import \{ DeploymentConfig \} from '\.\/pages\/DeploymentConfig';/);
  assert.match(source, /to="\/deployment-config"/);
  assert.match(source, /<Route path="\/deployment-config" element=\{<RequireAuth><DeploymentConfig \/><\/RequireAuth>\} \/>/);
});

test("deployment config page checks database and attachment storage settings", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /api\.get\('\/deployment\/config'\)/);
  assert.match(source, /data-testid="deployment-config-check"/);
  assert.match(source, /database/);
  assert.match(source, /jwt/);
  assert.match(source, /attachmentStorage/);
  assert.match(source, /AIS_JWT_ROTATION_APPROVED_BY/);
  assert.match(source, /AIS_JWT_ROTATION_EXPIRES_AT/);
  assert.match(source, /AIS_JWT_ROTATION_MONITOR_REF/);
  assert.match(source, /AIS_JWT_ROTATION_ROLLBACK_REF/);
  assert.match(source, /AIS_ATTACHMENT_STORAGE_PROVIDER/);
  assert.match(source, /AIS_ATTACHMENT_EXTERNAL_ENDPOINT/);
  assert.match(source, /AIS_ATTACHMENT_EXTERNAL_BUCKET/);
  assert.match(source, /AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF/);
  assert.match(source, /AIS_ATTACHMENT_RETENTION_DAYS/);
});
