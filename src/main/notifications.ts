import { Notification } from 'electron';
import notifier from 'node-notifier';

let notificationsEnabled = true;

export function setNotificationsEnabled(enabled: boolean): void {
  notificationsEnabled = enabled;
}

export function sendNotification(title: string, body: string): void {
  if (!notificationsEnabled) return;
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
      return;
    }
  } catch {
    // fall back below
  }
  notifier.notify({ title, message: body, appID: 'StudyFlow' });
}
