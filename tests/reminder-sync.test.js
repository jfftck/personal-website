'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

test('failed creates remain queued until a matching success removes them', async () => {
  const { mergeReminderOperation } = await import('../shared/reminder-sync.js');
  const operation = { type: 'put', id: 'one', reminder: { text: 'Test' } };
  const queue = mergeReminderOperation([], operation);

  assert.deepEqual(queue, [operation]);
});

test('a delete tombstone replaces a pending create for the same reminder', async () => {
  const { mergeReminderOperation } = await import('../shared/reminder-sync.js');
  const queue = mergeReminderOperation(
    [{ type: 'put', id: 'one', reminder: { text: 'Test' } }],
    { type: 'delete', id: 'one' },
  );

  assert.deepEqual(queue, [{ type: 'delete', id: 'one' }]);
});

test('initial enrollment excludes historical reminders', async () => {
  const { futureReminders } = await import('../shared/reminder-sync.js');
  const reminders = [
    { id: 'past', dueAt: '2020-01-01T00:00:00.000Z' },
    { id: 'future', dueAt: '2099-01-01T00:00:00.000Z' },
  ];

  assert.deepEqual(futureReminders(reminders, Date.parse('2030-01-01T00:00:00.000Z')), [reminders[1]]);
});

test('retry sanitation drops expired creates but keeps cancellation tombstones', async () => {
  const { removeExpiredPutOperations } = await import('../shared/reminder-sync.js');
  const queue = [
    { type: 'put', id: 'past', reminder: { dueAt: '2020-01-01T00:00:00.000Z' } },
    { type: 'put', id: 'future', reminder: { dueAt: '2099-01-01T00:00:00.000Z' } },
    { type: 'delete', id: 'deleted' },
  ];

  assert.deepEqual(
    removeExpiredPutOperations(queue, Date.parse('2030-01-01T00:00:00.000Z')),
    [queue[1], queue[2]],
  );
});

test('near-due reminders stay on the tagged local fallback path', async () => {
  const { shouldUploadReminder } = await import('../shared/reminder-sync.js');
  const now = Date.parse('2030-01-01T00:00:00.000Z');

  assert.equal(shouldUploadReminder({ dueAt: '2030-01-01T00:00:20.000Z' }, now), false);
  assert.equal(shouldUploadReminder({ dueAt: '2030-01-01T00:01:00.000Z' }, now), true);
});