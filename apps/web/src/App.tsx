import { useEffect, useState } from 'react';
import { useLocale, useSyncStatus } from './context';
import { CalendarView } from './views/CalendarView';
import { SettingsView } from './views/SettingsView';
import { TracksView } from './views/TracksView';

type Tab = 'calendar' | 'tracks' | 'settings';

export function App() {
  const { locale, t } = useLocale();
  const [tab, setTab] = useState<Tab>('calendar');
  const status = useSyncStatus();

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr';
    document.title = t.appName;
  }, [locale, t]);

  const badge = (() => {
    switch (status.state) {
      case 'unconfigured':
      case 'disconnected':
        return { text: t.statusLocal, tone: 'muted' };
      case 'syncing':
        return { text: t.statusSyncing, tone: 'muted' };
      case 'synced':
        return status.report.errors.length
          ? { text: t.statusAttention, tone: 'warn' }
          : { text: t.statusSynced, tone: 'ok' };
      case 'offline':
        return { text: t.statusOffline, tone: 'muted' };
      default:
        return { text: t.statusAttention, tone: 'warn' };
    }
  })();

  const tabs: { id: Tab; label: string }[] = [
    { id: 'calendar', label: t.navCalendar },
    { id: 'tracks', label: t.navTracks },
    { id: 'settings', label: t.navSettings },
  ];

  return (
    <div className="shell">
      <header className="topbar">
        <h1 className="brand">{t.appName}</h1>
        <nav className="tabs" aria-label={t.appName}>
          {tabs.map((x) => (
            <button
              key={x.id}
              className="tab"
              aria-current={tab === x.id ? 'page' : undefined}
              onClick={() => setTab(x.id)}
            >
              {x.label}
            </button>
          ))}
        </nav>
        <button className={`badge badge-${badge.tone}`} onClick={() => setTab('settings')}>
          {badge.text}
        </button>
      </header>
      <main className="main">
        {tab === 'calendar' && <CalendarView onAddTrack={() => setTab('tracks')} />}
        {tab === 'tracks' && <TracksView />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
