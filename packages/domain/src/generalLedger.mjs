import { assertVoucherCanBePosted, isVoucherBalanced } from "./ledger.mjs";
import { canPostToPeriod } from "./platform.mjs";

let voucherSequence = 0;

function assertRequiredText(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required.`);
  }
}

function indexAccounts(accounts) {
  return new Map(accounts.map((account) => [account.code, account]));
}

function assertOpenVoucherPeriod(voucher, period) {
  if (!canPostToPeriod(period)) {
    throw new Error("Voucher period must be open.");
  }
  if (period.fiscalYear !== voucher.fiscalYear || period.periodNo !== voucher.periodNo) {
    throw new Error("Voucher must belong to the supplied accounting period.");
  }
}

function assertLineAmount(line) {
  const debit = Number(line?.debit ?? 0);
  const credit = Number(line?.credit ?? 0);

  if (!Number.isFinite(debit) || !Number.isFinite(credit)) {
    throw new Error("Voucher line amounts must be finite numbers.");
  }
  if (debit < 0 || credit < 0) {
    throw new Error("Voucher line amounts cannot be negative.");
  }
  if (debit > 0 && credit > 0) {
    throw new Error("Voucher line cannot contain both debit and credit amounts.");
  }
  if (debit === 0 && credit === 0) {
    throw new Error("Voucher line must contain a debit or credit amount.");
  }
}

function assertVoucherAccounts(voucher, accounts) {
  const accountsByCode = indexAccounts(accounts);

  for (const line of voucher.lines) {
    assertRequiredText(line.summary, "line.summary");
    assertRequiredText(line.accountCode, "line.accountCode");
    assertLineAmount(line);

    const account = accountsByCode.get(line.accountCode);
    if (!account) {
      throw new Error(`Account ${line.accountCode} does not exist.`);
    }
    if (!account.isEnabled) {
      throw new Error(`Account ${line.accountCode} is disabled.`);
    }
    if (!account.isLeaf) {
      throw new Error(`Account ${line.accountCode} is not a leaf account.`);
    }
    if (!account.allowManualEntry) {
      throw new Error(`Account ${line.accountCode} does not allow manual entry.`);
    }
    for (const auxiliaryType of account.requiredAuxiliaries) {
      if (!line.auxiliaries?.[auxiliaryType]) {
        throw new Error(`Account ${line.accountCode} requires auxiliary ${auxiliaryType}.`);
      }
    }
  }
}

function assertVoucherReadyForWorkflow(voucher, { period, accounts }) {
  assertOpenVoucherPeriod(voucher, period);
  assertVoucherAccounts(voucher, accounts);
  assertVoucherCanBePosted(voucher);
}

export function createAccount(input) {
  assertRequiredText(input?.code, "code");
  assertRequiredText(input?.name, "name");
  assertRequiredText(input?.accountType, "accountType");

  if (!["debit", "credit"].includes(input.normalBalance)) {
    throw new Error("normalBalance must be debit or credit.");
  }

  return {
    id: `account:${input.code}`,
    accountSetId: input.accountSetId ?? null,
    code: input.code,
    name: input.name,
    parentId: input.parentId ?? null,
    accountType: input.accountType,
    normalBalance: input.normalBalance,
    isCash: input.isCash ?? false,
    isBank: input.isBank ?? false,
    isLeaf: input.isLeaf ?? true,
    isEnabled: input.isEnabled ?? true,
    allowManualEntry: input.allowManualEntry ?? true,
    requiredAuxiliaries: Array.isArray(input.requiredAuxiliaries) ? [...input.requiredAuxiliaries] : []
  };
}

export function createAccountCodeRule(input) {
  if (!Array.isArray(input?.segments) || input.segments.length === 0) {
    throw new Error("segments are required.");
  }

  for (const segment of input.segments) {
    if (!Number.isInteger(segment) || segment <= 0) {
      throw new Error("segments must contain positive integers.");
    }
  }

  return {
    id: "account-code-rule:default",
    segments: [...input.segments],
    allowedLengths: input.segments.reduce((lengths, segment, index) => {
      const previous = index === 0 ? 0 : lengths[index - 1];
      return [...lengths, previous + segment];
    }, [])
  };
}

export function assertAccountCodeMatchesRule(code, rule) {
  if (!rule) {
    return true;
  }
  if (!rule.allowedLengths.includes(code.length)) {
    throw new Error(`Account code ${code} does not match account code rule ${rule.segments.join("-")}.`);
  }
  return true;
}

export function createVoucher(input) {
  assertRequiredText(input?.accountSetId, "accountSetId");
  assertRequiredText(input?.voucherDate, "voucherDate");
  assertRequiredText(input?.createdBy, "createdBy");

  if (!Number.isInteger(input.fiscalYear)) {
    throw new Error("fiscalYear is required.");
  }
  if (!Number.isInteger(input.periodNo)) {
    throw new Error("periodNo is required.");
  }
  if (!Array.isArray(input.lines) || input.lines.length < 2) {
    throw new Error("Voucher must contain at least two lines.");
  }

  const lines = input.lines.map((line, index) => {
    assertRequiredText(line.summary, "line.summary");
    assertRequiredText(line.accountCode, "line.accountCode");
    assertLineAmount(line);
    return {
      lineNo: index + 1,
      summary: line.summary,
      accountCode: line.accountCode,
      debit: Number(line.debit ?? 0),
      credit: Number(line.credit ?? 0),
      auxiliaries: line.auxiliaries ? { ...line.auxiliaries } : {}
    };
  });

  return {
    id: input.id ?? `voucher:${input.accountSetId}:${input.fiscalYear}:${input.periodNo}:${input.createdBy}:${++voucherSequence}`,
    accountSetId: input.accountSetId,
    fiscalYear: input.fiscalYear,
    periodNo: input.periodNo,
    voucherNo: input.voucherNo ?? null,
    voucherDate: input.voucherDate,
    status: "draft",
    revision: input.revision ?? 1,
    sourceType: input.sourceType ?? "manual",
    aiDraftId: input.aiDraftId ?? null,
    attachmentCount: input.attachmentCount ?? 0,
    createdBy: input.createdBy,
    submittedBy: null,
    approvedBy: null,
    postedBy: null,
    postedAt: null,
    lines
  };
}

export function submitVoucher(voucher, { period, accounts, submittedBy }) {
  if (!["draft", "rejected"].includes(voucher?.status)) {
    throw new Error("Only draft or rejected vouchers can be submitted.");
  }
  assertRequiredText(submittedBy, "submittedBy");
  assertVoucherReadyForWorkflow(voucher, { period, accounts });

  return {
    ...voucher,
    status: "submitted",
    submittedBy
  };
}

export function approveVoucher(voucher, { period, approvedBy }) {
  if (voucher?.status !== "submitted") {
    throw new Error("Only submitted vouchers can be approved.");
  }
  assertRequiredText(approvedBy, "approvedBy");
  assertOpenVoucherPeriod(voucher, period);
  if (voucher.createdBy === approvedBy) {
    throw new Error("Voucher creator cannot approve their own voucher.");
  }
  if (!isVoucherBalanced(voucher)) {
    throw new Error("Only balanced vouchers can be approved.");
  }

  return {
    ...voucher,
    status: "approved",
    approvedBy
  };
}

export function postVoucher(voucher, { period, accounts, postedBy }) {
  if (voucher?.status === "posted") {
    throw new Error("Voucher is already posted.");
  }
  if (voucher?.status !== "approved") {
    throw new Error("Only approved vouchers can be posted.");
  }
  assertRequiredText(postedBy, "postedBy");
  assertVoucherReadyForWorkflow(voucher, { period, accounts });

  const accountsByCode = indexAccounts(accounts);
  const journalEntries = voucher.lines.map((line) => ({
    id: `journal:${voucher.id}:${line.lineNo}`,
    accountSetId: voucher.accountSetId,
    voucherId: voucher.id,
    voucherLineNo: line.lineNo,
    fiscalYear: voucher.fiscalYear,
    periodNo: voucher.periodNo,
    entryDate: voucher.voucherDate,
    accountCode: line.accountCode,
    summary: line.summary,
    debit: line.debit,
    credit: line.credit,
    auxiliarySnapshot: { ...line.auxiliaries }
  }));
  const balances = summarizeBalances(journalEntries, accountsByCode);

  return {
    voucher: {
      ...voucher,
      status: "posted",
      postedBy,
      postedAt: "posted"
    },
    journalEntries,
    balances
  };
}

export function rejectVoucher(voucher, { rejectedBy }) {
  if (voucher?.status !== "submitted") {
    throw new Error("Only submitted vouchers can be rejected.");
  }
  assertRequiredText(rejectedBy, "rejectedBy");

  return {
    ...voucher,
    status: "rejected",
    rejectedBy
  };
}

export function voidVoucher(voucher, { voidedBy }) {
  if (!["draft", "submitted", "rejected"].includes(voucher?.status)) {
    throw new Error("Only draft, submitted, or rejected vouchers can be voided.");
  }
  assertRequiredText(voidedBy, "voidedBy");

  return {
    ...voucher,
    status: "voided",
    voidedBy
  };
}

export function reverseVoucher(postedVoucher, { reversedBy, voucherDate, fiscalYear, periodNo }) {
  if (postedVoucher?.status !== "posted") {
    throw new Error("Only posted vouchers can be reversed.");
  }
  assertRequiredText(reversedBy, "reversedBy");
  assertRequiredText(voucherDate, "voucherDate");
  if (!Number.isInteger(fiscalYear)) {
    throw new Error("fiscalYear is required.");
  }
  if (!Number.isInteger(periodNo)) {
    throw new Error("periodNo is required.");
  }

  const lines = postedVoucher.lines.map((line) => ({
    ...line,
    debit: line.credit,
    credit: line.debit,
    summary: `(Reverse) ${line.summary}`
  }));

  return {
    id: `voucher:reversed:${postedVoucher.id}:${Date.now()}`,
    accountSetId: postedVoucher.accountSetId,
    fiscalYear,
    periodNo,
    voucherDate,
    status: "draft",
    voucherNo: null,
    createdBy: reversedBy,
    submittedBy: null,
    approvedBy: null,
    postedBy: null,
    postedAt: null,
    lines
  };
}

export function summarizeBalances(journalEntries, accountsByCode) {
  const balancesByAccount = new Map();

  for (const entry of journalEntries) {
    const account = accountsByCode.get(entry.accountCode);
    const current = balancesByAccount.get(entry.accountCode) ?? {
      accountCode: entry.accountCode,
      accountName: account?.name ?? entry.accountCode,
      normalBalance: account?.normalBalance ?? "debit",
      periodDebit: 0,
      periodCredit: 0
    };

    current.periodDebit += entry.debit;
    current.periodCredit += entry.credit;
    balancesByAccount.set(entry.accountCode, current);
  }

  return [...balancesByAccount.values()];
}

export function buildTrialBalance(balances) {
  const totals = balances.reduce(
    (sum, balance) => ({
      debit: sum.debit + balance.periodDebit,
      credit: sum.credit + balance.periodCredit,
      difference: sum.difference + balance.periodDebit - balance.periodCredit
    }),
    { debit: 0, credit: 0, difference: 0 }
  );

  return {
    rows: balances.map((balance) => ({ ...balance })),
    totals
  };
}
