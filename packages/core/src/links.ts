import type { StudyTrack } from './model';
import type { Session } from './schedule';

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/** Point a link at the site's Hebrew edition where one is known to exist. */
export function localizeUrl(url: string, locale: string | undefined): string {
  if (locale !== 'he') return url;
  try {
    const u = new URL(url);
    if (u.hostname === 'www.sefaria.org' || u.hostname === 'sefaria.org') {
      u.hostname = 'www.sefaria.org.il';
      u.searchParams.set('lang', 'he');
      return u.toString();
    }
  } catch {
    // Not a URL; returned unchanged and rejected by the caller.
  }
  return url;
}

export function safe(url: string | undefined): string | null {
  if (!url) return null;
  try {
    // User-supplied templates are untrusted once synced: never emit javascript: or data: links.
    return SAFE_PROTOCOLS.has(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}

function fill(template: string, session: Session): string {
  let ref = '';
  try {
    if (session.builtinUrl) ref = decodeURIComponent(new URL(session.builtinUrl).pathname.slice(1));
  } catch {
    // No usable reference.
  }
  const vars: Record<string, string> = {
    date: session.date,
    sessionIndex: String(session.sessionIndex ?? ''),
    firstUnit: String(session.firstUnit ?? ''),
    lastUnit: String(session.lastUnit ?? ''),
    label: session.label,
    labelHe: session.labelHe ?? session.label,
    ref,
  };
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? encodeURIComponent(vars[name]!) : whole));
}

/** The session's main link. Links are resolved from the track and the day; they are never stored. */
export function resolveLink(track: StudyTrack, session: Session, locale?: string): string | null {
  const custom = safe(session.customUrl);
  if (custom) return custom;
  if (track.link.provider === 'builtin') {
    const url = (locale === 'he' && session.builtinUrlHe) || session.builtinUrl;
    return safe(url && localizeUrl(url, locale));
  }
  if (track.link.provider === 'template') return safe(localizeUrl(fill(track.link.urlTemplate, session), locale));
  return null;
}

/** Further resources the user attached to the track, resolved for this session. */
export function resolveExtraLinks(track: StudyTrack, session: Session, locale?: string): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  for (const link of track.extraLinks ?? []) {
    const url = safe(localizeUrl(fill(link.urlTemplate, session), locale));
    if (url) out.push({ label: link.label, url });
  }
  return out;
}
