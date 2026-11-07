import { describe, expect, it } from 'vitest';
import {
  breakEvenPortionsPerDay,
  cashCheck,
  dayNumbers,
  debtorsOf,
  foodCheck,
  openDebts,
  missingFoodValue,
  missingPortions,
  pointers,
  portionsSold,
  splitOrderByDish,
  weekSummary,
} from './calculations';
import { addDays, weekStart } from './dates';
import type { AllData, Closing, Day, DebtPayment, Dish, Expense, Order } from './types';

const taco: Dish = { id: 'taco', name: 'Taco', priceMinor: 800, active: true, sort: 0 };
const soup: Dish = { id: 'soup', name: 'Soup', priceMinor: 500, active: true, sort: 1 };

let nextId = 1;
const order = (date: string, dishId: string, qty: number, price: number, extra: Partial<Order> = {}): Order => ({
  id: `o${nextId++}`,
  date,
  customerNumber: nextId,
  payment: 'cash',
  lines: [{ dishId, qty, unitPriceMinor: price }],
  amountMinor: qty * price,
  createdAt: 0,
  ...extra,
});
const expense = (date: string, kind: Expense['kind'], amountMinor: number): Expense => ({
  id: `e${nextId++}`,
  kind,
  date,
  name: 'Item',
  amountMinor,
  createdAt: 0,
});
const day = (date: string, openingCashMinor: number, portions: Record<string, number>): Day => ({
  date,
  openingCashMinor,
  portions,
  openedAt: 0,
});
const closing = (date: string, cash: number, left: Record<string, number>, extra: Partial<Closing> = {}): Closing => ({
  date,
  skipped: false,
  countedCashMinor: cash,
  portionsLeft: left,
  closedAt: 0,
  ...extra,
});
const emptyData = (over: Partial<AllData>): AllData => ({
  settings: null,
  dishes: [taco, soup],
  days: [],
  expenses: [],
  orders: [],
  cashOuts: [],
  closings: [],
  debtPayments: [],
  ...over,
});

const pay = (orderId: string, date: string, amountMinor: number, method: DebtPayment['method']): DebtPayment => ({
  id: `p${nextId++}`,
  orderId,
  date,
  amountMinor,
  method,
  createdAt: 0,
});

const D = '2026-11-04'; // a Wednesday

