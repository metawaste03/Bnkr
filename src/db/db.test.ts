import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addDebtPayment,
  addExpense,
  addOrder,
  completeSetup,
  db,
  deleteDish,
  loadAll,
  saveClosing,
  saveMorning,
  voidOrder,
} from './index';
import { createBackup, restoreBackup, validateBackup } from './backup';
import { salesCsv } from '../lib/csv';

const D = '2026-11-04';
const line = { dishId: 'taco', qty: 1, unitPriceMinor: 800 };

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('customer numbers', () => {
  it('count up within a day and restart the next day', async () => {
    expect((await addOrder(D, [line], 800, 'cash')).customerNumber).toBe(1);
    expect((await addOrder(D, [line], 800, 'transfer')).customerNumber).toBe(2);
    expect((await addOrder('2026-11-05', [line], 800, 'cash')).customerNumber).toBe(1);
  });

  it('are not reused after a sale is voided, and the voided sale is kept', async () => {
    const first = await addOrder(D, [line], 800, 'cash');
    await voidOrder(first.id);
    expect((await addOrder(D, [line], 800, 'cash')).customerNumber).toBe(2);
    const orders = await db.orders.toArray();
    expect(orders).toHaveLength(2);
    expect(orders.find((o) => o.id === first.id)?.voidedAt).toBeTypeOf('number');
  });
});

describe('deleting dishes', () => {
  async function setupDishes() {
    await completeSetup('NGN', [
      { name: 'Jollof Rice', priceMinor: 150000 },
      { name: 'Typo', priceMinor: 100 },
    ]);
    const dishes = await db.dishes.toArray();
    return {
      jollof: dishes.find((d) => d.name === 'Jollof Rice')!.id,
      typo: dishes.find((d) => d.name === 'Typo')!.id,
    };
  }

  it('deletes a dish that was never sold or prepared', async () => {
    const { jollof, typo } = await setupDishes();
    await saveMorning(D, 0, { [jollof]: 10, [typo]: 0 }, []);
    expect(await deleteDish(typo)).toBe(true);
    expect(await db.dishes.get(typo)).toBeUndefined();
  });

  it('refuses to delete a dish with sales, even removed ones', async () => {
    const { jollof } = await setupDishes();
    const sale = await addOrder(D, [{ dishId: jollof, qty: 1, unitPriceMinor: 150000 }], 150000, 'cash');
    await voidOrder(sale.id);
    expect(await deleteDish(jollof)).toBe(false);
    expect(await db.dishes.get(jollof)).toBeDefined();
  });

  it('refuses to delete a dish that had portions on a day', async () => {
    const { jollof } = await setupDishes();
    await saveMorning(D, 0, { [jollof]: 5 }, []);
    expect(await deleteDish(jollof)).toBe(false);
  });
});

describe('morning check-in', () => {
  it('editing the morning numbers keeps the original opening time', async () => {
    await saveMorning(D, 1000, { taco: 10 }, [{ name: 'Chicken', amountMinor: 500 }]);
    const openedAt = (await db.days.get(D))!.openedAt;
    await saveMorning(D, 2000, { taco: 12 }, []);
    const day = (await db.days.get(D))!;
    expect(day).toMatchObject({ openingCashMinor: 2000, openedAt, portions: { taco: 12 } });
    expect(await db.expenses.count()).toBe(1);
  });
});

