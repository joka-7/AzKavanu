import { addDays, toISODate, toLocalDate } from './dates';
import { resolveLink } from './links';
import { progressKey, type ProgressRecord, type StudyTrack } from './model';
import { sessionOn } from './schedule';

export interface DesiredNotification {
  /** Stable across re-planning, so platform schedulers can diff. */
  id: string;
  fireAt: number;
  title: string;
  body: string;
  url: string | null;
  trackId: string;
  date: string;
}

export interface PlanOptions {
  windowDays?: number;
  locale?: string;
}

/**
 * Materialise the concrete notifications wanted in the coming window.
 * Platform adapters reconcile this set against what the OS has scheduled.
 */
export function planReminders(
  tracks: Iterable<StudyTrack>,
  isDone: (trackId: string, date: string) => boolean,
  now: Date,
  opts: PlanOptions = {},
): DesiredNotification[] {
  const windowDays = opts.windowDays ?? 14;
  const he = opts.locale === 'he';
  const today = toISODate(now);
  const out: DesiredNotification[] = [];

  for (const track of tracks) {
    if (track.deleted || track.archived || track.reminders.length === 0) continue;
    for (let i = 0; i < windowDays; i++) {
      const date = addDays(today, i);
      const session = sessionOn(track, date);
      if (!session) continue;
      const done = isDone(track.id, date);
      for (const rule of track.reminders) {
        if (rule.onlyIfNotDone && done) continue;
        const [h, m] = rule.time.split(':').map(Number);
        const fireAt = toLocalDate(date, h, m).getTime();
        if (fireAt <= now.getTime()) continue;
        out.push({
          id: `${track.id}|${date}|${rule.id}`,
          fireAt,
          title: track.title,
          body: (he && session.labelHe) || session.label,
          url: resolveLink(track, session),
          trackId: track.id,
          date,
        });
      }
    }
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

export function isDoneIn(records: Record<string, ProgressRecord>) {
  return (trackId: string, date: string) => records[progressKey(trackId, date)]?.done === true;
}
