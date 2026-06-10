-- CreateTable
CREATE TABLE "AccountSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "accountingStandard" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "startPeriod" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    PRIMARY KEY ("userId", "roleId"),
    CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    PRIMARY KEY ("roleId", "permissionId"),
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountSetUser" (
    "accountSetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedBy" TEXT,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("accountSetId", "userId"),
    CONSTRAINT "AccountSetUser_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountSetUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "AccountingPeriod_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountCodeRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "segmentsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountCodeRule_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "level" INTEGER NOT NULL,
    "accountType" TEXT NOT NULL,
    "normalBalance" TEXT NOT NULL,
    "isLeaf" BOOLEAN NOT NULL DEFAULT true,
    "isCash" BOOLEAN NOT NULL DEFAULT false,
    "isBank" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "allowManualEntry" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChartOfAccount_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChartOfAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChartOfAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuxiliaryType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuxiliaryType_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuxiliaryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "auxiliaryTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuxiliaryItem_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuxiliaryItem_auxiliaryTypeId_fkey" FOREIGN KEY ("auxiliaryTypeId") REFERENCES "AuxiliaryType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountAuxiliaryRequirement" (
    "accountId" TEXT NOT NULL,
    "auxiliaryTypeId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY ("accountId", "auxiliaryTypeId"),
    CONSTRAINT "AccountAuxiliaryRequirement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountAuxiliaryRequirement_auxiliaryTypeId_fkey" FOREIGN KEY ("auxiliaryTypeId") REFERENCES "AuxiliaryType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpeningBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "openingDebit" REAL NOT NULL DEFAULT 0,
    "openingCredit" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "OpeningBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "periodId" TEXT,
    "voucherType" TEXT NOT NULL DEFAULT 'J',
    "voucherNo" TEXT NOT NULL,
    "voucherDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "attachmentCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "submittedBy" TEXT,
    "approvedBy" TEXT,
    "postedBy" TEXT,
    "postedAt" DATETIME,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "aiDraftId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "sourceModule" TEXT,
    "sourceDocumentType" TEXT,
    "sourceDocumentId" TEXT,
    "externalReferenceId" TEXT,
    "businessPartnerId" TEXT,
    "settlementMethod" TEXT,
    "currencyId" TEXT,
    "exchangeRate" REAL DEFAULT 1,
    CONSTRAINT "Voucher_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Voucher_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoucherLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "voucherId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitAmount" REAL NOT NULL DEFAULT 0,
    "creditAmount" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "exchangeRate" REAL NOT NULL DEFAULT 1,
    "originalAmount" REAL,
    "quantity" REAL,
    "unitPrice" REAL,
    CONSTRAINT "VoucherLine_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VoucherLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoucherLineAuxiliary" (
    "voucherLineId" TEXT NOT NULL,
    "auxiliaryTypeId" TEXT NOT NULL,
    "auxiliaryItemId" TEXT NOT NULL,

    PRIMARY KEY ("voucherLineId", "auxiliaryTypeId"),
    CONSTRAINT "VoucherLineAuxiliary_voucherLineId_fkey" FOREIGN KEY ("voucherLineId") REFERENCES "VoucherLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VoucherLineAuxiliary_auxiliaryTypeId_fkey" FOREIGN KEY ("auxiliaryTypeId") REFERENCES "AuxiliaryType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VoucherLineAuxiliary_auxiliaryItemId_fkey" FOREIGN KEY ("auxiliaryItemId") REFERENCES "AuxiliaryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoucherStatusLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "voucherId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoucherStatusLog_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoucherNumberSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "voucherType" TEXT NOT NULL,
    "currentNo" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttachmentLink" (
    "attachmentId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "voucherId" TEXT,
    "linkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("attachmentId", "objectType", "objectId"),
    CONSTRAINT "AttachmentLink_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AttachmentLink_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PostingBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "voucherCount" INTEGER NOT NULL,
    "postedBy" TEXT NOT NULL,
    "postedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostingBatch_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "voucherLineId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "entryDate" DATETIME NOT NULL,
    "accountId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "debitAmount" REAL NOT NULL DEFAULT 0,
    "creditAmount" REAL NOT NULL DEFAULT 0,
    "auxiliarySnapshotJson" TEXT,
    "postedBatchId" TEXT NOT NULL,
    CONSTRAINT "JournalEntry_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_voucherLineId_fkey" FOREIGN KEY ("voucherLineId") REFERENCES "VoucherLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_postedBatchId_fkey" FOREIGN KEY ("postedBatchId") REFERENCES "PostingBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountPeriodBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "openingDebit" REAL NOT NULL DEFAULT 0,
    "openingCredit" REAL NOT NULL DEFAULT 0,
    "periodDebit" REAL NOT NULL DEFAULT 0,
    "periodCredit" REAL NOT NULL DEFAULT 0,
    "cumulativeDebit" REAL NOT NULL DEFAULT 0,
    "cumulativeCredit" REAL NOT NULL DEFAULT 0,
    "closingDebit" REAL NOT NULL DEFAULT 0,
    "closingCredit" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "AccountPeriodBalance_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AccountPeriodBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "transactionDate" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "balance" REAL,
    "status" TEXT NOT NULL DEFAULT 'unreconciled',
    CONSTRAINT "BankStatement_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BankStatement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "ChartOfAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankReconciliationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchPattern" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankReconciliationRule_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankReconciliation_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountSetId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "traceId" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountSet_code_key" ON "AccountSet"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_accountSetId_fiscalYear_periodNo_key" ON "AccountingPeriod"("accountSetId", "fiscalYear", "periodNo");

-- CreateIndex
CREATE UNIQUE INDEX "AccountCodeRule_accountSetId_key" ON "AccountCodeRule"("accountSetId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_accountSetId_code_key" ON "ChartOfAccount"("accountSetId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AuxiliaryType_accountSetId_code_key" ON "AuxiliaryType"("accountSetId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AuxiliaryItem_auxiliaryTypeId_code_key" ON "AuxiliaryItem"("auxiliaryTypeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalance_accountId_fiscalYear_periodNo_key" ON "OpeningBalance"("accountId", "fiscalYear", "periodNo");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_accountSetId_fiscalYear_periodNo_voucherType_voucherNo_key" ON "Voucher"("accountSetId", "fiscalYear", "periodNo", "voucherType", "voucherNo");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherLine_voucherId_lineNo_key" ON "VoucherLine"("voucherId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherNumberSequence_accountSetId_fiscalYear_periodNo_voucherType_key" ON "VoucherNumberSequence"("accountSetId", "fiscalYear", "periodNo", "voucherType");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_voucherLineId_key" ON "JournalEntry"("voucherLineId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPeriodBalance_accountSetId_fiscalYear_periodNo_accountId_key" ON "AccountPeriodBalance"("accountSetId", "fiscalYear", "periodNo", "accountId");


