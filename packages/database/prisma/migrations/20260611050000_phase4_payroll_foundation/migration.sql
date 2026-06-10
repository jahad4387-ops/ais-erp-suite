-- CreateTable
CREATE TABLE "PayrollCategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollCategory_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "itemType" TEXT NOT NULL,
  "formula" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollItem_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollFormula" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "payrollItemId" TEXT NOT NULL,
  "expression" TEXT NOT NULL,
  "effectiveFrom" DATETIME,
  "effectiveTo" DATETIME,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollFormula_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PayrollFormula_payrollItemId_fkey" FOREIGN KEY ("payrollItemId") REFERENCES "PayrollItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeePayrollProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "employeeNo" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "departmentName" TEXT,
  "payrollCategoryId" TEXT NOT NULL,
  "baseSalary" REAL NOT NULL DEFAULT 0,
  "personalSocialSecurity" REAL NOT NULL DEFAULT 0,
  "personalHousingFund" REAL NOT NULL DEFAULT 0,
  "companySocialSecurity" REAL NOT NULL DEFAULT 0,
  "companyHousingFund" REAL NOT NULL DEFAULT 0,
  "monthlyTaxExemption" REAL NOT NULL DEFAULT 5000,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeePayrollProfile_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeePayrollProfile_payrollCategoryId_fkey" FOREIGN KEY ("payrollCategoryId") REFERENCES "PayrollCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollVariableImport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "importType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'imported',
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollVariableImport_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollVariableImportLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "importId" TEXT NOT NULL,
  "employeeProfileId" TEXT NOT NULL,
  "workDays" REAL NOT NULL DEFAULT 0,
  "performancePay" REAL NOT NULL DEFAULT 0,
  "piecePay" REAL NOT NULL DEFAULT 0,
  "allowance" REAL NOT NULL DEFAULT 0,
  "deduction" REAL NOT NULL DEFAULT 0,
  "rawJson" TEXT,
  CONSTRAINT "PayrollVariableImportLine_importId_fkey" FOREIGN KEY ("importId") REFERENCES "PayrollVariableImport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PayrollVariableImportLine_employeeProfileId_fkey" FOREIGN KEY ("employeeProfileId") REFERENCES "EmployeePayrollProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountSetId" TEXT NOT NULL,
  "runNo" TEXT NOT NULL,
  "payrollCategoryId" TEXT NOT NULL,
  "variableImportId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'calculated',
  "lineCount" INTEGER NOT NULL DEFAULT 0,
  "totalGrossAmount" REAL NOT NULL DEFAULT 0,
  "totalDeductionAmount" REAL NOT NULL DEFAULT 0,
  "totalTaxAmount" REAL NOT NULL DEFAULT 0,
  "totalNetPay" REAL NOT NULL DEFAULT 0,
  "totalCompanyCost" REAL NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollRun_accountSetId_fkey" FOREIGN KEY ("accountSetId") REFERENCES "AccountSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PayrollRun_payrollCategoryId_fkey" FOREIGN KEY ("payrollCategoryId") REFERENCES "PayrollCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PayrollRun_variableImportId_fkey" FOREIGN KEY ("variableImportId") REFERENCES "PayrollVariableImport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollRunLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "payrollRunId" TEXT NOT NULL,
  "employeeProfileId" TEXT NOT NULL,
  "employeeNo" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "departmentName" TEXT,
  "grossAmount" REAL NOT NULL DEFAULT 0,
  "deductionAmount" REAL NOT NULL DEFAULT 0,
  "taxableIncome" REAL NOT NULL DEFAULT 0,
  "cumulativeTaxableIncome" REAL NOT NULL DEFAULT 0,
  "individualIncomeTax" REAL NOT NULL DEFAULT 0,
  "manualAdjustmentAmount" REAL NOT NULL DEFAULT 0,
  "netPay" REAL NOT NULL DEFAULT 0,
  "companyCost" REAL NOT NULL DEFAULT 0,
  "manualAdjustmentsJson" TEXT,
  CONSTRAINT "PayrollRunLine_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PayrollRunLine_employeeProfileId_fkey" FOREIGN KEY ("employeeProfileId") REFERENCES "EmployeePayrollProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCategory_accountSetId_code_key" ON "PayrollCategory"("accountSetId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollItem_accountSetId_code_key" ON "PayrollItem"("accountSetId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePayrollProfile_accountSetId_employeeNo_key" ON "EmployeePayrollProfile"("accountSetId", "employeeNo");

-- CreateIndex
CREATE INDEX "PayrollVariableImport_accountSetId_fiscalYear_periodNo_idx" ON "PayrollVariableImport"("accountSetId", "fiscalYear", "periodNo");

-- CreateIndex
CREATE INDEX "PayrollRun_accountSetId_fiscalYear_periodNo_idx" ON "PayrollRun"("accountSetId", "fiscalYear", "periodNo");

-- CreateIndex
CREATE INDEX "PayrollRunLine_employeeProfileId_idx" ON "PayrollRunLine"("employeeProfileId");
