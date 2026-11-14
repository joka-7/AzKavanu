import { gematriya } from '@hebcal/core';
import { getCurriculum, recurrenceOf, type Schedule } from '@kavanu/core';
import type { cycleNames, strings } from './i18n';

type T = (typeof strings)['en'];

export function weekdayNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short' });
  // 1 November 2026 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 10, 1 + i)));
}

/** One-line human summary of what a schedule studies and when. */
export function describeSchedule(s: Schedule, t: T, cycles: (typeof cycleNames)['en'], locale: string): string {
  const rec = recurrenceOf(s);
  const days = weekdayNames(locale);
  const when =
    rec.type === 'daily'
      ? t.whenDaily
      : rec.type === 'weekly'
        ? [...rec.daysOfWeek].sort().map((d) => days[d]).join(', ')
        : rec.type === 'monthly'
          ? rec.calendar === 'hebrew'
            ? t.hebrewMonthDays(
                [...rec.daysOfMonth]
                  .sort((a, b) => a - b)
                  .map((d) => (locale === 'he' ? gematriya(d) : String(d)))
                  .join(', '),
              )
            : t.monthDays([...rec.daysOfMonth].sort((a, b) => a - b).join(', '))
          : rec.per === 'week'
            ? t.xPerWeek(rec.times)
            : t.xPerMonth(rec.times);

  let what = '';
  if (s.kind === 'fixedCycle') {
    what = cycles[s.cycle];
  } else if (s.kind === 'sequential') {
    const c = getCurriculum(s.curriculum);
    if (c) {
      const section = c.sections.find((x) => s.startUnit >= x.start && s.startUnit < x.start + x.count);
      const name = s.curriculum === 'talmud' ? t.catTalmud : t.catMishnah;
      what = `${name}${section ? ` (${locale === 'he' ? section.nameHe : section.name})` : ''} × ${s.unitsPerSession}`;
    } else {
      what = `${s.unitsPerSession} × ${s.unitLabel || '#'}`;
    }
    if (s.advance === 'completion' || rec.type === 'flexible') what += ` · ${t.ownPace}`;
  }
  return what ? `${what} · ${when}` : when;
}
