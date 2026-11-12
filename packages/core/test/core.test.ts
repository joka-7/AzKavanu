import { describe, expect, it } from 'vitest';
import {
  HlcClock,
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
    const plan = planReminders([t], () => false, now, { windowDays: 3 });
    expect(plan.map((n) => n.id)).toEqual(['t_hist|2026-11-01|pm', 't_hist|2026-11-03|am', 't_hist|2026-11-03|pm']);
    expect(plan[0]!.fireAt).toBe(toLocalDate('2026-11-01', 21, 0).getTime());
  });

  it('drops the nudge once the day is done', () => {
    const plan = planReminders([t], (_id, date) => date === '2026-11-01', now, { windowDays: 3 });
    expect(plan.map((n) => n.id)).not.toContain('t_hist|2026-11-01|pm');
    expect(plan).toHaveLength(2);
  });

  it('addDays crosses month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
