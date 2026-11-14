import { GroupFullError, type GroupPreview, type GroupView } from '@kavanu/core';
import { useState } from 'react';
import { useGroups, useLocale, useRepo, useServices, useSyncStatus } from '../context';
import { describeSchedule } from '../describe';
import { DriveHttpError } from '../platform/googleDrive';
import { grantFileAccess, pickerAvailable } from '../platform/picker';

interface Props {
  joinFile: string | null;
  onJoinHandled: () => void;
  onOpenSettings: () => void;
}

function inviteLink(fileId: string): string {
  return `${location.origin}${location.pathname}#join=${fileId}`;
}

export function GroupsView({ joinFile, onJoinHandled, onOpenSettings }: Props) {
  const { t } = useLocale();
  const { sync } = useServices();
  const groups = useGroups();
  const status = useSyncStatus();
  const [creating, setCreating] = useState(false);

  if (!groups) return <section className="card"><p>{t.groupsUnavailable}</p></section>;
  if (!sync.connected || status.state === 'needsReconnect') {
    return (
      <section className="card">
        <h2>{joinFile ? t.joinTitle : t.navGroups}</h2>
        <p>{t.groupsNeedDrive}</p>
        <button className="btn primary" onClick={onOpenSettings}>
          {t.navSettings}
        </button>
      </section>
    );
  }

  const list = groups.groups();
  return (
    <div className="stack wide">
      {joinFile && <JoinPanel fileId={joinFile} onDone={onJoinHandled} />}
      {creating ? (
        <CreatePanel onDone={() => setCreating(false)} />
      ) : (
        <div className="list-head">
          <h2>{t.navGroups}</h2>
          <button className="btn primary" onClick={() => setCreating(true)}>
            {t.newGroup}
          </button>
        </div>
      )}
      {list.length === 0 && !creating && !joinFile && <p className="empty">{t.noGroupsYet}</p>}
      {list.map((g) => (
        <GroupCard key={g.id} group={g} />
      ))}
    </div>
  );
}

