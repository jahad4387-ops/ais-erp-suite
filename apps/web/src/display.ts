type VoucherDisplayInput = {
  id?: string | null;
  voucherNo?: string | null;
  fiscalYear?: number | null;
  periodNo?: number | null;
};

const legacyVoucherNoPattern = /^JV-\d{6}-(\d{4})$/;

export function displayVoucherNo(voucher?: VoucherDisplayInput | null) {
  const raw = voucher?.voucherNo || '';
  const legacyMatch = legacyVoucherNoPattern.exec(raw);
  if (legacyMatch) {
    return `记-${String(Number(legacyMatch[1])).padStart(3, '0')}`;
  }
  if (/^记-\d{3}$/.test(raw)) {
    return raw;
  }
  if (raw && !raw.startsWith('voucher:')) {
    return raw;
  }
  const period = voucher?.fiscalYear && voucher?.periodNo ? `${voucher.fiscalYear}年第${voucher.periodNo}期` : '';
  return period ? `未编号凭证（${period}）` : '未编号凭证';
}

export function displayActorName(actorId: string | null | undefined, userNamesById: Map<string, string>, fallback?: string) {
  if (!actorId) {
    return '-';
  }
  return userNamesById.get(actorId) || fallback || actorId;
}
