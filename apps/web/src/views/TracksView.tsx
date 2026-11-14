import {
  FIXED_CYCLES,
  getCurriculum,
  recurrenceOf,
  toISODate,
  type FixedCycle,
  type Recurrence,
  type ReminderRule,
  type StudyTrack,
  type TrackInput,
} from '@kavanu/core';
import { useState } from 'react';
import { useLocale, useRepo } from '../context';
import { describeSchedule, weekdayNames } from '../describe';
import { PRESET_GROUPS, curriculumOf, type Material, type Preset, type When } from '../presets';

const COLORS = ['#27408b', '#1f7a5c', '#b4532a', '#7a3e9d', '#a8324a', '#2f6f8f', '#8a6d1a', '#4a5560'];

interface Draft {
  id?: string;
  title: string;
  /** Suggested title, used when the field is left empty. */
  defaultTitle: string;
  color: string;
  material: Material;
  cycle: FixedCycle;
  section: string;
  onlySection: boolean;
  startDate: string;
  unitLabel: string;
  startUnit: string;
  unitsPerSession: string;
  totalUnits: string;
  when: When;
  daysOfWeek: number[];
  daysOfMonth: number[];
  times: string;
  advance: 'calendar' | 'completion';
  builtinLink: boolean;
  urlTemplate: string;
  notes: string;
  reminders: ReminderRule[];
}

function blankDraft(count: number): Draft {
  return {
    title: '',
    defaultTitle: '',
    color: COLORS[count % COLORS.length]!,
    material: 'none',
    cycle: 'dafYomi',
    section: '',
    onlySection: false,
    startDate: toISODate(new Date()),
    unitLabel: '',
    startUnit: '1',
    unitsPerSession: '1',
    totalUnits: '',
    when: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4],
    daysOfMonth: [1],
    times: '2',
    advance: 'completion',
    builtinLink: true,
    urlTemplate: '',
    notes: '',
    reminders: [],
  };
}

function toDraft(t: StudyTrack): Draft {
  const d = blankDraft(0);
  d.id = t.id;
  d.title = t.title;
  d.color = t.color;
  d.reminders = t.reminders;
  d.notes = t.notes ?? '';
  d.builtinLink = t.link.provider === 'builtin';
  d.urlTemplate = t.link.provider === 'template' ? t.link.urlTemplate : '';

  const rec = recurrenceOf(t.schedule);
  if (rec.type === 'weekly') {
    d.when = 'weekly';
    d.daysOfWeek = rec.daysOfWeek;
  } else if (rec.type === 'monthly') {
    d.when = 'monthly';
    d.daysOfMonth = rec.daysOfMonth;
  } else if (rec.type === 'flexible') {
    d.when = rec.per === 'week' ? 'perWeek' : 'perMonth';
    d.times = String(rec.times);
  } else {
    d.when = 'daily';
  }

  const s = t.schedule;
  if (s.kind === 'fixedCycle') {
    d.material = 'cycle';
    d.cycle = s.cycle;
    return d;
  }
  d.startDate = s.startDate;
  if (s.kind === 'freeform') {
    d.material = 'none';
    return d;
  }
  d.advance = s.advance;
  d.unitsPerSession = String(s.unitsPerSession);
  const curriculum = getCurriculum(s.curriculum);
  if (curriculum && s.curriculum !== 'custom') {
    d.material = s.curriculum;
    const section = curriculum.sections.find((x) => s.startUnit >= x.start && s.startUnit < x.start + x.count);
    d.section = section?.name ?? '';
    d.onlySection = !!section && s.totalUnits === section.start + section.count - 1;
  } else {
    d.material = 'units';
    d.unitLabel = s.unitLabel;
    d.startUnit = String(s.startUnit);
    d.totalUnits = s.totalUnits ? String(s.totalUnits) : '';
  }
  return d;
}

const int = (s: string, min: number, max = Number.MAX_SAFE_INTEGER) =>
  Math.min(max, Math.max(min, Math.floor(Number(s)) || min));