describe('backup', () => {
  async function seed() {
    await completeSetup('USD', [{ name: 'Taco', priceMinor: 800 }]);
    await saveMorning(D, 1000, { taco: 10 }, [{ name: 'Chicken', amountMinor: 500 }]);
    await addExpense('weekly', D, 'Oil', 900);
    const voided = await addOrder(D, [line], 800, 'cash');
    await voidOrder(voided.id);
    await addOrder(D, [line], 700, 'transfer');
    const owed = await addOrder(D, [line], 800, 'credit', 'Chidi');
    await addDebtPayment(owed.id, '2026-11-05', 300, 'cash');
    await saveClosing(D, 1000, { taco: 9 });
  }

  it('restores everything after the data is cleared', async () => {
    await seed();
    const before = await loadAll();
    const file = JSON.parse(JSON.stringify(await createBackup()));

    await Promise.all(db.tables.map((t) => t.clear()));
    expect((await loadAll()).orders).toHaveLength(0);

    const backup = validateBackup(file);
    expect(backup).not.toBeNull();
    await restoreBackup(backup!);

    const after = await loadAll();
    const sortById = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    expect(sortById(after.orders)).toEqual(sortById(before.orders));
    expect(after.days).toEqual(before.days);
    expect(after.closings).toEqual(before.closings);
    expect(sortById(after.expenses)).toEqual(sortById(before.expenses));
    expect(after.dishes).toEqual(before.dishes);
    expect(after.debtPayments).toEqual(before.debtPayments);
    expect(after.debtPayments).toHaveLength(1);
    expect(after.settings?.lastBackupAt).toBeTypeOf('number');
  });

  it('still restores a backup saved before pay later existed', async () => {
    await seed();
    const current = JSON.parse(JSON.stringify(await createBackup()));
    const { debtPayments: _dropped, ...rest } = current;
    const oldFile = { ...rest, version: 1, orders: current.orders.filter((o: { payment: string }) => o.payment !== 'credit') };
    const backup = validateBackup(oldFile);
    expect(backup).not.toBeNull();
    await restoreBackup(backup!);
    expect((await loadAll()).debtPayments).toEqual([]);
  });

  it('rejects a pay-later sale without a name, or an unknown payment type', async () => {
    await seed();
    const good = JSON.parse(JSON.stringify(await createBackup()));
    const credit = good.orders.find((o: { payment: string }) => o.payment === 'credit');
    expect(validateBackup({ ...good, orders: [{ ...credit, customerName: undefined }] })).toBeNull();
    expect(validateBackup({ ...good, orders: [{ ...credit, payment: 'iou' }] })).toBeNull();
    expect(validateBackup({ ...good, debtPayments: [{ ...good.debtPayments[0], method: 'gift' }] })).toBeNull();
  });

  it('rejects files that are not valid backups, without touching data', async () => {
    await seed();
    const good = JSON.parse(JSON.stringify(await createBackup()));
    expect(validateBackup(null)).toBeNull();
    expect(validateBackup({ app: 'other' })).toBeNull();
    expect(validateBackup({ ...good, version: 99 })).toBeNull();
    expect(validateBackup({ ...good, orders: 'nope' })).toBeNull();
    expect(validateBackup({ ...good, days: [{ date: 'yesterday' }] })).toBeNull();
    expect(validateBackup({ ...good, orders: [{ ...good.orders[0], amountMinor: -5 }] })).toBeNull();
    expect(validateBackup({ ...good, orders: [{ ...good.orders[0], lines: [{ qty: 1 }] }] })).toBeNull();
  });
});

describe('CSV export', () => {
  it('marks voided sales and neutralises spreadsheet formulas', async () => {
    await completeSetup('USD', [{ name: '=HYPERLINK("x")', priceMinor: 800 }]);
    const dish = (await db.dishes.toArray())[0];
    const sale = await addOrder(D, [{ dishId: dish.id, qty: 2, unitPriceMinor: 800 }], 1600, 'cash');
    await voidOrder(sale.id);
    const csv = salesCsv(await loadAll());
    expect(csv).toContain('2026-11-04,1,"\'=HYPERLINK(""x"")",2,16.00,cash,voided,,\r\n');
  });

  it('names who owes on pay-later sales', async () => {
    await completeSetup('NGN', [{ name: 'Jollof', priceMinor: 150000 }]);
    const dish = (await db.dishes.toArray())[0];
    const sale = await addOrder(D, [{ dishId: dish.id, qty: 1, unitPriceMinor: 150000 }], 150000, 'credit', 'Chidi');
    await addDebtPayment(sale.id, D, 50000, 'cash');
    expect(salesCsv(await loadAll())).toContain('2026-11-04,1,Jollof,1,1500.00,pay later,sold,Chidi,1000.00\r\n');
  });
});

describe('pay-later records', () => {
  const credit = () => addOrder(D, [line], 800, 'credit', 'Chidi');

  it('needs a customer name', async () => {
    await expect(addOrder(D, [line], 800, 'credit', '  ')).rejects.toThrow();
  });

  it('refuses a payment for more than is owed, including across several payments', async () => {
    const sale = await credit();
    expect(await addDebtPayment(sale.id, D, 900, 'cash')).toBe(false);
    expect(await addDebtPayment(sale.id, D, 500, 'cash')).toBe(true);
    expect(await addDebtPayment(sale.id, D, 400, 'transfer')).toBe(false);
    expect(await addDebtPayment(sale.id, D, 300, 'write-off')).toBe(true);
    expect(await addDebtPayment(sale.id, D, 1, 'cash')).toBe(false);
  });

  it('refuses payments against cash sales or removed sales', async () => {
    const cashSale = await addOrder(D, [line], 800, 'cash');
    expect(await addDebtPayment(cashSale.id, D, 100, 'cash')).toBe(false);
    const removed = await credit();
    await voidOrder(removed.id);
    expect(await addDebtPayment(removed.id, D, 100, 'cash')).toBe(false);
  });

  it('will not remove a sale once money has been recorded against it', async () => {
    const sale = await credit();
    await addDebtPayment(sale.id, D, 100, 'cash');
    expect(await voidOrder(sale.id)).toBe(false);
    expect((await db.orders.get(sale.id))?.voidedAt).toBeUndefined();
  });
});
