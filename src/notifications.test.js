import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enableDeadlineNotifications,
  disableDeadlineNotifications,
  checkDeadlineNotifications,
} from './notifications.js';

test('avisos locais exigem consentimento e não repetem o mesmo aviso por prazo', async () => {
  const originalNotification = globalThis.Notification,
    originalStorage = globalThis.localStorage,
    originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const sent = [],
    store = new Map();
  let requests = 0;
  globalThis.Notification = class {
    static permission = 'granted';
    static async requestPermission() {
      requests++;
      return 'granted';
    }
    constructor(title, options) {
      sent.push({ title, ...options });
    }
  };
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  try {
    const now = Date.now(),
      job = {
        id: 'j',
        title: 'Uma thumbnail',
        status: 'production',
        deadline: '2026-11-10',
        dueAt: new Date(now + 1800000).toISOString(),
      };
    await checkDeadlineNotifications([job], now);
    assert.equal(sent.length, 0);
    assert.equal(requests, 0);
    await enableDeadlineNotifications();
    assert.equal(requests, 1);
    await checkDeadlineNotifications([job], now);
    await checkDeadlineNotifications([job], now + 1000);
    assert.equal(sent.length, 1);
    await checkDeadlineNotifications([job], now + 1800001);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].title, 'Prazo vencido');
    await checkDeadlineNotifications([{ ...job, status: 'delivered' }], now + 2000000);
    assert.equal(sent.length, 2);
    disableDeadlineNotifications();
    await checkDeadlineNotifications([{ ...job, id: 'other' }], now);
    assert.equal(sent.length, 2);
  } finally {
    if (originalNotification === undefined) delete globalThis.Notification;
    else globalThis.Notification = originalNotification;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  }
});