function toInput(d: Draft): TrackInput {
  const recurrence: Recurrence =
    d.when === 'weekly' && d.daysOfWeek.length > 0
      ? { type: 'weekly', daysOfWeek: [...d.daysOfWeek].sort() }
      : d.when === 'monthly' && d.daysOfMonth.length > 0
        ? { type: 'monthly', daysOfMonth: [...d.daysOfMonth].sort((a, b) => a - b) }
        : d.when === 'perWeek'
          ? { type: 'flexible', times: int(d.times, 1, 7), per: 'week' }
          : d.when === 'perMonth'
            ? { type: 'flexible', times: int(d.times, 1, 31), per: 'month' }
            : { type: 'daily' };
  const flexible = recurrence.type === 'flexible';
  const template = d.urlTemplate.trim();
  const hasBuiltin = d.material === 'cycle' || d.material === 'talmud' || d.material === 'mishnah';

  let schedule: TrackInput['schedule'];
  if (d.material === 'cycle') {
    schedule = { kind: 'fixedCycle', cycle: d.cycle, ...(recurrence.type === 'daily' ? {} : { recurrence }) };
  } else if (d.material === 'none') {
    schedule = { kind: 'freeform', startDate: d.startDate, recurrence };
  } else {
    const curriculum = getCurriculum(curriculumOf(d.material));
    const section = curriculum?.sections.find((x) => x.name === d.section) ?? curriculum?.sections[0];
    schedule = {
      kind: 'sequential',
      startDate: d.startDate,
      curriculum: curriculumOf(d.material),
      unitLabel: curriculum ? '' : d.unitLabel.trim(),
      startUnit: section ? section.start : int(d.startUnit, 1),
      unitsPerSession: int(d.unitsPerSession, 1, 100),
      ...(section
        ? d.onlySection
          ? { totalUnits: section.start + section.count - 1 }
          : {}
        : d.totalUnits.trim()
          ? { totalUnits: int(d.totalUnits, 1) }
          : {}),
      recurrence,
      advance: flexible ? 'completion' : d.advance,
    };
  }

  return {
    id: d.id,
    title: d.title.trim() || d.defaultTitle,
    color: d.color,
    archived: false,
    reminders: d.reminders,
    ...(d.notes.trim() ? { notes: d.notes.trim() } : {}),
    schedule,
    link: hasBuiltin
      ? d.builtinLink
        ? { provider: 'builtin' }
        : { provider: 'none' }
      : template
        ? { provider: 'template', urlTemplate: template }
        : { provider: 'none' },
  };
}

