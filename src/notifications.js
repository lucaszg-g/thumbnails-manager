import { dueTimestamp } from './model.js';
const ENABLED = 'thumbs-deadline-notifications';
const SEEN = 'thumbs-deadline-notifications-seen';

export function notificationStatus() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return localStorage.getItem(ENABLED) === 'yes' && Notification.permission === 'granted'
    ? 'enabled'
    : Notification.permission;
}
export async function enableDeadlineNotifications() {
  if (typeof Notification === 'undefined')
    throw Error('Este navegador não oferece notificações. Use os lembretes do Google Calendar.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw Error('As notificações não foram autorizadas no navegador.');
  localStorage.setItem(ENABLED, 'yes');
  return true;
}
export function disableDeadlineNotifications() {
  localStorage.removeItem(ENABLED);
}
export async function checkDeadlineNotifications(jobs, now = Date.now()) {
  if (notificationStatus() !== 'enabled') return;
  let seen;
  try {
    seen = JSON.parse(localStorage.getItem(SEEN) || '[]');
  } catch {
    seen = [];
  }
  if (!Array.isArray(seen)) seen = [];
  for (const job of jobs) {
    if (job.status === 'delivered') continue;
    const due = dueTimestamp(job),
      remaining = due - now;
    if (remaining > 3600000) continue;
    const type = remaining <= 0 ? 'late' : 'soon',
      id = `${job.id}:${due}:${type}`;
    if (seen.includes(id)) continue;
    const title = type === 'late' ? 'Prazo vencido' : 'Entrega em até 1 hora';
    const options = {
      body: job.title,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: id,
      data: { url: '/#thumbnails' },
    };
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) await registration.showNotification(title, options);
      else new Notification(title, options);
      seen.push(id);
      localStorage.setItem(SEEN, JSON.stringify(seen.slice(-200)));
    } catch {
      /* Google Calendar reminders remain independent of browser permission/support. */
    }
  }
}
