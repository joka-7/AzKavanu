import { DEFAULT_SCOPES, createNativeGoogleAuth } from '@joka-07/capacitor-auth';
import { AuthRequiredError, GROUP_SCOPE, SYNC_SCOPE, type AccessTokenSource } from './googleAuth';

/** Renew just before expiry: with a wider margin Android hands back the same, nearly expired token. */
const RENEW_MARGIN_MS = 5_000;
/**
 * Android returns a token for exactly the scopes asked for, so the app remembers on this
 * device that the user allowed group files and keeps asking for them. Not a secret.
 */
const GROUP_ACCESS_FLAG = 'kavanu.groupAccess';
type Native = ReturnType<typeof createNativeGoogleAuth>;

/**
 * Drive access tokens from Android (Credential Manager), for the Capacitor app.
 * Android renews a granted token without the user, but if the grant was removed
 * (in the Google account, say) the plugin shows Google's consent screen even on a
 * "silent" renewal; there is no way to ask it not to.
 */
export class NativeGoogleAuth implements AccessTokenSource {
  private native: Native;
  private token: string | null = null;
  private expiresAt = 0;

  constructor(private readonly webClientId: string) {
    this.native = this.nativeFor(this.hasGroupAccess());
  }

  hasGroupAccess(): boolean {
    return localStorage.getItem(GROUP_ACCESS_FLAG) === '1';
  }

  async requestGroupAccess(): Promise<boolean> {
    const native = this.nativeFor(true);
    const granted = await native.requestToken({ interactive: true });
    // Google's consent screen lets the user untick a permission, so check what was granted.
    if (!granted || !(await grantedScopes(granted.access_token)).includes(GROUP_SCOPE)) return false;
    localStorage.setItem(GROUP_ACCESS_FLAG, '1');
    this.native = native;
    this.token = granted.access_token;
    this.expiresAt = Date.now() + granted.expires_in * 1000;
    return true;
  }

  private nativeFor(withGroups: boolean): Native {
    const scopes = [...new Set([...DEFAULT_SCOPES, SYNC_SCOPE, ...(withGroups ? [GROUP_SCOPE] : [])])];
    return createNativeGoogleAuth({ webClientId: this.webClientId, fetchImpl: fetch.bind(globalThis), scopes });
  }

  invalidate(): void {
    this.token = null;
  }

  async getAccessToken(interactive: boolean): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - RENEW_MARGIN_MS) return this.token;
    const granted = await this.request(interactive);
    if (!granted) throw new AuthRequiredError('Google did not grant Drive access');
    this.token = granted.access_token;
    this.expiresAt = Date.now() + granted.expires_in * 1000;
    return granted.access_token;
  }

  async signOut(): Promise<void> {
    this.token = null;
    localStorage.removeItem(GROUP_ACCESS_FLAG);
    await this.native.signOut();
  }

  private async request(interactive: boolean) {
    if (interactive) return this.native.requestToken({ interactive });
    try {
      return await this.native.requestToken({ interactive });
    } catch (err) {
      if (isTransient(err)) throw err;
      // Otherwise the plugin refused because Android needs the user again; the app then offers "Reconnect".
      throw new AuthRequiredError(err instanceof Error ? err.message : 'Google sign-in required');
    }
  }
}

/**
 * A failed network request (fetch rejects with TypeError) or a failed token check
 * (the kit's "Could not check the Google token") is not a revoked grant, and must
 * not be shown as one.
 */
function isTransient(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && err.message.startsWith('Could not check the Google token'));
}

async function grantedScopes(accessToken: string): Promise<string[]> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) throw new Error(`Could not check the Google token (${res.status})`);
  const info: unknown = await res.json();
  const scope = typeof info === 'object' && info !== null && 'scope' in info ? info.scope : '';
  return typeof scope === 'string' ? scope.split(' ') : [];
}
