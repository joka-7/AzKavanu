import { describe, expect, it } from 'vitest';
import { MemoryDrive, MemoryStore, Repository, SyncEngine, type DrivePort, type TrackInput } from '../src';

const trackInput: TrackInput = {
  id: 't1',
  title: 'Daf Yomi',
  color: '#3b6fd4',
  schedule: { kind: 'fixedCycle', cycle: 'dafYomi' },
  link: { provider: 'builtin' },
  reminders: [],
  archived: false,
};

async function device(id: string, drive: DrivePort, now = () => Date.now()) {
  const store = new MemoryStore();
  const repo = new Repository(store, id, now);
  await repo.load();
  return { repo, store, engine: new SyncEngine(repo, drive, store) };
}

describe('SyncEngine', () => {
  it('propagates changes between devices', async () => {
    const drive = new MemoryDrive();
    const phone = await device('phone', drive);
    const laptop = await device('laptop', drive);

    await phone.repo.saveTrack(trackInput);
    await phone.repo.setDone('t1', '2026-11-09', true);
    await phone.engine.sync();
    await laptop.engine.sync();

    expect(laptop.repo.tracks().map((t) => t.title)).toEqual(['Daf Yomi']);
    expect(laptop.repo.isDone('t1', '2026-11-09')).toBe(true);
  });

  it('does nothing when nothing changed', async () => {
    const drive = new MemoryDrive();
    const phone = await device('phone', drive);
    await phone.repo.setDone('t1', '2026-11-09', true);
    await phone.engine.sync();
    const report = await phone.engine.sync();
    expect(report).toEqual({ pulled: [], pushed: [], errors: [] });
  });

  it('merges offline edits to different days', async () => {
    const drive = new MemoryDrive();
    const phone = await device('phone', drive);
    const laptop = await device('laptop', drive);
    await phone.repo.setDone('t1', '2026-11-08', true);
    await phone.engine.sync();
    await laptop.engine.sync();

    await phone.repo.setDone('t1', '2026-11-09', true);
    await laptop.repo.setDone('t1', '2026-11-10', true);
    await laptop.repo.setDone('t1', '2026-11-08', false);

    await laptop.engine.sync();
    await phone.engine.sync();
    await laptop.engine.sync();

    for (const d of [phone, laptop]) {
      expect(d.repo.isDone('t1', '2026-11-08')).toBe(false);
      expect(d.repo.isDone('t1', '2026-11-09')).toBe(true);
      expect(d.repo.isDone('t1', '2026-11-10')).toBe(true);
    }
  });

  it('resolves the same checkbox by last writer', async () => {
    const drive = new MemoryDrive();
    let t = 1000;
    const phone = await device('phone', drive, () => t);
    const laptop = await device('laptop', drive, () => t);
    await phone.repo.setDone('t1', '2026-11-09', true);
    t = 2000;
    await laptop.repo.setDone('t1', '2026-11-09', false);
    await phone.engine.sync();
    await laptop.engine.sync();
    await phone.engine.sync();
    expect(phone.repo.isDone('t1', '2026-11-09')).toBe(false);
    expect(laptop.repo.isDone('t1', '2026-11-09')).toBe(false);
  });

  it('self-heals when a racing upload overwrites another device', async () => {
    const drive = new MemoryDrive();
    const phone = await device('phone', drive);
    const laptop = await device('laptop', drive);
    await phone.repo.setDone('t1', '2026-11-01', true);
    await phone.engine.sync();
    await laptop.engine.sync();

    await phone.repo.setDone('t1', '2026-11-02', true);
    await laptop.repo.setDone('t1', '2026-11-03', true);

    // Laptop's upload lands in the window between the phone's read and the phone's write.
    const realUpdate = drive.update.bind(drive);
    let raced = false;
    drive.update = async (id, content) => {
      if (!raced) {
        raced = true;
        await laptop.engine.sync();
      }
      return realUpdate(id, content);
    };
    await phone.engine.sync();
    drive.update = realUpdate;

    // Remote now lacks the laptop's tick; nothing is lost because the laptop still holds it.
    const remote = [...drive.files.values()].find((f) => f.name === 'progress-2026')!.content as any;
    expect(Object.keys(remote.records)).not.toContain('t1|2026-11-03');

    await laptop.engine.sync();
    await phone.engine.sync();
    for (const d of [phone, laptop]) {
      expect(d.repo.isDone('t1', '2026-11-02')).toBe(true);
      expect(d.repo.isDone('t1', '2026-11-03')).toBe(true);
    }
  });

  it('collapses duplicate files created simultaneously', async () => {
    const drive = new MemoryDrive();
    const phone = await device('phone', drive);
    const laptop = await device('laptop', drive);
    await phone.repo.setDone('t1', '2026-11-02', true);
    await laptop.repo.setDone('t1', '2026-11-03', true);
    await drive.create('progress-2026', phone.repo.getDoc('progress-2026'));
    await drive.create('progress-2026', laptop.repo.getDoc('progress-2026'));

    await phone.engine.sync();
    await laptop.engine.sync();
    expect((await drive.list()).filter((f) => f.name === 'progress-2026')).toHaveLength(1);
    expect(laptop.repo.isDone('t1', '2026-11-02')).toBe(true);
    expect(laptop.repo.isDone('t1', '2026-11-03')).toBe(true);
  });

  it('keeps a tombstoned track deleted when a stale device syncs', async () => {
    const drive = new MemoryDrive();
    let t = 1000;
    const phone = await device('phone', drive, () => t);
    const laptop = await device('laptop', drive, () => t);
    await phone.repo.saveTrack(trackInput);
    await phone.engine.sync();
    await laptop.engine.sync();
    t = 2000;
    await phone.repo.deleteTrack('t1');
    await phone.engine.sync();
    await laptop.engine.sync();
    expect(laptop.repo.tracks()).toEqual([]);
  });

  it('never overwrites a remote document it cannot validate', async () => {
    const drive = new MemoryDrive();
    const phone = await device('phone', drive);
    await phone.repo.setDone('t1', '2026-11-02', true);
    const bad = await drive.create('progress-2026', { schemaVersion: 1, records: { x: { done: 'yes' } } });
    const report = await phone.engine.sync();
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]!.needsClientUpdate).toBe(false);
    expect(await drive.download(bad.id)).toEqual({ schemaVersion: 1, records: { x: { done: 'yes' } } });

    await drive.update(bad.id, { schemaVersion: 99, records: {} });
    const report2 = await phone.engine.sync();
    expect(report2.errors[0]!.needsClientUpdate).toBe(true);
  });

  it('survives a restart with pending changes', async () => {
    const drive = new MemoryDrive();
    const phone = await device('phone', drive);
    await phone.repo.setDone('t1', '2026-11-02', true);
    const reopened = new Repository(phone.store, 'phone');
    await reopened.load();
    expect(reopened.isDirty('progress-2026')).toBe(true);
    await new SyncEngine(reopened, drive, phone.store).sync();
    expect((await drive.list()).map((f) => f.name)).toEqual(['progress-2026']);
  });
});
