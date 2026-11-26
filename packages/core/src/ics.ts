import type { DesiredNotification } from './reminders';

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets must be folded; never split inside a multi-byte character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (parts.length ? 72 : 74)) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Floating local time, so the alarm fires at the same wall-clock time wherever the phone is. */
function localStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function utcStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * A calendar file (RFC 5545) with one short event and alarm per planned reminder.
 * Importing it gives reminders that fire even when the app is closed, on any
 * phone or computer, without a server.
 */
export function buildIcs(items: DesiredNotification[], calendarName: string, now = Date.now()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Az Kavanu//Reminders//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const n of items) {
    lines.push(
      'BEGIN:VEVENT',
      // Stable per reminder, so importing a newer file updates events instead of duplicating them.
      `UID:${n.id.replace(/[^A-Za-z0-9|_-]/g, '')}@az-kavanu`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${localStamp(n.fireAt)}`,
      `DTEND:${localStamp(n.fireAt + 15 * 60_000)}`,
      `SUMMARY:${escapeText(n.body ? `${n.title}: ${n.body}` : n.title)}`,
      ...(n.url ? [`URL:${n.url}`, `DESCRIPTION:${escapeText(n.url)}`] : []),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(n.title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
