const BACKUP_PREFIX = 'desktop-data-backup-v1:';
const memoryValues = new Map();

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
    notify('desktop-data-recovered', { key });
    return { found: true, value };
  } catch {
    return { found: false };
  }
}

export function readRawResult(key) {
  if (typeof key !== 'string' || !key) return { ok: false, value: null };
  const storage = getStorage();
  if (!storage) {
    return memoryValues.has(key)
      ? { ok: false, value: memoryValues.get(key) }
      : { ok: false, value: null };
  }
  try {
    const value = storage.getItem(key);
    if (value !== null) return { ok: true, value };
    return memoryValues.has(key)
      ? { ok: true, value: memoryValues.get(key) }
      : { ok: true, value: null };
  } catch {
    return memoryValues.has(key)
      ? { ok: false, value: memoryValues.get(key) }
      : { ok: false, value: null };
  }
}

export function readRaw(key, fallback = null) {
  const result = readRawResult(key);
  return result.value === null ? fallback : result.value;
}

export function readJSON(key, fallback, { validate } = {}) {
  const result = readRawResult(key);
  if (result.value !== null) {
    try {
      const value = JSON.parse(result.value);
      if (isValid(value, validate)) return value;
    } catch {
      // Try the last good snapshot below without altering the stored value.
    }
    const recovered = recoverBackup(key, validate);
    return recovered.found ? recovered.value : cloneFallback(fallback);
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
  try {
    const previous = storage.getItem(key);
    storage.setItem(key, next);
    memoryValues.delete(key);
    if (previous !== null && previous !== next) {
      try { storage.setItem(backupKey(key), previous); } catch { /* Keep the committed primary value. */ }
    }
    notify('desktop-data-change', { key });
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
    storage.removeItem(key);
    memoryValues.delete(key);
    notify('desktop-data-change', { key });
    return true;
  } catch {
    notify('desktop-data-error', { key, operation: 'remove' });
    return false;
  }
}
