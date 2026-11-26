import { DailyLearning, HDate, HebrewCalendar, ParshaEvent } from '@hebcal/core';
import { DafPage } from '@hebcal/learning';
import { parashaRef, talmudRef, tanakhRef, type AppRef } from './apps';
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
  /** A Hebrew-language page for the same material, where it differs from the localised main link. */
  builtinUrlHe?: string;
  /** A link the user attached to this day; takes priority over the built-in link. */
  customUrl?: string;
  /** Where this day's page is in the user's own Talmud and Tanakh apps, when it has one. */
  appRef?: AppRef;
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
      return rec.daysOfMonth.includes(
        rec.calendar === 'hebrew' ? new HDate(toLocalDate(date)).getDate() : parseISODate(date).d,
      );
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
  if (rec.calendar === 'hebrew') {
    // Walk Hebrew months from the start; each contributes its chosen days that fall in range.
    const first = new HDate(toLocalDate(start)).abs();
    const last = new HDate(toLocalDate(date)).abs();
    let count = 0;
    let month = new HDate(first);
    month = new HDate(1, month.getMonth(), month.getFullYear());
    while (month.abs() <= last) {
      const length = month.daysInMonth();
      for (const d of rec.daysOfMonth) {
        const abs = month.abs() + d - 1;
        if (d <= length && abs >= first && abs <= last) count++;
      }
      month = new HDate(month.abs() + length);
    }
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

/** The calendar library leaves a few Hebrew renderings partly in English; finish the job. */
function polishHebrew(cycle: FixedCycle, text: string): string {
  switch (cycle) {
    case 'kitzurShulchanAruch':
      return text.replace(/^Kitzur Shulchan Aru[ck]h\s*/, '');
    case 'shemiratHaLashon':
      return text
        .replace(/^Book II\b/, 'חלק ב')
        .replace(/^Book I\b/, 'חלק א')
        .replace(/Footnote_in_/g, 'הערה בסעיף ')
        .replace(/Footnote/g, 'הערה');
    case 'seferHaMitzvot':
      return text
        .replace(/^Day (\d+)/, 'יום $1')
        .replace(/Maimonides.? Introduction to Sefer Hamitzvot/g, 'הקדמת הרמב״ם לספר המצוות')
        .replace(/Positive Commandments?/g, 'מצוות עשה')
        .replace(/Negative Commandments?/g, 'מצוות לא תעשה')
        .replace(/Principles?/g, 'שורש')
        .replace(/Nusach HaTefila/g, 'נוסח התפילה')
        .replace(/Order of Prayer/g, 'סדר התפילה')
        .replace(/Text of the Haggadah/g, 'נוסח ההגדה')
        .replace(/Laws of Megillah and Chanukah Chapters/g, 'הלכות מגילה וחנוכה, פרקים')
        .replace(/Note About Varying Customs/g, 'הערה על חילופי מנהגים');
    default:
      return text;
  }
}

/** Hebrew tractate name for a Talmud page, in the spelling the Talmud app uses. */
function hebrewTractate(english: string, daf: number): string {
  const he = new DafPage(english, daf).render('he').replace(/[\u0591-\u05C7]/g, ''); // the library adds vowel marks to a few names
  const cut = he.lastIndexOf(' דף ');
  return cut > 0 ? he.slice(0, cut) : he;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function appRefFor(cycle: FixedCycle, ev: any): AppRef | null {
  try {
    switch (cycle) {
      case 'dafYomi':
      case 'dafWeekly':
        return talmudRef(hebrewTractate(ev.daf.name, ev.daf.blatt), ev.daf.blatt, 'a');
      case 'dirshuAmudYomi':
        return talmudRef(hebrewTractate(ev.amud.name, ev.amud.amud), ev.amud.amud, ev.amud.side === 'b' ? 'b' : 'a');
      case 'nachYomi':
        return tanakhRef(ev.k, parseInt(ev.v, 10));
      case '929':
        return tanakhRef(ev.reading.book, ev.reading.bookChap);
      case 'tanakhYomi': {
        const m = /^(.*?) (\d+):/.exec(ev.daf.verses);
        return m ? tanakhRef(m[1]!, Number(m[2])) : null;
      }
      case 'psalms':
        return tanakhRef('Psalms', Array.isArray(ev.reading) ? parseInt(String(ev.reading[0]), 10) : NaN);
      default:
        return null;
    }
  } catch {
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function fixedCycleMaterial(cycle: FixedCycle, date: ISODate, israel: boolean): Pick<Session, 'label' | 'labelHe' | 'builtinUrl' | 'builtinUrlHe' | 'appRef'> | null {
  const hd = new HDate(toLocalDate(date));
  try {
    if (cycle === 'parasha') {
      // The parasha read on the Shabbat on or after this date.
      const result = HebrewCalendar.getSedra(hd.getFullYear(), israel).lookup(hd);
      if (result.chag || !result.parsha?.length) return null;
      const ev = new ParshaEvent(result);
      return {
        label: ev.render('en'),
        labelHe: ev.render('he'),
        builtinUrl: ev.url(),
        // Sefaria resolves a parasha name to its Torah reading and has a Hebrew edition.
        builtinUrlHe: `https://www.sefaria.org.il/Parashat_${encodeURIComponent(result.parsha[0]!.replace(/ /g, '_'))}?lang=he`,
        appRef: parashaRef(result.parsha[0]!) ?? undefined,
      };
    }
    const ev = DailyLearning.lookup(cycle, hd, israel);
    if (!ev) return null;
    return {
      label: stripPrefix(cycle, ev.render('en')),
      labelHe: polishHebrew(cycle, stripPrefix(cycle, ev.render('he'))),
      builtinUrl: ev.url() ?? undefined,
      appRef: appRefFor(cycle, ev) ?? undefined,
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
      appRef: (s.curriculum === 'talmud' ? talmudRef(a.sectionHe, Number(a.ref), 'a') : null) ?? undefined,
    };
  }

  const numbers = range(String(firstUnit), String(lastUnit));
  return { ...base, sessionIndex, firstUnit, lastUnit, label: s.unitLabel ? `${s.unitLabel} ${numbers}` : numbers };
}
