import { addDays, inWeek } from './dates';
import type { AllData, CashOut, Closing, Day, Dish, Expense, Order } from './types';

export const activeOrders = (orders: Order[]) => orders.filter((o) => o.voidedAt === undefined);

export const listTotal = (order: Pick<Order, 'lines'>) =>
  order.lines.reduce((sum, l) => sum + l.qty * l.unitPriceMinor, 0);

/**
 * Splits what was actually paid across an order's dishes, in proportion to list price,
 * so per-dish revenue still adds up to the order amount after a discount.
 */
export function splitOrderByDish(order: Order): Record<string, { qty: number; revenue: number }> {
  const total = listTotal(order);
  const portions = order.lines.reduce((sum, l) => sum + l.qty, 0);
  const weight = (l: Order['lines'][number]) => (total > 0 ? l.qty * l.unitPriceMinor : l.qty);
  const weightTotal = total > 0 ? total : portions;

  const shares = order.lines.map((line) => {
    const exact = weightTotal > 0 ? (order.amountMinor * weight(line)) / weightTotal : 0;
    return { line, revenue: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });

  // Hand leftover minor units to the largest remainders so nothing is lost to rounding.
  let leftover = order.amountMinor - shares.reduce((sum, s) => sum + s.revenue, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (leftover <= 0) break;
    share.revenue += 1;
    leftover -= 1;
  }

  const result: Record<string, { qty: number; revenue: number }> = {};
  for (const { line, revenue } of shares) {
    const row = (result[line.dishId] ??= { qty: 0, revenue: 0 });
    row.qty += line.qty;
    row.revenue += revenue;
  }
  return result;
}

export function portionsSold(orders: Order[]): Record<string, number> {
  const sold: Record<string, number> = {};
  for (const order of activeOrders(orders)) {
    for (const line of order.lines) sold[line.dishId] = (sold[line.dishId] ?? 0) + line.qty;
  }
  return sold;
}

export function salesTotals(orders: Order[]) {
  let cash = 0;
  let transfer = 0;
  for (const order of activeOrders(orders)) {
    if (order.payment === 'cash') cash += order.amountMinor;
    else transfer += order.amountMinor;
  }
  return { cash, transfer, total: cash + transfer };
}

const sumAmounts = (items: { amountMinor: number }[]) => items.reduce((sum, i) => sum + i.amountMinor, 0);

/** Today's result: all sales minus the daily list. Weekly items are only counted in the week view. */
export function dayNumbers(orders: Order[], dailyExpenses: Expense[]) {
  const sales = salesTotals(orders);
  const costs = sumAmounts(dailyExpenses);
  return { ...sales, costs, profit: sales.total - costs };
}

export interface FoodRow {
  dishId: string;
  available: number;
  sold: number;
  expectedLeft: number;
  counted: number;
  /** counted − expected: negative means portions are unaccounted for. */
  diff: number;
}

export function foodCheck(day: Day, orders: Order[], closing: Closing | undefined): FoodRow[] | null {
  if (!closing?.portionsLeft) return null;
  const sold = portionsSold(orders);
  const dishIds = new Set([...Object.keys(day.portions), ...Object.keys(sold)]);
  return [...dishIds].map((dishId) => {
    const available = day.portions[dishId] ?? 0;
    const soldQty = sold[dishId] ?? 0;
    const expectedLeft = available - soldQty;
    const counted = closing.portionsLeft?.[dishId] ?? 0;
    return { dishId, available, sold: soldQty, expectedLeft, counted, diff: counted - expectedLeft };
  });
}

export function cashCheck(day: Day, orders: Order[], cashOuts: CashOut[], closing: Closing | undefined) {
  if (closing?.countedCashMinor === null || closing?.countedCashMinor === undefined) return null;
  const sales = salesTotals(orders);
  const cashOut = sumAmounts(cashOuts);
  const expected = day.openingCashMinor + sales.cash - cashOut;
  return {
    opening: day.openingCashMinor,
    cashSales: sales.cash,
    cashOut,
    expected,
    counted: closing.countedCashMinor,
    /** counted − expected: negative means cash is short. */
    diff: closing.countedCashMinor - expected,
    transfers: sales.transfer,
  };
}

export const missingPortions = (rows: FoodRow[]) => rows.reduce((sum, r) => sum + Math.max(0, -r.diff), 0);

export function missingFoodValue(rows: FoodRow[], dishes: Dish[]): number {
  return rows.reduce((sum, row) => {
    const price = dishes.find((d) => d.id === row.dishId)?.priceMinor ?? 0;
    return sum + Math.max(0, -row.diff) * price;
  }, 0);
}

// A day only counts toward the repeat warning if the gap is more than noise and has no ordinary explanation.
const CASH_TOLERANCE = 0.02;
const FOOD_TOLERANCE_PORTIONS = 1;

export function isCashShortDay(check: NonNullable<ReturnType<typeof cashCheck>>, closing: Closing): boolean {
  const explained = closing.cashReason !== undefined && closing.cashReason !== 'other';
  return !explained && check.diff < 0 && -check.diff > check.expected * CASH_TOLERANCE;
}

export function isFoodShortDay(rows: FoodRow[], closing: Closing): boolean {
  const explained = closing.foodReason !== undefined && closing.foodReason !== 'other';
  return !explained && missingPortions(rows) > FOOD_TOLERANCE_PORTIONS;
}

export interface WeekDayRow {
  date: string;
  sales: number;
  costs: number;
  profit: number;
  closed: boolean;
  cashDiff: number | null;
  missing: number | null;
}

export interface DishWeekRow {
  dish: Dish;
  sold: number;
  revenue: number;
  left: number;
}

export interface WeekSummary {
  start: string;
  sales: number;
  cash: number;
  transfer: number;
  dailyCosts: number;
  weeklyCosts: number;
  totalCosts: number;
  profit: number;
  portionsSold: number;
  portionsAvailable: number;
  avgCostPerPortion: number | null;
  daysOpen: number;
  perDish: DishWeekRow[];
  days: WeekDayRow[];
  cashUnaccounted: number; // total shortfall, as a positive amount
  portionsUnaccounted: number;
  cashShortDays: number;
  foodShortDays: number;
}

export function weekSummary(data: AllData, start: string): WeekSummary {
  const inThisWeek = <T extends { date: string }>(rows: T[]) => rows.filter((r) => inWeek(r.date, start));
  const orders = inThisWeek(data.orders);
  const expenses = inThisWeek(data.expenses);
  const days = inThisWeek(data.days).sort((a, b) => a.date.localeCompare(b.date));

  const sales = salesTotals(orders);
  const dailyCosts = sumAmounts(expenses.filter((e) => e.kind === 'daily'));
  const weeklyCosts = sumAmounts(expenses.filter((e) => e.kind === 'weekly'));
  const totalCosts = dailyCosts + weeklyCosts;

  const perDishMap = new Map<string, DishWeekRow>();
  const rowFor = (dishId: string) => {
    let row = perDishMap.get(dishId);
    if (!row) {
      const dish = data.dishes.find((d) => d.id === dishId);
      if (!dish) return null;
      row = { dish, sold: 0, revenue: 0, left: 0 };
      perDishMap.set(dishId, row);
    }
    return row;
  };

  for (const order of activeOrders(orders)) {
    for (const [dishId, split] of Object.entries(splitOrderByDish(order))) {
      const row = rowFor(dishId);
      if (row) {
        row.sold += split.qty;
        row.revenue += split.revenue;
      }
    }
  }

  let cashUnaccounted = 0;
  let portionsUnaccounted = 0;
  let cashShortDays = 0;
  let foodShortDays = 0;

  const dayRows = days.map((day): WeekDayRow => {
    const dayOrders = orders.filter((o) => o.date === day.date);
    const numbers = dayNumbers(
      dayOrders,
      expenses.filter((e) => e.kind === 'daily' && e.date === day.date),
    );
    const closing = data.closings.find((c) => c.date === day.date);
    const cash = cashCheck(
      day,
      dayOrders,
      data.cashOuts.filter((c) => c.date === day.date),
      closing,
    );
    const food = foodCheck(day, dayOrders, closing);

    if (cash && closing) {
      cashUnaccounted += Math.max(0, -cash.diff);
      if (isCashShortDay(cash, closing)) cashShortDays += 1;
    }
    if (food && closing) {
      portionsUnaccounted += missingPortions(food);
      if (isFoodShortDay(food, closing)) foodShortDays += 1;
      for (const row of food) {
        const dishRow = rowFor(row.dishId);
        if (dishRow) dishRow.left += row.counted;
      }
    }

    return {
      date: day.date,
      sales: numbers.total,
      costs: numbers.costs,
      profit: numbers.profit,
      closed: closing !== undefined,
      cashDiff: cash?.diff ?? null,
      missing: food ? missingPortions(food) : null,
    };
  });

  const sold = activeOrders(orders)
    .flatMap((o) => o.lines)
    .reduce((sum, l) => sum + l.qty, 0);
  const available = days.reduce(
    (sum, day) => sum + Object.values(day.portions).reduce((a, b) => a + b, 0),
    0,
  );

  return {
    start,
    sales: sales.total,
    cash: sales.cash,
    transfer: sales.transfer,
    dailyCosts,
    weeklyCosts,
    totalCosts,
    profit: sales.total - totalCosts,
    portionsSold: sold,
    portionsAvailable: available,
    avgCostPerPortion: available > 0 ? Math.round(totalCosts / available) : null,
    daysOpen: days.length,
    perDish: [...perDishMap.values()]
      .filter((row) => row.sold > 0 || row.left > 0)
      .sort((a, b) => b.revenue - a.revenue),
    days: dayRows,
    cashUnaccounted,
    portionsUnaccounted,
    cashShortDays,
    foodShortDays,
  };
}

export const previousWeek = (start: string) => addDays(start, -7);

/** Portions per open day needed to cover the week's costs at the average price actually charged. */
export function breakEvenPortionsPerDay(week: WeekSummary): number | null {
  if (week.portionsSold === 0 || week.sales === 0 || week.daysOpen === 0 || week.totalCosts === 0) return null;
  const averagePrice = week.sales / week.portionsSold;
  return Math.ceil(week.totalCosts / averagePrice / week.daysOpen);
}

export type PointerTone = 'good' | 'info' | 'warn';

export type Pointer =
  | { id: 'cash-repeat'; tone: PointerTone; days: number; amount: number }
  | { id: 'food-repeat'; tone: PointerTone; days: number; portions: number }
  | { id: 'break-even'; tone: PointerTone; needed: number; average: number }
  | { id: 'best-seller'; tone: PointerTone; dish: string; sold: number }
  | { id: 'most-unsold'; tone: PointerTone; dish: string; left: number }
  | { id: 'best-day'; tone: PointerTone; date: string; sales: number }
  | { id: 'vs-last-week'; tone: PointerTone; change: number };

export function pointers(week: WeekSummary, lastWeek: WeekSummary): Pointer[] {
  const out: Pointer[] = [];

  if (week.cashShortDays >= 2) {
    out.push({ id: 'cash-repeat', tone: 'warn', days: week.cashShortDays, amount: week.cashUnaccounted });
  }
  if (week.foodShortDays >= 2) {
    out.push({ id: 'food-repeat', tone: 'warn', days: week.foodShortDays, portions: week.portionsUnaccounted });
  }

  const needed = breakEvenPortionsPerDay(week);
  if (needed !== null) {
    const average = Math.round(week.portionsSold / week.daysOpen);
    out.push({ id: 'break-even', tone: average >= needed ? 'good' : 'warn', needed, average });
  }

  const bestSeller = [...week.perDish].sort((a, b) => b.sold - a.sold)[0];
  if (bestSeller && bestSeller.sold > 0) {
    out.push({ id: 'best-seller', tone: 'info', dish: bestSeller.dish.name, sold: bestSeller.sold });
  }

  const mostUnsold = [...week.perDish].sort((a, b) => b.left - a.left)[0];
  if (mostUnsold && mostUnsold.left > 0) {
    out.push({ id: 'most-unsold', tone: 'info', dish: mostUnsold.dish.name, left: mostUnsold.left });
  }

  if (week.days.length >= 2) {
    const best = [...week.days].sort((a, b) => b.sales - a.sales)[0];
    if (best.sales > 0) out.push({ id: 'best-day', tone: 'info', date: best.date, sales: best.sales });
  }

  if (lastWeek.daysOpen > 0 && week.daysOpen > 0) {
    const change = week.profit - lastWeek.profit;
    out.push({ id: 'vs-last-week', tone: change >= 0 ? 'good' : 'info', change });
  }

  return out;
}
