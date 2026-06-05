const ZERO_TOLERANCE = 0.000001;

export function sumVoucherSide(lines, side) {
  return lines.reduce((sum, line) => {
    const value = Number(line?.[side] ?? 0);
    if (!Number.isFinite(value)) {
      throw new TypeError(`Voucher line ${side} must be a finite number.`);
    }
    return sum + value;
  }, 0);
}

export function getVoucherBalance(voucher) {
  const lines = Array.isArray(voucher?.lines) ? voucher.lines : [];
  const debit = sumVoucherSide(lines, "debit");
  const credit = sumVoucherSide(lines, "credit");

  return {
    debit,
    credit,
    difference: debit - credit
  };
}

export function isVoucherBalanced(voucher) {
  const balance = getVoucherBalance(voucher);
  return Math.abs(balance.difference) < ZERO_TOLERANCE;
}

export function assertVoucherCanBePosted(voucher) {
  if (!voucher || !Array.isArray(voucher.lines) || voucher.lines.length === 0) {
    throw new Error("Voucher must contain at least one line.");
  }

  if (!isVoucherBalanced(voucher)) {
    const balance = getVoucherBalance(voucher);
    throw new Error(
      `Voucher is not balanced: debit=${balance.debit}, credit=${balance.credit}, difference=${balance.difference}.`
    );
  }

  return true;
}
