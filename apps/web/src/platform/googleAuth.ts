/**
 * Google Identity Services token model. A browser-only app cannot hold a
 * refresh token, so access tokens last about an hour and are kept in memory.
 */
/** The hidden per-app folder: everything sync needs. */
export const SYNC_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
/**
 * Only files this app created or the user picked: the shared group files. Asked for
 * separately, the first time someone opens groups, so connecting Drive shows one permission.
 */
export const GROUP_SCOPE = 'https://www.googleapis.com/auth/drive.file';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  /** Space-separated scopes the token carries, including ones granted earlier. */
  scope?: string;
  error?: string;
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string; scope?: string }): void;
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

/** Where Drive access tokens come from: Google's browser popup, or Android itself. */
export interface AccessTokenSource {
  /** `interactive` may show Google UI, so pass true only from a user gesture. */
  getAccessToken(interactive: boolean): Promise<string>;
  /** Forget the cached token, after Drive rejected it. */
  invalidate(): void;
  signOut(): Promise<void>;
  /** Whether the user has let the app reach group files (`GROUP_SCOPE`). */
  hasGroupAccess(): boolean;
  /** Asks Google for `GROUP_SCOPE`; call only from a user gesture. Resolves to whether it was granted. */
  requestGroupAccess(): Promise<boolean>;
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

export class GoogleAuth implements AccessTokenSource {
  private token: string | null = null;
  private expiresAt = 0;
  private granted = new Set<string>();

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
    // Google includes scopes granted earlier (such as GROUP_SCOPE) in the token it returns.
    void interactive;
    return this.request(SYNC_SCOPE);
  }

  hasGroupAccess(): boolean {
    return this.granted.has(GROUP_SCOPE);
  }

  async requestGroupAccess(): Promise<boolean> {
    await this.request(`${SYNC_SCOPE} ${GROUP_SCOPE}`);
    return this.hasGroupAccess();
  }

  private async request(scope: string): Promise<string> {
    await loadGis();
    return new Promise<string>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope,
        callback: (r) => {
          if (r.error || !r.access_token) return reject(new AuthRequiredError(r.error));
          this.token = r.access_token;
          this.expiresAt = Date.now() + (r.expires_in ?? 3600) * 1000;
          this.granted = new Set((r.scope ?? '').split(' '));
          resolve(r.access_token);
        },
        error_callback: (e) => reject(new AuthRequiredError(e.type)),
      });
      // An empty prompt shows Google UI only when consent or account choice is actually needed.
      client.requestAccessToken({ prompt: '' });
    });
  }

  async signOut(): Promise<void> {
    const token = this.token;
    this.token = null;
    this.granted = new Set();
    if (token && window.google) await new Promise<void>((done) => window.google!.accounts.oauth2.revoke(token, done));
  }
}
