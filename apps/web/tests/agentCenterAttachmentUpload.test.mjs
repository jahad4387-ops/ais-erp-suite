import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const agentCenterPath = fileURLToPath(new URL("../src/pages/AgentCenter.tsx", import.meta.url));

test("agent center uploads attachment evidence before AI voucher draft generation", () => {
  const source = readFileSync(agentCenterPath, "utf8");

  assert.match(source, /Upload/, "Agent center should expose an attachment picker for AI evidence.");
  assert.match(source, /data-testid="agent-ai-attachment-upload"/);
  assert.match(source, /contentBase64/);
  assert.match(source, /api\.post\('\/attachments\/upload'/);
  assert.match(source, /attachmentIds/);
  assert.match(source, /uploadedAttachmentIds/);
  assert.match(source, /api\.post\('\/ai\/voucher-drafts'/);
  assert.match(source, /api\.post\('\/ai\/reconciliation-suggestions'/);
  assert.match(source, /api\.post\('\/ai\/collection-drafts'/);
  assert.match(source, /api\.post\('\/ai\/exception-checks'/);
  assert.match(source, /dryRun: true/);
});
