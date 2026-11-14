import { DailyLearning, HDate, HebrewCalendar, ParshaEvent } from '@hebcal/core';
import '@hebcal/learning';
import { getCurriculum } from './curricula';
import { addDays, dayOfWeek, diffDays, parseISODate, toLocalDate, type ISODate } from './dates';
import type { FixedCycle, Recurrence, Schedule, StudyTrack } from './model';

export interface Session {
  trackId: string;
  date: ISODate;
  /** 1-based ordinal of this session within the track (absent for fixed cycles). */
  sessionIndex?: number;
  /** Human-readable description of the day's material, e.g. "Berachot 5" or "Chapter 3–4". */
  label: string;
  labelHe?: string;
  firstUnit?: number;
  lastUnit?: number;
  /** Link supplied by the curriculum itself, if any. */
  builtinUrl?: string;
  /** True for flexible tracks: the day is available for a session, not assigned one. */
  optional: boolean;
}

/** What the schedule engine needs to know beyond the track definition. */
export interface ScheduleContext {
  /** Dates this track was completed, ascending. Needed for flexible and completion-paced tracks. */
  doneDates?: readonly ISODate[];
  /** Follow the Israeli Torah-reading calendar for the weekly parasha. */
  israel?: boolean;
}

const DAILY: Recurrence = { type: 'daily' };

export function recurrenceOf(s: Schedule): Recurrence {
  return s.kind === 'fixedCycle' ? (s.recurrence ?? DAILY) : s.recurrence;
}

function matches(rec: Recurrence, date: ISODate): boolean {
  switch (rec.type) {
    case 'daily':
    case 'flexible':
      return true;
    case 'weekly':
      return rec.daysOfWeek.includes(dayOfWeek(date));
    case 'monthly':
      return rec.daysOfMonth.includes(parseISODate(date).d);
  }
}

/**
 * Whether a track has a session on a date, independent of progress:
 * `fixed` = assigned to that day, `optional` = flexible track, any day counts.
 */
