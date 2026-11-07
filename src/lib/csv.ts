import { debtFor, splitOrderByDish } from './calculations';
import { fractionDigits, minorToInput } from './money';
import type { AllData } from './types';

function cell(value: string | number): string {
  let text = String(value);
  // Stop a dish or item name being run as a formula when the file is opened in a spreadsheet.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

const PAYMENT_LABEL = { cash: 'cash', transfer: 'transfer', credit: 'pay later' } as const;

/**
 * One row per dish per sale. Amounts are each dish's share of what was charged.
 * Pay-later rows name the customer and show what that whole sale still owes.
 */
export function salesCsv(data: AllData): string {
  const digits = fractionDigits(data.settings?.currency ?? 'NGN');
  const money = (minor: number) => minorToInput(minor, digits);
  const rows: (string | number)[][] = [
    ['date', 'customer', 'dish', 'quantity', 'amount', 'payment', 'status', 'pay_later_name', 'sale_still_owed'],
  ];
  const orders = [...data.orders].sort(
    (a, b) => a.date.localeCompare(b.date) || a.customerNumber - b.customerNumber,
  );
  for (const order of orders) {
    const owed = order.payment === 'credit' ? money(debtFor(order, data.debtPayments).remaining) : '';
    for (const [dishId, split] of Object.entries(splitOrderByDish(order))) {
      rows.push([
        order.date,
        order.customerNumber,
        data.dishes.find((d) => d.id === dishId)?.name ?? dishId,
        split.qty,
        money(split.revenue),
        PAYMENT_LABEL[order.payment],
        order.voidedAt === undefined ? 'sold' : 'voided',
        order.customerName ?? '',
        order.voidedAt === undefined ? owed : '',
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
