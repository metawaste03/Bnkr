import { splitOrderByDish } from './calculations';
import { fractionDigits, minorToInput } from './money';
import type { AllData } from './types';

function cell(value: string | number): string {
  let text = String(value);
  // Stop a dish or item name being run as a formula when the file is opened in a spreadsheet.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

/** One row per dish per sale. Amounts are the share actually paid; voided sales are marked. */
export function salesCsv(data: AllData): string {
  const digits = fractionDigits(data.settings?.currency ?? 'NGN');
  const rows: (string | number)[][] = [['date', 'customer', 'dish', 'quantity', 'amount', 'payment', 'status']];
  const orders = [...data.orders].sort(
    (a, b) => a.date.localeCompare(b.date) || a.customerNumber - b.customerNumber,
  );
  for (const order of orders) {
    for (const [dishId, split] of Object.entries(splitOrderByDish(order))) {
      rows.push([
        order.date,
        order.customerNumber,
        data.dishes.find((d) => d.id === dishId)?.name ?? dishId,
        split.qty,
        minorToInput(split.revenue, digits),
        order.payment,
        order.voidedAt === undefined ? 'sold' : 'voided',
      ]);
    }
  }
  return toCsv(rows);
}

export function expensesCsv(data: AllData): string {
  const digits = fractionDigits(data.settings?.currency ?? 'NGN');
  const rows: (string | number)[][] = [['date', 'list', 'item', 'amount']];
  for (const e of [...data.expenses].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([e.date, e.kind, e.name, minorToInput(e.amountMinor, digits)]);
  }
  return toCsv(rows);
}
