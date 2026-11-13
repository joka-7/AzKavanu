/**
 * Hybrid logical clock. Stamps are fixed-width strings so that plain string
 * comparison orders them: `<ms:15 digits>-<counter:5 digits>-<deviceId>`.
 */
export type Hlc = string;

const MS_WIDTH = 15;
const COUNTER_WIDTH = 5;
const MAX_COUNTER = 10 ** COUNTER_WIDTH - 1;

export function formatHlc(ms: number, counter: number, deviceId: string): Hlc {
  return `${String(ms).padStart(MS_WIDTH, '0')}-${String(counter).padStart(COUNTER_WIDTH, '0')}-${deviceId}`;
}

export function parseHlc(h: Hlc): { ms: number; counter: number; deviceId: string } {
  const ms = Number(h.slice(0, MS_WIDTH));
  const counter = Number(h.slice(MS_WIDTH + 1, MS_WIDTH + 1 + COUNTER_WIDTH));
  const deviceId = h.slice(MS_WIDTH + COUNTER_WIDTH + 2);
  return { ms, counter, deviceId };
}

export function compareHlc(a: Hlc, b: Hlc): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class HlcClock {
  private ms = 0;
  private counter = 0;

  constructor(
    readonly deviceId: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** Stamp for a new local event; always greater than anything issued or observed before. */
  tick(): Hlc {
    const wall = this.now();
    if (wall > this.ms) {
      this.ms = wall;
      this.counter = 0;
    } else if (this.counter < MAX_COUNTER) {
      this.counter += 1;
    } else {
      this.ms += 1;
      this.counter = 0;
    }
    return formatHlc(this.ms, this.counter, this.deviceId);
  }

  /** Advance past a stamp seen from another replica, so later local events sort after it. */
  observe(remote: Hlc): void {
    const r = parseHlc(remote);
    if (!Number.isFinite(r.ms) || !Number.isFinite(r.counter)) return;
    if (r.ms > this.ms || (r.ms === this.ms && r.counter > this.counter)) {
      this.ms = r.ms;
      this.counter = r.counter;
    }
  }
}
