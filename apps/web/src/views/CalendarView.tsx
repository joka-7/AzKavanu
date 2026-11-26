import { HDate, HebrewCalendar, gematriya } from '@hebcal/core';
import {
  addDays,
  dayOfWeek,
  parseISODate,
  occurrence,
  periodProgress,
  resolveAppLinks,
  resolveExtraLinks,
  resolveLink,
  toISODate,
  toLocalDate,
  type ISODate,
  type Repository,
  type StudyTrack,
} from '@kavanu/core';
import { useMemo, useState } from 'react';
import { downloadCalendarFile } from '../calendarFile';
import { useLocale, useRepo, useServices } from '../context';
import { isNative } from '../platform/notifications';
import { EventPanel } from './EventPanel';

/** Consecutive assigned sessions completed, counting back from today (today may still be open). */
function streak(repo: Repository, track: StudyTrack, today: ISODate): number {
  let n = 0;
  for (let i = 0; i < 730; i++) {
    const date = addDays(today, -i);
    if (track.schedule.kind !== 'fixedCycle' && date < track.schedule.startDate) break;
    if (occurrence(track.schedule, date) !== 'fixed') continue;
    if (repo.isDone(track.id, date)) n++;
    else if (i > 0) break;
  }
  return n;
}

interface MonthModel {
  title: string;
  /** The same span in the other calendar, e.g. "Nov – Dec 2026" under a Hebrew month. */
  subtitle: string;
  cells: ISODate[];
  first: ISODate;
  last: ISODate;
}

