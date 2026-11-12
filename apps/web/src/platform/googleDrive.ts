import type { DrivePort, RemoteFile } from '@kavanu/core';
import { AuthRequiredError } from './googleAuth';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FIELDS = 'id,name,version';

interface DriveFile {
  id: string;
  name: string;
  version: string;
}

function toRemote(f: DriveFile): RemoteFile {
  return { id: f.id, name: f.name.replace(/\.json$/, ''), version: f.version };
}

/** Drive REST adapter confined to the hidden per-app `appDataFolder`. */
export class GoogleDrive implements DrivePort {
  constructor(private readonly getToken: () => Promise<string>) {}

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getToken();
    const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new AuthRequiredError('Google session expired');
    if (!res.ok) throw new Error(`Drive request failed (${res.status})`);
    return res;
  }

  async list(): Promise<RemoteFile[]> {
    const out: RemoteFile[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ spaces: 'appDataFolder', pageSize: '1000', fields: `nextPageToken,files(${FIELDS})` });
      if (pageToken) q.set('pageToken', pageToken);
      const body = (await (await this.call(`${API}/files?${q}`)).json()) as { files: DriveFile[]; nextPageToken?: string };
      out.push(...body.files.filter((f) => f.name.endsWith('.json')).map(toRemote));
      pageToken = body.nextPageToken;
    } while (pageToken);
    return out;
  }

  async download(id: string): Promise<unknown> {
    return (await this.call(`${API}/files/${encodeURIComponent(id)}?alt=media`)).json();
  }

  async create(name: string, content: unknown): Promise<RemoteFile> {
    const form = new FormData();
    const meta = { name: `${name}.json`, parents: ['appDataFolder'], mimeType: 'application/json' };
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));
    const res = await this.call(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, { method: 'POST', body: form });
    return toRemote((await res.json()) as DriveFile);
  }

  async update(id: string, content: unknown): Promise<RemoteFile> {
    const res = await this.call(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=${FIELDS}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(content),
    });
    return toRemote((await res.json()) as DriveFile);
  }

  async remove(id: string): Promise<void> {
    await this.call(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  /** Stable id of the signed-in Google account, used to keep two people's data apart. */
  async accountId(): Promise<string> {
    const body = (await (await this.call(`${API}/about?fields=user(permissionId)`)).json()) as {
      user: { permissionId: string };
    };
    return body.user.permissionId;
  }
}
