import Dexie, { type EntityTable } from 'dexie';
import type {
  AllData,
  CashOut,
  Closing,
  Day,
  Dish,
  Expense,
  ExpenseKind,
  Order,
  OrderLine,
  Payment,
  Settings,
} from '../lib/types';

// The app's original name. Don't rename this: a new name would open an empty database and strand saved records.
export const db = new Dexie('daybook') as Dexie & {
  settings: EntityTable<Settings, 'key'>;
  dishes: EntityTable<Dish, 'id'>;
  days: EntityTable<Day, 'date'>;
  expenses: EntityTable<Expense, 'id'>;
  orders: EntityTable<Order, 'id'>;
  cashOuts: EntityTable<CashOut, 'id'>;
  closings: EntityTable<Closing, 'date'>;
};

db.version(1).stores({
  settings: 'key',
  dishes: 'id',
  days: 'date',
  expenses: 'id, date',
  orders: 'id, date',
  cashOuts: 'id, date',
  closings: 'date',
});

const newId = () => crypto.randomUUID();

export async function loadAll(): Promise<AllData> {
  const [settings, dishes, days, expenses, orders, cashOuts, closings] = await Promise.all([
    db.settings.get('app'),
    db.dishes.orderBy('id').toArray(),
    db.days.toArray(),
    db.expenses.toArray(),
    db.orders.toArray(),
    db.cashOuts.toArray(),
    db.closings.toArray(),
  ]);
  dishes.sort((a, b) => a.sort - b.sort);
  return { settings: settings ?? null, dishes, days, expenses, orders, cashOuts, closings };
}

export async function completeSetup(
  currency: string,
  dishes: { name: string; priceMinor: number }[],
): Promise<void> {
  await db.transaction('rw', db.settings, db.dishes, async () => {
    await db.settings.put({ key: 'app', currency, createdAt: Date.now(), lastBackupAt: null });
    await db.dishes.bulkPut(dishes.map((d, sort) => ({ id: newId(), active: true, sort, ...d })));
  });
}

export async function addDish(name: string, priceMinor: number, sort: number): Promise<void> {
  await db.dishes.put({ id: newId(), name, priceMinor, active: true, sort });
}

export const updateDish = (id: string, changes: Partial<Pick<Dish, 'name' | 'priceMinor' | 'active'>>) =>
  db.dishes.update(id, changes);

/** A dish is in use once it has been sold (even if the sale was removed) or had portions on any day. */
export function isDishUsed(data: Pick<AllData, 'orders' | 'days'>, dishId: string): boolean {
  return (
    data.orders.some((o) => o.lines.some((l) => l.dishId === dishId)) ||
    data.days.some((d) => (d.portions[dishId] ?? 0) > 0)
  );
}

/** Deletes a dish only if it has never been used, so no past record loses its dish name. */
export async function deleteDish(id: string): Promise<boolean> {
  return db.transaction('rw', db.dishes, db.orders, db.days, async () => {
    const [orders, days] = await Promise.all([db.orders.toArray(), db.days.toArray()]);
    if (isDishUsed({ orders, days }, id)) return false;
    await db.dishes.delete(id);
    return true;
  });
}

export async function saveMorning(
  date: string,
  openingCashMinor: number,
  portions: Record<string, number>,
  expenses: { name: string; amountMinor: number }[],
): Promise<void> {
  await db.transaction('rw', db.days, db.expenses, async () => {
    const existing = await db.days.get(date);
    await db.days.put({ date, openingCashMinor, portions, openedAt: existing?.openedAt ?? Date.now() });
    for (const e of expenses) await addExpense('daily', date, e.name, e.amountMinor);
  });
}

export async function addExpense(
  kind: ExpenseKind,
  date: string,
  name: string,
  amountMinor: number,
): Promise<void> {
  await db.expenses.put({ id: newId(), kind, date, name, amountMinor, createdAt: Date.now() });
}

export const removeExpense = (id: string) => db.expenses.delete(id);

/** Saves a sale with the next customer number. Voided sales keep their numbers, so numbers are never reused. */
export async function addOrder(
  date: string,
  lines: OrderLine[],
  amountMinor: number,
  payment: Payment,
): Promise<Order> {
  return db.transaction('rw', db.orders, async () => {
    const sameDay = await db.orders.where('date').equals(date).toArray();
    const customerNumber = sameDay.reduce((max, o) => Math.max(max, o.customerNumber), 0) + 1;
    const order: Order = {
      id: newId(),
      date,
      customerNumber,
      payment,
      lines,
      amountMinor,
      createdAt: Date.now(),
    };
    await db.orders.put(order);
    return order;
  });
}

export const voidOrder = (id: string) => db.orders.update(id, { voidedAt: Date.now() });

export async function addCashOut(date: string, amountMinor: number, note: string): Promise<void> {
  await db.cashOuts.put({ id: newId(), date, amountMinor, note, createdAt: Date.now() });
}

export const removeCashOut = (id: string) => db.cashOuts.delete(id);

export async function saveClosing(
  date: string,
  countedCashMinor: number,
  portionsLeft: Record<string, number>,
): Promise<void> {
  await db.closings.put({ date, skipped: false, countedCashMinor, portionsLeft, closedAt: Date.now() });
}

export async function skipClosing(date: string): Promise<void> {
  await db.closings.put({
    date,
    skipped: true,
    countedCashMinor: null,
    portionsLeft: null,
    closedAt: Date.now(),
  });
}

export const updateClosingReasons = (date: string, changes: Pick<Closing, 'cashReason' | 'foodReason'>) =>
  db.closings.update(date, changes);

export const markBackedUp = () => db.settings.update('app', { lastBackupAt: Date.now() });
