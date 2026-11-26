import { buildIcs, planReminders, type Repository, type StudyTrack } from '@kavanu/core';

/** Download the track's upcoming reminders as a calendar file (works with the app closed). */
export function downloadCalendarFile(repo: Repository, track: StudyTrack, locale: string, appName: string): void {
  const plan = planReminders([track], repo.context, new Date(), { windowDays: 60, locale });
  const blob = new Blob([buildIcs(plan, `${appName}: ${track.title}`)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  // Some browsers discard a file name made only of non-Latin letters, so keep the name ASCII.
  const slug = track.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  a.download = `az-kavanu${slug ? `-${slug}` : '-reminders'}.ics`;
  // Attached to the page: some browsers ignore the file name of a detached link.
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
