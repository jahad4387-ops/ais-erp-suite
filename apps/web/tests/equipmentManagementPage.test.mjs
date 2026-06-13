import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
const navigationPath = fileURLToPath(new URL("../src/navigation.tsx", import.meta.url));
const pagePath = fileURLToPath(new URL("../src/pages/EquipmentManagement.tsx", import.meta.url));

test("supply chain manufacturing exposes equipment management as an enabled module", () => {
  const appSource = readFileSync(appPath, "utf8");
  const navigationSource = readFileSync(navigationPath, "utf8");

  assert.equal(existsSync(pagePath), true, "Equipment management page should exist.");
  assert.match(appSource, /import \{ EquipmentManagement \} from '\.\/pages\/EquipmentManagement';/);
  assert.match(appSource, /path="\/equipment-management"/);
  assert.match(navigationSource, /label: '设备管理', to: '\/equipment-management'/);
  assert.doesNotMatch(navigationSource, /key: 'supply-chain-device-management'[^}]+disabled: true/s);
});

test("supply chain inventory navigation exposes delivery generation entry", () => {
  const navigationSource = readFileSync(navigationPath, "utf8");

  assert.match(navigationSource, /label: '生成发货单', to: '\/sales-deliveries'/);
});

test("equipment management reuses fixed asset and depreciation data for manufacturing equipment visibility", () => {
  const pageSource = readFileSync(pagePath, "utf8");

  assert.match(pageSource, /api\.get\(`\/fixed-assets\?accountSetId=/);
  assert.match(pageSource, /api\.get\(`\/depreciation-runs\?accountSetId=/);
  assert.match(pageSource, /api\.get\(`\/asset-counts\?accountSetId=/);
  assert.match(pageSource, /设备状态/);
  assert.match(pageSource, /折旧状态/);
  assert.match(pageSource, /盘点状态/);
});
