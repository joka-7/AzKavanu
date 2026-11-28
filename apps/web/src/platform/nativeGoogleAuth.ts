import { DEFAULT_SCOPES, createNativeGoogleAuth } from '@joka-07/capacitor-auth';
import { AuthRequiredError, GROUP_SCOPE, SYNC_SCOPE, type AccessTokenSource } from './googleAuth';

/** Renew just before expiry: with a wider margin Android hands back the same, nearly expired token. */
const RENEW_MARGIN_MS = 5_000;
type Native = ReturnType<typeof createNativeGoogleAuth>;

/**
 * Drive access tokens from Android (Credential Manager), for the Capacitor app.
 * Android renews a granted token without the user, but if the grant was removed
 * (in the Google account, say) the plugin shows Google's consent screen even on a
 * "silent" renewal; there is no way to ask it not to.
 *
 * It asks for both scopes at connect, as the web does. The sign-in plugin keeps that one
 * scope list for every later renewal, so the list never changes after connecting. What was
 * actually granted is read from Google's tokeninfo.
 */
export class NativeGoogleAuth implements AccessTokenSource {
  private readonly native: Native;
  private token: string | null = null;
  private expiresAt = 0;
  /** Whether the current Google grant includes GROUP_SCOPE; unknown until the first token. */
  private groupAccess = false;

  constructor(webClientId: string) {
    const scopes = [...new Set([...DEFAULT_SCOPES, SYNC_SCOPE, GROUP_SCOPE])];
    this.native = createNativeGoogleAuth({ webClientId, fetchImpl: fetch.bind(globalThis), scopes });
  }

  hasGroupAccess(): boolean {
    return this.groupAccess;
  }

  /** Shows Google's consent again, where the user can tick the group-files box they left empty. */
  async requestGroupAccess(): Promise<boolean> {
    this.token = null;
    await this.getAccessToken(true);
    return this.groupAccess;
  }

  invalidate(): void {
    this.token = null;
  }

  async getAccessToken(interactive: boolean): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - RENEW_MARGIN_MS) return this.token;
    const granted = await this.request(interactive);
    if (!granted) throw new AuthRequiredError('Google did not grant Drive access');
    // Google's consent screen lets the user untick a permission, so check what was granted.
    const scopes = await grantedScopes(granted.access_token);
    if (!scopes.includes(SYNC_SCOPE)) throw new AuthRequiredError('Google did not grant access to the app folder');
    this.groupAccess = scopes.includes(GROUP_SCOPE);
    this.token = granted.access_token;
    this.expiresAt = Date.now() + granted.expires_in * 1000;
    return granted.access_token;
  }

  async signOut(): Promise<void> {
    this.token = null;
    this.groupAccess = false;
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
