// All money values are whole minor units (for example cents).

export type Payment = 'cash' | 'transfer' | 'credit'; // credit = eat now, pay later
export type DebtMethod = 'cash' | 'transfer' | 'write-off';
export type ExpenseKind = 'daily' | 'weekly';

export interface Settings {
  key: 'app';
  currency: string;
  createdAt: number;
  lastBackupAt: number | null;
}

export interface Dish {
  id: string;
  name: string;
  priceMinor: number;
  active: boolean;
  sort: number;
}

export interface Day {
  date: string; // YYYY-MM-DD, local time
  openingCashMinor: number;
  portions: Record<string, number>; // dish id -> portions available
  openedAt: number;
}

export interface Expense {
  id: string;
  kind: ExpenseKind;
  date: string;
  name: string;
  amountMinor: number;
  createdAt: number;
}

export interface OrderLine {
  dishId: string;
  qty: number;
  unitPriceMinor: number; // list price when sold
}

export interface Order {
  id: string;
  date: string;
  customerNumber: number;
  payment: Payment;
  lines: OrderLine[];
  amountMinor: number; // what was charged, which may differ from the list total
  customerName?: string; // who owes, for pay-later sales
  createdAt: number;
  voidedAt?: number;
}

/** Money received (or given up on) for a pay-later sale, dated the day it happened. */
export interface DebtPayment {
  id: string;
  orderId: string;
  date: string;
  amountMinor: number;
  method: DebtMethod;
  createdAt: number;
}

export interface CashOut {
  id: string;
  date: string;
  amountMinor: number;
  note: string;
  createdAt: number;
}

export type CashReason = 'wrong-change' | 'mistake' | 'other';
export type FoodReason = 'free-meal' | 'spill' | 'mistake' | 'other';

export interface Closing {
  date: string;
  skipped: boolean; // the day was closed without a count
  countedCashMinor: number | null;
  portionsLeft: Record<string, number> | null;
  cashReason?: CashReason;
  foodReason?: FoodReason;
  closedAt: number;
}

export interface AllData {
  settings: Settings | null;
  dishes: Dish[];
  days: Day[];
  expenses: Expense[];
  orders: Order[];
  cashOuts: CashOut[];
  closings: Closing[];
  debtPayments: DebtPayment[];
}
