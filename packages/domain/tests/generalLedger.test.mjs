import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccountSet, generateAccountingPeriods } from "../src/platform.mjs";
import {
  approveVoucher,
  buildTrialBalance,
  createAccount,
  createVoucher,
  postVoucher,
  submitVoucher
} from "../src/generalLedger.mjs";

function demoContext() {
  const accountSet = createAccountSet({
    code: "001",
    name: "Demo Account Set",
    companyName: "Demo Technology Co., Ltd.",
    baseCurrency: "CNY",
    accountingStandard: "Small Business Accounting Standards",
    startYear: 2026,
    startPeriod: 1,
    createdBy: "admin"
  });
  const [period] = generateAccountingPeriods(accountSet);
  const accounts = [
    createAccount({
      code: "1002",
      name: "Bank Deposits",
      accountType: "asset",
      normalBalance: "debit"
    }),
    createAccount({
      code: "6602",
      name: "Office Expense",
      accountType: "expense",
      normalBalance: "debit"
    })
  ];

  return { accountSet, period, accounts };
}

test("draft voucher can be submitted only when balanced and inside an open period", () => {
  const { accountSet, period, accounts } = demoContext();
  const voucher = createVoucher({
    accountSetId: accountSet.id,
    fiscalYear: 2026,
    periodNo: 1,
    voucherDate: "2026-01-15",
    createdBy: "zhang-san",
    lines: [
      { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
      { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 500 }
    ]
  });

  const submitted = submitVoucher(voucher, { period, accounts, submittedBy: "zhang-san" });

  assert.equal(submitted.status, "submitted");
  assert.equal(submitted.submittedBy, "zhang-san");
  assert.equal(voucher.status, "draft");
});

test("voucher drafts reject invalid line amount combinations", () => {
  const { accountSet } = demoContext();
  const baseVoucher = {
    accountSetId: accountSet.id,
    fiscalYear: 2026,
    periodNo: 1,
    voucherDate: "2026-01-15",
    createdBy: "zhang-san"
  };

  assert.throws(
    () =>
      createVoucher({
        ...baseVoucher,
        lines: [
          { summary: "Both sides filled", accountCode: "6602", debit: 100, credit: 100 },
          { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 100 }
        ]
      }),
    /both debit and credit/
  );
  assert.throws(
    () =>
      createVoucher({
        ...baseVoucher,
        lines: [
          { summary: "No amount", accountCode: "6602", debit: 0, credit: 0 },
          { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 100 }
        ]
      }),
    /debit or credit amount/
  );
  assert.throws(
    () =>
      createVoucher({
        ...baseVoucher,
        lines: [
          { summary: "Negative amount", accountCode: "6602", debit: -100, credit: 0 },
          { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 100 }
        ]
      }),
    /cannot be negative/
  );
});

test("voucher creator cannot approve their own voucher", () => {
  const { accountSet, period, accounts } = demoContext();
  const voucher = submitVoucher(
    createVoucher({
      accountSetId: accountSet.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    }),
    { period, accounts, submittedBy: "zhang-san" }
  );

  assert.throws(
    () => approveVoucher(voucher, { period, approvedBy: "zhang-san" }),
    /creator cannot approve their own voucher/
  );
});

test("approved voucher posts once into journal entries and trial balance stays balanced", () => {
  const { accountSet, period, accounts } = demoContext();
  const submitted = submitVoucher(
    createVoucher({
      accountSetId: accountSet.id,
      fiscalYear: 2026,
      periodNo: 1,
      voucherDate: "2026-01-15",
      createdBy: "zhang-san",
      lines: [
        { summary: "Buy office supplies", accountCode: "6602", debit: 500, credit: 0 },
        { summary: "Paid by bank", accountCode: "1002", debit: 0, credit: 500 }
      ]
    }),
    { period, accounts, submittedBy: "zhang-san" }
  );
  const approved = approveVoucher(submitted, { period, approvedBy: "li-si" });

  const posting = postVoucher(approved, { period, accounts, postedBy: "wang-wu" });
  const trialBalance = buildTrialBalance(posting.balances);

  assert.equal(posting.voucher.status, "posted");
  assert.equal(posting.journalEntries.length, 2);
  assert.deepEqual(trialBalance.totals, { debit: 500, credit: 500, difference: 0 });
  assert.throws(() => postVoucher(posting.voucher, { period, accounts, postedBy: "wang-wu" }), /already posted/);
});
