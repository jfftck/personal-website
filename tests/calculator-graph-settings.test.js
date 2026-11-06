const assert = require('node:assert/strict');
const test = require('node:test');

const graphSettingsModule = import('../artifacts/personal-website/public/apps/calculator-graph-settings.js');

const ranges = {
  xMin: '-10', xMax: '10', yMin: '-10', yMax: '10',
  thetaMin: '0', thetaMax: '6.283', rMin: '0', rMax: '10',
  tMin: '0', tMax: '6.283',
};
const display = {
  axisLabels: true,
  xAxisLine: true,
  yAxisLine: true,
  gridStyle: 'solid',
  gridSpacing: 'standard',
};
const makeFunction = (id, expression, xExpression = 'cos(t)', yExpression = 'sin(t)') => ({
  id,
  expression,
  xExpression,
  yExpression,
  color: '#e47b27',
  visible: true,
});

test('graph settings keep the existing key and versioned schema for each plot mode', async () => {
  const {
    GRAPH_SETTINGS_KEY,
    GRAPH_SETTINGS_VERSION,
    readSavedGraphSettings,
    serializeGraphSettings,
  } = await graphSettingsModule;
  const saved = {
    version: 2,
    graphMode: 'cartesian',
    ranges,
    display,
    functionsByMode: {
      cartesian: [makeFunction('fn-1', 'x^2')],
      polar: [makeFunction('fn-2', 'sin(theta)')],
      parametric: [makeFunction('fn-3', '', 't', 't^2')],
    },
    viewRanges: {
      cartesian: { xMin: -4, xMax: 4, yMin: -3, yMax: 3 },
      polar: { thetaMin: 0, thetaMax: 6.283, rMin: 0, rMax: 5 },
      parametric: { tMin: 0, tMax: 6.283, xMin: -2, xMax: 2, yMin: -3, yMax: 3 },
    },
  };
  const parsed = readSavedGraphSettings(JSON.stringify(saved));
  const serialized = JSON.parse(serializeGraphSettings({
    ...saved,
    functions: saved.functionsByMode.cartesian,
  }));

  assert.equal(GRAPH_SETTINGS_KEY, 'personal-desktop-calculator-graph-v1');
  assert.equal(GRAPH_SETTINGS_VERSION, 2);
  assert.equal(parsed.status, 'valid');
  assert.equal(parsed.functionsByMode.cartesian[0].expression, 'x^2');
  assert.equal(parsed.functionsByMode.polar[0].expression, 'sin(theta)');
  assert.equal(parsed.functionsByMode.parametric[0].yExpression, 't^2');
  assert.deepEqual(parsed.viewRanges, saved.viewRanges);
  assert.deepEqual(Object.keys(serialized), [
    'version', 'graphMode', 'ranges', 'display', 'functionsByMode', 'viewRanges',
  ]);
  assert.equal(serialized.version, 2);
  assert.deepEqual(serialized.functionsByMode, saved.functionsByMode);
});

test('version 1 graph settings migrate functions only into their saved plot mode', async () => {
  const { readSavedGraphSettings } = await graphSettingsModule;
  const saved = {
    version: 1,
    graphMode: 'polar',
    ranges,
    functions: [makeFunction('fn-4', 'sin(theta)')],
    viewRanges: {},
  };
  const parsed = readSavedGraphSettings(JSON.stringify(saved));

  assert.equal(parsed.status, 'valid');
  assert.equal(parsed.graphMode, 'polar');
  assert.equal(parsed.functionsByMode.cartesian.length, 0);
  assert.equal(parsed.functionsByMode.parametric.length, 0);
  assert.deepEqual(parsed.functionsByMode.polar.map(fn => fn.expression), ['sin(theta)']);
});

test('malformed graph settings and invalid configured or view ranges are rejected', async () => {
  const { readSavedGraphSettings, validRangePair } = await graphSettingsModule;
  const valid = {
    version: 2,
    graphMode: 'cartesian',
    ranges,
    display,
    functionsByMode: { cartesian: [], polar: [], parametric: [] },
    viewRanges: {},
  };
  const invalidCases = [
    '{not json',
    JSON.stringify({ ...valid, version: 1 }),
    JSON.stringify({ ...valid, ranges: { ...ranges, xMin: '10', xMax: '10' } }),
    JSON.stringify({ ...valid, viewRanges: { cartesian: { xMin: 5, xMax: 4, yMin: -2, yMax: 2 } } }),
    JSON.stringify({ ...valid, functionsByMode: { ...valid.functionsByMode, cartesian: [makeFunction('fn-5', 'unknown(x)')] } }),
  ];

  for (const raw of invalidCases) assert.equal(readSavedGraphSettings(raw).status, 'invalid');
  assert.equal(validRangePair('-2', '3'), true);
  assert.equal(validRangePair('3', '-2'), false);
  assert.equal(validRangePair('0', 'Infinity'), false);
});

test('empty and unavailable storage states remain distinct', async () => {
  const { readSavedGraphSettings, graphSettingsSnapshotFromSaved } = await graphSettingsModule;
  const empty = readSavedGraphSettings(null);
  const unavailable = readSavedGraphSettings();

  assert.equal(empty.status, 'empty');
  assert.equal(unavailable.status, 'unavailable');
  assert.notEqual(graphSettingsSnapshotFromSaved(empty), null);
  assert.equal(graphSettingsSnapshotFromSaved(unavailable), null);
});
