import { HDate } from '@hebcal/core';
import { DafYomiEvent, MishnaYomiEvent, MishnaYomiIndex } from '@hebcal/learning';
import { dayOfWeek, diffDays, toLocalDate, type ISODate } from './dates';
import type { Recurrence, StudyTrack } from './model';

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
}

function occursOn(rec: Recurrence, date: ISODate): boolean {
  return rec.type === 'daily' || rec.daysOfWeek.includes(dayOfWeek(date));
}

/** Number of occurrences from `start` through `date`, inclusive. Assumes `date >= start`. */
function occurrencesThrough(rec: Recurrence, start: ISODate, date: ISODate): number {
  const span = diffDays(date, start) + 1;
  if (rec.type === 'daily') return span;
  const days = new Set(rec.daysOfWeek);
  const fullWeeks = Math.floor(span / 7);
  let count = fullWeeks * days.size;
  const startDow = dayOfWeek(start);
  for (let i = 0; i < span % 7; i++) {
    if (days.has((startDow + i) % 7)) count++;
  }
  return count;
}

let mishnaIndex: MishnaYomiIndex | undefined;

function fixedCycleSession(track: StudyTrack, cycle: string, date: ISODate): Session | null {
  const hd = new HDate(toLocalDate(date));
  try {
    if (cycle === 'dafYomi') {
      const ev = new DafYomiEvent(hd);
      return {
        trackId: track.id,
        date,
        label: ev.daf.render('en'),
        labelHe: ev.daf.render('he'),
        builtinUrl: ev.url(),
      };
    }
    if (cycle === 'mishnaYomi') {
      mishnaIndex ??= new MishnaYomiIndex();
      const ev = new MishnaYomiEvent(hd, mishnaIndex.lookup(hd));
      return { trackId: track.id, date, label: ev.render('en'), labelHe: ev.render('he'), builtinUrl: ev.url() };
    }
  } catch {
    // Date outside the cycle's defined range.
  }
  return null;
}

/** The session a track schedules on a date, or null if none. Pure and deterministic. */
export function sessionOn(track: StudyTrack, date: ISODate): Session | null {
  const s = track.schedule;
  if (s.kind === 'fixedCycle') return fixedCycleSession(track, s.cycle, date);

  if (date < s.startDate || !occursOn(s.recurrence, date)) return null;
  const sessionIndex = occurrencesThrough(s.recurrence, s.startDate, date);

  if (s.kind === 'freeform') {
    return { trackId: track.id, date, sessionIndex, label: `#${sessionIndex}` };
  }

  const firstUnit = s.startUnit + (sessionIndex - 1) * s.unitsPerSession;
  if (s.totalUnits !== undefined && firstUnit > s.totalUnits) return null;
  const lastUnit = Math.min(firstUnit + s.unitsPerSession - 1, s.totalUnits ?? Infinity);
  const range = firstUnit === lastUnit ? `${firstUnit}` : `${firstUnit}–${lastUnit}`;
  return {
    trackId: track.id,
    date,
    sessionIndex,
    firstUnit,
    lastUnit,
    label: s.unitLabel ? `${s.unitLabel} ${range}` : range,
  };
}

export function sessionsOn(tracks: Iterable<StudyTrack>, date: ISODate): Session[] {
  const out: Session[] = [];
  for (const t of tracks) {
    if (t.deleted || t.archived) continue;
    const s = sessionOn(t, date);
    if (s) out.push(s);
  }
  return out;
}
