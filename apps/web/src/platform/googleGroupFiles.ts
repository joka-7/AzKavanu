import type { GroupFilePort } from '@kavanu/core';
import { API, UPLOAD, driveFetch, multipartBody } from './googleDrive';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FOLDER_NAME = 'Kavanu';

/**
 * Shared group files. These live in a visible `Kavanu` folder in the owner's
 * Drive because files in the hidden app-data folder cannot be shared.
 */
export class GoogleGroupFiles implements GroupFilePort {
  private folderId: string | null = null;

  constructor(private readonly getToken: () => Promise<string>) {}

  private call(url: string, init: RequestInit = {}): Promise<Response> {
    return driveFetch(this.getToken, url, init);
  }

  private async folder(): Promise<string> {
    if (this.folderId) return this.folderId;
    const q = new URLSearchParams({
      q: `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and 'root' in parents and trashed = false`,
      fields: 'files(id)',
    });
    const found = (await (await this.call(`${API}/files?${q}`)).json()) as { files: { id: string }[] };
    if (found.files[0]) return (this.folderId = found.files[0].id);
    const res = await this.call(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
    });
    return (this.folderId = ((await res.json()) as { id: string }).id);
  }

  async create(name: string, content: unknown): Promise<{ id: string; version: string }> {
    const meta = { name: `${name}.json`, parents: [await this.folder()], mimeType: 'application/json' };
    const res = await this.call(`${UPLOAD}/files?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      body: multipartBody(meta, content),
    });
    return (await res.json()) as { id: string; version: string };
  }

  async version(id: string): Promise<string> {
    const res = await this.call(`${API}/files/${encodeURIComponent(id)}?fields=version,trashed`);
    const body = (await res.json()) as { version: string; trashed?: boolean };
    if (body.trashed) throw new Error('File not found or access revoked');
    return body.version;
  }

  async download(id: string): Promise<unknown> {
    return (await this.call(`${API}/files/${encodeURIComponent(id)}?alt=media`)).json();
  }

  async update(id: string, content: unknown): Promise<{ version: string }> {
    const res = await this.call(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=version`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(content),
    });
    return (await res.json()) as { version: string };
  }

  /** Grant one named Google account edit access. Drive emails them the invitation with `message`. */
  async share(id: string, email: string, message: string): Promise<void> {
    const q = new URLSearchParams({ sendNotificationEmail: 'true', emailMessage: message, fields: 'id' });
    await this.call(`${API}/files/${encodeURIComponent(id)}/permissions?${q}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email }),
    });
  }

  /** Remove a permission; a member uses this with their own id to withdraw from the file. */
  async unshare(id: string, permissionId: string): Promise<void> {
    await this.call(`${API}/files/${encodeURIComponent(id)}/permissions/${encodeURIComponent(permissionId)}`, {
      method: 'DELETE',
    });
  }

  async remove(id: string): Promise<void> {
    await this.call(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}
