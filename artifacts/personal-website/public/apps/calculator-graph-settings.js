'use strict';

import { readRawResult, removeData, writeRaw } from '../data-handler.js';
import { evaluateExpression } from './calculator-math.js';
import { NOTE_COLORS } from './sticky-notes-data.js';

export const GRAPH_SETTINGS_KEY = 'personal-desktop-calculator-graph-v1';
export const GRAPH_SETTINGS_VERSION = 2;
export const GRAPH_MODES = Object.freeze(['cartesian', 'polar', 'parametric']);
export const GRAPH_DISPLAY_DEFAULTS = Object.freeze({
  axisLabels: true,
  xAxisLine: true,
  yAxisLine: true,
  gridStyle: 'solid',
  gridSpacing: 'standard',
});
export const GRAPH_GRID_STYLES = Object.freeze(['solid', 'dashed', 'dotted', 'none']);
export const GRAPH_GRID_SPACINGS = Object.freeze(['fine', 'standard', 'coarse']);
export const GRAPH_GRID_TARGETS = Object.freeze({ fine: 12, standard: 7, coarse: 4 });
export const RANGE_KEYS = Object.freeze([
  'xMin', 'xMax', 'yMin', 'yMax', 'thetaMin', 'thetaMax', 'rMin', 'rMax', 'tMin', 'tMax',
]);
export const DEFAULT_GRAPH_RANGES = Object.freeze({
  xMin: '-10', xMax: '10', yMin: '-10', yMax: '10',
  thetaMin: '0', thetaMax: '6.283', rMin: '0', rMax: '10',
  tMin: '0', tMax: '6.283',
});
export const VIEW_RANGE_KEYS = Object.freeze({
  cartesian: Object.freeze(['xMin', 'xMax', 'yMin', 'yMax']),
  polar: Object.freeze(['thetaMin', 'thetaMax', 'rMin', 'rMax']),
  parametric: Object.freeze(['tMin', 'tMax', 'xMin', 'xMax', 'yMin', 'yMax']),
});

export function createGraphFunctionsByMode() {
  return Object.fromEntries(GRAPH_MODES.map(mode => [mode, []]));
}

export function createGraphSettingsDefaults() {
  return {
    graphMode: 'cartesian',
    ranges: { ...DEFAULT_GRAPH_RANGES },
    display: { ...GRAPH_DISPLAY_DEFAULTS },
    viewRanges: null,
    functionsByMode: createGraphFunctionsByMode(),
  };
}

function readGraphDisplay(value) {
  if (value === undefined) return { ...GRAPH_DISPLAY_DEFAULTS };
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.axisLabels !== 'boolean' || typeof value.xAxisLine !== 'boolean' ||
      typeof value.yAxisLine !== 'boolean' || !GRAPH_GRID_STYLES.includes(value.gridStyle) ||
      !GRAPH_GRID_SPACINGS.includes(value.gridSpacing)) return null;
  return {
    axisLabels: value.axisLabels,
    xAxisLine: value.xAxisLine,
    yAxisLine: value.yAxisLine,
    gridStyle: value.gridStyle,
    gridSpacing: value.gridSpacing,
  };
}

export function validRangePair(min, max) {
  return Number.isFinite(Number(min)) && Number.isFinite(Number(max)) &&
    Number.isFinite(Number(max) - Number(min)) && Number(min) < Number(max);
}

