import { describe, expect, it } from 'vitest';
import { GroupManager, formatHlc, MemoryGroupFiles, MemoryStore, Repository, type TrackInput } from '../src';

const TODAY = '2026-11-12';
const daf: TrackInput = {
  title: 'Daf Yomi',
  color: '#27408b',
  schedule: { kind: 'fixedCycle', cycle: 'dafYomi' },
  link: { provider: 'builtin' },
  reminders: [],
  archived: false,
};

async function user(name: string, files: MemoryGroupFiles) {
  const store = new MemoryStore();
  const repo = new Repository(store, `dev_${name}`);
  await repo.load();
  await repo.setSetting('displayName', name);
  const groups = new GroupManager(repo, store, files, () => TODAY);
  await groups.load();
  return { repo, groups, store };
}

async function setup() {
  const files = new MemoryGroupFiles();
  const dana = await user('Dana', files);
  const track = await dana.repo.saveTrack(daf);
  await dana.repo.setDone(track.id, '2026-11-11', true);
  const groupId = await dana.groups.createGroup({ name: 'Morning Daf', displayName: 'Dana', trackId: track.id });
  const fileId = dana.repo.memberships()[groupId]!.driveFileId;
  return { files, dana, track, groupId, fileId };
}

describe('GroupManager', () => {
  it('lets a second user join and both see each other', async () => {
    const { files, dana, fileId } = await setup();
    const eli = await user('Eli', files);

    const info = await eli.groups.peek(fileId);
    expect(info).toMatchObject({ name: 'Morning Daf', memberCount: 1 });

    await eli.groups.joinGroup({ fileId, displayName: 'Eli', trackId: null });
    const eliTrack = eli.repo.tracks()[0]!;
    expect(eliTrack.title).toBe('Daf Yomi');
    await eli.repo.setDone(eliTrack.id, TODAY, true);
    await eli.groups.sync();
    await dana.groups.sync();

    const view = dana.groups.groups()[0]!;
    expect(view.members.map((m) => [m.displayName, m.isMe])).toEqual([
      ['Dana', true],
      ['Eli', false],
    ]);
    const eliRow = view.members[1]!;
    expect(eliRow.lastDays.at(-1)).toEqual({ date: TODAY, done: true });
    expect(eliRow.doneLast30).toBe(1);
    expect(view.members[0]!.lastDays.at(-2)).toEqual({ date: '2026-11-11', done: true });
    expect(eli.groups.groups()[0]!.role).toBe('member');
  });

  it('does not write when nothing changed', async () => {
    const { files, dana, fileId } = await setup();
    await dana.groups.sync();
    const before = files.files.get(fileId)!.version;
    await dana.groups.sync();
    await dana.groups.sync();
    expect(files.files.get(fileId)!.version).toBe(before);
  });

  it('republishes a section that another member tampered with or erased', async () => {
    const { files, dana, fileId, groupId } = await setup();
    const memberId = dana.repo.memberships()[groupId]!.memberId;
    const content = files.files.get(fileId)!.content as any;
    content.records[`member:${memberId}`].recent = {};
    const evil = formatHlc(Date.now() + 3_600_000, 0, 'evil');
    content.records[`member:${memberId}`].hlc = evil;
    await files.update(fileId, content);

    await dana.groups.sync();
    const healed = (await files.download(fileId)) as any;
    expect(healed.records[`member:${memberId}`].recent).toEqual({ '2026-11-11': true });
    // The repair must outrank the forged stamp, or other members would keep the forgery.
    expect(healed.records[`member:${memberId}`].hlc > evil).toBe(true);

    content.records[`member:${memberId}`].hlc = formatHlc(Date.now() + 10 * 86_400_000, 0, 'evil');
    await files.update(fileId, content);
    await dana.groups.sync();
    expect(dana.groups.groups()[0]!.error).toMatch(/invalid timestamps/);
    await files.update(fileId, healed);

    // Wholesale wipe of members: restored from the cached copy.
    await files.update(fileId, { schemaVersion: 1, records: { meta: healed.records.meta } });
    await dana.groups.sync();
    expect(Object.keys(((await files.download(fileId)) as any).records)).toContain(`member:${memberId}`);
  });

  it('converges after a racing overwrite', async () => {
    const { files, dana, fileId } = await setup();
    const eli = await user('Eli', files);
    await eli.groups.joinGroup({ fileId, displayName: 'Eli', trackId: null });
    // Dana's stale copy (without Eli) overwrites the file.
    const stale = { schemaVersion: 1, records: Object.fromEntries(Object.entries(((await files.download(fileId)) as any).records).filter(([k]) => !k.includes(eli.repo.memberships()[Object.keys(eli.repo.memberships())[0]!]!.memberId))) };
    await files.update(fileId, stale);
    await eli.groups.sync();
    await dana.groups.sync();
    expect(dana.groups.groups()[0]!.members).toHaveLength(2);
  });

  it('removes a member who leaves', async () => {
    const { files, dana, fileId } = await setup();
    const eli = await user('Eli', files);
    const id = await eli.groups.joinGroup({ fileId, displayName: 'Eli', trackId: null });
    await eli.groups.leaveGroup(id);
    expect(eli.groups.groups()).toEqual([]);
    await dana.groups.sync();
    expect(dana.groups.groups()[0]!.members.map((m) => m.displayName)).toEqual(['Dana']);
    // Leaving does not delete the member's own track or progress.
    expect(eli.repo.tracks()).toHaveLength(1);
  });

  it('rejects malformed group files and reports revoked access', async () => {
    const { files, dana, fileId } = await setup();
    const bad = await files.create('x', { schemaVersion: 1, records: { meta: { kind: 'meta', name: 'x' } } });
    await expect(dana.groups.peek(bad.id)).rejects.toThrow();
    files.files.delete(fileId);
    await dana.groups.sync();
    expect(dana.groups.groups()[0]!.error).toMatch(/revoked/);
  });

  it('keeps showing groups from cache after a restart', async () => {
    const { files, dana } = await setup();
    const reopenedRepo = new Repository(dana.store, 'dev_Dana');
    await reopenedRepo.load();
    const reopened = new GroupManager(reopenedRepo, dana.store, files, () => TODAY);
    await reopened.load();
    expect(reopened.groups()[0]!.name).toBe('Morning Daf');
  });
});
