import { describe, expect, it } from 'vitest';
import {
  FIXED_CYCLES,
  HlcClock,
  getCurriculum,
  occurrence,
  periodProgress,
  addDays,
  compareHlc,
  mergeDocs,
  planReminders,
  resolveLink,
  sessionOn,
  toLocalDate,
  type RecordDoc,
  type StudyTrack,
} from '../src';

const base = {
  color: '#3b6fd4',
  reminders: [],
  archived: false,
  deleted: false,
  hlc: '000000000000001-00000-d1',
};

const daf: StudyTrack = {
  ...base,
  id: 't_daf',
  title: 'Daf Yomi',
  schedule: { kind: 'fixedCycle', cycle: 'dafYomi' },
  link: { provider: 'builtin' },
};

const chapters: StudyTrack = {
  ...base,
  id: 't_seq',
  title: 'Book',
  schedule: {
    kind: 'sequential',
    curriculum: 'custom',
    advance: 'calendar',
    startDate: '2026-11-01',
    unitLabel: 'Chapter',
    startUnit: 1,
    unitsPerSession: 2,
    totalUnits: 7,
    recurrence: { type: 'daily' },
  },
  link: { provider: 'template', urlTemplate: 'https://example.org/book/{firstUnit}?d={date}' },
};

const history: StudyTrack = {
  ...base,
  id: 't_hist',
  title: 'History',
  schedule: { kind: 'freeform', startDate: '2026-11-01', recurrence: { type: 'weekly', daysOfWeek: [0, 2, 4] } },
  link: { provider: 'none' },
};

describe('hlc', () => {
  it('is monotonic even when the wall clock stalls or goes backwards', () => {
    let now = 1000;
    const c = new HlcClock('d1', () => now);
    const a = c.tick();
    const b = c.tick();
    now = 500;
    const d = c.tick();
    expect(compareHlc(a, b)).toBeLessThan(0);
    expect(compareHlc(b, d)).toBeLessThan(0);
  });

  it('advances past observed remote stamps', () => {
    const fast = new HlcClock('fast', () => 9_000_000);
    const slow = new HlcClock('slow', () => 1000);
    const remote = fast.tick();
    slow.observe(remote);
    expect(compareHlc(slow.tick(), remote)).toBeGreaterThan(0);
  });
});

describe('mergeDocs', () => {
  const doc = (records: Record<string, { hlc: string; v: number }>): RecordDoc<any> => ({ schemaVersion: 1, records });
  const a = doc({ x: { hlc: '2', v: 1 }, y: { hlc: '1', v: 1 } });
  const b = doc({ y: { hlc: '3', v: 2 }, z: { hlc: '1', v: 2 } });

  it('keeps the newest record per key and reports both directions', () => {
    const r = mergeDocs(a, b);
    expect(r.merged.records).toEqual({ x: { hlc: '2', v: 1 }, y: { hlc: '3', v: 2 }, z: { hlc: '1', v: 2 } });
    expect(r.localChanged).toBe(true);
    expect(r.remoteStale).toBe(true);
  });

  it('is commutative and idempotent', () => {
    const ab = mergeDocs(a, b).merged;
    expect(mergeDocs(b, a).merged).toEqual(ab);
    const again = mergeDocs(ab, b);
    expect(again.merged).toEqual(ab);
    expect(again.localChanged).toBe(false);
  });
});

describe('schedule', () => {
  it('computes Daf Yomi from the date alone', () => {
    const s = sessionOn(daf, '2026-11-11')!;
    expect(s.label).toBe('Bechorot 54');
    expect(s.labelHe).toContain('בכורות');
    expect(resolveLink(daf, s)).toBe('https://www.sefaria.org/Bekhorot.54a?lang=bi');
    expect(sessionOn(daf, '2026-11-12')!.label).toBe('Bechorot 55');
  });

  it('computes Mishna Yomi', () => {
    const t: StudyTrack = { ...daf, id: 't_m', schedule: { kind: 'fixedCycle', cycle: 'mishnaYomi' } };
    const s = sessionOn(t, '2026-11-11')!;
    expect(s.label).toBe('Oholot 17:3-4');
    expect(resolveLink(t, s)).toContain('Mishnah_Oholot.17.3-4');
  });

  it('walks sequential units and stops at the end', () => {
    expect(sessionOn(chapters, '2026-10-31')).toBeNull();
    expect(sessionOn(chapters, '2026-11-01')!.label).toBe('Chapter 1–2');
    expect(sessionOn(chapters, '2026-11-03')!.label).toBe('Chapter 5–6');
    expect(sessionOn(chapters, '2026-11-04')!.label).toBe('Chapter 7');
    expect(sessionOn(chapters, '2026-11-05')).toBeNull();
  });

  it('numbers weekly sessions across weeks', () => {
    // 2026-11-01 is a Sunday.
    expect(sessionOn(history, '2026-11-01')!.sessionIndex).toBe(1);
    expect(sessionOn(history, '2026-11-02')).toBeNull();
    expect(sessionOn(history, '2026-11-03')!.sessionIndex).toBe(2);
    expect(sessionOn(history, '2026-11-05')!.sessionIndex).toBe(3);
    expect(sessionOn(history, '2026-11-08')!.sessionIndex).toBe(4);
    expect(sessionOn(history, '2026-11-19')!.sessionIndex).toBe(9);
  });

  it('counts weekly sessions when the start date is mid-week', () => {
    const t: StudyTrack = { ...history, schedule: { ...history.schedule, startDate: '2026-11-04' } as any };
    // Wed start: occurrences Thu 5, Sun 8, Tue 10, Thu 12
    const idx = ['2026-11-05', '2026-11-08', '2026-11-10', '2026-11-12'].map((d) => sessionOn(t, d)!.sessionIndex);
    expect(idx).toEqual([1, 2, 3, 4]);
  });
});

