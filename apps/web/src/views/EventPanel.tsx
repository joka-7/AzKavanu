import {
  googleCalendarUrl,
  recurrenceOf,
  repeatFromRecurrence,
  resolveLink,
  type EventEnd,
  type EventRepeat,
  type EventSpec,
  type ISODate,
  type Repository,
  type StudyTrack,
} from '@kavanu/core';
import { useState } from 'react';
import { downloadDailyEvents, downloadEvent } from '../calendarFile';
import { weekdayNames } from '../describe';
import { useLocale } from '../context';

type RepeatKind = 'schedule' | 'none' | 'daily' | 'weekly' | 'monthly';

/** Add one study to the user's own calendar, with details, a repeat rule and an alert. */
export function EventPanel({
  repo,
  track,
  date,
  onClose,
  defaultTitle,
  defaultDetails,
  closeLabel,
}: {
  repo: Repository;
  track: StudyTrack;
  date: ISODate;
  onClose: () => void;
  defaultTitle?: string;
  defaultDetails?: string;
  closeLabel?: string;
}) {
  const { locale, t } = useLocale();
  const session = repo.session(track, date);
  const dayUrl = session ? resolveLink(track, session, locale) : null;
  const scheduleRepeat = repeatFromRecurrence(recurrenceOf(track.schedule));
  const flexible = recurrenceOf(track.schedule).type === 'flexible';
  const names = weekdayNames(locale);
  const dow = new Date(`${date}T12:00:00`).getDay();

  const [mode, setMode] = useState<'recurring' | 'daily'>('recurring');
  const [title, setTitle] = useState(defaultTitle ?? track.title);
  const [first, setFirst] = useState<ISODate>(date);
  const [start, setStart] = useState(track.time?.start ?? track.reminders[0]?.time ?? '20:00');
  const [end, setEnd] = useState(track.time?.end ?? '');
  const [kind, setKind] = useState<RepeatKind>(scheduleRepeat ? 'schedule' : 'weekly');
  const [days, setDays] = useState<number[]>([dow]);
  const [monthDays, setMonthDays] = useState<number[]>([Number(date.slice(8))]);
  const [endType, setEndType] = useState<EventEnd['type']>('never');
  const [until, setUntil] = useState<ISODate>(date);
  const [count, setCount] = useState('10');
  const [details, setDetails] = useState(defaultDetails ?? track.notes ?? '');
  // null = automatic: a link to one day's page only makes sense on an event that does not repeat.
  const [linkChoice, setLinkChoice] = useState<boolean | null>(null);
  const [alarm, setAlarm] = useState('15');
  const [message, setMessage] = useState<string | null>(null);

  const toggle = (list: number[], v: number) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const repeatEnd: EventEnd = endType === 'until' ? { type: 'until', date: until } : endType === 'count' ? { type: 'count', count: Math.max(1, Math.floor(Number(count)) || 1) } : { type: 'never' };
  const repeat: EventRepeat =
    kind === 'schedule' && scheduleRepeat
      ? { ...scheduleRepeat, end: repeatEnd }
      : kind === 'daily'
        ? { freq: 'daily', end: repeatEnd }
        : kind === 'weekly'
          ? { freq: 'weekly', days: days.length ? days : [dow], end: repeatEnd }
          : kind === 'monthly'
            ? { freq: 'monthly', monthDays: monthDays.length ? monthDays : [1], end: repeatEnd }
            : { freq: 'none', end: { type: 'never' } };
  const repeats = repeat.freq !== 'none';
  const withLink = linkChoice ?? !repeats;
  const alarmMinutes = alarm === 'none' ? null : Number(alarm);
  const spec: EventSpec = {
    uid: `${track.id}|${first}|${start}`,
    title: title.trim() || track.title,
    description: details,
    ...(withLink && dayUrl ? { url: dayUrl } : {}),
    date: first,
    start,
    ...(end ? { end } : {}),
    repeat,
    alarmMinutes,
  };
  const durationMin = end && end > start ? (Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) - Number(start.slice(0, 2)) * 60 - Number(start.slice(3))) : 30;

  return (
    <form className="session-panel event-panel" onSubmit={(e) => e.preventDefault()}>
      <strong>{t.addToCalendarBtn}</strong>
      {!flexible && (
        <div className="choices column">
          <label>
            <input type="radio" checked={mode === 'recurring'} onChange={() => setMode('recurring')} /> {t.eventModeRecurring}
          </label>
          <label>
            <input type="radio" checked={mode === 'daily'} onChange={() => setMode('daily')} /> {t.eventModeDaily}
          </label>
        </div>
      )}

      <div className="row times">
        <label className="field">
          <span>{t.eventStart}</span>
          <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>{t.eventEnd}</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>

      {mode === 'recurring' && (
        <>
          <label className="field">
            <span>{t.eventRepeat}</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as RepeatKind)}>
              {scheduleRepeat && <option value="schedule">{t.repeatSchedule}</option>}
              <option value="none">{t.repeatNone}</option>
              <option value="daily">{t.repeatDaily}</option>
              <option value="weekly">{t.repeatWeekly}</option>
              <option value="monthly">{t.repeatMonthly}</option>
            </select>
          </label>
          {kind === 'weekly' && (
            <div className="days" role="group" aria-label={t.repeatWeekly}>
              {names.map((n, i) => (
                <button type="button" key={i} className="day-toggle" aria-pressed={days.includes(i)} onClick={() => setDays(toggle(days, i))}>
                  {n}
                </button>
              ))}
            </div>
          )}
          {kind === 'monthly' && (
            <div className="days month-days" role="group" aria-label={t.repeatMonthly}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <button type="button" key={d} className="day-toggle" aria-pressed={monthDays.includes(d)} onClick={() => setMonthDays(toggle(monthDays, d))}>
                  {d}
                </button>
              ))}
            </div>
          )}
          <details className="more">
            <summary>{t.moreOptions}</summary>
            <div className="more-body">
              <label className="field">
                <span>{t.eventTitle}</span>
                <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="field narrow">
                <span>{t.eventDate}</span>
                <input type="date" required value={first} onChange={(e) => setFirst(e.target.value)} />
              </label>
              {repeats && (
                <>
                  <label className="field narrow">
                    <span>{t.eventEnds}</span>
                    <select value={endType} onChange={(e) => setEndType(e.target.value as EventEnd['type'])}>
                      <option value="never">{t.endNever}</option>
                      <option value="until">{t.endOn}</option>
                      <option value="count">{t.endAfter}</option>
                    </select>
                  </label>
                  {endType === 'until' && (
                    <label className="field narrow">
                      <span>{t.endOn}</span>
                      <input type="date" required value={until} min={first} onChange={(e) => setUntil(e.target.value)} />
                    </label>
                  )}
                  {endType === 'count' && (
                    <label className="field narrow">
                      <span>{t.endAfter}</span>
                      <input type="number" min={1} max={999} value={count} onChange={(e) => setCount(e.target.value)} />
                    </label>
                  )}
                </>
              )}
              <label className="field">
                <span>{t.eventDetails}</span>
                <textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
              </label>
              {dayUrl && (
                <label className="choice">
                  <input type="checkbox" checked={withLink} onChange={(e) => setLinkChoice(e.target.checked)} /> {t.eventIncludeLink}
                </label>
              )}
              {repeats && <span className="muted small">{t.eventRecurringNote}</span>}
            </div>
          </details>
        </>
      )}

      <label className="field narrow">
        <span>{t.eventAlarm}</span>
        <select value={alarm} onChange={(e) => setAlarm(e.target.value)}>
          <option value="none">{t.alarmNone}</option>
          <option value="0">{t.alarmAtStart}</option>
          {[10, 15, 30, 60].map((n) => (
            <option key={n} value={n}>
              {t.alarmMin(n)}
            </option>
          ))}
        </select>
      </label>

      {message && <span role="status">{message}</span>}
      <div className="actions tight">
        {mode === 'recurring' ? (
          <>
            <a className="btn primary" href={googleCalendarUrl(spec)} target="_blank" rel="noopener noreferrer" title={t.googleAlertNote}>
              {t.openGoogleCalendar}
            </a>
            <button type="button" className="btn" onClick={() => downloadEvent(spec)}>
              {t.downloadEvent}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              const n = downloadDailyEvents(repo, track, {
                locale,
                appName: t.appName,
                start,
                durationMin,
                alarmMinutes,
                from: date,
                link: (d) => {
                  const s = repo.session(track, d);
                  return s ? resolveLink(track, s, locale) : null;
                },
              });
              setMessage(`${n} × ${t.downloadEvent}`);
            }}
          >
            {t.downloadEvent}
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>
          {closeLabel ?? t.cancel}
        </button>
      </div>
    </form>
  );
}
