import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/BackupRestoreWorkbench.tsx", import.meta.url));

test("Phase 6 backup restore workbench is reachable from platform management navigation", () => {
  const source = readFileSync(appPath, "utf8");

  assert.match(source, /import \{ BackupRestoreWorkbench \} from '\.\/pages\/BackupRestoreWorkbench';/);
  assert.match(source, /to="\/backup-restore"/);
  assert.match(source, /<Route path="\/backup-restore" element=\{<RequireAuth><BackupRestoreWorkbench \/><\/RequireAuth>\} \/>/);
});

test("Phase 6 backup restore workbench wires backup, restore, and restore-drill APIs", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /api\.get\('\/deployment\/config'\)/);
  assert.match(source, /api\.get\(`\/ops\/backups\?accountSetId=\$\{encodeURIComponent\(currentAccountSetId\)\}`\)/);
  assert.match(source, /api\.get\(`\/ops\/restores\?accountSetId=\$\{encodeURIComponent\(currentAccountSetId\)\}`\)/);
  assert.match(source, /api\.post\('\/ops\/backups'/);
  assert.match(source, /api\.post\('\/ops\/restores\/execute'/);
  assert.match(source, /data-testid="backup-restore-create-backup"/);
  assert.match(source, /data-testid="backup-restore-run-drill"/);
  assert.match(source, /restoreDrill\.enabled/);
  assert.match(source, /RESTORE_DRILL_REQUIRED/);
  assert.match(source, /attachmentHashVerification/);
  assert.match(source, /impactScope/);
  assert.match(source, /blockedChannels/);
});

test("Phase 6 ops workbench wires migration jobs and security event audit APIs", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /api\.get\(`\/ops\/migrations\/jobs\?accountSetId=\$\{encodeURIComponent\(currentAccountSetId\)\}`\)/);
  assert.match(source, /api\.post\('\/ops\/migrations\/jobs'/);
  assert.match(source, /api\.post\(`\/ops\/migrations\/jobs\/\$\{encodeURIComponent\(job\.id\)\}\/dry-run`/);
  assert.match(source, /api\.post\(`\/ops\/migrations\/jobs\/\$\{encodeURIComponent\(job\.id\)\}\/import`/);
  assert.match(source, /api\.get\(`\/security\/events\?accountSetId=\$\{encodeURIComponent\(currentAccountSetId\)\}`\)/);
  assert.match(source, /data-testid="ops-migration-create-job"/);
  assert.match(source, /data-testid="ops-migration-run-dry-run"/);
  assert.match(source, /data-testid="ops-migration-run-import"/);
  assert.match(source, /data-testid="ops-security-events-refresh"/);
  assert.match(source, /迁移任务/);
  assert.match(source, /安全审计/);
  assert.match(source, /partner_master/);
  assert.match(source, /伙伴档案/);
  assert.match(source, /defaultPartnerMigrationRows/);
  assert.match(source, /inventory_item_master/);
  assert.match(source, /存货档案/);
  assert.match(source, /defaultInventoryItemMigrationRows/);
  assert.match(source, /validation/);
  assert.match(source, /importSummary/);
  assert.match(source, /eventType/);
  assert.match(source, /severity/);
});
