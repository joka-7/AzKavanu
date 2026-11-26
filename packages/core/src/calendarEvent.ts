import { addDays, dayOfWeek, diffDays, parseISODate, toLocalDate, type ISODate } from './dates';
import { escapeText, fold, localStamp, utcStamp } from './ics';
import type { Recurrence } from './model';

export type EventEnd = { type: 'never' } | { type: 'until'; date: ISODate } | { type: 'count'; count: number };

export interface EventRepeat {
  freq: 'none' | 'daily' | 'weekly' | 'monthly';
  /** Sunday = 0. Used by weekly. */
  days?: number[];
  /** Days of the Gregorian month. Used by monthly. */
  monthDays?: number[];
  end: EventEnd;
}

export interface EventSpec {
  uid: string;
  title: string;
  description?: string;
  url?: string;
  /** Earliest date the event may start on; the first matching day is used. */
  date: ISODate;
  /** `HH:MM` local time. */
  start: string;
  /** `HH:MM`; when absent or not after the start, the event lasts `durationMin` (default 30). */
  end?: string;
  durationMin?: number;
  repeat: EventRepeat;
  /** Minutes before the start; 0 = at the start; null = no alarm. */
  alarmMinutes: number | null;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** The recurrence a track already has, when a calendar can express it (not "n times a week" or Hebrew-month days). */
export function repeatFromRecurrence(rec: Recurrence): EventRepeat | null {
  switch (rec.type) {
    case 'daily':
      return { freq: 'daily', end: { type: 'never' } };
    case 'weekly':
      return { freq: 'weekly', days: [...rec.daysOfWeek], end: { type: 'never' } };
    case 'monthly':
      return rec.calendar === 'gregorian' ? { freq: 'monthly', monthDays: [...rec.daysOfMonth], end: { type: 'never' } } : null;
    default:
      return null;
  }
}

function matches(repeat: EventRepeat, date: ISODate): boolean {
  switch (repeat.freq) {
    case 'weekly':
      return (repeat.days ?? []).includes(dayOfWeek(date));
    case 'monthly':
      return (repeat.monthDays ?? []).includes(parseISODate(date).d);
    default:
      return true;
  }
}

/** First date on or after `spec.date` that the rule produces (calendars expect DTSTART to match). */
export function firstOccurrence(spec: Pick<EventSpec, 'date' | 'repeat'>): ISODate {
  for (let i = 0; i < 400; i++) {
    const d = addDays(spec.date, i);
    if (matches(spec.repeat, d)) return d;
  }
  return spec.date;
}

/** `RRULE` value without the `RRULE:` prefix, or null for a one-off event. */
export function rruleOf(repeat: EventRepeat): string | null {
  if (repeat.freq === 'none') return null;
  const parts = [`FREQ=${repeat.freq.toUpperCase()}`];
  if (repeat.freq === 'weekly' && repeat.days?.length) {
    parts.push(`BYDAY=${[...repeat.days].sort().map((d) => DAY_CODES[d]).join(',')}`);
  }
  if (repeat.freq === 'monthly' && repeat.monthDays?.length) {
    parts.push(`BYMONTHDAY=${[...repeat.monthDays].sort((a, b) => a - b).join(',')}`);
  }
  if (repeat.end.type === 'count') parts.push(`COUNT=${Math.max(1, Math.floor(repeat.end.count))}`);
  if (repeat.end.type === 'until') parts.push(`UNTIL=${repeat.end.date.replace(/-/g, '')}T235959`);
  return parts.join(';');
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function span(spec: EventSpec): { start: number; end: number } {
  const date = firstOccurrence(spec);
  const [h, m] = spec.start.split(':').map(Number);
  const start = toLocalDate(date, h, m).getTime();
  const endMin = spec.end && minutes(spec.end) > minutes(spec.start) ? minutes(spec.end) : minutes(spec.start) + (spec.durationMin ?? 30);
  return { start, end: start + (endMin - minutes(spec.start)) * 60_000 };
}

function descriptionOf(spec: EventSpec): string {
  return [spec.description?.trim(), spec.url].filter(Boolean).join('\n\n');
}

/** A calendar file with a single (possibly recurring) event. */
export function eventIcs(spec: EventSpec, now = Date.now()): string {
  const { start, end } = span(spec);
  const rrule = rruleOf(spec.repeat);
  const description = descriptionOf(spec);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Az Kavanu//Event//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${spec.uid.replace(/[^A-Za-z0-9|_-]/g, '')}@az-kavanu`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${localStamp(start)}`,
    `DTEND:${localStamp(end)}`,
    ...(rrule ? [`RRULE:${rrule}`] : []),
    `SUMMARY:${escapeText(spec.title)}`,
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    ...(spec.url ? [`URL:${spec.url}`] : []),
    ...(spec.alarmMinutes === null
      ? []
      : [
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${escapeText(spec.title)}`,
          `TRIGGER:${spec.alarmMinutes === 0 ? 'PT0M' : `-PT${Math.floor(spec.alarmMinutes)}M`}`,
          'END:VALARM',
        ]),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Opens Google Calendar's "new event" page already filled in, recurrence included. */
export function googleCalendarUrl(spec: EventSpec): string {
  const { start, end } = span(spec);
  const rrule = rruleOf(spec.repeat);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: spec.title,
    dates: `${localStamp(start)}/${localStamp(end)}`,
  });
  const details = descriptionOf(spec);
  if (details) params.set('details', details);
  if (rrule) params.set('recur', `RRULE:${rrule}`);
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Number of days between two dates; handy for "ends after N weeks" style defaults. */
export const daysBetween = diffDays;
