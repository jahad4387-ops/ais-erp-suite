import { test } from "node:test";
import assert from "node:assert/strict";
import { findModuleById, listRequiredModules } from "../src/moduleCatalog.mjs";

test("module catalog covers every textbook product area", () => {
  const ids = listRequiredModules().map((module) => module.id);

  assert.deepEqual(ids, [
    "platform",
    "general-ledger",
    "procure-to-pay",
    "order-to-cash",
    "inventory-costing",
    "payroll",
    "fixed-assets",
    "reporting",
    "ai-agent"
  ]);
});

test("general ledger module includes voucher and period-adjacent responsibilities", () => {
  const module = findModuleById("general-ledger");

  assert.equal(module.name, "账务处理与总账");
  assert.ok(module.responsibilities.includes("凭证"));
  assert.ok(module.responsibilities.includes("期末"));
});
