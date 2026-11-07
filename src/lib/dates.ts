// Dates are local-time YYYY-MM-DD strings. Arithmetic goes through UTC so daylight saving can't shift a day.

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: string, days: number): string {
  const d = parseUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday that starts the week containing this date. */
export function weekStart(date: string): string {
  const dayOfWeek = parseUtc(date).getUTCDay(); // 0 is Sunday
  return addDays(date, dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseUtc(to).getTime() - parseUtc(from).getTime()) / 86_400_000);
}

export function inWeek(date: string, start: string): boolean {
  return date >= start && date <= addDays(start, 6);
}

export function formatDay(date: string): string {
  return parseUtc(date).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function formatWeekday(date: string): string {
  return parseUtc(date).toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' });
}

export function formatShortDate(date: string): string {
  return parseUtc(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
