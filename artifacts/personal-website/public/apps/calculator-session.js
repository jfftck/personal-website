import { readJSON, removeData, writeJSON } from '../data-handler.js';

export const CALCULATOR_HISTORY_KEY = 'personal-desktop-calculator-history-v1';
export const CALCULATOR_MEMORY_KEY = 'personal-desktop-calculator-memory-v1';
export const CALCULATOR_HISTORY_LIMIT = 24;

export function isValidCalculatorHistory(value) {
  return Array.isArray(value) && value.every(entry =>
    entry && typeof entry === 'object' && !Array.isArray(entry) &&
    typeof entry.expression === 'string' &&
    typeof entry.result === 'string' &&
    typeof entry.numericResult === 'number' && Number.isFinite(entry.numericResult),
  );
}

export function isValidCalculatorMemory(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function safeRead(read, key, fallback, validate) {
  try {
    const value = read(key, fallback, { validate });
    return validate(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(write, key, value, validate) {
  try {
    return write(key, value, { validate }) === true;
  } catch {
    return false;
  }
}

function safeRemove(remove, key) {
  try {
    return remove(key) === true;
  } catch {
    return false;
  }
}

export function createCalculatorSession({
  read = readJSON,
  write = writeJSON,
  remove = removeData,
} = {}) {
  let history = safeRead(read, CALCULATOR_HISTORY_KEY, [], isValidCalculatorHistory)
    .slice(0, CALCULATOR_HISTORY_LIMIT)
    .map(({ expression, result, numericResult }) => ({ expression, result, numericResult }));
  let memoryValue = safeRead(read, CALCULATOR_MEMORY_KEY, null, isValidCalculatorMemory);

  const persistHistory = () => safeWrite(write, CALCULATOR_HISTORY_KEY, history, isValidCalculatorHistory);
  const persistMemory = () => safeWrite(write, CALCULATOR_MEMORY_KEY, memoryValue, isValidCalculatorMemory);

  function updateMemory(operation, value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    const next = operation === 'store'
      ? value
      : operation === 'add'
        ? (memoryValue ?? 0) + value
        : (memoryValue ?? 0) - value;
    if (!Number.isFinite(next)) return false;
    memoryValue = next;
    return persistMemory();
  }

  return {
    getHistory() {
      return history.map(entry => ({ ...entry }));
    },
    recordCalculation(entry) {
      if (!isValidCalculatorHistory([entry])) return false;
      history.unshift({
        expression: entry.expression,
        result: entry.result,
        numericResult: entry.numericResult,
      });
      history.splice(CALCULATOR_HISTORY_LIMIT);
      return persistHistory();
    },
    clearHistory() {
      history = [];
      return safeRemove(remove, CALCULATOR_HISTORY_KEY);
    },
    getMemory() {
      return memoryValue;
    },
    hasMemory() {
      return memoryValue !== null;
    },
    storeMemory(value) {
      return updateMemory('store', value);
    },
    addToMemory(value) {
      return updateMemory('add', value);
    },
    subtractFromMemory(value) {
      return updateMemory('subtract', value);
    },
    clearMemory() {
      memoryValue = null;
      return safeRemove(remove, CALCULATOR_MEMORY_KEY);
    },
  };
}
