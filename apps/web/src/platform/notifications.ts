import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { DesiredNotification } from '@kavanu/core';

export type NotifPermission = 'granted' | 'denied' | 'default' | 'unsupported';

/** Platform scheduler: makes what the OS has scheduled equal to the planned set. */
export interface Notifier {
  /** True when reminders fire even while the app is closed. */
  readonly background: boolean;
  /** How far ahead the planner should materialise notifications. */
  readonly windowDays: number;
  permission(): Promise<NotifPermission>;
  requestPermission(): Promise<NotifPermission>;
  reconcile(desired: DesiredNotification[]): Promise<void>;
}

const MAX_TIMEOUT = 2 ** 31 - 1;

/**
 * Browser scheduler. A browser cannot fire a notification while the app is
 * closed without a push server, so this only covers the time the tab or
 * installed PWA is open: it holds a timer per upcoming notification.
 */
export class WebNotifier implements Notifier {
  readonly background = false;
  readonly windowDays = 2;
  private timers = new Map<string, number>();

  async permission(): Promise<NotifPermission> {
    return 'Notification' in window ? Notification.permission : 'unsupported';
  }

  async requestPermission(): Promise<NotifPermission> {
    return 'Notification' in window ? Notification.requestPermission() : 'unsupported';
  }

  async reconcile(desired: DesiredNotification[]): Promise<void> {
    for (const id of this.timers.values()) clearTimeout(id);
    this.timers.clear();
    if ((await this.permission()) !== 'granted') return;
    const now = Date.now();
    for (const n of desired) {
      const delay = n.fireAt - now;
      if (delay <= 0 || delay > MAX_TIMEOUT) continue;
      this.timers.set(
        n.id,
        window.setTimeout(() => void this.show(n), delay),
      );
    }
  }

  private async show(n: DesiredNotification): Promise<void> {
    this.timers.delete(n.id);
    const options: NotificationOptions = { body: n.body, tag: n.id, data: { url: n.url }, icon: './icon-192.png' };
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(n.title, options);
    } else {
      const notification = new Notification(n.title, options);
      notification.onclick = () => {
        if (n.url) window.open(n.url, '_blank', 'noopener');
      };
    }
  }
}

/** Stable positive 31-bit id for the OS, derived from the planner's string id. */
function numericId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

/** Android scheduler: hands notifications to the OS alarm service, so they fire with the app closed. */
export class NativeNotifier implements Notifier {
  readonly background = true;
  readonly windowDays = 14;
  /** Android limits how many alarms an app may hold; the nearest ones matter most. */
  private static readonly MAX_SCHEDULED = 100;
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    void LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const url = (event.notification.extra as { url?: string } | undefined)?.url;
      if (url) window.open(url, '_system');
    });
  }

  private static map(state: string): NotifPermission {
    return state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'default';
  }

  async permission(): Promise<NotifPermission> {
    return NativeNotifier.map((await LocalNotifications.checkPermissions()).display);
  }

  async requestPermission(): Promise<NotifPermission> {
    return NativeNotifier.map((await LocalNotifications.requestPermissions()).display);
  }

  reconcile(desired: DesiredNotification[]): Promise<void> {
    // Serialise: overlapping cancel/schedule calls would leave duplicates or gaps.
    this.queue = this.queue.then(() => this.apply(desired)).catch((err) => console.warn('Reminder scheduling failed', err));
    return this.queue;
  }

  private async apply(desired: DesiredNotification[]): Promise<void> {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if ((await this.permission()) !== 'granted' || desired.length === 0) return;
    await LocalNotifications.schedule({
      notifications: desired.slice(0, NativeNotifier.MAX_SCHEDULED).map((n) => ({
        id: numericId(n.id),
        title: n.title,
        body: n.body,
        schedule: { at: new Date(n.fireAt), allowWhileIdle: true },
        extra: { url: n.url },
      })),
    });
  }
}

export const isNative = Capacitor.isNativePlatform();

export function createNotifier(): Notifier {
  return isNative ? new NativeNotifier() : new WebNotifier();
}