export function occurrence(schedule: Schedule, date: ISODate): 'fixed' | 'optional' | null {
  if (schedule.kind !== 'fixedCycle' && date < schedule.startDate) return null;
  const rec = recurrenceOf(schedule);
  if (rec.type === 'flexible') return 'optional';
  return matches(rec, date) ? 'fixed' : null;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Number of occurrences from `start` through `date`, inclusive. Assumes `date >= start`. */
function occurrencesThrough(rec: Recurrence, start: ISODate, date: ISODate): number {
  const span = diffDays(date, start) + 1;
  if (rec.type === 'daily' || rec.type === 'flexible') return span;
  if (rec.type === 'weekly') {
    const days = new Set(rec.daysOfWeek);
    let count = Math.floor(span / 7) * days.size;
    const startDow = dayOfWeek(start);
    for (let i = 0; i < span % 7; i++) if (days.has((startDow + i) % 7)) count++;
    return count;
  }
  const a = parseISODate(start);
  const b = parseISODate(date);
  let count = 0;
  for (let y = a.y, m = a.m; y < b.y || (y === b.y && m <= b.m); m === 12 ? (y++, (m = 1)) : m++) {
    const from = y === a.y && m === a.m ? a.d : 1;
    const to = y === b.y && m === b.m ? b.d : daysInMonth(y, m);
    for (const d of rec.daysOfMonth) if (d >= from && d <= to) count++;
  }
  return count;
}

/** Index of the first element >= value in a sorted array. */
function lowerBound(sorted: readonly string[], value: string): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function isDoneOn(doneDates: readonly ISODate[] | undefined, date: ISODate): boolean {
  if (!doneDates) return false;
  return doneDates[lowerBound(doneDates, date)] === date;
}

/** First and last date of the week (Sunday–Saturday) or calendar month containing `date`. */
export function periodBounds(per: 'week' | 'month', date: ISODate): [ISODate, ISODate] {
  if (per === 'week') {
    const start = addDays(date, -dayOfWeek(date));
    return [start, addDays(start, 6)];
  }
  const { y, m } = parseISODate(date);
  const prefix = `${y}-${String(m).padStart(2, '0')}-`;
  return [`${prefix}01`, `${prefix}${String(daysInMonth(y, m)).padStart(2, '0')}`];
}

/** For a flexible track: sessions completed in the period containing `date`, against the target. */
export function periodProgress(
  schedule: Schedule,
  date: ISODate,
  doneDates: readonly ISODate[] = [],
): { done: number; target: number; per: 'week' | 'month' } | null {
  const rec = recurrenceOf(schedule);
  if (rec.type !== 'flexible') return null;
  const [from, to] = periodBounds(rec.per, date);
  const done = lowerBound(doneDates, addDays(to, 1)) - lowerBound(doneDates, from);
  return { done, target: rec.times, per: rec.per };
}

/** Prefixes the calendar library adds that merely repeat the track's own title. */
const STRIP_PREFIX: ReadonlySet<FixedCycle> = new Set(['dafYomi', 'dirshuAmudYomi', 'dirshuDafHalacha', 'tanyaYomi']);

function stripPrefix(cycle: FixedCycle, text: string): string {
  return STRIP_PREFIX.has(cycle) ? text.replace(/^[^:]{1,40}:\s*/, '') : text;
}

function fixedCycleMaterial(cycle: FixedCycle, date: ISODate, israel: boolean): Pick<Session, 'label' | 'labelHe' | 'builtinUrl'> | null {
  const hd = new HDate(toLocalDate(date));
  try {
    if (cycle === 'parasha') {
      // The parasha read on the Shabbat on or after this date.
      const result = HebrewCalendar.getSedra(hd.getFullYear(), israel).lookup(hd);
      if (result.chag || !result.parsha?.length) return null;
      const ev = new ParshaEvent(result);
      return { label: ev.render('en'), labelHe: ev.render('he'), builtinUrl: ev.url() };
    }
    const ev = DailyLearning.lookup(cycle, hd, israel);
    if (!ev) return null;
    return {
      label: stripPrefix(cycle, ev.render('en')),
      labelHe: stripPrefix(cycle, ev.render('he')),
      builtinUrl: ev.url() ?? undefined,
    };
  } catch {
    return null; // Date outside the cycle's defined range.
  }
}

function range(a: string, b: string): string {
  return a === b ? a : `${a}–${b}`;
}

/** The session a track offers on a date, or null if none. Pure and deterministic given the context. */
export function sessionOn(track: StudyTrack, date: ISODate, ctx: ScheduleContext = {}): Session | null {
  const s = track.schedule;
  const kind = occurrence(s, date);
  if (!kind) return null;
  const optional = kind === 'optional';
  const base = { trackId: track.id, date, optional };

  if (s.kind === 'fixedCycle') {
    const material = fixedCycleMaterial(s.cycle, date, ctx.israel ?? false);
    return material ? { ...base, ...material } : null;
  }

  // Completion pacing (always used by flexible tracks): the ordinal follows what was actually done.
  const byCompletion = optional || (s.kind === 'sequential' && s.advance === 'completion');
  const sessionIndex = byCompletion
    ? lowerBound(ctx.doneDates ?? [], date) + 1
    : occurrencesThrough(s.recurrence, s.startDate, date);

  if (s.kind === 'freeform') return { ...base, sessionIndex, label: `#${sessionIndex}` };

  const curriculum = getCurriculum(s.curriculum);
  const end = Math.min(s.totalUnits ?? Infinity, curriculum?.units.length ?? Infinity);
  const firstUnit = s.startUnit + (sessionIndex - 1) * s.unitsPerSession;
  if (firstUnit > end) return null;
  const lastUnit = Math.min(firstUnit + s.unitsPerSession - 1, end);

  if (curriculum) {
    const a = curriculum.units[firstUnit - 1]!;
    const b = curriculum.units[lastUnit - 1]!;
    const same = a.section === b.section;
    return {
      ...base,
      sessionIndex,
      firstUnit,
      lastUnit,
      label: same ? `${a.section} ${range(a.ref, b.ref)}` : `${a.section} ${a.ref} – ${b.section} ${b.ref}`,
      labelHe: same ? `${a.sectionHe} ${range(a.refHe, b.refHe)}` : `${a.sectionHe} ${a.refHe} – ${b.sectionHe} ${b.refHe}`,
      builtinUrl: a.url || undefined,
    };
  }

  const numbers = range(String(firstUnit), String(lastUnit));
  return { ...base, sessionIndex, firstUnit, lastUnit, label: s.unitLabel ? `${s.unitLabel} ${numbers}` : numbers };
}
