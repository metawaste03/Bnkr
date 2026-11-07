export function isValidCurrency(code: string): boolean {
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code });
    return /^[A-Z]{3}$/.test(code);
  } catch {
    return false;
  }
}

export function fractionDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatMoney(minor: number, currency: string): string {
  const digits = fractionDigits(currency);
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol', // ₦ rather than NGN
    trailingZeroDisplay: 'stripIfInteger', // ₦1,500 rather than ₦1,500.00
  }).format(minor / 10 ** digits);
}

/** The amount as it should appear in an editable field: 1500, or 1500.50 if it has kobo. */
export function minorToEditable(minor: number, digits: number): string {
  return minor % 10 ** digits === 0 ? String(minor / 10 ** digits) : minorToInput(minor, digits);
}

export function minorToInput(minor: number, digits: number): string {
  return (minor / 10 ** digits).toFixed(digits);
}

/**
 * Reads typed money into minor units, accepting "12.50", "12,50", "1,500" and "1.500,75".
 * Returns null for anything that isn't a clear, non-negative amount.
 */
export function parseMoney(text: string, digits: number): number | null {
  const s = text.replace(/\s/g, '');
  if (!/^(\d[\d.,]*|[.,]\d+)$/.test(s)) return null;

  const dots = s.split('.').length - 1;
  const commas = s.split(',').length - 1;
  let whole = s;
  let fraction = '';

  if (dots > 0 && commas > 0) {
    const decimalAt = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    const separator = s[decimalAt];
    if (s.split(separator).length - 1 > 1) return null; // "1,000,000.50" is fine, "1.000,50,25" isn't
    whole = s.slice(0, decimalAt);
    fraction = s.slice(decimalAt + 1);
  } else if (dots + commas > 1) {
    whole = s; // a repeated separator can only be grouping
  } else if (dots + commas === 1) {
    const at = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    const after = s.slice(at + 1);
    const looksLikeGrouping = after.length === 3 && at > 0 && digits !== 3;
    if (!looksLikeGrouping) {
      whole = s.slice(0, at);
      fraction = after;
    }
  }

  whole = whole.replace(/[.,]/g, '');
  if (fraction.length > digits) return null;

  const minor = Number(whole || '0') * 10 ** digits + Number(fraction.padEnd(digits, '0') || '0');
  return Number.isSafeInteger(minor) ? minor : null;
}