describe('closing checks', () => {
  it('matches the agreed example: 3 portions and $24 unaccounted for', () => {
    const d = day(D, 2000, { taco: 50 });
    const orders = [order(D, 'taco', 40, 800)];
    const c = closing(D, 31600, { taco: 7 });

    const food = foodCheck(d, orders, c)!;
    expect(food[0]).toMatchObject({ available: 50, sold: 40, expectedLeft: 10, counted: 7, diff: -3 });
    expect(missingPortions(food)).toBe(3);
    expect(missingFoodValue(food, [taco])).toBe(2400);

    const cash = cashCheck(d, orders, [], c)!;
    expect(cash.expected).toBe(34000);
    expect(cash.counted).toBe(31600);
    expect(cash.diff).toBe(-2400);
  });

  it('leaves transfers out of the cash check but shows them separately', () => {
    const d = day(D, 1000, { taco: 5 });
    const orders = [order(D, 'taco', 1, 800), order(D, 'taco', 2, 800, { payment: 'transfer' })];
    const cash = cashCheck(d, orders, [], closing(D, 1800, { taco: 2 }))!;
    expect(cash.expected).toBe(1800);
    expect(cash.diff).toBe(0);
    expect(cash.transfers).toBe(1600);
  });

  it('still counts transferred portions as sold in the food check', () => {
    const d = day(D, 0, { taco: 5 });
    const orders = [order(D, 'taco', 2, 800, { payment: 'transfer' })];
    expect(foodCheck(d, orders, closing(D, 0, { taco: 3 }))![0].diff).toBe(0);
  });

  it('takes cash removed from the till off the expected cash', () => {
    const d = day(D, 1000, { taco: 5 });
    const out = { id: 'c', date: D, amountMinor: 300, note: 'ice', createdAt: 0 };
    const cash = cashCheck(d, [order(D, 'taco', 1, 800)], [out], closing(D, 1500, { taco: 4 }))!;
    expect(cash.expected).toBe(1500);
    expect(cash.diff).toBe(0);
  });

  it('ignores voided sales in both checks', () => {
    const d = day(D, 1000, { taco: 5 });
    const orders = [order(D, 'taco', 1, 800), order(D, 'taco', 2, 800, { voidedAt: 5 })];
    const c = closing(D, 1800, { taco: 4 });
    expect(cashCheck(d, orders, [], c)!.diff).toBe(0);
    expect(foodCheck(d, orders, c)![0].diff).toBe(0);
    expect(portionsSold(orders).taco).toBe(1);
  });

  it('reports extra cash and food as positive differences, not shortfalls', () => {
    const d = day(D, 0, { taco: 5 });
    const orders = [order(D, 'taco', 2, 800)];
    const c = closing(D, 1700, { taco: 4 });
    expect(cashCheck(d, orders, [], c)!.diff).toBe(100);
    const food = foodCheck(d, orders, c)!;
    expect(food[0].diff).toBe(1);
    expect(missingPortions(food)).toBe(0);
  });

  it('includes a dish that was sold without being listed that morning', () => {
    const food = foodCheck(day(D, 0, { taco: 5 }), [order(D, 'soup', 1, 500)], closing(D, 0, { taco: 5 }))!;
    expect(food.find((r) => r.dishId === 'soup')).toMatchObject({ available: 0, sold: 1, expectedLeft: -1, diff: 1 });
  });

  it('returns no checks when the day was closed without a count', () => {
    const c: Closing = { date: D, skipped: true, countedCashMinor: null, portionsLeft: null, closedAt: 0 };
    expect(cashCheck(day(D, 0, {}), [], [], c)).toBeNull();
    expect(foodCheck(day(D, 0, {}), [], c)).toBeNull();
    expect(cashCheck(day(D, 0, {}), [], [], undefined)).toBeNull();
  });
});

