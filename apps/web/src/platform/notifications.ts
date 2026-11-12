import type { DesiredNotification } from '@kavanu/core';

const MAX_TIMEOUT = 2 ** 31 - 1;

/**
 * Web reminder scheduler. A browser cannot fire a notification while the app
 * is closed without a push server, so this only covers the time the tab or
 * installed PWA is open: it holds a timer per upcoming notification.
 */
export class WebNotifier {
  private timers = new Map<string, number>();

  static get supported(): boolean {
    return 'Notification' in window;
  }

  static get permission(): NotificationPermission | 'unsupported' {
    return WebNotifier.supported ? Notification.permission : 'unsupported';
  }

  static async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    return WebNotifier.supported ? Notification.requestPermission() : 'unsupported';
  }

  /** Make the scheduled set equal to `desired`. */
  reconcile(desired: DesiredNotification[]): void {
    for (const id of this.timers.values()) clearTimeout(id);
    this.timers.clear();
    if (WebNotifier.permission !== 'granted') return;
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
