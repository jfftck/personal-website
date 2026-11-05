const BACKUP_PREFIX = 'desktop-data-backup-v1:';
const DATA_HANDLER_STATE = Symbol.for('personal-desktop.data-handler.v1');
const handlerState = globalThis[DATA_HANDLER_STATE] || (globalThis[DATA_HANDLER_STATE] = {
  memoryValues: new Map(),
  recoveryCandidates: new Map(),
});
const { memoryValues, recoveryCandidates } = handlerState;

function getStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function notify(name, detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    // Storage must remain usable in environments without CustomEvent.
  }
}

function backupKey(key) {
  return `${BACKUP_PREFIX}${encodeURIComponent(key)}`;
}

function isValid(value, validate) {
  try {
    return typeof validate !== 'function' || validate(value) === true;
  } catch {
    return false;
  }
}

function cloneFallback(value) {
  if (value === undefined) return undefined;
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
}

function recoverBackup(key, validate) {
  const storage = getStorage();
  if (!storage) return { found: false };
  try {
    const raw = storage.getItem(backupKey(key));
    if (raw === null) return { found: false };
    const value = JSON.parse(raw);
    if (!isValid(value, validate)) return { found: false };
    return { found: true, value, raw };
  } catch {
    return { found: false };
  }
}

export function restoreDataBackup(key) {
  if (typeof key !== 'string' || !key) return false;
  const recovery = recoveryCandidates.get(key);
  const storage = getStorage();
  if (!recovery || !storage) {
    notify('desktop-data-recovery-error', {
      key,
      reason: recovery ? 'storage-unavailable' : 'copy-unavailable',
    });
    return false;
  }

  try {
    const current = storage.getItem(key);
    const backup = storage.getItem(backupKey(key));
    if (current !== recovery.primaryRaw || backup !== recovery.backupRaw) {
      recoveryCandidates.delete(key);
      notify('desktop-data-recovery-error', { key, reason: 'data-changed' });
      return false;
    }
    const value = JSON.parse(backup);
    if (!isValid(value, recovery.validate)) {
      recoveryCandidates.delete(key);
      notify('desktop-data-recovery-error', { key, reason: 'copy-invalid' });
      return false;
    }
    storage.setItem(key, backup);
    memoryValues.delete(key);
    recoveryCandidates.delete(key);
    notify('desktop-data-change', { key });
    notify('desktop-data-recovery-restored', { key });
    return true;
  } catch {
    notify('desktop-data-recovery-error', { key, reason: 'storage-unavailable' });
    return false;
  }
}

export function readRawResult(key) {
  if (typeof key !== 'string' || !key) return { ok: false, value: null };
  const storage = getStorage();
  if (!storage) {
    if (memoryValues.has(key)) return { ok: false, value: memoryValues.get(key) };
    notify('desktop-data-error', { key, operation: 'read' });
    return { ok: false, value: null };
  }
  try {
    const value = storage.getItem(key);
    if (value !== null) return { ok: true, value };
    return memoryValues.has(key)
      ? { ok: true, value: memoryValues.get(key) }
      : { ok: true, value: null };
  } catch {
    if (memoryValues.has(key)) return { ok: false, value: memoryValues.get(key) };
    notify('desktop-data-error', { key, operation: 'read' });
    return { ok: false, value: null };
  }
}

export function readRaw(key, fallback = null) {
  const result = readRawResult(key);
  return result.value === null ? fallback : result.value;
}

export function readJSON(key, fallback, { validate } = {}) {
  const result = readRawResult(key);
  if (!result.ok && result.value === null) {
    return cloneFallback(fallback);
  }
  if (result.value !== null) {
    try {
      const value = JSON.parse(result.value);
      if (isValid(value, validate)) {
        if (recoveryCandidates.delete(key)) notify('desktop-data-recovery-saved', { key });
        return value;
      }
    } catch {
      // Try the last good snapshot below without altering the stored value.
    }
    const recovered = recoverBackup(key, validate);
    if (recovered.found) {
      recoveryCandidates.set(key, {
        backupRaw: recovered.raw,
        primaryRaw: result.value,
        validate,
      });
      notify('desktop-data-recovery-available', { key });
      return recovered.value;
    }
    notify('desktop-data-error', { key, operation: 'read' });
  }
  return cloneFallback(fallback);
}

export function writeRaw(key, value) {
  if (typeof key !== 'string' || !key) return false;
  const next = String(value);
  const storage = getStorage();
  if (!storage) {
    memoryValues.set(key, next);
    notify('desktop-data-error', { key, operation: 'write' });
    return false;
  }
  let previous = null;
  let previousWasReadable = false;
  try {
    previous = storage.getItem(key);
    previousWasReadable = true;
  } catch {
    // A readable old value is useful for recovery, but must not block a new save.
  }
  try {
    storage.setItem(key, next);
    memoryValues.delete(key);
    const hadPendingRecovery = recoveryCandidates.delete(key);
    if (!hadPendingRecovery && previousWasReadable && previous !== null && previous !== next) {
      try { storage.setItem(backupKey(key), previous); } catch { /* Keep the committed primary value. */ }
    }
    notify('desktop-data-change', { key });
    if (hadPendingRecovery) notify('desktop-data-recovery-saved', { key });
    return true;
  } catch {
    memoryValues.set(key, next);
    notify('desktop-data-error', { key, operation: 'write' });
    return false;
  }
}

export function writeJSON(key, value, { validate } = {}) {
  if (!isValid(value, validate)) {
    notify('desktop-data-error', { key, operation: 'validate' });
    return false;
  }
  try {
    return writeRaw(key, JSON.stringify(value));
  } catch {
    notify('desktop-data-error', { key, operation: 'serialize' });
    return false;
  }
}

export function removeData(key) {
  if (typeof key !== 'string' || !key) return false;
  const storage = getStorage();
  if (!storage) {
    notify('desktop-data-error', { key, operation: 'remove' });
    return false;
  }
  try {
    storage.removeItem(backupKey(key));
    storage.removeItem(key);
    memoryValues.delete(key);
    if (recoveryCandidates.delete(key)) notify('desktop-data-recovery-cleared', { key });
    notify('desktop-data-change', { key });
    return true;
  } catch {
    notify('desktop-data-error', { key, operation: 'remove' });
    return false;
  }
}