describe('pay later', () => {
  const NEXT = '2026-11-05';
  const credit = (date: string, qty: number, name = 'Chidi') =>
    order(date, 'taco', qty, 800, { payment: 'credit', customerName: name });

  it('counts the food as sold but expects no cash for it', () => {
    const d = day(D, 1000, { taco: 5 });
    const orders = [order(D, 'taco', 1, 800), credit(D, 2)];
    const c = closing(D, 1800, { taco: 2 });
    expect(foodCheck(d, orders, c)![0].diff).toBe(0);
    const cash = cashCheck(d, orders, [], c)!;
    expect(cash.expected).toBe(1800);
    expect(cash.diff).toBe(0);
  });

  it('counts as a sale on the day the food was sold', () => {
    const numbers = dayNumbers([credit(D, 2)], [expense(D, 'daily', 500)]);
    expect(numbers).toMatchObject({ credit: 1600, total: 1600, profit: 1100 });
  });

  it('paid the same day in cash: expected in the till that day', () => {
    const sale = credit(D, 2);
    const cash = cashCheck(day(D, 0, { taco: 2 }), [sale], [], closing(D, 1600, { taco: 0 }), [pay(sale.id, D, 1600, 'cash')])!;
    expect(cash.debtCash).toBe(1600);
    expect(cash.expected).toBe(1600);
    expect(cash.diff).toBe(0);
  });

  it('paid the next day in cash: raises the next day, not the sale day, and is not a new sale', () => {
    const sale = credit(D, 2);
    const payment = pay(sale.id, NEXT, 1600, 'cash');
    const data = emptyData({
      days: [day(D, 0, { taco: 2 }), day(NEXT, 0, { taco: 0 })],
      orders: [sale],
      debtPayments: [payment],
      closings: [closing(D, 0, { taco: 0 }), closing(NEXT, 1600, { taco: 0 })],
    });
    const week = weekSummary(data, weekStart(D));
    expect(week.days.map((r) => r.cashDiff)).toEqual([0, 0]);
    expect(week.days.map((r) => r.sales)).toEqual([1600, 0]);
    expect(week.sales).toBe(1600);
    expect(week.debtCash).toBe(1600);
    expect(openDebts(data)).toHaveLength(0);
  });

  it('paid by transfer: shown with transfers, not in the till', () => {
    const sale = credit(D, 1);
    const cash = cashCheck(day(D, 0, {}), [sale], [], closing(D, 0, {}), [pay(sale.id, D, 800, 'transfer')])!;
    expect(cash.expected).toBe(0);
    expect(cash.transfers).toBe(800);
  });

  it('partly paid: the rest stays owed', () => {
    const sale = credit(D, 2);
    const data = emptyData({ orders: [sale], debtPayments: [pay(sale.id, NEXT, 1000, 'cash')] });
    const [debt] = openDebts(data);
    expect(debt).toMatchObject({ paid: 1000, remaining: 600 });
  });

  it("never paid: marking it won't be paid takes it off profit in the week it's given up", () => {
    const sale = credit(D, 2);
    const data = emptyData({
      days: [day(D, 0, { taco: 2 })],
      orders: [sale],
      debtPayments: [pay(sale.id, NEXT, 1600, 'write-off')],
    });
    const week = weekSummary(data, weekStart(D));
    expect(week.sales).toBe(1600);
    expect(week.writtenOff).toBe(1600);
    expect(week.profit).toBe(0);
    expect(openDebts(data)).toHaveLength(0);
  });

  it('ignores removed pay-later sales', () => {
    expect(openDebts(emptyData({ orders: [credit(D, 1), { ...credit(D, 1), voidedAt: 1 }] }))).toHaveLength(1);
  });

  it('groups debts by name, ignoring case and spaces', () => {
    const debtors = debtorsOf(
      openDebts(emptyData({ orders: [credit(D, 1, 'Chidi'), credit(NEXT, 2, ' chidi '), credit(D, 1, 'Ada')] })),
    );
    expect(debtors.map((d) => [d.name, d.debts.length, d.total])).toEqual([
      ['Chidi', 2, 2400],
      ['Ada', 1, 800],
    ]);
  });

  it('points out old debts and people with more than one unpaid sale', () => {
    const today = '2026-11-08';
    const open = openDebts(emptyData({ orders: [credit('2026-11-04', 1), credit('2026-11-07', 1), credit('2026-11-07', 1, 'Ada')] }));
    const empty = weekSummary(emptyData({}), weekStart(today));
    const found = pointers(empty, empty, open, today);
    expect(found.find((p) => p.id === 'owed-old')).toMatchObject({ count: 1, amount: 800 });
    expect(found.find((p) => p.id === 'repeat-debtor')).toMatchObject({ name: 'Chidi', count: 2, amount: 1600 });
    expect(pointers(empty, empty, open)).toEqual([]); // past weeks get no debt pointers
  });
});

describe('profit', () => {
  it('uses only the daily list for the daily number', () => {
    const numbers = dayNumbers(
      [order(D, 'taco', 2, 800), order(D, 'soup', 1, 500, { payment: 'transfer' })],
      [expense(D, 'daily', 900)],
    );
    expect(numbers).toMatchObject({ cash: 1600, transfer: 500, total: 2100, costs: 900, profit: 1200 });
  });

  it('counts the weekly list once in the week, without splitting it', () => {
    const week = weekSummary(
      emptyData({
        days: [day(D, 0, { taco: 10 })],
        orders: [order(D, 'taco', 5, 800)],
        expenses: [expense(D, 'daily', 1000), expense(D, 'weekly', 1500)],
      }),
      weekStart(D),
    );
    expect(week.sales).toBe(4000);
    expect(week.totalCosts).toBe(2500);
    expect(week.profit).toBe(1500);
    expect(week.avgCostPerPortion).toBe(250);
  });
});