describe('links', () => {
  it('fills templates and encodes values', () => {
    const s = sessionOn(chapters, '2026-11-02')!;
    expect(resolveLink(chapters, s)).toBe('https://example.org/book/3?d=2026-11-02');
  });

  it('refuses non-http links', () => {
    const t: StudyTrack = { ...chapters, link: { provider: 'template', urlTemplate: 'javascript:alert({date})' } };
    expect(resolveLink(t, sessionOn(t, '2026-11-02')!)).toBeNull();
  });
});

describe('planReminders', () => {
  const t: StudyTrack = {
    ...history,
    reminders: [
      { id: 'am', time: '07:00', onlyIfNotDone: false },
      { id: 'pm', time: '21:00', onlyIfNotDone: true },
    ],
  };
  const now = toLocalDate('2026-11-01', 12, 0);

  it('plans future reminders only on scheduled days', () => {
    const plan = planReminders([t], () => ({}), now, { windowDays: 3 });
    expect(plan.map((n) => n.id)).toEqual(['t_hist|2026-11-01|pm', 't_hist|2026-11-03|am', 't_hist|2026-11-03|pm']);
    expect(plan[0]!.fireAt).toBe(toLocalDate('2026-11-01', 21, 0).getTime());
  });

  it('drops the nudge once the day is done', () => {
    const plan = planReminders([t], () => ({ doneDates: ['2026-11-01'] }), now, { windowDays: 3 });
    expect(plan.map((n) => n.id)).not.toContain('t_hist|2026-11-01|pm');
    expect(plan).toHaveLength(2);
  });

  it('addDays crosses month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('fixed cycles', () => {
  it('every listed cycle yields material and an http link on an ordinary weekday', () => {
    for (const cycle of FIXED_CYCLES) {
      const t: StudyTrack = { ...daf, id: `t_${cycle}`, schedule: { kind: 'fixedCycle', cycle } };
      // Tuesday 10 November 2026; tolerate cycles that pause on some days by scanning a week.
      const dates = Array.from({ length: 7 }, (_, i) => addDays('2026-11-10', i));
      const s = dates.map((d) => sessionOn(t, d)).find(Boolean);
      expect(s, cycle).toBeTruthy();
      expect(s!.label.length, cycle).toBeGreaterThan(0);
      if (s!.builtinUrl) expect(resolveLink(t, s!), cycle).toMatch(/^https:/);
    }
  });

  it('leaves no English in the Hebrew labels', () => {
    for (const cycle of FIXED_CYCLES) {
      const t: StudyTrack = { ...daf, id: `t_${cycle}`, schedule: { kind: 'fixedCycle', cycle } };
      for (let i = 0; i < 1200; i++) {
        for (const d of [addDays('2026-11-10', i)]) {
          const s = sessionOn(t, d);
          if (s?.labelHe) expect(s.labelHe, `${cycle} ${d}`).not.toMatch(/[A-Za-z]{2,}/);
        }
      }
    }
  });

  it('gives the parasha of the coming Shabbat and can be limited to chosen days', () => {
    const t: StudyTrack = {
      ...daf,
      id: 't_p',
      schedule: { kind: 'fixedCycle', cycle: 'parasha', recurrence: { type: 'weekly', daysOfWeek: [4, 5] } },
    };
    expect(sessionOn(t, '2026-11-11')).toBeNull(); // Wednesday
    expect(sessionOn(t, '2026-11-12', { israel: true })!.label).toBe('Parashat Toldot');
    expect(sessionOn(t, '2026-11-13', { israel: true })!.labelHe).toContain('תּוֹלְדוֹת');
  });
});

describe('own-pace study', () => {
  const mishnah: StudyTrack = {
    ...base,
    id: 't_own',
    title: 'Mishnah',
    schedule: {
      kind: 'sequential',
      curriculum: 'mishnah',
      startDate: '2026-11-01',
      unitLabel: '',
      startUnit: 1,
      unitsPerSession: 1,
      recurrence: { type: 'flexible', times: 2, per: 'week' },
      advance: 'completion',
    },
    link: { provider: 'builtin' },
  };

  it('builds the Talmud and Mishnah lists from the calendar library', () => {
    const talmud = getCurriculum('talmud')!;
    expect(talmud.units).toHaveLength(2711);
    expect(talmud.sections[0]).toMatchObject({ name: 'Berachot', start: 1, count: 63 });
    expect(talmud.units.at(-1)).toMatchObject({ section: 'Niddah', ref: '73' });
    const m = getCurriculum('mishnah')!;
    expect(m.units).toHaveLength(4192);
    expect(m.sections).toHaveLength(63);
    expect(m.units[0]).toMatchObject({ section: 'Berakhot', ref: '1:1', sectionHe: 'ברכות', refHe: 'א, א' });
    expect(m.units.find((u) => u.ref === '9:5')?.refHe).toBe('ט, ה');
  });

  it('offers the next unit on any day and advances only when a session is completed', () => {
    expect(occurrence(mishnah.schedule, '2026-11-03')).toBe('optional');
    const first = sessionOn(mishnah, '2026-11-03')!;
    expect(first).toMatchObject({ label: 'Berakhot 1:1', optional: true });
    expect(resolveLink(mishnah, first)).toBe('https://www.sefaria.org/Mishnah_Berakhot.1.1?lang=bi');
    // A week later with nothing done, it is still the first mishna.
    expect(sessionOn(mishnah, '2026-11-10')!.label).toBe('Berakhot 1:1');
    const ctx = { doneDates: ['2026-11-03', '2026-11-05'] };
    expect(sessionOn(mishnah, '2026-11-03', ctx)!.label).toBe('Berakhot 1:1');
    expect(sessionOn(mishnah, '2026-11-05', ctx)!.label).toBe('Berakhot 1:2');
    expect(sessionOn(mishnah, '2026-11-20', ctx)!.label).toBe('Berakhot 1:3');
  });

  it('counts sessions against the weekly or monthly target', () => {
    const done = ['2026-11-03', '2026-11-05', '2026-11-08'];
    expect(periodProgress(mishnah.schedule, '2026-11-06', done)).toEqual({ done: 2, target: 2, per: 'week' });
    expect(periodProgress(mishnah.schedule, '2026-11-09', done)).toEqual({ done: 1, target: 2, per: 'week' });
    const monthly = { ...mishnah.schedule, recurrence: { type: 'flexible', times: 4, per: 'month' } } as StudyTrack['schedule'];
    expect(periodProgress(monthly, '2026-11-30', done)).toEqual({ done: 3, target: 4, per: 'month' });
    expect(periodProgress(chapters.schedule, '2026-11-06', done)).toBeNull();
  });

  it('continues from the last completed session when a fixed-day track is paced by completion', () => {
    const t: StudyTrack = {
      ...base,
      id: 't_daf',
      title: 'Daf',
      schedule: {
        kind: 'sequential',
        curriculum: 'talmud',
        startDate: '2026-11-01',
        unitLabel: '',
        startUnit: getCurriculum('talmud')!.sections.find((x) => x.name === 'Megillah')!.start,
        unitsPerSession: 1,
        recurrence: { type: 'weekly', daysOfWeek: [0, 3] },
        advance: 'completion',
      },
      link: { provider: 'builtin' },
    };
    expect(sessionOn(t, '2026-11-02')).toBeNull();
    expect(sessionOn(t, '2026-11-04')!.label).toBe('Megillah 2');
    expect(sessionOn(t, '2026-11-04', { doneDates: ['2026-11-01'] })!.label).toBe('Megillah 3');
    expect(sessionOn(t, '2026-11-04', { doneDates: ['2026-11-01'] })!.labelHe).toBe('מגילה ג׳');
  });

  it('stops reminding once the weekly target is met', () => {
    const t: StudyTrack = { ...mishnah, reminders: [{ id: 'r', time: '20:00', onlyIfNotDone: true }] };
    const now = toLocalDate('2026-11-03', 8, 0); // Tuesday
    const open = planReminders([t], () => ({ doneDates: ['2026-11-01'] }), now, { windowDays: 5 });
    expect(open.map((n) => n.date)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    const met = planReminders([t], () => ({ doneDates: ['2026-11-01', '2026-11-02'] }), now, { windowDays: 6 });
    // Nothing for the rest of this week; the new week (from Sunday the 8th) starts again.
    expect(met.map((n) => n.date)).toEqual(['2026-11-08']);
  });
});

describe('monthly recurrence', () => {
  const t: StudyTrack = {
    ...base,
    id: 't_month',
    title: 'Review',
    schedule: { kind: 'freeform', startDate: '2026-01-15', recurrence: { type: 'monthly', daysOfMonth: [1, 15, 31] } },
    link: { provider: 'none' },
  };
  it('occurs on the chosen days and skips days a month lacks', () => {
    expect(sessionOn(t, '2026-01-15')!.sessionIndex).toBe(1);
    expect(sessionOn(t, '2026-01-31')!.sessionIndex).toBe(2);
    expect(sessionOn(t, '2026-02-01')!.sessionIndex).toBe(3);
    expect(sessionOn(t, '2026-02-15')!.sessionIndex).toBe(4);
    expect(sessionOn(t, '2026-02-28')).toBeNull();
    expect(sessionOn(t, '2026-03-01')!.sessionIndex).toBe(5);
    expect(sessionOn(t, '2027-01-01')!.sessionIndex).toBe(31);
  });
});
