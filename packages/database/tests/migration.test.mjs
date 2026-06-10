import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationSql = readFileSync(
  new URL("../prisma/migrations/20260607120000_phase1_init/migration.sql", import.meta.url)
);
const migrationText = migrationSql.toString("utf8");
const phase2PartnerMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260610090000_phase2_partner_master_data/migration.sql", import.meta.url)
);
const phase2PartnerMigrationText = phase2PartnerMigrationSql.toString("utf8");
const phase2OrderMigrationSql = readFileSync(
  new URL("../prisma/migrations/20260610100000_phase2_order_workflow/migration.sql", import.meta.url)
);
const phase2OrderMigrationText = phase2OrderMigrationSql.toString("utf8");
const migrationLock = readFileSync(new URL("../prisma/migrations/migration_lock.toml", import.meta.url), "utf8");

test("Phase 1 migration is UTF-8 SQL, not UTF-16 PowerShell output", () => {
  assert.notDeepEqual([...migrationSql.subarray(0, 2)], [0xff, 0xfe], "migration.sql must not be UTF-16 LE.");
  assert.match(migrationText, /^﻿?-- CreateTable/, "migration.sql must start with SQL text.");
});

test("Phase 1 migration creates required accounting tables", () => {
  const requiredTables = [
    "AccountSet",
    "User",
    "Role",
    "Permission",
    "AccountingPeriod",
    "ChartOfAccount",
    "AuxiliaryType",
    "AuxiliaryItem",
    "Voucher",
    "VoucherLine",
    "VoucherStatusLog",
    "Attachment",
    "PostingBatch",
    "JournalEntry",
    "AccountPeriodBalance",
    "BankStatement",
    "AuditLog"
  ];

  for (const table of requiredTables) {
    assert.match(migrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created by migration.sql.`);
  }

  assert.match(migrationText, /"revision" INTEGER NOT NULL DEFAULT 1/, "Voucher revision must be persisted for optimistic locking.");
});

test("Phase 1 migration lock targets SQLite", () => {
  assert.match(migrationLock, /provider = "sqlite"/);
});

test("User persistence stores password hashes instead of plaintext passwords", () => {
  assert.match(migrationText, /"passwordHash" TEXT NOT NULL/, "User table must persist passwordHash.");
  assert.doesNotMatch(migrationText, /"password" TEXT NOT NULL/, "User table must not persist plaintext password.");
});

test("Phase 2 partner migration creates account-set scoped partner master data", () => {
  assert.match(phase2PartnerMigrationText, /CREATE TABLE "Partner"/, "Partner table must be created.");
  assert.match(phase2PartnerMigrationText, /"partnerType" TEXT NOT NULL/, "Partner type must be persisted.");
  assert.match(phase2PartnerMigrationText, /"paymentTerms" TEXT/, "Payment terms must be persisted.");
  assert.match(phase2PartnerMigrationText, /"settlementMethod" TEXT/, "Settlement method must be persisted.");
  assert.match(
    phase2PartnerMigrationText,
    /CREATE UNIQUE INDEX "Partner_accountSetId_code_key"/,
    "Partner code must be unique inside an account set."
  );
});

test("Phase 2 order migration creates purchase and sales order workflows", () => {
  for (const table of ["PurchaseOrder", "PurchaseOrderLine", "SalesOrder", "SalesOrderLine"]) {
    assert.match(phase2OrderMigrationText, new RegExp(`CREATE TABLE "${table}"`), `${table} must be created.`);
  }
  assert.match(phase2OrderMigrationText, /"status" TEXT NOT NULL DEFAULT 'draft'/, "Orders must persist status.");
  assert.match(phase2OrderMigrationText, /"totalAmount" REAL NOT NULL DEFAULT 0/, "Orders must persist totals.");
  assert.match(
    phase2OrderMigrationText,
    /CREATE UNIQUE INDEX "PurchaseOrder_accountSetId_orderNo_key"/,
    "Purchase order number must be unique inside an account set."
  );
  assert.match(
    phase2OrderMigrationText,
    /CREATE UNIQUE INDEX "SalesOrder_accountSetId_orderNo_key"/,
    "Sales order number must be unique inside an account set."
  );
});