export function readSavedGraphSettings(rawOverride) {
  let raw;
  if (arguments.length) raw = rawOverride;
  else {
    const result = readRawResult(GRAPH_SETTINGS_KEY);
    if (!result.ok && result.value === null) return { status: 'unavailable' };
    raw = result.value;
  }
  if (raw === null) return { status: 'empty' };

  try {
    const saved = JSON.parse(raw);
    const display = readGraphDisplay(saved?.display);
    const legacyFunctions = saved?.version === 1 && Array.isArray(saved.functions);
    const hasModeFunctions = saved?.version === GRAPH_SETTINGS_VERSION &&
      saved.functionsByMode && typeof saved.functionsByMode === 'object' && !Array.isArray(saved.functionsByMode);
    if (!saved || !display || (!legacyFunctions && !hasModeFunctions) || !GRAPH_MODES.includes(saved.graphMode) ||
        !saved.ranges || typeof saved.ranges !== 'object' || Array.isArray(saved.ranges) ||
        (legacyFunctions && saved.functions.length > 20)) {
      return { status: 'invalid' };
    }

    const ranges = {};
    for (const key of RANGE_KEYS) {
      const value = saved.ranges[key];
      if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim() || !Number.isFinite(Number(value))) {
        return { status: 'invalid' };
      }
      ranges[key] = String(value);
    }
    const rangePairs = [
      ['xMin', 'xMax'], ['yMin', 'yMax'], ['thetaMin', 'thetaMax'],
      ['rMin', 'rMax'], ['tMin', 'tMax'],
    ];
    if (rangePairs.some(([min, max]) => !validRangePair(ranges[min], ranges[max]))) return { status: 'invalid' };

    const serializedFunctions = legacyFunctions
      ? Object.fromEntries(GRAPH_MODES.map(mode => [mode, mode === saved.graphMode ? saved.functions : []]))
      : saved.functionsByMode;
    if (GRAPH_MODES.some(mode => !Array.isArray(serializedFunctions[mode]) || serializedFunctions[mode].length > 20)) {
      return { status: 'invalid' };
    }
    const ids = new Set();
    const functionsByMode = Object.fromEntries(GRAPH_MODES.map(mode => [mode, serializedFunctions[mode].map(fn => {
      if (!fn || typeof fn !== 'object' || typeof fn.id !== 'string' || !/^fn-\d+$/.test(fn.id) || ids.has(fn.id) ||
          typeof fn.expression !== 'string' || (mode !== 'parametric' && !fn.expression.trim()) || fn.expression.length > 180 ||
          typeof fn.xExpression !== 'string' || !fn.xExpression.trim() || fn.xExpression.length > 180 ||
          typeof fn.yExpression !== 'string' || !fn.yExpression.trim() || fn.yExpression.length > 180 ||
          typeof fn.visible !== 'boolean' || !NOTE_COLORS.some(color => color.hex === fn.color)) return null;
      ids.add(fn.id);
      return { id: fn.id, expression: fn.expression, xExpression: fn.xExpression, yExpression: fn.yExpression, color: fn.color, visible: fn.visible, path: '' };
    })]));
    if (GRAPH_MODES.some(mode => functionsByMode[mode].some(fn => !fn))) return { status: 'invalid' };
    const acceptsExpression = (expression, variable) => {
      for (const probe of [0, 1, -1, 2, 0.5]) {
        try { evaluateExpression(expression, { [variable]: probe }); return true; } catch {}
      }
      return false;
    };
    if (GRAPH_MODES.some(mode => functionsByMode[mode].some(fn => mode === 'parametric'
      ? !acceptsExpression(fn.xExpression, 't') || !acceptsExpression(fn.yExpression, 't')
      : !acceptsExpression(fn.expression, mode === 'polar' ? 'theta' : 'x')))) return { status: 'invalid' };

    const viewRanges = {};
    if (saved.viewRanges !== null && saved.viewRanges !== undefined) {
      if (!saved.viewRanges || typeof saved.viewRanges !== 'object' || Array.isArray(saved.viewRanges)) return { status: 'invalid' };
      for (const graphMode of GRAPH_MODES) {
        const view = saved.viewRanges[graphMode];
        if (view === undefined) continue;
        if (!view || typeof view !== 'object' || Array.isArray(view)) return { status: 'invalid' };
        const validated = {};
        if (view.fit !== undefined && typeof view.fit !== 'boolean') return { status: 'invalid' };
        for (const key of VIEW_RANGE_KEYS[graphMode]) {
          const value = view[key];
          if (typeof value !== 'number' || !Number.isFinite(value)) return { status: 'invalid' };
          validated[key] = value;
        }
        if (view.fit) validated.fit = true;
        const pairs = graphMode === 'polar'
          ? [['thetaMin', 'thetaMax'], ['rMin', 'rMax']]
          : graphMode === 'parametric'
            ? [['tMin', 'tMax'], ['xMin', 'xMax'], ['yMin', 'yMax']]
            : [['xMin', 'xMax'], ['yMin', 'yMax']];
        if (pairs.some(([min, max]) => !validRangePair(validated[min], validated[max]))) return { status: 'invalid' };
        viewRanges[graphMode] = validated;
      }
    }
    return { status: 'valid', graphMode: saved.graphMode, ranges, functions: functionsByMode[saved.graphMode], functionsByMode, viewRanges, display };
  } catch {
    return { status: 'invalid' };
  }
}

export function serializeGraphFunctionsByMode(functionsByMode, activeMode, activeFunctions) {
  return Object.fromEntries(GRAPH_MODES.map(mode => [
    mode,
    ((mode === activeMode ? activeFunctions : functionsByMode[mode]) || []).map(({ id, expression, xExpression, yExpression, color, visible }) => ({
      id, expression, xExpression, yExpression, color, visible,
    })),
  ]));
}

export function serializeGraphSettings(state) {
  return JSON.stringify({
    version: GRAPH_SETTINGS_VERSION,
    graphMode: state.graphMode,
    ranges: state.ranges,
    display: state.display,
    functionsByMode: serializeGraphFunctionsByMode(state.functionsByMode, state.graphMode, state.functions),
    viewRanges: state.viewRanges,
  });
}

export function saveGraphSettings(state) {
  const serialized = serializeGraphSettings(state);
  return { serialized, saved: writeRaw(GRAPH_SETTINGS_KEY, serialized) };
}

export function clearGraphSettings() {
  return removeData(GRAPH_SETTINGS_KEY);
}

export function graphSettingsSnapshot(state) {
  const normalizedFunctions = Object.fromEntries(GRAPH_MODES.map(mode => [
    mode,
    (state.functionsByMode[mode] || []).map(fn => ({
      id: fn.id,
      expression: fn.expression,
      xExpression: fn.xExpression,
      yExpression: fn.yExpression,
      color: fn.color,
      visible: fn.visible,
    })),
  ]));
  const normalizedViewRanges = {};
  for (const mode of GRAPH_MODES) {
    const view = state.viewRanges?.[mode];
    if (!view) continue;
    const normalizedView = Object.fromEntries(VIEW_RANGE_KEYS[mode].map(key => [key, view[key]]));
    if (view.fit) normalizedView.fit = true;
    normalizedViewRanges[mode] = normalizedView;
  }
  return JSON.stringify({
    graphMode: state.graphMode,
    ranges: Object.fromEntries(RANGE_KEYS.map(key => [key, state.ranges[key]])),
    display: {
      axisLabels: state.display.axisLabels,
      xAxisLine: state.display.xAxisLine,
      yAxisLine: state.display.yAxisLine,
      gridStyle: state.display.gridStyle,
      gridSpacing: state.display.gridSpacing,
    },
    functionsByMode: normalizedFunctions,
    viewRanges: normalizedViewRanges,
  });
}

export function graphSettingsSnapshotFromSaved(saved) {
  if (saved.status === 'valid') return graphSettingsSnapshot(saved);
  if (saved.status === 'empty') {
    const defaults = createGraphSettingsDefaults();
    return graphSettingsSnapshot({ ...defaults, viewRanges: {} });
  }
  return null;
}