describe('week boundaries', () => {
  it('runs Monday to Sunday', () => {
    expect(weekStart('2026-11-02')).toBe('2026-11-02'); // Monday
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sunday
    expect(weekStart('2026-11-09')).toBe('2026-11-09'); // next Monday
  });

  it('crosses month ends and daylight saving dates correctly', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });

  it('keeps Sunday sales in their week and Monday sales in the next', () => {
    const data = emptyData({
      days: [day('2026-11-08', 0, {}), day('2026-11-09', 0, {})],
      orders: [order('2026-11-08', 'taco', 1, 800), order('2026-11-09', 'taco', 1, 500)],
    });
    expect(weekSummary(data, '2026-11-02').sales).toBe(800);
    expect(weekSummary(data, '2026-11-09').sales).toBe(500);
  });
});

describe('splitOrderByDish', () => {
  it('splits a discount across dishes and still adds up to what was paid', () => {
    const o: Order = {
      ...order(D, 'taco', 1, 800),
      lines: [
        { dishId: 'taco', qty: 1, unitPriceMinor: 800 },
        { dishId: 'soup', qty: 1, unitPriceMinor: 500 },
      ],
      amountMinor: 1000,
    };
    const split = splitOrderByDish(o);
    expect(split.taco.revenue + split.soup.revenue).toBe(1000);
    expect(split.taco.revenue).toBe(615);
  });

  it('handles a zero-price list by splitting on quantity', () => {
    const o = { ...order(D, 'taco', 2, 0), amountMinor: 101 };
    expect(splitOrderByDish(o).taco.revenue).toBe(101);
  });
});

describe('pointers', () => {
  const closedDay = (date: string, cash: number, left: number, extra: Partial<Closing> = {}) => ({
    day: day(date, 0, { taco: 10 }),
    order: order(date, 'taco', 5, 1000),
    closing: closing(date, cash, { taco: left }, extra),
  });
  const build = (rows: ReturnType<typeof closedDay>[]) =>
    weekSummary(
      emptyData({
        days: rows.map((r) => r.day),
        orders: rows.map((r) => r.order),
        closings: rows.map((r) => r.closing),
      }),
      '2026-11-02',
    );
  const empty = weekSummary(emptyData({}), '2026-10-26');
  const ids = (week: ReturnType<typeof build>) => pointers(week, empty).map((p) => p.id);

  it('does not warn about a single short day', () => {
    const week = build([closedDay('2026-11-02', 4000, 5), closedDay('2026-11-03', 5000, 5)]);
    expect(ids(week)).not.toContain('cash-repeat');
  });

  it('warns when cash is short on repeated days', () => {
    const week = build([closedDay('2026-11-02', 4000, 5), closedDay('2026-11-03', 4000, 5)]);
    expect(ids(week)).toContain('cash-repeat');
    expect(week.cashUnaccounted).toBe(2000);
  });

  it('ignores differences within the tolerance', () => {
    const week = build([closedDay('2026-11-02', 4950, 5), closedDay('2026-11-03', 4950, 5)]);
    expect(week.cashShortDays).toBe(0);
  });

  it('does not count a day explained by an ordinary reason', () => {
    const week = build([
      closedDay('2026-11-02', 4000, 5, { cashReason: 'wrong-change' }),
      closedDay('2026-11-03', 4000, 5),
    ]);
    expect(week.cashShortDays).toBe(1);
  });

  it('warns about repeated missing food, but not one portion', () => {
    const one = build([closedDay('2026-11-02', 5000, 4), closedDay('2026-11-03', 5000, 4)]);
    expect(ids(one)).not.toContain('food-repeat');
    const three = build([closedDay('2026-11-02', 5000, 2), closedDay('2026-11-03', 5000, 2)]);
    expect(ids(three)).toContain('food-repeat');
  });

  it('works out break-even portions per open day from the average price', () => {
    const week = weekSummary(
      emptyData({
        days: [day(D, 0, { taco: 10 }), day(addDays(D, 1), 0, { taco: 10 })],
        orders: [order(D, 'taco', 10, 500)],
        expenses: [expense(D, 'weekly', 10100)],
      }),
      weekStart(D),
    );
    expect(breakEvenPortionsPerDay(week)).toBe(11);
  });

  it('gives no pointers for an empty week', () => {
    expect(pointers(empty, empty)).toEqual([]);
  });
});
