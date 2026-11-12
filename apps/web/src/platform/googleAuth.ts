/**
 * Google Identity Services token model. A browser-only app cannot hold a
 * refresh token, so access tokens last about an hour and are kept in memory.
 */
export const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

export class AuthRequiredError extends Error {
  constructor(message = 'Google sign-in required') {
    super(message);
  }
}

let gisLoading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new Error('Could not load Google sign-in'));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

export class GoogleAuth {
  private token: string | null = null;
  private expiresAt = 0;

  constructor(private readonly clientId: string) {}

  invalidate(): void {
    this.token = null;
  }

  /**
   * `interactive` must only be true in response to a user gesture; otherwise
   * the request is silent and fails with AuthRequiredError if Google needs to show UI.
   */
  async getAccessToken(interactive: boolean): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - 60_000) return this.token;
    await loadGis();
    return new Promise<string>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: DRIVE_SCOPES,
        callback: (r) => {
          if (r.error || !r.access_token) return reject(new AuthRequiredError(r.error));
          this.token = r.access_token;
          this.expiresAt = Date.now() + (r.expires_in ?? 3600) * 1000;
          resolve(r.access_token);
        },
        error_callback: (e) => reject(new AuthRequiredError(e.type)),
      });
      // An empty prompt shows Google UI only when consent or account choice is actually needed.
      void interactive;
      client.requestAccessToken({ prompt: '' });
    });
  }

  async signOut(): Promise<void> {
    const token = this.token;
    this.token = null;
    if (token && window.google) await new Promise<void>((done) => window.google!.accounts.oauth2.revoke(token, done));
  }
}