export function TracksView() {
  const repo = useRepo();
  const { locale, t, cycles } = useLocale();
  const tracks = repo.tracks();
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dayNames = weekdayNames(locale);

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const startFrom = (p: Preset) => {
    const d = blankDraft(tracks.length);
    d.material = p.material;
    d.defaultTitle = p.cycle ? cycles[p.cycle] : p.key === 'custom' ? '' : p.label!(t);
    if (p.cycle) d.cycle = p.cycle;
    if (p.when) d.when = p.when;
    if (p.times) d.times = String(p.times);
    if (p.daysOfWeek) d.daysOfWeek = p.daysOfWeek;
    if (p.unitLabel) d.unitLabel = p.unitLabel(t);
    if (p.totalUnits) d.totalUnits = String(p.totalUnits);
    if (p.urlTemplate) d.urlTemplate = p.urlTemplate;
    const curriculum = getCurriculum(curriculumOf(p.material));
    if (curriculum) d.section = curriculum.sections[0]!.name;
    setDraft(d);
    setPicking(false);
  };

  const save = async () => {
    if (!draft) return;
    try {
      const input = toInput(draft);
      if (!input.title) throw new Error(t.title);
      await repo.saveTrack(input);
      setDraft(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = async () => {
    if (!draft?.id || !confirm(t.confirmDelete)) return;
    await repo.deleteTrack(draft.id);
    setDraft(null);
  };

  if (picking) {
    return (
      <section className="card">
        <div className="list-head">
          <h2>{t.chooseWhat}</h2>
          <button className="btn" onClick={() => setPicking(false)}>
            {t.cancel}
          </button>
        </div>
        {PRESET_GROUPS.map((g) => (
          <div key={g.title(t)} className="preset-group">
            <h3>{g.title(t)}</h3>
            <div className="presets">
              {g.presets.map((p) => (
                <button key={p.key} className="preset" onClick={() => startFrom(p)}>
                  {p.cycle ? cycles[p.cycle] : p.label!(t)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
    );
  }

  if (draft) {
    const curriculum = getCurriculum(curriculumOf(draft.material));
    const flexible = draft.when === 'perWeek' || draft.when === 'perMonth';
    const sequential = draft.material === 'talmud' || draft.material === 'mishnah' || draft.material === 'units';
    const hasBuiltin = draft.material === 'cycle' || !!curriculum;
    const materials: [Material, string][] = [
      ['cycle', t.matCycle],
      ['talmud', t.matTalmud],
      ['mishnah', t.matMishnah],
      ['units', t.matUnits],
      ['none', t.matNone],
    ];
    const whens: [When, string][] = [
      ['daily', t.whenDaily],
      ['weekly', t.whenWeekly],
      ['monthly', t.whenMonthly],
      ['perWeek', t.whenPerWeek],
      ['perMonth', t.whenPerMonth],
    ];
    const toggle = (list: number[], v: number) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

    return (
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2>{draft.id ? t.editTrack : t.newTrack}</h2>

        <label className="field">
          <span>{t.title}</span>
          <input
            value={draft.title}
            maxLength={120}
            required={!draft.defaultTitle}
            placeholder={draft.defaultTitle}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>

        <label className="field">
          <span>{t.material}</span>
          <select
            value={draft.material}
            onChange={(e) => {
              const material = e.target.value as Material;
              const c = getCurriculum(curriculumOf(material));
              set({ material, section: c ? c.sections[0]!.name : '', onlySection: false });
            }}
          >
            {materials.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {draft.material === 'cycle' && (
          <label className="field">
            <span>{t.cycle}</span>
            <select value={draft.cycle} onChange={(e) => set({ cycle: e.target.value as FixedCycle })}>
              {FIXED_CYCLES.map((c) => (
                <option key={c} value={c}>
                  {cycles[c]}
                </option>
              ))}
            </select>
          </label>
        )}

        {curriculum && (
          <div className="row">
            <label className="field">
              <span>{t.startAt}</span>
              <select value={draft.section} onChange={(e) => set({ section: e.target.value })}>
                {curriculum.sections.map((x) => (
                  <option key={x.name} value={x.name}>
                    {locale === 'he' ? x.nameHe : x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t.perSession}</span>
              <input
                type="number"
                min={1}
                max={100}
                value={draft.unitsPerSession}
                onChange={(e) => set({ unitsPerSession: e.target.value })}
              />
            </label>
          </div>
        )}
        {curriculum && (
          <label className="choice">
            <input type="checkbox" checked={draft.onlySection} onChange={(e) => set({ onlySection: e.target.checked })} />{' '}
            {t.onlySection}
          </label>
        )}

        {draft.material === 'units' && (
          <div className="row">
            <label className="field">
              <span>{t.unitLabel}</span>
              <input
                value={draft.unitLabel}
                maxLength={40}
                placeholder={t.unitLabelHint}
                onChange={(e) => set({ unitLabel: e.target.value })}
              />
            </label>
            <label className="field">
              <span>{t.startUnit}</span>
              <input type="number" min={1} value={draft.startUnit} onChange={(e) => set({ startUnit: e.target.value })} />
            </label>
            <label className="field">
              <span>{t.perSession}</span>
              <input
                type="number"
                min={1}
                max={100}
                value={draft.unitsPerSession}
                onChange={(e) => set({ unitsPerSession: e.target.value })}
              />
            </label>
            <label className="field">
              <span>{t.totalUnits}</span>
              <input type="number" min={1} value={draft.totalUnits} onChange={(e) => set({ totalUnits: e.target.value })} />
            </label>
          </div>
        )}

        <label className="field">
          <span>{t.when}</span>
          <select value={draft.when} onChange={(e) => set({ when: e.target.value as When })}>
            {whens.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {draft.when === 'weekly' && (
          <div className="days" role="group" aria-label={t.whenWeekly}>
            {dayNames.map((name, i) => (
              <button
                type="button"
                key={i}
                className="day-toggle"
                aria-pressed={draft.daysOfWeek.includes(i)}
                onClick={() => set({ daysOfWeek: toggle(draft.daysOfWeek, i) })}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        {draft.when === 'monthly' && (
          <div className="days month-days" role="group" aria-label={t.whenMonthly}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <button
                type="button"
                key={d}
                className="day-toggle"
                aria-pressed={draft.daysOfMonth.includes(d)}
                onClick={() => set({ daysOfMonth: toggle(draft.daysOfMonth, d) })}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        {flexible && (
          <label className="field narrow">
            <span>{draft.when === 'perWeek' ? t.timesPerWeek : t.timesPerMonth}</span>
            <input
              type="number"
              min={1}
              max={draft.when === 'perWeek' ? 7 : 31}
              value={draft.times}
              onChange={(e) => set({ times: e.target.value })}
            />
          </label>
        )}

        {draft.material !== 'cycle' && (
          <label className="field narrow">
            <span>{t.startDate}</span>
            <input type="date" required value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </label>
        )}

        {sequential && !flexible && (
          <fieldset className="field">
            <legend>{t.pacing}</legend>
            <div className="choices column">
              <label>
                <input type="radio" checked={draft.advance === 'completion'} onChange={() => set({ advance: 'completion' })} />{' '}
                {t.paceCompletion}
              </label>
              <label>
                <input type="radio" checked={draft.advance === 'calendar'} onChange={() => set({ advance: 'calendar' })} />{' '}
                {t.paceCalendar}
              </label>
            </div>
          </fieldset>
        )}

        {hasBuiltin ? (
          <label className="choice">
            <input type="checkbox" checked={draft.builtinLink} onChange={(e) => set({ builtinLink: e.target.checked })} />{' '}
            {t.linkBuiltinGeneric}
          </label>
        ) : (
          <label className="field">
            <span>{t.linkTemplate}</span>
            <input
              type="url"
              dir="ltr"
              value={draft.urlTemplate}
              placeholder="https://example.org/lesson/{sessionIndex}"
              onChange={(e) => set({ urlTemplate: e.target.value })}
            />
            <small className="muted" dir="ltr">
              {t.linkTemplateHint}
            </small>
          </label>
        )}

        <label className="field">
          <span>{t.notes}</span>
          <textarea rows={2} maxLength={500} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>

        <fieldset className="field">
          <legend>{t.reminders}</legend>
          {draft.reminders.map((r, i) => (
            <div className="reminder" key={r.id}>
              <input
                type="time"
                required
                value={r.time}
                aria-label={t.reminders}
                onChange={(e) =>
                  set({ reminders: draft.reminders.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)) })
                }
              />
              <label>
                <input
                  type="checkbox"
                  checked={r.onlyIfNotDone}
                  onChange={(e) =>
                    set({ reminders: draft.reminders.map((x, j) => (j === i ? { ...x, onlyIfNotDone: e.target.checked } : x)) })
                  }
                />{' '}
                {t.onlyIfNotDone}
              </label>
              <button type="button" className="btn" onClick={() => set({ reminders: draft.reminders.filter((_, j) => j !== i) })}>
                {t.remove}
              </button>
            </div>
          ))}
          {draft.reminders.length < 10 && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                set({
                  reminders: [...draft.reminders, { id: `r_${crypto.randomUUID().slice(0, 8)}`, time: '20:00', onlyIfNotDone: true }],
                })
              }
            >
              {t.addReminder}
            </button>
          )}
        </fieldset>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="submit" className="btn primary">
            {t.save}
          </button>
          <button type="button" className="btn" onClick={() => setDraft(null)}>
            {t.cancel}
          </button>
          {draft.id && (
            <button type="button" className="btn danger" onClick={() => void remove()}>
              {t.delete}
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <section className="card">
      <div className="list-head">
        <h2>{t.navTracks}</h2>
        <button className="btn primary" onClick={() => setPicking(true)}>
          {t.newTrack}
        </button>
      </div>
      {tracks.length === 0 ? (
        <p className="empty">{t.noTracksYet}</p>
      ) : (
        <ul className="track-list">
          {tracks.map((tr) => (
            <li key={tr.id} style={{ '--track': tr.color } as React.CSSProperties}>
              <div className="track-text">
                <span className="session-title">{tr.title}</span>
                <span className="muted">{describeSchedule(tr.schedule, t, cycles, locale)}</span>
              </div>
              <button className="btn" onClick={() => setDraft(toDraft(tr))}>
                {t.edit}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
