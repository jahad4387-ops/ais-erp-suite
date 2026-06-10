const PERIODS_PER_YEAR = 12;

function assertRequiredText(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required.`);
  }
}

function assertPeriodNo(periodNo) {
  if (!Number.isInteger(periodNo) || periodNo < 1 || periodNo > PERIODS_PER_YEAR) {
    throw new Error("startPeriod must be an integer from 1 to 12.");
  }
}

export function createAccountSet(input) {
  assertRequiredText(input?.code, "code");
  assertRequiredText(input?.name, "name");
  assertRequiredText(input?.companyName, "companyName");
  assertRequiredText(input?.baseCurrency, "baseCurrency");
  assertRequiredText(input?.accountingStandard, "accountingStandard");

  if (!Number.isInteger(input.startYear) || input.startYear < 1900) {
    throw new Error("startYear must be a valid year.");
  }
  assertPeriodNo(input.startPeriod);

  return {
    id: `account-set:${input.code}`,
    code: input.code,
    name: input.name,
    companyName: input.companyName,
    baseCurrency: input.baseCurrency,
    accountingStandard: input.accountingStandard,
    startYear: input.startYear,
    startPeriod: input.startPeriod,
    status: "draft",
    createdBy: input.createdBy ?? null
  };
}

export function generateAccountingPeriods(accountSet) {
  if (!accountSet) {
    throw new Error("accountSet is required.");
  }
  assertPeriodNo(accountSet.startPeriod);

  return Array.from({ length: PERIODS_PER_YEAR }, (_, index) => {
    const periodNo = index + 1;
    const isCurrent = periodNo === accountSet.startPeriod;

    return {
      id: `${accountSet.id}:period:${accountSet.startYear}:${periodNo}`,
      accountSetId: accountSet.id,
      fiscalYear: accountSet.startYear,
      periodNo,
      status: isCurrent ? "open" : "unopened",
      isCurrent
    };
  });
}

export function canPostToPeriod(period) {
  return period?.status === "open";
}

export function enableAccountSet(accountSet, { enabledBy } = {}) {
  if (!accountSet) {
    throw new Error("accountSet is required.");
  }
  if (accountSet.status === "enabled") {
    return accountSet;
  }

  return {
    ...accountSet,
    status: "enabled",
    enabledBy: enabledBy ?? null
  };
}

export function disableAccountSet(accountSet, { disabledBy } = {}) {
  if (!accountSet) {
    throw new Error("accountSet is required.");
  }
  if (accountSet.status === "disabled") {
    return accountSet;
  }

  return {
    ...accountSet,
    status: "disabled",
    disabledBy: disabledBy ?? null
  };
}

export function openAccountingPeriod(period, { openedBy } = {}) {
  if (!period) {
    throw new Error("period is required.");
  }
  if (period.status === "locked") {
    throw new Error("Locked periods cannot be opened.");
  }

  return {
    ...period,
    status: "open",
    openedBy: openedBy ?? null
  };
}

export function closeAccountingPeriod(period, { unpostedVoucherCount = 0, closedBy } = {}) {
  if (!period) {
    throw new Error("period is required.");
  }
  if (period.status !== "open") {
    throw new Error("Only open periods can be closed.");
  }
  if (unpostedVoucherCount > 0) {
    throw new Error(`Period close blocked: ${unpostedVoucherCount} unposted vouchers remain.`);
  }

  return {
    ...period,
    status: "closed",
    isCurrent: false,
    closedBy: closedBy ?? null
  };
}

export function lockAccountingPeriod(period, { lockedBy } = {}) {
  if (!period) {
    throw new Error("period is required.");
  }

  return {
    ...period,
    status: "locked",
    isCurrent: false,
    lockedBy: lockedBy ?? null
  };
}

export function setCurrentAccountingPeriod(targetPeriod, allPeriods, { setBy } = {}) {
  if (!targetPeriod) {
    throw new Error("period is required.");
  }
  if (targetPeriod.status !== "open") {
    throw new Error("Current accounting period must be open.");
  }

  const updatedPeriods = allPeriods.map((period) => ({
    ...period,
    isCurrent: period.id === targetPeriod.id
  }));

  return {
    period: {
      ...updatedPeriods.find((period) => period.id === targetPeriod.id),
      setBy: setBy ?? null
    },
    periods: updatedPeriods
  };
}
