import { toISODate, type Recurrence, type ReminderRule, type StudyTrack, type TrackInput } from '@kavanu/core';
import { useState } from 'react';
import { useLocale, useRepo } from '../context';

const COLORS = ['#27408b', '#1f7a5c', '#b4532a', '#7a3e9d', '#a8324a', '#2f6f8f', '#8a6d1a', '#4a5560'];

type TrackType = 'dafYomi' | 'mishnaYomi' | 'sequential' | 'freeform';

interface Draft {
  id?: string;
  title: string;
  color: string;
  type: TrackType;
  startDate: string;
  unitLabel: string;
  startUnit: string;
  unitsPerSession: string;
  totalUnits: string;
  repeat: 'daily' | 'weekly';
  daysOfWeek: number[];
  builtinLink: boolean;
  urlTemplate: string;
  reminders: ReminderRule[];
}

function newDraft(count: number): Draft {
  return {
    title: '',
    color: COLORS[count % COLORS.length]!,
    type: 'dafYomi',
    startDate: toISODate(new Date()),
    unitLabel: '',
    startUnit: '1',
    unitsPerSession: '1',
    totalUnits: '',
    repeat: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4],
    builtinLink: true,
    urlTemplate: '',
    reminders: [],
  };
}

function toDraft(t: StudyTrack): Draft {
  const d = newDraft(0);
  d.id = t.id;
  d.title = t.title;
  d.color = t.color;
  d.reminders = t.reminders;
  d.builtinLink = t.link.provider === 'builtin';
  d.urlTemplate = t.link.provider === 'template' ? t.link.urlTemplate : '';
  const s = t.schedule;
  if (s.kind === 'fixedCycle') {
    d.type = s.cycle;
  } else {
    d.type = s.kind;
    d.startDate = s.startDate;
    d.repeat = s.recurrence.type;
    if (s.recurrence.type === 'weekly') d.daysOfWeek = s.recurrence.daysOfWeek;
    if (s.kind === 'sequential') {
      d.unitLabel = s.unitLabel;
      d.startUnit = String(s.startUnit);
      d.unitsPerSession = String(s.unitsPerSession);
      d.totalUnits = s.totalUnits ? String(s.totalUnits) : '';
    }
  }
  return d;
}

function toInput(d: Draft, defaultTitle: string): TrackInput {
  const fixed = d.type === 'dafYomi' || d.type === 'mishnaYomi';
  const recurrence: Recurrence =
    d.repeat === 'weekly' && d.daysOfWeek.length > 0
      ? { type: 'weekly', daysOfWeek: [...d.daysOfWeek].sort() }
      : { type: 'daily' };
  const int = (s: string, min: number) => Math.max(min, Math.floor(Number(s)) || min);
  const template = d.urlTemplate.trim();
  return {
    id: d.id,
    title: d.title.trim() || defaultTitle,
    color: d.color,
    archived: false,
    reminders: d.reminders,
    schedule:
      d.type === 'dafYomi' || d.type === 'mishnaYomi'
        ? { kind: 'fixedCycle', cycle: d.type }
        : d.type === 'sequential'
          ? {
              kind: 'sequential',
              startDate: d.startDate,
              unitLabel: d.unitLabel.trim(),
              startUnit: int(d.startUnit, 1),
              unitsPerSession: Math.min(100, int(d.unitsPerSession, 1)),
              ...(d.totalUnits.trim() ? { totalUnits: int(d.totalUnits, 1) } : {}),
              recurrence,
            }
          : { kind: 'freeform', startDate: d.startDate, recurrence },
    link: fixed
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
  const { locale, t } = useLocale();
  const tracks = repo.tracks();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const intlLocale = locale === 'he' ? 'he-IL' : 'en-GB';
  const dayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(intlLocale, { weekday: 'short' }).format(new Date(2026, 10, 1 + i)),
  );
  const typeLabel: Record<TrackType, string> = {
    dafYomi: t.typeDafYomi,
    mishnaYomi: t.typeMishnaYomi,
    sequential: t.typeSequential,
    freeform: t.typeFreeform,
  };

  const describe = (tr: StudyTrack): string => {
    const s = tr.schedule;
    if (s.kind === 'fixedCycle') return `${typeLabel[s.cycle]} · ${t.scheduleDaily}`;
    const when = s.recurrence.type === 'daily' ? t.scheduleDaily : s.recurrence.daysOfWeek.map((d) => dayNames[d]).join(', ');
    const what = s.kind === 'sequential' ? `${s.unitsPerSession} × ${s.unitLabel || '#'} · ` : '';
    return `${what}${when} · ${t.from} ${s.startDate}`;
  };

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const save = async () => {
    if (!draft) return;
    try {
      await repo.saveTrack(toInput(draft, typeLabel[draft.type]));
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

  if (draft) {
    const fixed = draft.type === 'dafYomi' || draft.type === 'mishnaYomi';
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
          <span>{t.type}</span>
          <select value={draft.type} onChange={(e) => set({ type: e.target.value as TrackType })}>
            {(Object.keys(typeLabel) as TrackType[]).map((k) => (
              <option key={k} value={k}>
                {typeLabel[k]}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{t.title}</span>
          <input
            value={draft.title}
            maxLength={120}
            placeholder={typeLabel[draft.type]}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>

        <fieldset className="field">
          <legend>{t.color}</legend>
          <div className="swatches">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className="swatch"
                aria-label={c}
                aria-pressed={draft.color === c}
                style={{ background: c }}
                onClick={() => set({ color: c })}
              />
            ))}
          </div>
        </fieldset>

        {!fixed && (
          <>
            <label className="field">
              <span>{t.startDate}</span>
              <input type="date" required value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </label>

            {draft.type === 'sequential' && (
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
                  <span>{t.unitsPerSession}</span>
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

            <fieldset className="field">
              <legend>{t.repeats}</legend>
              <div className="choices">
                <label>
                  <input type="radio" checked={draft.repeat === 'daily'} onChange={() => set({ repeat: 'daily' })} /> {t.daily}
                </label>
                <label>
                  <input type="radio" checked={draft.repeat === 'weekly'} onChange={() => set({ repeat: 'weekly' })} /> {t.weekly}
                </label>
              </div>
              {draft.repeat === 'weekly' && (
                <div className="days">
                  {dayNames.map((name, i) => (
                    <button
                      type="button"
                      key={i}
                      className="day-toggle"
                      aria-pressed={draft.daysOfWeek.includes(i)}
                      onClick={() =>
                        set({
                          daysOfWeek: draft.daysOfWeek.includes(i)
                            ? draft.daysOfWeek.filter((d) => d !== i)
                            : [...draft.daysOfWeek, i],
                        })
                      }
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </fieldset>
          </>
        )}

        {fixed ? (
          <label className="choice">
            <input type="checkbox" checked={draft.builtinLink} onChange={(e) => set({ builtinLink: e.target.checked })} />{' '}
            {t.linkBuiltin}
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
        <button className="btn primary" onClick={() => setDraft(newDraft(tracks.length))}>
          {t.newTrack}
        </button>
      </div>
      {tracks.length === 0 ? (
        <p className="empty">{t.noTracksYet}</p>
      ) : (
        <ul className="track-list">
          {tracks.map((tr) => (
            <li key={tr.id} style={{ '--track': tr.color } as React.CSSProperties}>
              <span className="track-mark" aria-hidden="true" />
              <div className="track-text">
                <span className="session-title">{tr.title}</span>
                <span className="muted">{describe(tr)}</span>
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
