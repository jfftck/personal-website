export function mergeReminderOperation(queue, operation) {
  return [...queue.filter(item => item.id !== operation.id), operation];
}

export function futureReminders(reminders, now = Date.now()) {
  return reminders.filter(reminder => {
    const dueAt = new Date(reminder.dueAt || reminder.when).getTime();
    return Number.isFinite(dueAt) && dueAt > now;
  });
}

export function removeExpiredPutOperations(queue, now = Date.now()) {
  return queue.filter(operation => operation.type !== 'put'
    || new Date(operation.reminder?.dueAt).getTime() > now);
}

export function shouldUploadReminder(reminder, now = Date.now(), handoffMilliseconds = 30_000) {
  return new Date(reminder.dueAt).getTime() - now > handoffMilliseconds;
}