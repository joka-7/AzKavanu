import { HDate, gematriya } from '@hebcal/core';
import {
  addDays,
  dayOfWeek,
  parseISODate,
  resolveLink,
  sessionOn,
  sessionsOn,
  toISODate,
  toLocalDate,
  type ISODate,
  type Repository,
  type StudyTrack,
} from '@kavanu/core';
import { useMemo, useState } from 'react';
import { useLocale, useRepo } from '../context';

/** Consecutive scheduled sessions completed, counting back from today (today may still be open). */
function streak(repo: Repository, track: StudyTrack, today: ISODate): number {
  let n = 0;
  for (let i = 0; i < 730; i++) {
    const date = addDays(today, -i);
    if (!sessionOn(track, date)) {
      if (track.schedule.kind !== 'fixedCycle' && date < track.schedule.startDate) break;
      continue;
    }
    if (repo.isDone(track.id, date)) n++;
    else if (i > 0) break;
  }
  return n;
}

function monthGrid(year: number, month: number): ISODate[] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const start = addDays(first, -dayOfWeek(first));
  const cells: ISODate[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(start, i));
  // Drop a trailing week that lies entirely in the next month.
  return parseISODate(cells[35]!).m === month ? cells : cells.slice(0, 35);
}

export function CalendarView({ onAddTrack }: { onAddTrack: () => void }) {
  const repo = useRepo();
  const { locale, t } = useLocale();
  const today = toISODate(new Date());
  const [selected, setSelected] = useState<ISODate>(today);
  const [cursor, setCursor] = useState(() => {
    const { y, m } = parseISODate(today);
    return { y, m };
  });

  const tracks = repo.tracks();
  const trackById = useMemo(() => new Map(tracks.map((x) => [x.id, x])), [tracks]);
  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const intlLocale = locale === 'he' ? 'he-IL' : 'en-GB';

  const monthTitle = new Intl.DateTimeFormat(intlLocale, { month: 'long', year: 'numeric' }).format(
    new Date(cursor.y, cursor.m - 1, 1),
  );
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(intlLocale, { weekday: 'short' }).format(new Date(2026, 10, 1 + i)),
  );
  const selectedTitle = new Intl.DateTimeFormat(intlLocale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    toLocalDate(selected),
  );
  const selectedHebrew = new HDate(toLocalDate(selected));

  const shift = (delta: number) =>
    setCursor(({ y, m }) => {
      const idx = y * 12 + (m - 1) + delta;
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
    });

  const goToday = () => {
    const { y, m } = parseISODate(today);
    setCursor({ y, m });
    setSelected(today);
  };

  const sessions = sessionsOn(tracks, selected);
  const doneCount = sessions.filter((s) => repo.isDone(s.trackId, selected)).length;

  return (
    <div className="calendar-layout">
      <section className="card day" aria-labelledby="day-title">
        <div className="day-head">
          <div>
            <h2 id="day-title">{selected === today ? `${t.today} · ${selectedTitle}` : selectedTitle}</h2>
            <p className="muted">
              {locale === 'he' ? selectedHebrew.renderGematriya(true) : selectedHebrew.render('en')}
            </p>
          </div>
          {sessions.length > 0 && <span className="count">{t.doneOf(doneCount, sessions.length)}</span>}
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
              const url = resolveLink(track, s);
              const run = streak(repo, track, today);
              return (
                <li key={track.id} className={done ? 'session done' : 'session'} style={{ '--track': track.color } as React.CSSProperties}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={done}
                      aria-label={t.markDone(track.title)}
                      onChange={(e) => void repo.setDone(track.id, selected, e.target.checked)}
                    />
                    <span className="box" aria-hidden="true" />
                  </label>
                  <div className="session-text">
                    <span className="session-title">{track.title}</span>
                    <span className="session-unit">{(locale === 'he' && s.labelHe) || s.label}</span>
                    {run > 1 && <span className="session-streak">{t.streak(run)}</span>}
                  </div>
                  {url && (
                    <a className="btn" href={url} target="_blank" rel="noopener noreferrer">
                      {t.open}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card month" aria-label={monthTitle}>
        <div className="month-head">
          <h2>{monthTitle}</h2>
          <div className="month-nav">
            <button className="btn" onClick={goToday}>
              {t.today}
            </button>
            <button className="btn icon" aria-label={t.prevMonth} onClick={() => shift(-1)}>
              <span className="chev prev" aria-hidden="true" />
            </button>
            <button className="btn icon" aria-label={t.nextMonth} onClick={() => shift(1)}>
              <span className="chev next" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="grid" role="grid">
          {weekdayNames.map((w) => (
            <div key={w} className="weekday" role="columnheader">
              {w}
            </div>
          ))}
          {cells.map((date) => {
            const { m, d } = parseISODate(date);
            const daySessions = sessionsOn(tracks, date);
            const classes = ['cell'];
            if (m !== cursor.m) classes.push('other');
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
                  <span className="greg">{d}</span>
                  <span className="heb">{gematriya(new HDate(toLocalDate(date)).getDate())}</span>
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
