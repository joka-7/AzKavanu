import { addDays, toISODate, toLocalDate } from './dates';
import { resolveLink } from './links';
import type { StudyTrack } from './model';
import { isDoneOn, periodProgress, sessionOn, type ScheduleContext } from './schedule';

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
  contextFor: (trackId: string) => ScheduleContext,
  now: Date,
  opts: PlanOptions = {},
): DesiredNotification[] {
  const windowDays = opts.windowDays ?? 14;
  const he = opts.locale === 'he';
  const today = toISODate(now);
  const out: DesiredNotification[] = [];

  for (const track of tracks) {
    if (track.deleted || track.archived || track.reminders.length === 0) continue;
    const ctx = contextFor(track.id);
    for (let i = 0; i < windowDays; i++) {
      const date = addDays(today, i);
      const session = sessionOn(track, date, ctx);
      if (!session) continue;
      // A flexible track stops nudging once the week's or month's target is met.
      const quota = periodProgress(track.schedule, date, ctx.doneDates);
      if (quota && quota.done >= quota.target) continue;
      const done = isDoneOn(ctx.doneDates, date);
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
