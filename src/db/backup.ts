import { db, loadAll } from './index';
import type { AllData } from '../lib/types';

/** Version 2 added pay-later repayments. Version 1 files (before credit existed) still restore. */
const BACKUP_VERSION = 2;

export interface BackupFile extends AllData {
  app: 'daybook'; // the app's original name, kept so older backups stay valid
  version: number;
  exportedAt: number;
}

export async function createBackup(): Promise<BackupFile> {
  return { app: 'daybook', version: BACKUP_VERSION, exportedAt: Date.now(), ...(await loadAll()) };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isCountMap = (v: unknown) => isRecord(v) && Object.values(v).every(isCount);
const PAYMENTS = ['cash', 'transfer', 'credit'];
const DEBT_METHODS = ['cash', 'transfer', 'write-off'];

/** Checks a parsed file before anything is overwritten. Returns the backup, or null if it can't be trusted. */
export function validateBackup(parsed: unknown): BackupFile | null {
  if (!isRecord(parsed) || parsed.app !== 'daybook') return null;
  if (parsed.version !== 1 && parsed.version !== BACKUP_VERSION) return null;

  const { settings, dishes, days, expenses, orders, cashOuts, closings } = parsed;
  const debtPayments = parsed.version === 1 ? [] : parsed.debtPayments;
  if (!isRecord(settings) || settings.key !== 'app' || typeof settings.currency !== 'string') return null;

  const every = (rows: unknown, check: (r: Record<string, unknown>) => boolean) =>
    Array.isArray(rows) && rows.every((r) => isRecord(r) && check(r));

  const valid =
    every(dishes, (r) => typeof r.id === 'string' && typeof r.name === 'string' && isCount(r.priceMinor)) &&
    every(days, (r) => isDate(r.date) && isCount(r.openingCashMinor) && isCountMap(r.portions)) &&
    every(expenses, (r) => typeof r.id === 'string' && isDate(r.date) && isCount(r.amountMinor)) &&
    every(
      orders,
      (r) =>
        typeof r.id === 'string' &&
        isDate(r.date) &&
        isCount(r.amountMinor) &&
        PAYMENTS.includes(r.payment as string) &&
        (r.payment !== 'credit' || typeof r.customerName === 'string') &&
        every(r.lines, (l) => typeof l.dishId === 'string' && isCount(l.qty) && isCount(l.unitPriceMinor)),
    ) &&
    every(cashOuts, (r) => typeof r.id === 'string' && isDate(r.date) && isCount(r.amountMinor)) &&
    every(closings, (r) => isDate(r.date) && typeof r.skipped === 'boolean') &&
    every(
      debtPayments,
      (r) =>
        typeof r.id === 'string' &&
        typeof r.orderId === 'string' &&
        isDate(r.date) &&
        isCount(r.amountMinor) &&
        DEBT_METHODS.includes(r.method as string),
    );

  return valid ? ({ ...parsed, debtPayments } as unknown as BackupFile) : null;
}

/** Replaces everything on this phone with the backup. Runs in one transaction, so a failure changes nothing. */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.settings.put({ ...backup.settings!, lastBackupAt: Date.now() });
    await db.dishes.bulkPut(backup.dishes);
    await db.days.bulkPut(backup.days);
    await db.expenses.bulkPut(backup.expenses);
    await db.orders.bulkPut(backup.orders);
    await db.cashOuts.bulkPut(backup.cashOuts);
    await db.closings.bulkPut(backup.closings);
    await db.debtPayments.bulkPut(backup.debtPayments);
  });
}
