'use strict';

const fs = require('fs');
const path = require('path');

class ReminderStore {
  constructor(filename) {
    this.filename = filename;
    this.data = { subscriptions: {}, reminders: {}, invalidEndpoints: {} };
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
      if (parsed && parsed.subscriptions && parsed.reminders) {
        this.data = { ...parsed, invalidEndpoints: parsed.invalidEndpoints || {} };
      }
    } catch { /* start with an empty store */ }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(temporary, this.filename);
  }

  setSubscription(clientId, subscription) {
    if (!this.data.subscriptions[clientId] && Object.keys(this.data.subscriptions).length >= 10_000) {
      throw new Error('Subscription capacity reached');
    }
    for (const [otherClientId, existing] of Object.entries(this.data.subscriptions)) {
      if (otherClientId !== clientId && existing.endpoint === subscription.endpoint) {
        throw new Error('This push subscription is already registered');
      }
    }
    this.data.subscriptions[clientId] = subscription;
    delete this.data.invalidEndpoints[subscription.endpoint];
    this.save();
  }

  isInvalidEndpoint(endpoint) {
    return Boolean(this.data.invalidEndpoints[endpoint]);
  }

  invalidateSubscription(clientId, endpoint) {
    delete this.data.subscriptions[clientId];
    if (endpoint) this.data.invalidEndpoints[endpoint] = new Date().toISOString();
    const entries = Object.entries(this.data.invalidEndpoints);
    if (entries.length > 1000) {
      entries.sort((a, b) => new Date(a[1]) - new Date(b[1]));
      for (const [oldEndpoint] of entries.slice(0, entries.length - 1000)) {
        delete this.data.invalidEndpoints[oldEndpoint];
      }
    }
    this.save();
  }

  removeSubscription(clientId, removeReminders = true) {
    delete this.data.subscriptions[clientId];
    if (removeReminders) {
      for (const [key, reminder] of Object.entries(this.data.reminders)) {
        if (reminder.clientId === clientId) delete this.data.reminders[key];
      }
    }
    this.save();
  }

  setReminder(clientId, reminder) {
    const key = `${clientId}:${reminder.id}`;
    const existing = this.data.reminders[key];
    const unchanged = existing && existing.text === reminder.text && existing.dueAt === reminder.dueAt;
    const clientReminderCount = Object.values(this.data.reminders)
      .filter(item => item.clientId === clientId).length;
    if (!existing && clientReminderCount >= 200) {
      throw new Error('Too many reminders for this browser');
    }
    if (!existing && Object.keys(this.data.reminders).length >= 100_000) {
      throw new Error('Reminder capacity reached');
    }
    this.data.reminders[key] = {
      clientId,
      id: reminder.id,
      text: reminder.text,
      when: reminder.when,
      dueAt: reminder.dueAt,
      sentAt: unchanged ? existing.sentAt : null,
      leasedUntil: null,
      attempts: unchanged ? (existing.attempts || 0) : 0,
    };
    this.save();
  }

  removeReminder(clientId, reminderId) {
    delete this.data.reminders[`${clientId}:${reminderId}`];
    this.save();
  }

  claimDue(now = Date.now()) {
    const due = [];
    for (const reminder of Object.values(this.data.reminders)) {
      const dueAt = new Date(reminder.dueAt).getTime();
      const leaseExpired = !reminder.leasedUntil || new Date(reminder.leasedUntil).getTime() <= now;
      if (!reminder.sentAt && leaseExpired && Number.isFinite(dueAt) && dueAt <= now) {
        reminder.leasedUntil = new Date(now + 60_000).toISOString();
        due.push({
          reminder: { ...reminder },
          subscription: this.data.subscriptions[reminder.clientId],
        });
      }
    }
    if (due.length) this.save();
    return due;
  }

  markSent(clientId, reminderId, now = Date.now()) {
    const reminder = this.data.reminders[`${clientId}:${reminderId}`];
    if (!reminder) return;
    reminder.sentAt = new Date(now).toISOString();
    reminder.leasedUntil = null;
    this.save();
  }

  release(clientId, reminderId, retryAt = Date.now() + 60_000) {
    const reminder = this.data.reminders[`${clientId}:${reminderId}`];
    if (!reminder || reminder.sentAt) return;
    reminder.leasedUntil = new Date(retryAt).toISOString();
    reminder.attempts = (reminder.attempts || 0) + 1;
    this.save();
  }
}

module.exports = { ReminderStore };