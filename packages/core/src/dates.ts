/** Local calendar dates as `YYYY-MM-DD` strings. All arithmetic is done in UTC to avoid DST drift. */
export type ISODate = string;

const DAY_MS = 86_400_000;

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${s}`);
  return { y, m, d };
}

function utcMs(s: ISODate): number {
  const { y, m, d } = parseISODate(s);
  return Date.UTC(y, m - 1, d);
}

/** A Date at local midnight (or the given local time) for this calendar date. */
export function toLocalDate(s: ISODate, hours = 0, minutes = 0): Date {
  const { y, m, d } = parseISODate(s);
  return new Date(y, m - 1, d, hours, minutes, 0, 0);
}

export function addDays(s: ISODate, n: number): ISODate {
  return new Date(utcMs(s) + n * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((utcMs(a) - utcMs(b)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(s: ISODate): number {
  return new Date(utcMs(s)).getUTCDay();
}

export function yearOf(s: ISODate): number {
  return parseISODate(s).y;
}
