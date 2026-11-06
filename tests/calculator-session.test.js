const assert = require('node:assert/strict');
const test = require('node:test');

const sessionModule = import('../artifacts/personal-website/public/apps/calculator-session.js');

function createAdapter(initial = {}) {
  const values = new Map(Object.entries(initial));
  const state = { failRead: false, failWrite: false, failRemove: false, writes: 0 };
  const adapter = {
    values,
    state,
    read(key, fallback, { validate } = {}) {
      if (state.failRead) throw new Error('Storage read blocked');
      if (!values.has(key)) return structuredClone(fallback);
      const value = values.get(key);
      return typeof validate !== 'function' || validate(value) ? structuredClone(value) : structuredClone(fallback);
    },
    write(key, value, { validate } = {}) {
      state.writes += 1;
      if (state.failWrite || (typeof validate === 'function' && !validate(value))) return false;
      values.set(key, structuredClone(value));
      return true;
    },
    remove(key) {
      if (state.failRemove) return false;
      values.delete(key);
      return true;
    },
  };
  return adapter;
}

const entry = (expression, numericResult) => ({
  expression,
  result: String(numericResult),
  numericResult,
});

test('calculator history and memory restore across session creation and retain the history limit', async () => {
  const {
    CALCULATOR_HISTORY_KEY,
    CALCULATOR_HISTORY_LIMIT,
    CALCULATOR_MEMORY_KEY,
    createCalculatorSession,
  } = await sessionModule;
  assert.equal(CALCULATOR_HISTORY_KEY, 'personal-desktop-calculator-history-v1');
  assert.equal(CALCULATOR_MEMORY_KEY, 'personal-desktop-calculator-memory-v1');
  assert.equal(CALCULATOR_HISTORY_LIMIT, 24);
  const savedHistory = Array.from({ length: CALCULATOR_HISTORY_LIMIT + 3 }, (_, index) =>
    entry(`expression-${index}`, index),
  );
  const adapter = createAdapter({
    [CALCULATOR_HISTORY_KEY]: savedHistory,
    [CALCULATOR_MEMORY_KEY]: 12.5,
  });
  const session = createCalculatorSession(adapter);

  assert.equal(session.getHistory().length, CALCULATOR_HISTORY_LIMIT);
  assert.equal(session.getHistory()[0].expression, 'expression-0');
  assert.equal(session.getMemory(), 12.5);
  assert.equal(session.hasMemory(), true);

  session.recordCalculation(entry('8+4', 12));
  session.addToMemory(2);
  const restarted = createCalculatorSession(adapter);

  assert.equal(restarted.getHistory().length, CALCULATOR_HISTORY_LIMIT);
  assert.deepEqual(restarted.getHistory()[0], entry('8+4', 12));
  assert.equal(restarted.getMemory(), 14.5);
});

test('invalid saved history and memory fall back without rewriting stored data', async () => {
  const {
    CALCULATOR_HISTORY_KEY,
    CALCULATOR_MEMORY_KEY,
    createCalculatorSession,
  } = await sessionModule;
  const badHistory = [{ expression: '1/0', result: 'Infinity', numericResult: Infinity }];
  const badMemory = { value: 42 };
  const adapter = createAdapter({
    [CALCULATOR_HISTORY_KEY]: badHistory,
    [CALCULATOR_MEMORY_KEY]: badMemory,
  });
  const session = createCalculatorSession(adapter);

  assert.deepEqual(session.getHistory(), []);
  assert.equal(session.getMemory(), null);
  assert.equal(session.hasMemory(), false);
  assert.equal(adapter.state.writes, 0);
  assert.deepEqual(adapter.values.get(CALCULATOR_HISTORY_KEY), badHistory);
  assert.deepEqual(adapter.values.get(CALCULATOR_MEMORY_KEY), badMemory);
});

test('read, write, and removal failures keep in-session state usable', async () => {
  const {
    CALCULATOR_HISTORY_KEY,
    CALCULATOR_MEMORY_KEY,
    createCalculatorSession,
  } = await sessionModule;
  const adapter = createAdapter();
  adapter.state.failRead = true;
  const session = createCalculatorSession(adapter);
  adapter.state.failRead = false;
  adapter.state.failWrite = true;

  assert.equal(session.recordCalculation(entry('9-2', 7)), false);
  assert.equal(session.storeMemory(7), false);
  assert.deepEqual(session.getHistory(), [entry('9-2', 7)]);
  assert.equal(session.getMemory(), 7);

  adapter.state.failRemove = true;
  assert.equal(session.clearHistory(), false);
  assert.equal(session.clearMemory(), false);
  assert.deepEqual(session.getHistory(), []);
  assert.equal(session.getMemory(), null);
  assert.equal(session.hasMemory(), false);
  assert.equal(adapter.values.has(CALCULATOR_HISTORY_KEY), false);
  assert.equal(adapter.values.has(CALCULATOR_MEMORY_KEY), false);
});

test('memory arithmetic starts from zero, rejects invalid values, and clears explicitly', async () => {
  const { CALCULATOR_MEMORY_KEY, createCalculatorSession } = await sessionModule;
  const adapter = createAdapter();
  const session = createCalculatorSession(adapter);

  assert.equal(session.addToMemory(5), true);
  assert.equal(session.subtractFromMemory(2), true);
  assert.equal(session.getMemory(), 3);
  assert.equal(session.storeMemory(Number.NaN), false);
  assert.equal(session.getMemory(), 3);
  assert.equal(session.clearMemory(), true);
  assert.equal(session.hasMemory(), false);
  assert.equal(adapter.values.has(CALCULATOR_MEMORY_KEY), false);
});
