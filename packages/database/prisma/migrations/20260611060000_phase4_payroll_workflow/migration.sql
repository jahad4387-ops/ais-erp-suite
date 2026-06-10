-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "PayrollRun" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "PayrollRun" ADD COLUMN "lockedBy" TEXT;
ALTER TABLE "PayrollRun" ADD COLUMN "lockedAt" DATETIME;

-- CreateTable
CREATE TABLE "PayrollPaymentFile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "bankAccountCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'prepared',
  "totalAmount" REAL NOT NULL DEFAULT 0,
  "lineCount" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollPaymentFile_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PayrollPaymentFile_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollPaymentFileLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "paymentFileId" TEXT NOT NULL,
  "employeeProfileId" TEXT NOT NULL,
  "employeeNo" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "amount" REAL NOT NULL DEFAULT 0,
  "bankAccountNo" TEXT,
  CONSTRAINT "PayrollPaymentFileLine_paymentFileId_fkey" FOREIGN KEY ("paymentFileId") REFERENCES "PayrollPaymentFile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PayrollPaymentFileLine_employeeProfileId_fkey" FOREIGN KEY ("employeeProfileId") REFERENCES "EmployeePayrollProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollAllocation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'allocated',
  "totalAllocatedAmount" REAL NOT NULL DEFAULT 0,
  "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
  "voucherDraftJson" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollAllocation_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PayrollAllocation_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollAllocationLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "payrollAllocationId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "workOrderId" TEXT,
  "costType" TEXT NOT NULL,
  "allocationRate" REAL NOT NULL DEFAULT 1,
  "allocatedAmount" REAL NOT NULL DEFAULT 0,
  CONSTRAINT "PayrollAllocationLine_payrollAllocationId_fkey" FOREIGN KEY ("payrollAllocationId") REFERENCES "PayrollAllocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollCostPoolOutput" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "sourceRunId" TEXT NOT NULL,
  "payrollAllocationId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "departmentId" TEXT NOT NULL,
  "workOrderId" TEXT,
  "costType" TEXT NOT NULL,
  "amount" REAL NOT NULL DEFAULT 0,
  "lockedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollCostPoolOutput_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PayrollCostPoolOutput_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "PayrollRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PayrollCostPoolOutput_payrollAllocationId_fkey" FOREIGN KEY ("payrollAllocationId") REFERENCES "PayrollAllocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PayrollPaymentFile_accountSetId_payrollRunId_idx" ON "PayrollPaymentFile"("accountSetId", "payrollRunId");

-- CreateIndex
CREATE INDEX "PayrollAllocation_accountSetId_fiscalYear_periodNo_idx" ON "PayrollAllocation"("accountSetId", "fiscalYear", "periodNo");

-- CreateIndex
CREATE INDEX "PayrollCostPoolOutput_accountSetId_fiscalYear_periodNo_idx" ON "PayrollCostPoolOutput"("accountSetId", "fiscalYear", "periodNo");