/** The month containing `anchor`, in either calendar, as whole weeks starting on Sunday. */
function monthModel(anchor: ISODate, hebrew: boolean, locale: string): MonthModel {
  const intl = locale === 'he' ? 'he-IL' : 'en-GB';
  let first: ISODate;
  let last: ISODate;
  let title: string;
  let subtitle: string;
  if (hebrew) {
    const hd = new HDate(toLocalDate(anchor));
    const start = new HDate(1, hd.getMonth(), hd.getFullYear());
    first = toISODate(start.greg());
    last = addDays(first, start.daysInMonth() - 1);
    title =
      locale === 'he'
        ? start.renderGematriya(true).split(' ').slice(1).join(' ')
        : `${start.getMonthName()} ${start.getFullYear()}`;
    const fmt = new Intl.DateTimeFormat(intl, { month: 'short', year: 'numeric' });
    const a = fmt.format(toLocalDate(first));
    const b = fmt.format(toLocalDate(last));
    subtitle = a === b ? a : `${a} – ${b}`;
  } else {
    const { y, m } = parseISODate(anchor);
    first = `${y}-${String(m).padStart(2, '0')}-01`;
    last = addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`, -1);
    title = new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric' }).format(toLocalDate(first));
    const name = (d: ISODate) => {
      const hd = new HDate(toLocalDate(d));
      return locale === 'he' ? hd.renderGematriya(true).split(' ').slice(1).join(' ') : `${hd.getMonthName()} ${hd.getFullYear()}`;
    };
    subtitle = name(first) === name(last) ? name(first) : `${name(first)} – ${name(last)}`;
  }
  const cells: ISODate[] = [];
  for (let d = addDays(first, -dayOfWeek(first)); d <= last || cells.length % 7 !== 0; d = addDays(d, 1)) cells.push(d);
  return { title, subtitle, cells, first, last };
}

export function CalendarView({ onAddTrack }: { onAddTrack: () => void }) {
  const repo = useRepo();
  const { notifier } = useServices();
  const { locale, t } = useLocale();
  const [panel, setPanel] = useState<{ trackId: string; kind: 'link' | 'reminder' | 'event' } | null>(null);
  const [linkText, setLinkText] = useState('');
  const [reminderTime, setReminderTime] = useState('20:00');
  const [reminderOnlyIfNotDone, setReminderOnlyIfNotDone] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  // Whether the month grid is shown; a per-device preference, so it is kept in this browser only.
  const [monthOpen, setMonthOpen] = useState(() => {
    try {
      return localStorage.getItem('azk.monthOpen') !== '0';
    } catch {
      return true;
    }
  });
  const toggleMonth = () => {
    setMonthOpen(!monthOpen);
    try {
      localStorage.setItem('azk.monthOpen', monthOpen ? '0' : '1');
    } catch {
      // Private mode: the choice just lasts for this visit.
    }
  };
  /** Move the selected day, bringing the month view along with it. */
  const moveDay = (delta: number) => {
    const next = addDays(selected, delta);
    setSelected(next);
    setAnchor(next);
  };
  const today = toISODate(new Date());
  const [selected, setSelected] = useState<ISODate>(today);
  const hebrew = repo.setting('calendar', locale === 'he' ? 'hebrew' : 'gregorian') === 'hebrew';
  /** Any date inside the month being shown. */
  const [anchor, setAnchor] = useState<ISODate>(today);

  const tracks = repo.tracks();
  const trackById = useMemo(() => new Map(tracks.map((x) => [x.id, x])), [tracks]);
  const month = useMemo(() => monthModel(anchor, hebrew, locale), [anchor, hebrew, locale]);
  const intlLocale = locale === 'he' ? 'he-IL' : 'en-GB';
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(intlLocale, { weekday: 'short' }).format(new Date(2026, 10, 1 + i)),
  );

  const selectedHd = new HDate(toLocalDate(selected));
  const weekday = new Intl.DateTimeFormat(intlLocale, { weekday: 'long' }).format(toLocalDate(selected));
  const gregorianText = new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    toLocalDate(selected),
  );
  const hebrewText = locale === 'he' ? selectedHd.renderGematriya(true) : selectedHd.render('en');
  const selectedTitle = `${weekday}, ${hebrew ? hebrewText : gregorianText}`;
  const selectedOther = hebrew ? gregorianText : hebrewText;
  const holidays = (HebrewCalendar.getHolidaysOnDate(selectedHd, repo.setting('israel', false)) ?? [])
    .map((ev) => ev.render(locale === 'he' ? 'he' : 'en'))
    .join(' · ');

  const goToday = () => {
    setAnchor(today);
    setSelected(today);
  };

  // Timed sessions first, in order of the day; the rest follow by name.
  const sessions = repo.sessions(selected).sort((a, b) => {
    const ta = trackById.get(a.trackId)?.time?.start ?? '99';
    const tb = trackById.get(b.trackId)?.time?.start ?? '99';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  const assigned = sessions.filter((s) => !s.optional);
  const doneCount = assigned.filter((s) => repo.isDone(s.trackId, selected)).length;

  return (
    <div className="calendar-layout">
      <section className="card day" aria-labelledby="day-title">
        <div className="day-head">
          <div>
            <h2 id="day-title">{selected === today ? `${t.today} · ${selectedTitle}` : selectedTitle}</h2>
            <p className="muted">{selectedOther}</p>
            {holidays && <p className="holiday">{holidays}</p>}
          </div>
          <div className="day-side">
            <div className="month-nav">
              <button className="btn icon" aria-label={t.prevDay} onClick={() => moveDay(-1)}>
                <span className="chev prev" aria-hidden="true" />
              </button>
              <button className="btn icon" aria-label={t.nextDay} onClick={() => moveDay(1)}>
                <span className="chev next" aria-hidden="true" />
              </button>
            </div>
            {assigned.length > 0 && <span className="count">{t.doneOf(doneCount, assigned.length)}</span>}
          </div>
        </div>

        {tracks.length === 0 ? (
          <div className="empty">
            <p>{t.noTracksYet}</p>
            <button className="btn primary" onClick={onAddTrack}>
              {t.addFirstTrack}
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <p className="empty">{t.nothingScheduled}</p>
        ) : (
          <ul className="sessions">
            {sessions.map((s) => {
              const track = trackById.get(s.trackId)!;
              const done = repo.isDone(track.id, selected);
              const url = resolveLink(track, s, locale);
              const extra = resolveExtraLinks(track, s, locale);
              const appLinks = resolveAppLinks(s);
              const run = s.optional ? 0 : streak(repo, track, today);
              const quota = periodProgress(track.schedule, selected, repo.doneDates(track.id));
              const open = panel?.trackId === track.id ? panel.kind : null;
              const times = track.reminders.map((r) => r.time).sort().join(', ');
              const togglePanel = (kind: 'link' | 'reminder' | 'event') => {
                setMessage(null);
                if (open === kind) return setPanel(null);
                setPanel({ trackId: track.id, kind });
                if (kind === 'link') setLinkText(s.customUrl ?? '');
                else setReminderTime(track.time?.start ?? '20:00');
              };
              return (
                <li key={track.id} className={done ? 'session done' : 'session'} style={{ '--track': track.color } as React.CSSProperties}>
                  <div className="session-text">
                    <span className="session-title">{track.title}</span>
                    {track.time && (
                      <span className="session-time" dir="ltr">
                        {track.time.start}
                        {track.time.end ? `–${track.time.end}` : ''}
                      </span>
                    )}
                    <span className="session-unit">{(locale === 'he' && s.labelHe) || s.label}</span>
                    {quota && (
                      <span className={quota.done >= quota.target ? 'session-streak' : 'session-quota'}>
                        {t.quota(quota.done, quota.target, quota.per)}
                      </span>
                    )}
                    {run > 1 && <span className="session-streak">{t.streak(run)}</span>}
                    {track.notes && <span className="session-notes">{track.notes}</span>}
                  </div>

                  <div className="session-actions">
                    <button
                      className={done ? 'btn done-btn on' : 'btn done-btn'}
                      aria-pressed={done}
                      aria-label={`${done ? t.doneUndo : t.markDoneBtn}: ${track.title}`}
                      onClick={() => void repo.setDone(track.id, selected, !done)}
                    >
                      {done ? t.doneUndo : t.markDoneBtn}
                    </button>
                    {url && (
                      <a className="btn" href={url} target="_blank" rel="noopener noreferrer">
                        {t.open}
                      </a>
                    )}
                    {appLinks.map((l) => (
                      <a key={l.app} className="btn" href={l.url} target="_blank" rel="noopener noreferrer">
                        {l.app === 'shasRadar' ? t.appShasRadar : t.appOtVaOt}
                      </a>
                    ))}
                    {extra.map((l) => (
                      <a key={l.label + l.url} className="btn" href={l.url} target="_blank" rel="noopener noreferrer">
                        {l.label}
                      </a>
                    ))}
                    <button className="btn" aria-expanded={open === 'link'} onClick={() => togglePanel('link')}>
                      {url ? t.changeLink : t.addLink}
                    </button>
                    <button className="btn" aria-expanded={open === 'reminder'} onClick={() => togglePanel('reminder')}>
                      {t.remindMe}
                    </button>
                    {!isNative && (
                      <button className="btn" aria-expanded={open === 'event'} onClick={() => togglePanel('event')}>
                        {t.addToCalendarBtn}
                      </button>
                    )}
                  </div>

                  {open === 'event' && <EventPanel repo={repo} track={track} date={selected} onClose={() => setPanel(null)} />}

                  {open === 'link' && (
                    <form
                      className="session-panel"
                      onSubmit={(e) => {
                        e.preventDefault();
                        repo.setSessionLink(track.id, selected, linkText).then(
                          () => {
                            setMessage(null);
                            setPanel(null);
                          },
                          () => setMessage(t.linkInvalid),
                        );
                      }}
                    >
                      <strong>{t.linkForDay}</strong>
                      <span className="muted small">{t.linkHintDay}</span>
                      <input
                        type="text"
                        inputMode="url"
                        dir="ltr"
                        autoFocus
                        placeholder="https://"
                        aria-label={t.linkForDay}
                        value={linkText}
                        onChange={(e) => setLinkText(e.target.value)}
                      />
                      {message && <span className="error">{message}</span>}
                      <div className="actions tight">
                        <button className="btn primary" disabled={!linkText.trim()}>
                          {t.save}
                        </button>
                        {s.customUrl && (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => void repo.setSessionLink(track.id, selected, null).then(() => setPanel(null))}
                          >
                            {t.remove}
                          </button>
                        )}
                        <button type="button" className="btn" onClick={() => setPanel(null)}>
                          {t.cancel}
                        </button>
                      </div>
                    </form>
                  )}

                  {open === 'reminder' && (
                    <form
                      className="session-panel"
                      onSubmit={(e) => {
                        e.preventDefault();
                        // The reminder planner re-runs on every change, so the new reminder is scheduled right away.
                        void repo.addReminder(track.id, reminderTime, reminderOnlyIfNotDone).then(() => setMessage(t.reminderSaved(reminderTime)));
                      }}
                    >
                      <strong>{t.remindMe}</strong>
                      {times && <span className="muted small">{t.reminderExisting(times)}</span>}
                      <label className="field narrow">
                        <span>{t.reminderAt}</span>
                        <input type="time" required value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
                      </label>
                      <label className="choice">
                        <input
                          type="checkbox"
                          checked={reminderOnlyIfNotDone}
                          onChange={(e) => setReminderOnlyIfNotDone(e.target.checked)}
                        />{' '}
                        {t.onlyIfNotDone}
                      </label>
                      {!notifier.background && <span className="muted small">{t.browserReminderNote}</span>}
                      {message && <span role="status">{message}</span>}
                      <div className="actions tight">
                        <button className="btn primary">{t.save}</button>
                        {!isNative && track.reminders.length > 0 && (
                          <button
                            type="button"
                            className="btn"
                            title={t.calendarHint}
                            onClick={() => downloadCalendarFile(repo, track, locale, t.appName)}
                          >
                            {t.addToCalendar}
                          </button>
                        )}
                        <button type="button" className="btn" onClick={() => setPanel(null)}>
                          {t.cancel}
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card month" aria-label={month.title}>
        <div className="month-head">
          <div>
            <h2>{month.title}</h2>
            <p className="muted small">{month.subtitle}</p>
          </div>
          <div className="month-nav">
            {monthOpen && (
              <>
                <button className="btn" onClick={() => void repo.setSetting('calendar', hebrew ? 'gregorian' : 'hebrew')}>
                  {hebrew ? t.calGregorian : t.calHebrew}
                </button>
                <button className="btn" onClick={goToday}>
                  {t.today}
                </button>
                <button className="btn icon" aria-label={t.prevMonth} onClick={() => setAnchor(addDays(month.first, -1))}>
                  <span className="chev prev" aria-hidden="true" />
                </button>
                <button className="btn icon" aria-label={t.nextMonth} onClick={() => setAnchor(addDays(month.last, 1))}>
                  <span className="chev next" aria-hidden="true" />
                </button>
              </>
            )}
            <button className="btn" aria-expanded={monthOpen} aria-controls="month-grid" onClick={toggleMonth}>
              {monthOpen ? t.hideMonth : t.showMonth}
            </button>
          </div>
        </div>
        <div className="grid" role="grid" id="month-grid" hidden={!monthOpen}>
          {weekdayNames.map((w) => (
            <div key={w} className="weekday" role="columnheader">
              {w}
            </div>
          ))}
          {month.cells.map((date) => {
            const { d } = parseISODate(date);
            const hDay = new HDate(toLocalDate(date)).getDate();
            const hText = locale === 'he' ? gematriya(hDay) : String(hDay);
            // A flexible track has no assigned days, so the grid marks only the days it was done.
            const daySessions = repo.sessions(date).filter((x) => !x.optional || repo.isDone(x.trackId, date));
            const classes = ['cell'];
            if (date < month.first || date > month.last) classes.push('other');
            if (date === today) classes.push('is-today');
            if (date === selected) classes.push('is-selected');
            return (
              <button
                key={date}
                role="gridcell"
                className={classes.join(' ')}
                aria-pressed={date === selected}
                aria-label={date}
                onClick={() => setSelected(date)}
              >
                <span className="cell-num">
                  <span className="greg">{hebrew ? hText : d}</span>
                  <span className="heb">{hebrew ? d : hText}</span>
                </span>
                <span className="dots">
                  {daySessions.map((s) => {
                    const track = trackById.get(s.trackId)!;
                    return (
                      <span
                        key={s.trackId}
                        className={repo.isDone(s.trackId, date) ? 'dot filled' : 'dot'}
                        style={{ '--track': track.color } as React.CSSProperties}
                      />
                    );
                  })}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
