import {
  addDays,
  buildIcs,
  eventIcs,
  planReminders,
  toISODate,
  toLocalDate,
  type DesiredNotification,
  type EventSpec,
  type Repository,
  type StudyTrack,
} from '@kavanu/core';

function save(text: string, name: string): void {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  // Attached to the page: some browsers ignore the file name of a detached link.
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Some browsers discard a file name made only of non-Latin letters, so keep the name ASCII. */
function fileName(title: string): string {
  const slug = title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `az-kavanu${slug ? `-${slug}` : ''}.ics`;
}

/** Download the track's upcoming reminders as a calendar file (works with the app closed). */
export function downloadCalendarFile(repo: Repository, track: StudyTrack, locale: string, appName: string): void {
  const plan = planReminders([track], repo.context, new Date(), { windowDays: 60, locale });
  save(buildIcs(plan, `${appName}: ${track.title}`), fileName(track.title || 'reminders'));
}

/** One event per study day for the next 60 days, each with that day's material and link. */
export function downloadDailyEvents(
  repo: Repository,
  track: StudyTrack,
  opts: { locale: string; appName: string; start: string; durationMin: number; alarmMinutes: number | null; from: string; link: (date: string) => string | null },
): number {
  const items: DesiredNotification[] = [];
  const [h, m] = opts.start.split(':').map(Number);
  const now = Date.now();
  for (let i = 0; i < 60; i++) {
    const date = addDays(opts.from, i);
    const s = repo.session(track, date);
    if (!s || s.optional) continue;
    const fireAt = toLocalDate(date, h, m).getTime();
    if (fireAt <= now) continue;
    items.push({
      id: `${track.id}|${date}|cal`,
      fireAt,
      title: track.title,
      body: (opts.locale === 'he' && s.labelHe) || s.label,
      url: opts.link(date),
      trackId: track.id,
      date,
    });
  }
  save(buildIcs(items, `${opts.appName}: ${track.title}`, now, { durationMin: opts.durationMin, alarmMinutes: opts.alarmMinutes }), fileName(track.title));
  return items.length;
}

export function downloadEvent(spec: EventSpec): void {
  save(eventIcs(spec), fileName(spec.title));
}

export const todayISO = (): string => toISODate(new Date());
