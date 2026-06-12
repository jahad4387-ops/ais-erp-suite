import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/DeploymentConfig.tsx", import.meta.url));

test("deployment config page is reachable from platform management navigation", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  assert.match(appSource, /import \{ DeploymentConfig \} from '\.\/pages\/DeploymentConfig';/);
  assert.match(navigationSource, /to: '\/deployment-config'/);
  assert.match(appSource, /<Route path="\/deployment-config" element=\{<RequireAuth><DeploymentConfig \/><\/RequireAuth>\} \/>/);
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
  assert.match(source, /ai/);
  assert.match(source, /llmDraft/);
  assert.match(source, /AIS_OCR_PROVIDER/);
  assert.match(source, /AIS_OCR_MODEL/);
  assert.match(source, /AIS_OCR_COMMAND/);
  assert.match(source, /AIS_OCR_COMMAND_ARGS/);
  assert.match(source, /commandPresent/);
  assert.match(source, /AIS_LLM_DRAFT_PROVIDER/);
  assert.match(source, /AIS_LLM_DRAFT_MODEL/);
  assert.match(source, /AIS_LLM_DRAFT_BASE_URL/);
  assert.match(source, /AIS_LLM_DRAFT_API_KEY_REF/);
  assert.match(source, /AIS_LLM_DRAFT_TIMEOUT_MS/);
  assert.match(source, /AIS_LLM_DRAFT_MAX_TOKENS/);
  assert.match(source, /AIS_LLM_DRAFT_REDACTION/);
  assert.match(source, /restoreDrill/);
  assert.match(source, /blockedChannels/);
  assert.match(source, /RESTORE_DRILL/);
  assert.match(source, /AIS_RESTORE_DRILL/);
});
