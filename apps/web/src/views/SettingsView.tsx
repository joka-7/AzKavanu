import { useEffect, useState } from 'react';
import { useLocale, useRepo, useServices, useSyncStatus } from '../context';
import type { Locale } from '../i18n';
import { isNative, type NotifPermission } from '../platform/notifications';

export function SettingsView() {
  const repo = useRepo();
  const { sync, notifier, replanReminders } = useServices();
  const status = useSyncStatus();
  const { locale, t } = useLocale();
  const [permission, setPermission] = useState<NotifPermission>('default');
  useEffect(() => {
    void notifier.permission().then(setPermission);
  }, [notifier]);

  const message = (() => {
    switch (status.state) {
      case 'unconfigured':
        return isNative ? t.driveNativePending : t.driveUnconfigured;
      case 'disconnected':
        return t.driveDisconnected;
      case 'needsReconnect':
        return t.driveNeedsReconnect;
      case 'syncing':
        return t.driveSyncing;
      case 'offline':
        return t.driveOffline;
      case 'accountMismatch':
        return t.driveMismatch;
      case 'error':
        return t.driveError(status.message);
      case 'synced':
        return t.driveSynced(new Date(status.at).toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-GB', { timeStyle: 'short' }));
    }
  })();
  const docErrors = status.state === 'synced' ? status.report.errors : [];

  const exportData = () => {
    const blob = new Blob([JSON.stringify(repo.exportAll(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kavanu-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const deleteLocal = async () => {
    if (!confirm(t.confirmDeleteLocal)) return;
    await sync.disconnect();
    await repo.clearAll();
    location.reload();
  };

  const notifText = {
    granted: notifier.background ? t.notifGrantedNative : t.notifGranted,
    default: notifier.background ? t.notifDefaultNative : t.notifDefault,
    denied: notifier.background ? t.notifDeniedNative : t.notifDenied,
    unsupported: t.notifUnsupported,
  }[permission];

  return (
    <div className="stack">
      <section className="card">
        <h2>{t.storage}</h2>
        <p role="status">{message}</p>
        {docErrors.length > 0 && (
          <p className="error">
            {docErrors.some((e) => e.needsClientUpdate) ? t.driveNeedsUpdate : t.driveDocErrors(docErrors.length)}
          </p>
        )}
        <div className="actions">
          {status.state === 'disconnected' && (
            <button className="btn primary" onClick={() => void sync.connect()}>
              {t.driveConnect}
            </button>
          )}
          {(status.state === 'needsReconnect' || status.state === 'error') && (
            <button className="btn primary" onClick={() => void sync.connect()}>
              {t.driveReconnect}
            </button>
          )}
          {(status.state === 'synced' || status.state === 'offline') && (
            <button className="btn" onClick={() => void sync.syncNow()}>
              {t.syncNow}
            </button>
          )}
          {sync.connected && status.state !== 'syncing' && (
            <button className="btn" onClick={() => void sync.disconnect()}>
              {t.disconnect}
            </button>
          )}
        </div>
        {status.state !== 'unconfigured' && <p className="muted small">{t.drivePrivacy}</p>}
      </section>

      <section className="card">
        <h2>{t.notifications}</h2>
        <p>{notifText}</p>
        {permission === 'default' && (
          <button
            className="btn primary"
            onClick={async () => {
              setPermission(await notifier.requestPermission());
              replanReminders();
            }}
          >
            {t.notifEnable}
          </button>
        )}
      </section>

      <section className="card">
        <h2>{t.language}</h2>
        <div className="choices">
          {(['en', 'he'] as Locale[]).map((l) => (
            <label key={l}>
              <input type="radio" name="locale" checked={locale === l} onChange={() => void repo.setSetting('locale', l)} />{' '}
              {l === 'en' ? 'English' : 'עברית'}
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>{t.torahCalendar}</h2>
        <div className="choices">
          {[true, false].map((il) => (
            <label key={String(il)}>
              <input
                type="radio"
                name="israel"
                checked={repo.setting('israel', false) === il}
                onChange={() => void repo.setSetting('israel', il)}
              />{' '}
              {il ? t.israel : t.diaspora}
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>{t.data}</h2>
        <div className="actions">
          <button className="btn" onClick={exportData}>
            {t.exportData}
          </button>
          <button className="btn danger" onClick={() => void deleteLocal()}>
            {t.deleteLocal}
          </button>
        </div>
      </section>
    </div>
  );
}
