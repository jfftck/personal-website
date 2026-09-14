'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ReminderStore } = require('../reminder-store');

function createStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reminder-store-'));
  return new ReminderStore(path.join(directory, 'store.json'));
}

test('a due reminder is leased once until released', () => {
  const store = createStore();
  store.setSubscription('abcdefghijkl', { endpoint: 'https://example.test' });
  store.setReminder('abcdefghijkl', {
    id: 'one',
    text: 'Test',
    when: new Date(Date.now() - 1000).toISOString(),
    dueAt: new Date(Date.now() - 1000).toISOString(),
  });

  assert.equal(store.claimDue().length, 1);
  assert.equal(store.claimDue().length, 0);
  store.release('abcdefghijkl', 'one', Date.now() - 1);
  assert.equal(store.claimDue().length, 1);
});

test('sent reminders stay sent when unchanged data is synchronized again', () => {
  const store = createStore();
  const reminder = {
    id: 'one',
    text: 'Test',
    when: new Date(Date.now() - 1000).toISOString(),
    dueAt: new Date(Date.now() - 1000).toISOString(),
  };
  store.setReminder('abcdefghijkl', reminder);
  store.markSent('abcdefghijkl', 'one');
  store.setReminder('abcdefghijkl', reminder);

  assert.equal(store.claimDue().length, 0);
});

test('removing a subscription also removes its reminders', () => {
  const store = createStore();
  store.setSubscription('abcdefghijkl', { endpoint: 'https://example.test' });
  store.setReminder('abcdefghijkl', {
    id: 'one',
    text: 'Test',
    when: new Date(Date.now() + 1000).toISOString(),
    dueAt: new Date(Date.now() + 1000).toISOString(),
  });
  store.removeSubscription('abcdefghijkl');

  assert.deepEqual(store.data.subscriptions, {});
  assert.deepEqual(store.data.reminders, {});
});

test('an expired subscription can be removed without losing reminders', () => {
  const store = createStore();
  store.setSubscription('abcdefghijkl', { endpoint: 'https://example.test' });
  store.setReminder('abcdefghijkl', {
    id: 'one',
    text: 'Test',
    when: new Date(Date.now() + 1000).toISOString(),
    dueAt: new Date(Date.now() + 1000).toISOString(),
  });
  store.invalidateSubscription('abcdefghijkl', 'https://example.test');

  assert.deepEqual(store.data.subscriptions, {});
  assert.equal(Object.keys(store.data.reminders).length, 1);
  assert.equal(store.isInvalidEndpoint('https://example.test'), true);
});

test('a push endpoint cannot be shared by multiple browser identities', () => {
  const store = createStore();
  const subscription = { endpoint: 'https://example.test' };
  store.setSubscription('abcdefghijkl', subscription);

  assert.throws(
    () => store.setSubscription('mnopqrstuvwx', subscription),
    /already registered/,
  );
});

test('absolute due times are independent of the server timezone', () => {
  const dueAt = '2030-01-01T17:00:00.000Z';
  const originalTimezone = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';
    const westCoast = new Date(dueAt).getTime();
    process.env.TZ = 'Asia/Tokyo';
    const tokyo = new Date(dueAt).getTime();
    assert.equal(westCoast, tokyo);
    assert.equal(westCoast, 1893517200000);
  } finally {
    process.env.TZ = originalTimezone;
  }
});