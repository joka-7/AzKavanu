import type { StudyTrack } from './model';
import type { Session } from './schedule';

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/** Daily links are resolved from the track definition and the session; they are never stored. */
export function resolveLink(track: StudyTrack, session: Session): string | null {
  let url: string | undefined;
  if (track.link.provider === 'builtin') {
    url = session.builtinUrl;
  } else if (track.link.provider === 'template') {
    const vars: Record<string, string> = {
      date: session.date,
      sessionIndex: String(session.sessionIndex ?? ''),
      firstUnit: String(session.firstUnit ?? ''),
      lastUnit: String(session.lastUnit ?? ''),
      label: session.label,
    };
    url = track.link.urlTemplate.replace(/\{(\w+)\}/g, (whole, name: string) =>
      name in vars ? encodeURIComponent(vars[name]!) : whole,
    );
  }
  if (!url) return null;
  try {
    // User-supplied templates are untrusted once synced: never emit javascript: or data: links.
    return SAFE_PROTOCOLS.has(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}
