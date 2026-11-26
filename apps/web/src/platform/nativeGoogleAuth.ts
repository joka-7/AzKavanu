import { DEFAULT_SCOPES, createNativeGoogleAuth } from '@joka-07/capacitor-auth';
import { AuthRequiredError, DRIVE_SCOPES, type AccessTokenSource } from './googleAuth';

/** Renew just before expiry: with a wider margin Android hands back the same, nearly expired token. */
const RENEW_MARGIN_MS = 5_000;

/**
 * Drive access tokens from Android (Credential Manager), for the Capacitor app.
 * Android renews a granted token without the user, but if the grant was removed
 * (in the Google account, say) the plugin shows Google's consent screen even on a
 * "silent" renewal; there is no way to ask it not to.
 */
export class NativeGoogleAuth implements AccessTokenSource {
  private readonly native: ReturnType<typeof createNativeGoogleAuth>;
  private token: string | null = null;
  private expiresAt = 0;

  constructor(webClientId: string) {
    const scopes = [...new Set([...DEFAULT_SCOPES, ...DRIVE_SCOPES.split(' ')])];
    this.native = createNativeGoogleAuth({ webClientId, fetchImpl: fetch.bind(globalThis), scopes });
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