function CreatePanel({ onDone }: { onDone: () => void }) {
  const repo = useRepo();
  const groups = useGroups()!;
  const { t } = useLocale();
  const tracks = repo.tracks();
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState(repo.setting('displayName', ''));
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [maxMembers, setMaxMembers] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (tracks.length === 0) {
    return (
      <section className="card">
        <p>{t.groupNeedsTrack}</p>
        <button className="btn" onClick={onDone}>
          {t.cancel}
        </button>
      </section>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await repo.setSetting('displayName', displayName.trim());
      const max = Math.floor(Number(maxMembers));
      await groups.createGroup({
        name,
        displayName,
        trackId,
        description,
        ...(max >= 2 ? { maxMembers: Math.min(100, max) } : {}),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2>{t.newGroup}</h2>
      <label className="field">
        <span>{t.groupName}</span>
        <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>{t.yourName}</span>
        <input required maxLength={60} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label className="field">
        <span>{t.groupTrack}</span>
        <select value={trackId} onChange={(e) => setTrackId(e.target.value)}>
          {tracks.map((tr) => (
            <option key={tr.id} value={tr.id}>
              {tr.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t.groupDescription}</span>
        <textarea rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="field narrow">
        <span>{t.groupMax}</span>
        <input type="number" min={2} max={100} value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)} />
      </label>
      <p className="muted small">{t.groupPrivacy}</p>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {t.create}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t.cancel}
        </button>
      </div>
    </form>
  );
}

function JoinPanel({ fileId, onDone }: { fileId: string; onDone: () => void }) {
  const repo = useRepo();
  const groups = useGroups()!;
  const { sync } = useServices();
  const { locale, t, cycles } = useLocale();
  const [info, setInfo] = useState<GroupPreview | null>(null);
  const [displayName, setDisplayName] = useState(repo.setting('displayName', ''));
  const [trackId, setTrackId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async () => {
    setBusy(true);
    setError(null);
    try {
      try {
        setInfo(await groups.peek(fileId));
      } catch (err) {
        // Not yet visible to this app: ask the user to grant access to this one file.
        if (!(err instanceof DriveHttpError) || (err.status !== 404 && err.status !== 403)) throw err;
        if (!pickerAvailable()) throw new Error(t.joinNeedsPicker);
        if (!(await grantFileAccess(fileId, await sync.token()))) return;
        setInfo(await groups.peek(fileId));
      }
    } catch (err) {
      setError(err instanceof DriveHttpError ? t.joinNoAccess : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await groups.joinGroup({ fileId, displayName, trackId: trackId || null });
      onDone();
    } catch (err) {
      setError(err instanceof GroupFullError ? t.groupFull : err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault();
        void (info ? join() : lookup());
      }}
    >
      <h2>{t.joinTitle}</h2>
      {!info ? (
        <p className="muted">{t.joinPickFile}</p>
      ) : (
        <>
          <p>
            <strong>{info.name}</strong> · {t.groupMembers(info.memberCount, info.maxMembers)}
            <br />
            <span className="muted">
              {info.track.title} · {describeSchedule(info.track.schedule, t, cycles, locale)}
            </span>
            {info.description && (
              <>
                <br />
                {info.description}
              </>
            )}
          </p>
          <label className="field">
            <span>{t.yourName}</span>
            <input required maxLength={60} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="field">
            <span>{t.joinTrackChoice}</span>
            <select value={trackId} onChange={(e) => setTrackId(e.target.value)}>
              <option value="">{t.joinNewTrack(info.track.title)}</option>
              {repo.tracks().map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.title}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small">{t.groupPrivacy}</p>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {info ? t.join : t.joinLookup}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t.cancel}
        </button>
      </div>
    </form>
  );
}

function GroupCard({ group }: { group: GroupView }) {
  const groups = useGroups()!;
  const { sync } = useServices();
  const { locale, t, cycles } = useLocale();
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const owner = group.role === 'owner';
  const link = inviteLink(group.driveFileId);
  const dayFmt = new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', { weekday: 'narrow' });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const invite = () =>
    run(async () => {
      await sync.groupFiles!.share(group.driveFileId, email.trim(), t.inviteMessage(group.name, link));
      setNotice(t.inviteSent(email.trim()));
      setEmail('');
    });

  const leave = () =>
    run(async () => {
      if (!confirm(t.confirmLeave)) return;
      await groups.leaveGroup(group.id);
      // Also give up access to the file itself; harmless if it fails.
      if (sync.accountId) await sync.groupFiles!.unshare(group.driveFileId, sync.accountId).catch(() => {});
    });

  const remove = () =>
    run(async () => {
      if (!confirm(t.confirmDeleteGroup)) return;
      await sync.groupFiles!.remove(group.driveFileId);
      await groups.forgetGroup(group.id);
    });

  const days = group.members[0]?.lastDays ?? [];

  return (
    <section className="card group" style={{ '--track': group.track.color } as React.CSSProperties}>
      <div className="list-head">
        <div>
          <h2>{group.name}</h2>
          <p className="muted small">
            {group.track.title} · {describeSchedule(group.track.schedule, t, cycles, locale)}
            <br />
            {t.groupMembers(group.members.length, group.maxMembers)}
          </p>
          {group.description && <p>{group.description}</p>}
        </div>
      </div>
      {group.error && <p className="error">{t.groupError(group.error)}</p>}

      <div className="members" role="table" aria-label={group.name}>
        <div className="member head" role="row">
          <span role="columnheader" />
          <span className="week" role="columnheader">
            {days.map((d) => (
              <span key={d.date} className="wd">
                {dayFmt.format(new Date(`${d.date}T12:00:00`))}
              </span>
            ))}
          </span>
          <span role="columnheader" />
        </div>
        {group.members.map((m) => (
          <div className="member" role="row" key={m.memberId}>
            <span className="member-name" role="cell">
              {m.displayName}
              {m.isMe && <span className="muted"> ({t.you})</span>}
            </span>
            <span className="week" role="cell">
              {m.lastDays.map((d) => (
                <span
                  key={d.date}
                  className={d.done === null ? 'dot off' : d.done ? 'dot filled' : 'dot'}
                  title={d.date}
                  aria-label={`${d.date}: ${d.done ? '✓' : '–'}`}
                />
              ))}
            </span>
            <span className="member-stats muted small" role="cell">
              {m.streak > 1 ? `${t.streak(m.streak)} · ` : ''}
              {t.last30(m.doneLast30)}
            </span>
          </div>
        ))}
      </div>

      {owner && (
        <form
          className="invite"
          onSubmit={(e) => {
            e.preventDefault();
            void invite();
          }}
        >
          <input
            type="email"
            required
            dir="ltr"
            placeholder={t.inviteEmail}
            aria-label={t.inviteEmail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn primary" disabled={busy}>
            {t.invite}
          </button>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p className="error">{error}</p>}

      <div className="actions">
        {owner && (
          <>
            <button
              className="btn"
              onClick={() => void navigator.clipboard.writeText(link).then(() => setNotice(t.linkCopied))}
            >
              {t.copyLink}
            </button>
            <a
              className="btn"
              href={`https://drive.google.com/file/d/${encodeURIComponent(group.driveFileId)}/view`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.manageInDrive}
            </a>
          </>
        )}
        <button className="btn danger" disabled={busy} onClick={() => void (owner ? remove() : leave())}>
          {owner ? t.deleteGroup : t.leaveGroup}
        </button>
      </div>
    </section>
  );
}
