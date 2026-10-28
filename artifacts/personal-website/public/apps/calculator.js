'use strict';

import { enhanceSelect, refreshCustomSelect } from './custom-select.js';
import { NOTE_COLORS } from './sticky-notes.js';
import '../shared/app-controls.js';

const BASIC_KEYS = [
  ['AC', 'clear'], ['±', 'sign'], ['%', 'percent'], ['÷', 'operator'],
  ['7', 'digit'], ['8', 'digit'], ['9', 'digit'], ['×', 'operator'],
  ['4', 'digit'], ['5', 'digit'], ['6', 'digit'], ['−', 'operator'],
  ['1', 'digit'], ['2', 'digit'], ['3', 'digit'], ['+', 'operator'],
  ['0', 'wide digit'], ['.', 'decimal'], ['=', 'equals'],
];
const SCIENTIFIC_KEYS = ['sin(', 'cos(', 'tan(', 'ln(', 'log(', '√(', 'π', 'e', '^', '(', ')'];
const HEX_DIGITS = ['A', 'B', 'C', 'D', 'E', 'F'];
const GRAPH_KEYS = [
  'sin(', 'cos(', 'tan(', '√(', 'ln(', 'log(',
  'π', 'e', 'x', 'θ', 't', ',', '^',
  '7', '8', '9', '÷', '(', ')',
  '4', '5', '6', '×', '+', '−',
  '1', '2', '3', '%', '/', '.',
  '0', 'Clear', '⌫',
];
const BASIC_KEY_TOOLTIPS = Object.freeze({
  '±': 'Change sign · type -',
  '%': 'Percent · type /100',
  '÷': 'Divide · type /',
  '×': 'Multiply · type *',
  '−': 'Subtract · type -',
  '+': 'Add · type +',
  '=': 'Evaluate · press Enter',
  '.': 'Decimal point · type .',
});
const SCIENTIFIC_KEY_TOOLTIPS = Object.freeze({
  'sin(': 'Sine function · type sin(',
  'cos(': 'Cosine function · type cos(',
  'tan(': 'Tangent function · type tan(',
  'ln(': 'Natural logarithm · type ln(',
  'log(': 'Base-10 logarithm · type log(',
  '√(': 'Square root · type sqrt(',
  'π': 'Pi constant · type pi',
  e: 'Euler’s number · type e',
  '^': 'Power · type ^',
  '(': 'Open parenthesis · type (',
  ')': 'Close parenthesis · type )',
});
const GRAPH_KEY_TOOLTIPS = Object.freeze({
  'sin(': 'Sine function · type sin(',
  'cos(': 'Cosine function · type cos(',
  'tan(': 'Tangent function · type tan(',
  '√(': 'Square root · type sqrt(',
  'ln(': 'Natural logarithm · type ln(',
  'log(': 'Base-10 logarithm · type log(',
  'π': 'Pi constant · type pi',
  e: 'Euler’s number · type e',
  x: 'x variable · type x',
  'θ': 'Theta variable · type theta',
  t: 'Parameter variable · type t',
  '^': 'Power · type ^',
  '÷': 'Divide · type /',
  '×': 'Multiply · type *',
  '+': 'Add · type +',
  '−': 'Subtract · type -',
  '%': 'Modulo · type %',
  '/': 'Divide · type /',
  '.': 'Decimal point · type .',
  '(': 'Open parenthesis · type (',
  ')': 'Close parenthesis · type )',
});
const MATH_SYMBOL_ALIASES = Object.freeze({
  'θ': 'theta', 'Θ': 'theta', 'π': 'pi', 'Π': 'pi', '√': 'sqrt',
  '×': '*', '÷': '/', '−': '-',
});
const HISTORY_LIMIT = 24;
const GRAPH_SETTINGS_KEY = 'personal-desktop-calculator-graph-v1';
const CALCULATOR_MODE_KEY = 'personal-desktop-calculator-mode-v1';
const GRAPH_SETTINGS_VERSION = 2;
const GRAPH_MODES = ['cartesian', 'polar', 'parametric'];
const GRAPH_DISPLAY_DEFAULTS = Object.freeze({
  axisLabels: true,
  xAxisLine: true,
  yAxisLine: true,
  gridStyle: 'solid',
  gridSpacing: 'standard',
});
const GRAPH_GRID_STYLES = ['solid', 'dashed', 'dotted', 'none'];
const GRAPH_GRID_SPACINGS = ['fine', 'standard', 'coarse'];
const GRAPH_GRID_TARGETS = Object.freeze({ fine: 12, standard: 7, coarse: 4 });
const RANGE_KEYS = ['xMin', 'xMax', 'yMin', 'yMax', 'thetaMin', 'thetaMax', 'rMin', 'rMax', 'tMin', 'tMax'];
const DEFAULT_GRAPH_RANGES = {
  xMin: '-10', xMax: '10', yMin: '-10', yMax: '10',
  thetaMin: '0', thetaMax: '6.283', rMin: '0', rMax: '10',
  tMin: '0', tMax: '6.283',
};
const VIEW_RANGE_KEYS = {
  cartesian: ['xMin', 'xMax', 'yMin', 'yMax'],
  polar: ['thetaMin', 'thetaMax', 'rMin', 'rMax'],
  parametric: ['tMin', 'tMax', 'xMin', 'xMax', 'yMin', 'yMax'],
};
const PLOT_FRAME = Object.freeze({
  left: 48, right: 616, top: 26, bottom: 374,
  width: 568, height: 348, centerX: 332, centerY: 200, polarRadius: 174,
});
let nextFunctionId = 1;
const calculatorGraphSubscribers = new Set();

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

function validRangePair(min, max) {
  return Number.isFinite(Number(min)) && Number.isFinite(Number(max)) &&
    Number.isFinite(Number(max) - Number(min)) && Number(min) < Number(max);
}

function readSavedGraphSettings(rawOverride) {
  let raw;
  if (arguments.length) raw = rawOverride;
  else {
    try { raw = localStorage.getItem(GRAPH_SETTINGS_KEY); }
    catch { return { status: 'unavailable' }; }
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
        for (const key of VIEW_RANGE_KEYS[graphMode]) {
          const value = view[key];
          if (typeof value !== 'number' || !Number.isFinite(value)) return { status: 'invalid' };
          validated[key] = value;
        }
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

function parseRadixNumber(raw, radix) {
  let base = radix;
  let digits = raw;
  const prefix = raw.toLowerCase().match(/^0([box])/);
  if (prefix) {
    base = { b: 2, o: 8, x: 16 }[prefix[1]];
    digits = raw.slice(2);
  }
  const [whole = '', fraction = ''] = digits.toLowerCase().split('.');
  const digitValue = character => {
    const value = Number.parseInt(character, 16);
    if (!Number.isFinite(value) || value >= base) {
      throw new Error(`Digit “${character.toUpperCase()}” is not valid in base ${base}.`);
    }
    return value;
  };
  let result = 0;
  for (const character of whole || '0') result = result * base + digitValue(character);
  let place = 1 / base;
  for (const character of fraction) {
    result += digitValue(character) * place;
    place /= base;
  }
  if (!Number.isFinite(result)) throw new Error('The number is too large.');
  return result;
}

function scanExpressionTokens(source, radix = 10) {
  const tokens = [];
  const pattern = /\s*(0[bxo][0-9a-f]+(?:\.[0-9a-f]*)?|\d+(?:\.\d*)?|\.\d+|[a-zA-Z]+|[θΘπΠ√×÷−]|[+\-*/%^()])/gyi;
  let position = 0;
  while (position < source.length) {
    if (!source.slice(position).trim()) break;
    pattern.lastIndex = position;
    const match = pattern.exec(source);
    if (!match) throw new Error(`Unsupported character “${source[position]}”.`);
    const raw = match[1];
    const value = MATH_SYMBOL_ALIASES[raw] || raw.toLowerCase();
    const start = match.index + match[0].length - raw.length;
    const numeric = /^\d|\./.test(value);
    if (/^[a-z]+$/.test(value) && !['x', 'theta', 't', 'pi', 'e', 'sin', 'cos', 'tan', 'ln', 'log', 'sqrt'].includes(value)) {
      throw new Error(`Unknown function or name “${value}”.`);
    }
    tokens.push({ value, start, end: pattern.lastIndex, numeric });
    position = pattern.lastIndex;
  }
  return tokens;
}

function formatRadixNumber(number, radix) {
  if (!Number.isFinite(number)) throw new Error('The result is not a finite number.');
  const rounded = Number(number.toPrecision(12));
  if (radix === 10) return String(rounded);
  const prefix = { 2: '0b', 8: '0o', 16: '0x' }[radix];
  if (!prefix) throw new Error('Unsupported number base.');
  const sign = rounded < 0 ? '-' : '';
  const absolute = Math.abs(rounded);
  const integer = Math.floor(absolute);
  let whole = integer.toString(radix);
  let remainder = absolute - integer;
  let fraction = '';
  const digits = '0123456789abcdef';
  for (let place = 0; place < 14 && remainder > 1e-14; place += 1) {
    remainder *= radix;
    const digit = Math.min(radix - 1, Math.floor(remainder));
    fraction += digits[digit];
    remainder -= digit;
  }
  fraction = fraction.replace(/0+$/, '');
  return `${sign}${prefix}${whole}${fraction ? `.${fraction}` : ''}`;
}

function convertExpressionRadix(source, fromRadix, toRadix) {
  let result = '';
  let cursor = 0;
  for (const token of scanExpressionTokens(source, fromRadix)) {
    result += source.slice(cursor, token.start);
    result += token.numeric
      ? formatRadixNumber(parseRadixNumber(token.value, fromRadix), toRadix)
      : source.slice(token.start, token.end);
    cursor = token.end;
  }
  return result + source.slice(cursor);
}

export function buildCalculator(id, ctx) {
  const root = document.createElement('section');
  root.className = 'utility-app calc-wrap';
  root.dataset.mode = 'basic';
  root.dataset.radix = '10';
  const expressionId = `${id || 'calculator'}-expression`;
  root.innerHTML = `
    <div class="calc" aria-label="Calculator">
      <header class="calc-header">
        <div class="calc-header-actions">
          <div class="calc-memory" role="group" aria-label="Memory">
            <button type="button" data-memory="store" aria-label="Memory store" title="Store result">MS</button>
            <button type="button" data-memory="recall" aria-label="Memory recall" title="Recall memory" disabled>MR</button>
            <button type="button" data-memory="add" aria-label="Add to memory" title="Add to memory">M+</button>
            <button type="button" data-memory="subtract" aria-label="Subtract from memory" title="Subtract from memory">M−</button>
            <button type="button" data-memory="clear" aria-label="Clear memory" title="Clear memory" disabled>MC</button>
          </div>
          <div class="calc-header-graph-actions" role="group" aria-label="Graph editing" hidden>
            <button type="button" class="calc-open-editor" aria-label="Edit functions">y = f(x)</button>
            <button type="button" class="calc-open-settings" aria-label="Graph settings">Settings</button>
          </div>
        </div>
        <app-select class="calc-mode-select">
          <select class="calc-mode-select-field" aria-label="Calculator mode">
            <option value="basic">Basic</option>
            <option value="scientific">Scientific</option>
            <option value="graph">Graph</option>
          </select>
        </app-select>
      </header>
      <div class="calc-workspace">
        <main class="calc-main">
          <div class="calc-display">
            <div class="calc-display-header">
              <label class="calc-expression-label" for="${expressionId}">Expression</label>
            </div>
            <div class="calc-expression-input-wrap">
              <input class="calc-expression" id="${expressionId}" aria-label="Expression" inputmode="decimal" autocomplete="off" spellcheck="false" value="0">
              <button type="button" class="calc-backspace" aria-label="Backspace" title="Delete the previous character">⌫</button>
            </div>
            <div class="calc-result-line"><span class="calc-result-caption">RESULT</span><output class="calc-value" aria-live="polite">0</output></div>
            <p class="calc-message" role="status" aria-live="polite"></p>
          </div>
          <div class="calc-keypads">
            <div class="calc-keypad-columns">
              <div class="calc-keys" aria-label="Calculator keypad"></div>
              <div class="calc-keypad-support">
                <div class="calc-base-control" role="group" aria-label="Number base">
                  <span class="calc-base-label">Base</span>
                  <button type="button" data-radix="2" aria-label="Base 2" aria-pressed="false">2</button>
                  <button type="button" data-radix="8" aria-label="Base 8" aria-pressed="false">8</button>
                  <button type="button" data-radix="10" aria-label="Base 10" aria-pressed="true">10</button>
                  <button type="button" data-radix="16" aria-label="Base 16" aria-pressed="false">16</button>
                </div>
                <div class="calc-hex-keys" aria-label="Hexadecimal digits" hidden></div>
                <div class="calc-scientific" aria-label="Scientific keypad" hidden></div>
              </div>
            </div>
          </div>
          <section class="calc-graph" hidden aria-label="Function graph">
            <div class="calc-graph-heading">
              <span class="calc-kicker">PLOT / ${'<span class="calc-mode-label">CARTESIAN</span>'}</span>
            </div>
            <div class="calc-graph-toolbar" role="group" aria-label="Graph controls">
              <div class="calc-zoom-controls" role="group" aria-label="Zoom controls">
                <button type="button" class="calc-zoom-out" aria-label="Zoom out">−</button>
                <button type="button" class="calc-zoom-in" aria-label="Zoom in">+</button>
              </div>
              <div class="calc-menu-controls">
                <div class="calc-menu-host">
                  <button type="button" class="calc-menu-trigger calc-view-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="${expressionId}-view-menu">View</button>
                  <div class="calc-menu-popover menu-popover calc-view-menu" id="${expressionId}-view-menu" role="dialog" aria-label="Graph view options" hidden>
                    <div class="calc-view-option-group" role="group" aria-label="Axis ratio">
                      <span class="calc-view-option-title">Ratio</span>
                      <div class="calc-view-options">
                        <button type="button" data-view-ratio="auto" aria-pressed="true">Auto</button>
                        <button type="button" data-view-ratio="1:1" aria-pressed="false">1:1</button>
                        <button type="button" data-view-ratio="2:1" aria-pressed="false">2:1</button>
                        <button type="button" data-view-ratio="1:2" aria-pressed="false">1:2</button>
                        <button type="button" data-view-ratio="custom" aria-pressed="false">Custom…</button>
                      </div>
                      <div class="calc-custom-ratio" hidden>
                        <label>X <input type="number" class="calc-custom-ratio-x" min="0.001" max="1000" step="any" value="1" aria-label="Custom ratio X"></label>
                        <span aria-hidden="true">:</span>
                        <label>Y <input type="number" class="calc-custom-ratio-y" min="0.001" max="1000" step="any" value="1" aria-label="Custom ratio Y"></label>
                        <button type="button" class="calc-apply-custom-ratio">Apply</button>
                      </div>
                    </div>
                    <div class="calc-view-option-group" role="group" aria-label="Scaling factor">
                      <span class="calc-view-option-title">Scaling factor</span>
                      <div class="calc-view-options">
                        <button type="button" data-view-scale="0.5" aria-pressed="false">0.5×</button>
                        <button type="button" data-view-scale="1" aria-pressed="true">1×</button>
                        <button type="button" data-view-scale="2" aria-pressed="false">2×</button>
                        <button type="button" data-view-scale="4" aria-pressed="false">4×</button>
                        <button type="button" data-view-scale="custom" aria-pressed="false">Custom…</button>
                      </div>
                      <div class="calc-custom-scale" hidden>
                        <label>Factor <input type="number" class="calc-custom-scale-value" min="0.001" max="1000" step="any" value="1" aria-label="Custom scaling factor"></label>
                        <button type="button" class="calc-apply-custom-scale">Apply</button>
                      </div>
                      <div class="calc-log-options" role="group" aria-label="Logarithmic axes">
                        <button type="button" data-log-axis="x" aria-pressed="false">Log X</button>
                        <button type="button" data-log-axis="y" aria-pressed="false">Log Y</button>
                      </div>
                    </div>
                    <p class="calc-view-error" role="alert" aria-live="polite"></p>
                    <button type="button" class="calc-fit-view calc-menu-action" data-close-menu>Fit curves</button>
                    <hr class="calc-menu-divider">
                    <button type="button" class="calc-reset-view calc-menu-action" data-close-menu>Reset view</button>
                  </div>
                </div>
                <div class="calc-menu-host">
                  <button type="button" class="calc-menu-trigger calc-setup-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="${expressionId}-setup-menu">Setup</button>
                  <div class="calc-menu-popover menu-popover calc-setup-menu" id="${expressionId}-setup-menu" role="dialog" aria-label="Graph setup actions" hidden>
                    <button type="button" class="calc-copy-setup calc-menu-action" data-close-menu>Copy setup</button>
                    <button type="button" class="calc-open-restore calc-menu-action" data-close-menu>Restore setup</button>
                    <button type="button" class="calc-copy-view-ranges calc-menu-action" data-close-menu>Copy ranges</button>
                  </div>
                </div>
              </div>
              <div class="calc-plot-actions">
                <div class="calc-menu-host calc-info-host">
                  <button type="button" class="calc-info-trigger" aria-label="Graph information" title="Current graph view" aria-haspopup="dialog" aria-expanded="false" aria-controls="${expressionId}-info-panel">
                    <svg aria-hidden="true" viewBox="0 0 20 20" focusable="false"><circle cx="10" cy="10" r="8.1"></circle><path d="M10 8.7v5"></path><circle cx="10" cy="5.8" r=".7"></circle></svg>
                  </button>
                  <div class="calc-menu-popover menu-popover calc-info-panel" id="${expressionId}-info-panel" role="dialog" aria-label="Current graph view" tabindex="-1" hidden>
                    <h3>Current graph view</h3>
                    <section class="calc-info-functions" aria-labelledby="${expressionId}-functions-heading">
                      <h4 id="${expressionId}-functions-heading">Functions</h4>
                      <ul class="calc-function-list" aria-label="Functions in this plot mode"></ul>
                    </section>
                    <dl class="calc-info-summary">
                      <div><dt>Mode</dt><dd class="calc-info-mode"></dd></div>
                    </dl>
                    <dl class="calc-info-ranges"></dl>
                    <dl class="calc-info-display">
                      <div><dt>Ratio</dt><dd class="calc-info-ratio"></dd></div>
                      <div><dt>Scale</dt><dd class="calc-info-scale"></dd></div>
                      <div><dt>Log axes</dt><dd class="calc-info-log"></dd></div>
                    </dl>
                    <textarea class="calc-view-ranges-values" aria-label="Current graph ranges for copying" rows="2" readonly spellcheck="false" hidden></textarea>
                  </div>
                </div>
                <button type="button" class="calc-plot calc-primary-action">Plot</button>
              </div>
            </div>
            <div class="calc-copy-statuses" aria-live="polite">
              <span class="calc-copy-view-ranges-status" role="status" aria-live="polite"></span>
              <span class="calc-copy-setup-status" role="status" aria-live="polite"></span>
            </div>
            <svg class="calc-plot-area" role="application" aria-label="Function graph. Drag to pan, use the mouse wheel or plus and minus to zoom, and use arrow keys to pan. Press Home to reset the view." tabindex="0" viewBox="0 0 640 400" preserveAspectRatio="none"></svg>
            <p class="calc-graph-status" role="status" aria-live="polite">Add a function, then choose Plot.</p>
            <div class="calc-storage-warning" role="alert" hidden></div>
            <div class="calc-storage-recovery" role="alert" hidden><span></span><button type="button" class="calc-reset-saved">Reset saved graph</button></div>
          </section>
        </main>
        <aside class="calc-history" aria-label="Calculation history">
          <div class="calc-history-heading"><div><span class="calc-kicker">RECENT</span><h3>History</h3></div><button type="button" class="calc-history-clear">Clear</button></div>
          <ol class="calc-history-list"></ol>
          <p class="calc-history-empty">Your completed calculations will appear here.</p>
        </aside>
      </div>
    </div>
    <dialog class="calc-dialog calc-editor-dialog" aria-labelledby="${expressionId}-editor-title">
      <form method="dialog" class="calc-dialog-card calc-editor-card">
        <header class="calc-dialog-header"><div><span class="calc-kicker">FUNCTION LAB</span><h3 id="${expressionId}-editor-title">Edit functions</h3></div></header>
        <div class="calc-editor-layout">
          <nav class="calc-editor-nav" aria-label="Functions">
            <div class="calc-editor-list" aria-live="polite"></div>
            <button type="button" class="calc-new-function util-action" aria-label="New function">New</button>
          </nav>
          <div class="calc-editor-fields">
            <p class="calc-editor-empty" hidden>No functions yet. Type an expression or choose New.</p>
            <div class="calc-editor-expression-label">
              <label class="calc-editor-equation-label" for="${expressionId}-function-expression">y =</label>
              <span class="calc-editor-input-wrap">
                <input class="calc-editor-expression" id="${expressionId}-function-expression" aria-label="Function expression" autocomplete="off" spellcheck="false">
                <button type="button" class="calc-editor-backspace" aria-label="Backspace expression" title="Delete the previous character">⌫</button>
              </span>
            </div>
            <div class="calc-editor-function-fields" hidden></div>
            <fieldset class="note-color-picker calc-color-picker"><legend>Line color</legend><div class="note-color-options calc-color-options"></div></fieldset>
            <p class="calc-editor-error" role="alert" aria-live="polite"></p>
            <div class="calc-function-keypad" aria-label="Function keypad"></div>
            <app-dialog-actions class="calc-dialog-actions"><button type="button" data-action="cancel">Cancel</button><button type="button" class="calc-apply-functions calc-primary-action">Apply</button></app-dialog-actions>
          </div>
        </div>
      </form>
    </dialog>
    <dialog class="calc-dialog calc-settings-dialog" aria-labelledby="${expressionId}-settings-title">
      <form method="dialog" class="calc-dialog-card calc-settings-card">
        <header class="calc-dialog-header"><div><span class="calc-kicker">PLOT / CONFIGURE</span><h3 id="${expressionId}-settings-title">Graph settings</h3></div></header>
        <label class="calc-setting-field">Graph mode
          <select class="calc-graph-mode" aria-label="Graph mode">
            <option value="cartesian">Cartesian · y = f(x)</option>
            <option value="polar" title="theta">Polar · r = f(θ)</option>
            <option value="parametric">Parametric · x(t), y(t)</option>
          </select>
        </label>
        <div class="calc-range-fields"></div>
        <fieldset class="calc-graph-display-settings">
          <legend>Graph display</legend>
          <div class="calc-graph-display-toggles">
            <label><input type="checkbox" class="calc-show-axis-labels"> Show axis labels</label>
            <label><input type="checkbox" class="calc-show-x-axis"> Show X-axis line</label>
            <label><input type="checkbox" class="calc-show-y-axis"> Show Y-axis line</label>
          </div>
          <div class="calc-graph-display-selects">
            <label class="calc-setting-field">Grid style
              <app-select class="calc-grid-style-select">
                <select class="calc-grid-style" aria-label="Grid style">
                  <option value="solid">Solid lines</option>
                  <option value="dashed">Dashed lines</option>
                  <option value="dotted">Dotted lines</option>
                  <option value="none">No grid</option>
                </select>
              </app-select>
            </label>
            <label class="calc-setting-field">Grid spacing
              <app-select class="calc-grid-spacing-select">
                <select class="calc-grid-spacing" aria-label="Grid spacing">
                  <option value="fine">Fine</option>
                  <option value="standard">Standard</option>
                  <option value="coarse">Coarse</option>
                </select>
              </app-select>
            </label>
          </div>
        </fieldset>
        <p class="calc-settings-error" role="alert" aria-live="polite"></p>
        <app-dialog-actions class="calc-dialog-actions"><button type="button" data-action="cancel">Cancel</button><button type="button" class="calc-apply-settings calc-primary-action">Apply settings</button></app-dialog-actions>
      </form>
    </dialog>
    <dialog class="calc-dialog calc-restore-dialog" aria-labelledby="${expressionId}-restore-title">
      <form method="dialog" class="calc-dialog-card calc-restore-card">
        <header class="calc-dialog-header"><div><span class="calc-kicker">PLOT / REUSE</span><h3 id="${expressionId}-restore-title">Restore graph setup</h3></div><button type="button" class="calc-dialog-close" aria-label="Close restore setup">Close</button></header>
        <label class="calc-setup-field">Paste a graph setup
          <textarea class="calc-setup-input" rows="8" spellcheck="false" autocomplete="off" aria-label="Graph setup snippet" placeholder="Paste the copied graph setup here"></textarea>
        </label>
        <p class="calc-setup-summary" role="status" aria-live="polite">Review the setup before applying it. Your current graph will stay unchanged until you apply.</p>
        <pre class="calc-setup-preview" hidden></pre>
        <footer class="calc-dialog-actions"><button type="button" class="calc-review-setup">Review setup</button><button type="button" class="calc-apply-setup calc-primary-action" hidden>Apply setup</button></footer>
      </form>
    </dialog>`;

  enhanceSelect(root.querySelector('.calc-graph-mode'));
  enhanceSelect(root.querySelector('.calc-mode-select-field'));
  enhanceSelect(root.querySelector('.calc-grid-style'));
  enhanceSelect(root.querySelector('.calc-grid-spacing'));
  const $ = selector => root.querySelector(selector);
  const input = $('.calc-expression');
  const value = $('.calc-value');
  const message = $('.calc-message');
  const keys = $('.calc-keys');
  const keypads = $('.calc-keypads');
  const hexKeys = $('.calc-hex-keys');
  const scientific = $('.calc-scientific');
  const historyList = $('.calc-history-list');
  const historyEmpty = $('.calc-history-empty');
  const graph = $('.calc-graph');
  const plotArea = $('.calc-plot-area');
  const graphStatus = $('.calc-graph-status');
  const viewRangeValues = $('.calc-view-ranges-values');
  const copyViewRangesButton = $('.calc-copy-view-ranges');
  const copyViewRangesStatus = $('.calc-copy-view-ranges-status');
  const copySetupButton = $('.calc-copy-setup');
  const copySetupStatus = $('.calc-copy-setup-status');
  const viewMenuTrigger = $('.calc-view-trigger');
  const viewMenu = $('.calc-view-menu');
  const infoMenuTrigger = $('.calc-info-trigger');
  const infoMenu = $('.calc-info-panel');
  const infoRanges = $('.calc-info-ranges');
  const setupMenuTrigger = $('.calc-setup-trigger');
  const setupMenu = $('.calc-setup-menu');
  const modeSelect = $('.calc-mode-select-field');
  const ratioButtons = [...root.querySelectorAll('[data-view-ratio]')];
  const scaleButtons = [...root.querySelectorAll('[data-view-scale]')];
  const logAxisButtons = [...root.querySelectorAll('[data-log-axis]')];
  const restoreDialog = $('.calc-restore-dialog');
  const setupInput = $('.calc-setup-input');
  const setupSummary = $('.calc-setup-summary');
  const setupPreview = $('.calc-setup-preview');
  const applySetupButton = $('.calc-apply-setup');
  const viewError = $('.calc-view-error');
  const editorDialog = $('.calc-editor-dialog');
  const settingsDialog = $('.calc-settings-dialog');
  let lastEditorField = null;
  let lastEditorSelection = null;
  const history = [];
  let mode = (() => {
    try {
      const saved = localStorage.getItem(CALCULATOR_MODE_KEY);
      return ['basic', 'scientific', 'graph'].includes(saved) ? saved : 'basic';
    } catch {
      return 'basic';
    }
  })();
  let radix = 10;
  let memoryValue = null;
  let resultFresh = false;
  let graphMode = 'cartesian';
  let settingsMode = graphMode;
  let graphDisplay = { ...GRAPH_DISPLAY_DEFAULTS };
  let ranges = { ...DEFAULT_GRAPH_RANGES };
  let viewRanges = null;
  let viewRatio = 'auto';
  let customRatioX = 1;
  let customRatioY = 1;
  let viewScaleFactor = 1;
  let logAxes = { x: false, y: false };
  let functionsByMode = Object.fromEntries(GRAPH_MODES.map(plotMode => [plotMode, []]));
  let functions = functionsByMode[graphMode];
  let activeFunctionId = null;
  let editorDraft = [];
  let restoreDraft = null;
  function rememberEditorField(field, moveCaretToEnd = false) {
    lastEditorField = field || null;
    if (!field) {
      lastEditorSelection = null;
      return;
    }
    const length = field.value.length;
    const start = moveCaretToEnd ? length : field.selectionStart ?? length;
    const end = moveCaretToEnd ? length : field.selectionEnd ?? start;
    lastEditorSelection = { start, end };
  }
  const storageWarning = $('.calc-storage-warning');
  const recoveryNotice = $('.calc-storage-recovery');
  const recoveryMessage = recoveryNotice.querySelector('span');
  const savedGraph = readSavedGraphSettings();
  if (savedGraph.status === 'valid') {
    graphMode = savedGraph.graphMode;
    ranges = savedGraph.ranges;
    graphDisplay = savedGraph.display;
    functionsByMode = savedGraph.functionsByMode;
    functions = functionsByMode[graphMode];
    viewRanges = Object.keys(savedGraph.viewRanges).length ? savedGraph.viewRanges : null;
    activeFunctionId = functions[0]?.id ?? null;
    nextFunctionId = Math.max(nextFunctionId, ...Object.values(functionsByMode).flat().map(fn => Number(fn.id.slice(3)) + 1));
  } else if (savedGraph.status === 'invalid') {
    recoveryMessage.textContent = 'Saved graph settings could not be restored. Defaults are active.';
    recoveryNotice.hidden = false;
  } else if (savedGraph.status === 'unavailable') {
    showStorageWarning('read');
  }
  $('.calc-mode-label').textContent = graphMode.toUpperCase();

  function showStorageWarning(operation) {
    storageWarning.textContent = operation === 'read'
      ? 'This browser could not read saved graph settings. Changes may not persist until browser storage is available.'
      : 'Graph settings could not be saved in this browser. Changes may not persist until browser storage is available.';
    storageWarning.hidden = false;
  }

  function applySavedGraphSettings(saved) {
    if (saved.status === 'empty') {
      graphMode = 'cartesian';
      settingsMode = graphMode;
      ranges = { ...DEFAULT_GRAPH_RANGES };
      graphDisplay = { ...GRAPH_DISPLAY_DEFAULTS };
      viewRanges = null;
      functionsByMode = Object.fromEntries(GRAPH_MODES.map(plotMode => [plotMode, []]));
      functions = functionsByMode[graphMode];
      activeFunctionId = null;
      recoveryNotice.hidden = true;
    } else if (saved.status === 'valid') {
      graphMode = saved.graphMode;
      settingsMode = graphMode;
      ranges = saved.ranges;
      graphDisplay = saved.display;
      viewRanges = Object.keys(saved.viewRanges).length ? saved.viewRanges : null;
      functionsByMode = saved.functionsByMode;
      functions = functionsByMode[graphMode];
      activeFunctionId = functions.some(fn => fn.id === activeFunctionId)
        ? activeFunctionId
        : functions[0]?.id ?? null;
      nextFunctionId = Math.max(nextFunctionId, ...Object.values(functionsByMode).flat().map(fn => Number(fn.id.slice(3)) + 1));
      recoveryNotice.hidden = true;
    } else return;

    $('.calc-mode-label').textContent = graphMode.toUpperCase();
    renderFunctions();
    plot(false);
  }

  function broadcastGraphSettings() {
    const saved = readSavedGraphSettings(JSON.stringify({
      version: GRAPH_SETTINGS_VERSION,
      graphMode,
      ranges,
      display: graphDisplay,
      functionsByMode: serializeFunctionsByMode(),
      viewRanges,
    }));
    if (saved.status === 'valid') {
      calculatorGraphSubscribers.forEach(subscriber => {
        if (subscriber !== onGraphSettingsChanged) subscriber(saved);
      });
    }
  }

  function onGraphSettingsChanged(saved) {
    applySavedGraphSettings(saved);
  }
  calculatorGraphSubscribers.add(onGraphSettingsChanged);
  function onStorageGraphSettings(event) {
    if (event.key === GRAPH_SETTINGS_KEY) {
      applySavedGraphSettings(event.newValue === null
        ? { status: 'empty' }
        : readSavedGraphSettings(event.newValue));
    }
  }
  window.addEventListener('storage', onStorageGraphSettings);

  function serializeFunctionsByMode() {
    functionsByMode[graphMode] = functions;
    return Object.fromEntries(GRAPH_MODES.map(plotMode => [plotMode, functionsByMode[plotMode].map(({ id: functionId, expression, xExpression, yExpression, color, visible }) => ({
      id: functionId, expression, xExpression, yExpression, color, visible,
    }))]));
  }

  function activateGraphMode(nextMode) {
    functionsByMode[graphMode] = functions;
    graphMode = nextMode;
    functions = functionsByMode[graphMode] || (functionsByMode[graphMode] = []);
    activeFunctionId = functions[0]?.id ?? null;
  }

  function persistGraphSettings() {
    try {
      const serialized = JSON.stringify({
        version: GRAPH_SETTINGS_VERSION,
        graphMode,
        ranges,
        display: graphDisplay,
        functionsByMode: serializeFunctionsByMode(),
        viewRanges,
      });
      localStorage.setItem(GRAPH_SETTINGS_KEY, serialized);
      const saved = readSavedGraphSettings(serialized);
      if (saved.status === 'valid') {
        storageWarning.hidden = true;
        calculatorGraphSubscribers.forEach(subscriber => {
          if (subscriber !== onGraphSettingsChanged) subscriber(saved);
        });
      }
    } catch {
      showStorageWarning('write');
    }
  }

  function resetSavedGraph() {
    try {
      localStorage.removeItem(GRAPH_SETTINGS_KEY);
      graphMode = 'cartesian';
      settingsMode = graphMode;
      ranges = { ...DEFAULT_GRAPH_RANGES };
      graphDisplay = { ...GRAPH_DISPLAY_DEFAULTS };
      viewRanges = null;
      functionsByMode = Object.fromEntries(GRAPH_MODES.map(plotMode => [plotMode, []]));
      functions = functionsByMode[graphMode];
      activeFunctionId = null;
      $('.calc-mode-label').textContent = graphMode.toUpperCase();
      recoveryNotice.hidden = true;
      renderFunctions();
      plot();
      graphStatus.textContent = 'Saved graph reset to defaults.';
      broadcastGraphSettings();
    } catch {
      recoveryMessage.textContent = 'Saved graph settings could not be cleared. Check this browser’s storage settings and try again.';
      recoveryNotice.hidden = false;
    }
  }

  function makeFunction(expression) {
    const color = nextFunctionId === 1
      ? NOTE_COLORS.find(item => item.value === 'blue').hex
      : NOTE_COLORS[(nextFunctionId - 2) % NOTE_COLORS.length].hex;
    return { id: `fn-${nextFunctionId++}`, expression, xExpression: 'cos(t)', yExpression: 'sin(t)', color, visible: true, path: '' };
  }
  const format = number => {
    return formatRadixNumber(number, radix);
  };
  const renderHistory = () => {
    historyList.replaceChildren();
    history.forEach(entry => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'calc-history-entry';
      button.setAttribute('aria-label', `Reuse result ${entry.result} from ${entry.expression}`);
      const expression = document.createElement('span'); expression.textContent = entry.expression;
      const result = document.createElement('strong'); result.textContent = entry.result;
      button.append(expression, result);
      button.addEventListener('click', () => {
        input.value = format(entry.numericResult); value.textContent = format(entry.numericResult);
        message.textContent = 'History result loaded into the expression.';
        resultFresh = true; input.focus({ preventScroll: true });
      });
      li.append(button); historyList.append(li);
    });
    historyEmpty.hidden = history.length > 0;
  };
  const calculate = (record = true) => {
    try {
      const expression = input.value.trim();
      const result = evaluateExpression(expression, null, radix);
      value.textContent = format(result); message.textContent = '';
      input.setSelectionRange(input.value.length, input.value.length);
      if (record && expression) {
        history.unshift({ expression, result: format(result), numericResult: result }); history.splice(HISTORY_LIMIT); renderHistory(); resultFresh = true;
      }
      return result;
    } catch (error) {
      value.textContent = '—'; message.textContent = error.message || 'Check the expression and try again.';
      resultFresh = false; return null;
    }
  };
  const updatePreview = () => {
    if (!input.value.trim()) { value.textContent = '0'; message.textContent = ''; return; }
    if (calculate(false) !== null) message.textContent = '';
  };
  const setMode = next => {
    if (next === 'basic' && radix !== 10) setRadix(10);
    mode = next; root.dataset.mode = next;
    modeSelect.value = next;
    refreshCustomSelect(modeSelect);
    root.querySelector('.calc-memory').hidden = next === 'graph';
    root.querySelector('.calc-header-graph-actions').hidden = next !== 'graph';
    scientific.hidden = next !== 'scientific'; graph.hidden = next !== 'graph'; keypads.hidden = next === 'graph';
    root.classList.toggle('calc-graph-mode', next === 'graph');
    root.querySelector('.calc-display').hidden = next === 'graph';
    root.querySelector('.calc-history').hidden = next === 'graph';
    try { localStorage.setItem(CALCULATOR_MODE_KEY, next); } catch {}
    if (next === 'graph') plot();
  };
  const insert = (text, replaceResult = false) => {
    const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
    const replace = resultFresh && replaceResult;
    const replaceZero = replaceResult && ['0', '0b0', '0o0', '0x0'].includes(input.value.trim().toLowerCase());
    const base = replace || replaceZero ? '' : input.value, offset = replace || replaceZero ? 0 : start, suffixStart = replace || replaceZero ? 0 : end;
    const insertion = (replace || replaceZero) && text === '.' ? '0.' : text;
    input.value = `${base.slice(0, offset)}${insertion}${base.slice(suffixStart)}`;
    const caret = offset + insertion.length; input.setSelectionRange(caret, caret);
    resultFresh = false; input.focus({ preventScroll: true }); updatePreview();
  };
  const insertRadixDigit = digit => {
    if (Number.parseInt(digit, 16) >= radix) return;
    if (radix === 10) { insert(digit, true); return; }
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const prefix = { 2: '0b', 8: '0o', 16: '0x' }[radix];
    const before = input.value.slice(0, start);
    const startsOperand = !before.trim() || /[+\-*/^(]\s*$/.test(before);
    if (resultFresh || input.value === '0' || input.value.trim().toLowerCase() === `${prefix}0` || !input.value || startsOperand) {
      insert(`${prefix}${digit}`, true);
      return;
    }
    insert(digit, true);
  };
  const clear = () => {
    input.value = formatRadixNumber(0, radix); value.textContent = input.value;
    message.textContent = ''; resultFresh = false; input.focus({ preventScroll: true });
  };
  const backspace = () => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    if (start === end && start > 0) input.setRangeText('', start - 1, end, 'end');
    else if (start !== end) input.setRangeText('', start, end, 'end');
    resultFresh = false;
    updatePreview();
    input.focus({ preventScroll: true });
  };
  const setRadix = next => {
    if (next === radix) return;
    try { input.value = convertExpressionRadix(input.value, radix, next); }
    catch { /* Leave an incomplete expression intact so the user can finish editing it. */ }
    radix = next;
    root.dataset.radix = String(next);
    input.inputMode = next === 16 ? 'text' : 'decimal';
    root.querySelectorAll('.calc-base-control button').forEach(button => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.radix) === next));
    });
    keys.querySelectorAll('[data-digit]').forEach(button => { button.disabled = Number(button.dataset.digit) >= next; });
    hexKeys.hidden = next !== 16;
    updatePreview();
  };

  BASIC_KEYS.forEach(([label, kind]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `calc-key ${kind.includes('operator') ? 'operator' : ''} ${kind.includes('equals') ? 'equals' : ''} ${kind.includes('wide') ? 'wide' : ''}`;
    button.textContent = label;
    if (BASIC_KEY_TOOLTIPS[label]) button.title = BASIC_KEY_TOOLTIPS[label];
    if (kind.includes('digit')) button.dataset.digit = label;
    button.addEventListener('click', () => {
      if (kind.includes('clear')) clear();
      else if (kind.includes('equals')) calculate(true);
      else if (kind.includes('sign')) {
        const match = input.value.match(/-?(?:0[bxo][0-9a-f]+|[0-9a-f]+)(?:\.[0-9a-f]*)?$/i);
        if (match) {
          const replacement = match[0].startsWith('-') ? match[0].slice(1) : `-${match[0]}`;
          input.setRangeText(replacement, match.index, input.value.length, 'end'); resultFresh = false; updatePreview();
        }
      } else if (kind.includes('percent')) insert(`/${formatRadixNumber(100, radix)}`);
      else if (kind.includes('operator')) insert(({ '÷': '/', '×': '*', '−': '-' })[label] || label);
      else if (kind.includes('digit')) insertRadixDigit(label);
      else insert(label, kind.includes('decimal'));
    });
    keys.append(button);
  });
  SCIENTIFIC_KEYS.forEach(label => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'calc-science-key'; button.textContent = label;
    if (SCIENTIFIC_KEY_TOOLTIPS[label]) {
      button.title = SCIENTIFIC_KEY_TOOLTIPS[label];
      button.setAttribute('aria-label', SCIENTIFIC_KEY_TOOLTIPS[label]);
    }
    button.addEventListener('click', () => insert(label, true)); scientific.append(button);
  });
  HEX_DIGITS.forEach(digit => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'calc-key calc-hex-key';
    button.textContent = digit; button.setAttribute('aria-label', `Hex digit ${digit}`);
    button.addEventListener('click', () => insertRadixDigit(digit));
    hexKeys.append(button);
  });
  root.querySelectorAll('.calc-base-control button').forEach(button => {
    button.addEventListener('click', () => setRadix(Number(button.dataset.radix)));
  });
  root.querySelectorAll('.calc-memory button').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.memory;
      if (action === 'recall') {
        if (memoryValue === null) return;
        input.value = formatRadixNumber(memoryValue, radix);
        resultFresh = false;
        updatePreview();
        message.textContent = 'Memory recalled.';
        input.focus({ preventScroll: true });
        return;
      }
      if (action === 'clear') {
        memoryValue = null;
        root.querySelector('[data-memory="recall"]').disabled = true;
        button.disabled = true;
        message.textContent = 'Memory cleared.';
        return;
      }
      const current = calculate(false);
      if (current === null) return;
      if (action === 'store') memoryValue = current;
      else if (action === 'add') memoryValue = (memoryValue ?? 0) + current;
      else if (action === 'subtract') memoryValue = (memoryValue ?? 0) - current;
      root.querySelector('[data-memory="recall"]').disabled = memoryValue === null;
      root.querySelector('[data-memory="clear"]').disabled = memoryValue === null;
      message.textContent = action === 'store' ? 'Memory stored.' : 'Memory updated.';
    });
  });
  $('.calc-backspace').addEventListener('click', backspace);
  modeSelect.addEventListener('change', () => setMode(modeSelect.value));
  $('.calc-history-clear').addEventListener('click', () => { history.splice(0); renderHistory(); });
  input.addEventListener('input', () => { resultFresh = false; updatePreview(); });
  input.addEventListener('keydown', event => {
    if (radix === 16 && /^[a-f]$/i.test(event.key)) {
      event.preventDefault(); insertRadixDigit(event.key.toUpperCase()); return;
    }
    if (event.key === 'Enter') { event.preventDefault(); calculate(true); }
    if (event.key === 'Escape') clear();
  });
  function bindGraphPopover(trigger, panel) {
    const close = restoreFocus => {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger.focus();
    };
    trigger.addEventListener('click', () => {
      const shouldOpen = panel.hidden;
      root.querySelectorAll('.calc-menu-popover:not([hidden])').forEach(openPanel => {
        openPanel.hidden = true;
        root.querySelector(`[aria-controls="${openPanel.id}"]`)?.setAttribute('aria-expanded', 'false');
      });
      if (shouldOpen) {
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        (panel.querySelector('button:not(:disabled),[tabindex="-1"]'))?.focus();
      }
    });
    panel.addEventListener('click', event => {
      if (!event.target.closest('[data-close-menu]')) return;
      close(Boolean(event.target.closest('.calc-view-menu,.calc-mode-menu,.calc-info-panel')));
    });
    document.addEventListener('pointerdown', event => {
      if (panel.hidden || panel.contains(event.target) || trigger.contains(event.target)) return;
      close(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || panel.hidden) return;
      event.preventDefault();
      close(true);
    });
  }
  bindGraphPopover(viewMenuTrigger, viewMenu);
  bindGraphPopover(setupMenuTrigger, setupMenu);
  bindGraphPopover(infoMenuTrigger, infoMenu);
  root.querySelector('.calc-plot').addEventListener('click', plot);
  $('.calc-zoom-in').addEventListener('click', () => { zoomView(0.8); persistGraphSettings(); });
  $('.calc-zoom-out').addEventListener('click', () => { zoomView(1.25); persistGraphSettings(); });
  $('.calc-fit-view').addEventListener('click', fitView);
  $('.calc-reset-view').addEventListener('click', resetView);
  ratioButtons.forEach(button => button.addEventListener('click', () => {
    if (graphMode === 'polar') return;
    viewRatio = button.dataset.viewRatio;
    if (viewRatio === 'custom') {
      $('.calc-custom-ratio').hidden = false;
      $('.calc-custom-ratio-x').focus();
      return;
    }
    $('.calc-custom-ratio').hidden = true;
    viewError.textContent = '';
    updateViewOptions();
    plot(false);
  }));
  scaleButtons.forEach(button => button.addEventListener('click', () => {
    if (button.dataset.viewScale === 'custom') {
      $('.calc-custom-scale').hidden = false;
      $('.calc-custom-scale-value').focus();
      return;
    }
    viewScaleFactor = Number(button.dataset.viewScale);
    viewError.textContent = '';
    updateViewOptions();
    plot(false);
  }));
  $('.calc-apply-custom-ratio').addEventListener('click', () => {
    const x = Number($('.calc-custom-ratio-x').value);
    const y = Number($('.calc-custom-ratio-y').value);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0 || x > 1000 || y > 1000) {
      viewError.textContent = 'Enter positive X and Y ratio values up to 1000.';
      return;
    }
    customRatioX = x;
    customRatioY = y;
    viewRatio = 'custom';
    viewError.textContent = '';
    updateViewOptions();
    plot(false);
  });
  $('.calc-apply-custom-scale').addEventListener('click', () => {
    const factor = Number($('.calc-custom-scale-value').value);
    if (!Number.isFinite(factor) || factor <= 0 || factor > 1000) {
      viewError.textContent = 'Enter a scaling factor greater than 0 and no more than 1000.';
      return;
    }
    viewScaleFactor = factor;
    viewError.textContent = '';
    updateViewOptions();
    plot(false);
  });
  logAxisButtons.forEach(button => button.addEventListener('click', () => {
    if (graphMode === 'polar') return;
    const axis = button.dataset.logAxis;
    logAxes[axis] = !logAxes[axis];
    viewError.textContent = '';
    updateViewOptions();
    plot(false);
  }));
  $('.calc-reset-saved').addEventListener('click', resetSavedGraph);
  $('.calc-open-editor').addEventListener('click', openEditor);
  $('.calc-open-settings').addEventListener('click', openSettings);
  root.querySelectorAll('.calc-dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

  function updateViewOptions() {
    const activeRatio = graphMode === 'polar' ? '1:1' : viewRatio;
    ratioButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.viewRatio === activeRatio));
      button.disabled = graphMode === 'polar' && button.dataset.viewRatio !== '1:1';
    });
    scaleButtons.forEach(button => {
      const selected = button.dataset.viewScale === 'custom'
        ? ![0.5, 1, 2, 4].includes(viewScaleFactor)
        : Number(button.dataset.viewScale) === viewScaleFactor;
      button.setAttribute('aria-pressed', String(selected));
    });
    $('.calc-custom-ratio').hidden = viewRatio !== 'custom';
    $('.calc-custom-ratio-x').value = String(customRatioX);
    $('.calc-custom-ratio-y').value = String(customRatioY);
    $('.calc-custom-scale').hidden = !scaleButtons.some(button => button.dataset.viewScale === 'custom' && button.getAttribute('aria-pressed') === 'true');
    $('.calc-custom-scale-value').value = String(viewScaleFactor);
    logAxisButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(logAxes[button.dataset.logAxis]));
      button.disabled = graphMode === 'polar';
    });
  }

  function renderFunctions() {
    functionsByMode[graphMode] = functions;
    updateViewOptions();
    const editorFormat = graphMode === 'polar'
      ? 'r = f(θ)'
      : graphMode === 'parametric' ? 'x(t), y(t)' : 'y = f(x)';
    const editorButton = $('.calc-open-editor');
    editorButton.textContent = editorFormat;
    editorButton.setAttribute('aria-label', `Edit functions: ${editorFormat}`);
    editorButton.title = `Edit functions · ${editorFormat}`;
    const list = $('.calc-function-list'); list.replaceChildren();
    functions.forEach(fn => {
      const row = document.createElement('li'); row.className = 'calc-function-item';
      const swatch = document.createElement('span'); swatch.className = 'calc-function-swatch'; swatch.style.setProperty('--function-color', fn.color);
      const label = document.createElement('span'); label.className = 'calc-function-summary';
      label.textContent = graphMode === 'parametric' ? `x(t)=${fn.xExpression} · y(t)=${fn.yExpression}` : `${graphMode === 'polar' ? 'r(θ)' : 'y'} = ${fn.expression}`;
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'calc-function-toggle';
      toggle.setAttribute('aria-pressed', String(fn.visible)); toggle.setAttribute('aria-label', `${fn.visible ? 'Hide' : 'Show'} function: ${label.textContent}`); toggle.textContent = fn.visible ? 'Visible' : 'Hidden';
      toggle.addEventListener('click', () => { fn.visible = !fn.visible; renderFunctions(); plot(); persistGraphSettings(); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'calc-function-remove'; remove.setAttribute('aria-label', `Remove function: ${label.textContent}`); remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        functions = functions.filter(item => item.id !== fn.id);
        if (activeFunctionId === fn.id) activeFunctionId = functions[0]?.id ?? null;
        renderFunctions(); plot(); persistGraphSettings();
      });
      row.append(swatch, label, toggle, remove); list.append(row);
    });
    if (!functions.length) {
      const empty = document.createElement('li'); empty.className = 'calc-function-empty'; empty.textContent = 'No functions yet';
      list.append(empty);
    }
  }
  function renderSettingsFields(fieldMode = graphMode) {
    const holder = $('.calc-range-fields'); holder.replaceChildren();
    const fields = fieldMode === 'cartesian'
      ? [['xMin', 'Minimum x'], ['xMax', 'Maximum x'], ['yMin', 'Minimum y'], ['yMax', 'Maximum y']]
      : fieldMode === 'polar'
        ? [['thetaMin', 'Minimum θ'], ['thetaMax', 'Maximum θ'], ['rMin', 'Minimum r'], ['rMax', 'Maximum r']]
        : [['tMin', 'Minimum t'], ['tMax', 'Maximum t'], ['xMin', 'Minimum x'], ['xMax', 'Maximum x'], ['yMin', 'Minimum y'], ['yMax', 'Maximum y']];
    fields.forEach(([key, label]) => {
      const wrapper = document.createElement('label'); wrapper.className = 'calc-setting-field';
      wrapper.textContent = label;
      const field = document.createElement('input'); field.type = 'number'; field.step = 'any'; field.dataset.range = key; field.value = ranges[key];
      field.setAttribute('aria-label', label.replace('θ', 'theta'));
      if (label.includes('θ')) field.title = 'theta';
      wrapper.append(field); holder.append(wrapper);
    });
  }
  function openSettings() {
    settingsMode = graphMode;
    const graphModeSelect = $('.calc-graph-mode');
    graphModeSelect.value = settingsMode;
    refreshCustomSelect(graphModeSelect);
    $('.calc-show-axis-labels').checked = graphDisplay.axisLabels;
    $('.calc-show-x-axis').checked = graphDisplay.xAxisLine;
    $('.calc-show-y-axis').checked = graphDisplay.yAxisLine;
    const gridStyle = $('.calc-grid-style');
    gridStyle.value = graphDisplay.gridStyle;
    refreshCustomSelect(gridStyle);
    const gridSpacing = $('.calc-grid-spacing');
    gridSpacing.value = graphDisplay.gridSpacing;
    refreshCustomSelect(gridSpacing);
    $('.calc-settings-error').textContent = ''; renderSettingsFields(settingsMode);
    settingsDialog.showModal(); $('.calc-graph-mode').focus();
  }
  $('.calc-graph-mode').addEventListener('change', event => {
    settingsMode = event.target.value; renderSettingsFields(settingsMode);
  });
  $('.calc-apply-settings').addEventListener('click', () => {
    const nextRanges = { ...ranges }; let error = '';
    $('.calc-range-fields').querySelectorAll('input').forEach(field => { nextRanges[field.dataset.range] = field.value; });
    const nextDisplay = {
      axisLabels: $('.calc-show-axis-labels').checked,
      xAxisLine: $('.calc-show-x-axis').checked,
      yAxisLine: $('.calc-show-y-axis').checked,
      gridStyle: $('.calc-grid-style').value,
      gridSpacing: $('.calc-grid-spacing').value,
    };
    const required = settingsMode === 'cartesian' ? ['xMin', 'xMax', 'yMin', 'yMax'] : settingsMode === 'polar' ? ['thetaMin', 'thetaMax', 'rMin', 'rMax'] : ['tMin', 'tMax', 'xMin', 'xMax', 'yMin', 'yMax'];
    const nums = Object.fromEntries(required.map(key => [key, Number(nextRanges[key])]));
    if (required.some(key => !String(nextRanges[key]).trim() || !Number.isFinite(nums[key]))) error = 'Enter a finite value for every range.';
    const pairs = settingsMode === 'cartesian' ? [['xMin', 'xMax', 'x'], ['yMin', 'yMax', 'y']]
      : settingsMode === 'polar' ? [['thetaMin', 'thetaMax', 'theta'], ['rMin', 'rMax', 'r']]
        : [['tMin', 'tMax', 't'], ['xMin', 'xMax', 'x'], ['yMin', 'yMax', 'y']];
    if (!error && pairs.some(([a, b]) => nums[a] >= nums[b])) error = 'Each range start must be less than its end.';
    if (error) { $('.calc-settings-error').textContent = error; return; }
    ranges = nextRanges;
    graphDisplay = nextDisplay;
    if (settingsMode !== graphMode) activateGraphMode(settingsMode);
    viewRanges = null;
    $('.calc-mode-label').textContent = graphMode.toUpperCase(); renderFunctions(); settingsDialog.close(); plot(); persistGraphSettings();
  });

  function renderEditorNav() {
    const nav = $('.calc-editor-list'); nav.replaceChildren();
    editorDraft.forEach(fn => {
      const label = graphMode === 'parametric'
        ? [fn.xExpression, fn.yExpression].some(expression => expression.trim())
          ? `${fn.xExpression.trim() || '…'}, ${fn.yExpression.trim() || '…'}`
          : ''
        : fn.expression.trim();
      const empty = !label;
      const row = document.createElement('div');
      row.className = 'calc-editor-function-row';
      row.dataset.empty = String(empty);
      const select = document.createElement('button'); select.type = 'button'; select.className = 'calc-editor-select';
      select.setAttribute('aria-current', String(fn.id === activeFunctionId));
      select.dataset.empty = String(empty);
      select.setAttribute('aria-label', empty ? 'Empty function entry' : `Edit ${label}`);
      select.textContent = label;
      select.title = empty ? 'Type an expression to name this function' : label;
      select.addEventListener('click', () => { saveEditorDraft(); activeFunctionId = fn.id; renderEditor(); });
      row.append(select);
      if (!empty) {
        const visible = document.createElement('input'); visible.type = 'checkbox'; visible.checked = fn.visible; visible.setAttribute('aria-label', `Show ${label}`);
        visible.addEventListener('change', () => { fn.visible = visible.checked; });
        row.append(visible);
      }
      nav.append(row);
    });
  }
  function saveEditorDraft() {
    const fn = editorDraft.find(item => item.id === activeFunctionId); if (!fn) return;
    if (graphMode === 'parametric') {
      fn.xExpression = $('.calc-editor-x').value; fn.yExpression = $('.calc-editor-y').value;
    } else fn.expression = $('.calc-editor-expression').value;
    fn.color = $('.calc-color-picker input:checked')?.value || NOTE_COLORS.find(item => item.value === 'blue').hex;
  }
  function eraseEditorField(field) {
    if (!field) return;
    const selection = lastEditorField === field && lastEditorSelection
      ? lastEditorSelection
      : { start: field.selectionStart ?? field.value.length, end: field.selectionEnd ?? field.value.length };
    const start = Math.max(0, selection.start);
    const end = Math.max(start, selection.end);
    if (start === end && start > 0) field.setRangeText('', start - 1, end, 'end');
    else if (start !== end) field.setRangeText('', start, end, 'end');
    saveEditorDraft();
    renderEditorNav();
    rememberEditorField(field);
    field.focus();
  }
  function bindEditorBackspace(button, field) {
    button.addEventListener('pointerdown', () => rememberEditorField(field));
    button.addEventListener('click', () => eraseEditorField(field));
  }
  bindEditorBackspace($('.calc-editor-backspace'), $('.calc-editor-expression'));
  function makeEditorInput(fieldClass, accessibleName, value, fieldId) {
    const wrap = document.createElement('span');
    wrap.className = 'calc-editor-input-wrap';
    const field = document.createElement('input');
    field.className = fieldClass;
    field.id = fieldId;
    field.setAttribute('aria-label', accessibleName);
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.value = value;
    const backspaceButton = document.createElement('button');
    backspaceButton.type = 'button';
    backspaceButton.className = 'calc-editor-backspace';
    backspaceButton.setAttribute('aria-label', `Backspace ${accessibleName === 'x(t)' ? 'first' : 'second'} coordinate`);
    backspaceButton.title = `Delete the previous character in ${accessibleName}`;
    backspaceButton.textContent = '⌫';
    bindEditorBackspace(backspaceButton, field);
    wrap.append(field, backspaceButton);
    return { wrap, field };
  }
  function renderEditor() {
    renderEditorNav();
    const regularLabel = $('.calc-editor-expression-label');
    const fieldWrap = $('.calc-editor-function-fields');
    const regularInput = $('.calc-editor-expression');
    const emptyMessage = $('.calc-editor-empty');
    const colorPicker = $('.calc-color-picker');
    const functionKeypad = $('.calc-function-keypad');
    const applyButton = $('.calc-apply-functions');
    const coordinateSeparator = $('.calc-function-key[data-function-key=","]');
    if (coordinateSeparator) coordinateSeparator.hidden = graphMode !== 'parametric';
    const fn = editorDraft.find(item => item.id === activeFunctionId);
    if (!fn) {
      emptyMessage.hidden = false;
      regularLabel.hidden = true;
      fieldWrap.hidden = true;
      colorPicker.hidden = true;
      functionKeypad.hidden = true;
      applyButton.disabled = true;
      $('.calc-editor-error').textContent = '';
      rememberEditorField(null);
      return;
    }
    emptyMessage.hidden = true;
    colorPicker.hidden = false;
    functionKeypad.hidden = false;
    applyButton.disabled = false;
    if (graphMode === 'parametric') {
      regularLabel.hidden = true; fieldWrap.hidden = false; fieldWrap.replaceChildren();
      [['xExpression', 'x(t)'], ['yExpression', 'y(t)']].forEach(([key, label]) => {
        const fieldId = `${expressionId}-${label.replace(/[()]/g, '')}`;
        const fieldLabel = document.createElement('label'); fieldLabel.className = 'calc-editor-function-label'; fieldLabel.htmlFor = fieldId; fieldLabel.textContent = `${label[0]} =`;
        const { wrap } = makeEditorInput(key === 'xExpression' ? 'calc-editor-x' : 'calc-editor-y', label, fn[key], fieldId);
        const fieldRow = document.createElement('div'); fieldRow.className = 'calc-editor-function-field';
        fieldRow.append(fieldLabel, wrap); fieldWrap.append(fieldRow);
      });
      rememberEditorField($('.calc-editor-x'), true);
    } else {
      regularLabel.hidden = false; fieldWrap.hidden = true;
      $('.calc-editor-equation-label').textContent = graphMode === 'polar' ? 'r =' : 'y =';
      regularLabel.title = '';
      regularInput.title = graphMode === 'polar' ? 'theta' : '';
      regularInput.value = fn.expression;
      rememberEditorField(regularInput, true);
    }
    const colorOptions = $('.calc-color-options'); colorOptions.replaceChildren();
    NOTE_COLORS.forEach(({ value, label, hex }) => {
      const choice = document.createElement('label'); choice.className = 'note-color-choice'; choice.dataset.noteColor = value;
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = `${expressionId}-function-color-${fn.id}`; radio.value = hex; radio.checked = fn.color === hex; radio.setAttribute('aria-label', `${label} line color`);
      const swatch = document.createElement('span'); swatch.className = 'note-color-swatch'; swatch.setAttribute('aria-hidden', 'true');
      const accessibleName = document.createElement('span'); accessibleName.className = 'sr-only'; accessibleName.textContent = label;
      choice.append(radio, swatch, accessibleName); colorOptions.append(choice);
      radio.addEventListener('change', () => { if (radio.checked) fn.color = hex; });
    });
    $('.calc-editor-error').textContent = '';
  }
  function openEditor() {
    editorDraft = functions.map(fn => ({ ...fn }));
    if (!editorDraft.length) {
      const blank = makeFunction('');
      if (graphMode === 'parametric') {
        blank.xExpression = '';
        blank.yExpression = '';
      }
      editorDraft.push(blank);
    }
    activeFunctionId = editorDraft.some(fn => fn.id === activeFunctionId)
      ? activeFunctionId
      : editorDraft[0].id;
    renderEditor(); editorDialog.showModal();
    rememberEditorField(editorDraft.length
      ? graphMode === 'parametric' ? $('.calc-editor-x') : $('.calc-editor-expression')
      : null, true);
    (lastEditorField || $('.calc-new-function')).focus();
  }
  $('.calc-new-function').addEventListener('click', () => {
    saveEditorDraft();
    const fn = makeFunction('');
    if (graphMode === 'parametric') {
      fn.xExpression = '';
      fn.yExpression = '';
    }
    editorDraft.push(fn); activeFunctionId = fn.id; renderEditor();
    rememberEditorField(graphMode === 'parametric' ? $('.calc-editor-x') : $('.calc-editor-expression'), true);
    lastEditorField.focus();
  });
  $('.calc-apply-functions').addEventListener('click', () => {
    saveEditorDraft();
    const completedDraft = editorDraft.filter(fn => graphMode === 'parametric'
      ? fn.xExpression.trim() || fn.yExpression.trim()
      : fn.expression.trim());
    const bad = completedDraft.find(fn => {
      try {
        const valid = (expression, variable) => {
          let lastError;
          for (const probe of [0, 1, -1, 2, 0.5]) {
            try { evaluateExpression(expression, { [variable]: probe }); return; } catch (error) { lastError = error; }
          }
          throw lastError || new Error('Expression is invalid.');
        };
        if (graphMode === 'parametric') { valid(fn.xExpression, 't'); valid(fn.yExpression, 't'); }
        else valid(fn.expression, graphMode === 'polar' ? 'theta' : 'x');
        return false;
      } catch (error) { $('.calc-editor-error').textContent = `${fn.id}: ${error.message}`; return true; }
    });
    if (bad) return;
    functions = completedDraft.map(fn => ({ ...fn }));
    activeFunctionId = functions.some(fn => fn.id === activeFunctionId)
      ? activeFunctionId
      : functions[0]?.id ?? null;
    $('.calc-editor-error').textContent = ''; editorDialog.close(); renderFunctions(); plot(); persistGraphSettings();
  });
  function focusParametricY() {
    if (graphMode !== 'parametric') return;
    saveEditorDraft();
    const field = $('.calc-editor-y');
    if (!field) return;
    const end = field.value.length;
    field.focus();
    field.setSelectionRange(end, end);
    rememberEditorField(field);
  }
  GRAPH_KEYS.forEach(key => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'calc-function-key'; button.textContent = key;
    button.dataset.functionKey = key;
    if (key === 'Clear') button.setAttribute('aria-label', 'Clear expression');
    if (key === '⌫') button.setAttribute('aria-label', 'Delete previous character');
    if (key === ',') {
      button.setAttribute('aria-label', 'Move to y expression');
      button.title = 'Coordinate separator · move focus to y(t)';
      button.hidden = graphMode !== 'parametric';
    }
    if (GRAPH_KEY_TOOLTIPS[key]) {
      button.title = GRAPH_KEY_TOOLTIPS[key];
      const accessibleNames = { '√(': 'Square root', 'π': 'Pi', 'θ': 'Theta' };
      if (accessibleNames[key]) button.setAttribute('aria-label', accessibleNames[key]);
    }
    if (key === 'Clear') button.title = 'Clear expression · press Escape';
    if (key === '⌫') button.title = 'Delete previous character · press Backspace';
    button.addEventListener('click', () => {
      if (key === ',') {
        focusParametricY();
        return;
      }
      const fallback = graphMode === 'parametric' ? $('.calc-editor-x') : $('.calc-editor-expression');
      const field = lastEditorField?.isConnected && editorDialog.contains(lastEditorField) ? lastEditorField : fallback;
      if (!field) return;
      const selection = document.activeElement === field
        ? { start: field.selectionStart ?? field.value.length, end: field.selectionEnd ?? field.value.length }
        : lastEditorField === field && lastEditorSelection
          ? lastEditorSelection
          : { start: field.value.length, end: field.value.length };
      const { start, end } = selection;
      if (key === 'Clear') {
        field.value = '';
        field.setSelectionRange(0, 0);
      } else if (key === '⌫') {
        const from = start === end ? Math.max(0, start - 1) : start;
        field.setRangeText('', from, end, 'end');
      } else {
        const token = ({ '−': '-', '×': '*', '÷': '/' })[key] || key;
        field.setRangeText(token, start, end, 'end');
      }
      field.dispatchEvent(new Event('input', { bubbles: true }));
      rememberEditorField(field);
      field.focus();
    });
    $('.calc-function-keypad').append(button);
  });
  editorDialog.addEventListener('focusin', event => {
    if (event.target.matches('.calc-editor-expression,.calc-editor-x,.calc-editor-y')) rememberEditorField(event.target);
  });
  editorDialog.addEventListener('focusout', event => {
    if (event.target.matches('.calc-editor-expression,.calc-editor-x,.calc-editor-y')) rememberEditorField(event.target);
  });
  editorDialog.addEventListener('input', event => {
    if (!event.target.matches('.calc-editor-expression,.calc-editor-x,.calc-editor-y')) return;
    saveEditorDraft();
    renderEditorNav();
  });
  editorDialog.addEventListener('keydown', event => {
    if (event.key === ',' && graphMode === 'parametric' && event.target.matches('.calc-editor-x')) {
      event.preventDefault();
      focusParametricY();
      return;
    }
    if (event.key === 'Enter' && event.target.matches('.calc-editor-expression,.calc-editor-x,.calc-editor-y')) {
      event.preventDefault(); $('.calc-apply-functions').click();
    }
  });

  function getViewRanges() {
    if (!viewRanges) viewRanges = {};
    if (!viewRanges[graphMode]) {
      const keys = graphMode === 'cartesian' ? ['xMin', 'xMax', 'yMin', 'yMax']
        : graphMode === 'polar' ? ['thetaMin', 'thetaMax', 'rMin', 'rMax']
          : ['tMin', 'tMax', 'xMin', 'xMax', 'yMin', 'yMax'];
      viewRanges[graphMode] = Object.fromEntries(keys.map(key => [key, Number(ranges[key])]));
    }
    return viewRanges[graphMode];
  }
  function formatViewRanges(view) {
    return Object.entries(view).map(([key, value]) => `${key}: ${String(value)}`).join(', ');
  }
  function createGraphSetup() {
    return JSON.stringify({
      format: 'replit-calculator-graph-setup',
      version: 1,
      graphMode,
      display: graphDisplay,
      functions: functions.map(({ expression, xExpression, yExpression, color, visible }) => ({
        expression, xExpression, yExpression, color, visible,
      })),
      configuredRanges: Object.fromEntries(VIEW_RANGE_KEYS[graphMode].map(key => [key, ranges[key]])),
      currentViewRanges: { ...getViewRanges() },
    }, null, 2);
  }
  function parseGraphSetup(text) {
    try {
      const setup = JSON.parse(text);
      if (!setup || setup.format !== 'replit-calculator-graph-setup' || setup.version !== 1 ||
          !GRAPH_MODES.includes(setup.graphMode) || !Array.isArray(setup.functions) ||
          !setup.configuredRanges || typeof setup.configuredRanges !== 'object' || Array.isArray(setup.configuredRanges) ||
          !setup.currentViewRanges || typeof setup.currentViewRanges !== 'object' || Array.isArray(setup.currentViewRanges)) {
        return { status: 'invalid' };
      }

      const keys = VIEW_RANGE_KEYS[setup.graphMode];
      const configuredRanges = {};
      const currentViewRanges = {};
      for (const key of keys) {
        const configured = setup.configuredRanges[key];
        const current = setup.currentViewRanges[key];
        if (![configured, current].every(value =>
          (typeof value === 'string' || typeof value === 'number') &&
          String(value).trim() && Number.isFinite(Number(value)))) return { status: 'invalid' };
        configuredRanges[key] = String(configured);
        currentViewRanges[key] = Number(current);
      }
      const pairs = setup.graphMode === 'polar'
        ? [['thetaMin', 'thetaMax'], ['rMin', 'rMax']]
        : setup.graphMode === 'parametric'
          ? [['tMin', 'tMax'], ['xMin', 'xMax'], ['yMin', 'yMax']]
          : [['xMin', 'xMax'], ['yMin', 'yMax']];
      if (pairs.some(([min, max]) =>
        !validRangePair(configuredRanges[min], configuredRanges[max]) ||
        !validRangePair(currentViewRanges[min], currentViewRanges[max]))) return { status: 'invalid' };

      const functionsForValidation = setup.functions.map((fn, index) => ({
        id: `fn-${index + 1}`,
        expression: fn?.expression,
        xExpression: fn?.xExpression,
        yExpression: fn?.yExpression,
        color: fn?.color,
        visible: fn?.visible,
      }));
      const allRanges = { ...DEFAULT_GRAPH_RANGES, ...configuredRanges };
      const validated = readSavedGraphSettings(JSON.stringify({
        version: GRAPH_SETTINGS_VERSION,
        graphMode: setup.graphMode,
        ranges: allRanges,
        display: setup.display,
        functionsByMode: Object.fromEntries(GRAPH_MODES.map(mode => [mode, mode === setup.graphMode ? functionsForValidation : []])),
        viewRanges: { [setup.graphMode]: currentViewRanges },
      }));
      return validated.status === 'valid' ? validated : { status: 'invalid' };
    } catch {
      return { status: 'invalid' };
    }
  }
  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {}
    }
    const fallback = document.createElement('textarea');
    fallback.value = text;
    fallback.setAttribute('readonly', '');
    fallback.setAttribute('aria-hidden', 'true');
    fallback.tabIndex = -1;
    fallback.style.position = 'fixed';
    fallback.style.opacity = '0';
    document.body.append(fallback);
    fallback.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch {}
    fallback.remove();
    return copied;
  }
  copyViewRangesButton.addEventListener('click', async () => {
    const returnFocus = setupMenu.contains(document.activeElement);
    const current = getPlotRanges();
    const rangeText = current.valid
      ? formatViewRanges(formatDisplayedRanges(current, getViewRanges()))
      : formatViewRanges(getViewRanges());
    viewRangeValues.value = rangeText;
    const copied = await copyText(rangeText);
    copyViewRangesStatus.textContent = copied
      ? 'Current graph ranges copied.'
      : 'Could not copy the ranges. Select the values and copy them manually.';
    if (!copied) {
      infoMenu.hidden = false;
      infoMenuTrigger.setAttribute('aria-expanded', 'true');
      viewRangeValues.hidden = false;
      viewRangeValues.focus();
      viewRangeValues.select();
    } else if (returnFocus) setupMenuTrigger.focus();
  });
  function openRestoreSetup(initialText = '') {
    setupInput.value = initialText;
    restoreDraft = null;
    applySetupButton.hidden = true;
    setupPreview.hidden = true;
    setupPreview.textContent = '';
    setupSummary.textContent = 'Review the setup before applying it. Your current graph will stay unchanged until you apply.';
    restoreDialog.showModal();
    setupInput.focus();
    if (initialText) setupInput.select();
  }
  copySetupButton.addEventListener('click', async () => {
    const returnFocus = setupMenu.contains(document.activeElement);
    const setup = createGraphSetup();
    const copied = await copyText(setup);
    copySetupStatus.textContent = copied
      ? 'Complete graph setup copied.'
      : 'Could not copy the setup. The snippet is open for manual copying.';
    if (!copied) openRestoreSetup(setup);
    else if (returnFocus) setupMenuTrigger.focus();
  });
  $('.calc-open-restore').addEventListener('click', () => openRestoreSetup());
  setupInput.addEventListener('input', () => {
    restoreDraft = null;
    applySetupButton.hidden = true;
    setupSummary.textContent = '';
    setupPreview.hidden = true;
    setupPreview.textContent = '';
  });
  $('.calc-review-setup').addEventListener('click', () => {
    restoreDraft = parseGraphSetup(setupInput.value);
    if (restoreDraft.status !== 'valid') {
      restoreDraft = null;
      applySetupButton.hidden = true;
      setupPreview.hidden = true;
      setupPreview.textContent = '';
      setupSummary.textContent = 'This setup is not valid. Check that you pasted a complete graph setup snippet.';
      return;
    }
    const count = restoreDraft.functions.length;
    setupSummary.textContent = `Ready to restore ${restoreDraft.graphMode} setup with ${count} ${count === 1 ? 'function' : 'functions'}. Configured ranges and the current view will be restored. Applying replaces the active graph.`;
    const functionLines = restoreDraft.functions.map((fn, index) => restoreDraft.graphMode === 'parametric'
      ? `${index + 1}. x(t) = ${fn.xExpression}; y(t) = ${fn.yExpression}`
      : `${index + 1}. ${restoreDraft.graphMode === 'polar' ? 'r(θ)' : 'y'} = ${fn.expression}`);
    setupPreview.textContent = [
      `Mode: ${restoreDraft.graphMode}`,
      'Functions:',
      ...functionLines,
      `Configured ranges: ${formatViewRanges(Object.fromEntries(VIEW_RANGE_KEYS[restoreDraft.graphMode].map(key => [key, restoreDraft.ranges[key]])))}`,
      `Current view: ${formatViewRanges(restoreDraft.viewRanges[restoreDraft.graphMode])}`,
    ].join('\n');
    setupPreview.hidden = false;
    applySetupButton.hidden = false;
  });
  applySetupButton.addEventListener('click', () => {
    if (!restoreDraft) return;
    activateGraphMode(restoreDraft.graphMode);
    settingsMode = graphMode;
    ranges = restoreDraft.ranges;
    viewRanges = restoreDraft.viewRanges;
    graphDisplay = restoreDraft.display;
    functions = restoreDraft.functions.map(fn => ({
      ...fn,
      id: `fn-${nextFunctionId++}`,
      path: '',
    }));
    functionsByMode[graphMode] = functions;
    activeFunctionId = functions[0]?.id ?? null;
    $('.calc-mode-label').textContent = graphMode.toUpperCase();
    renderFunctions();
    restoreDialog.close();
    plot();
    persistGraphSettings();
    graphStatus.textContent = `Restored ${graphMode} graph setup with ${functions.length} ${functions.length === 1 ? 'function' : 'functions'}.`;
  });
  function resetView() {
    if (viewRanges) delete viewRanges[graphMode];
    viewRatio = 'auto';
    viewScaleFactor = 1;
    logAxes = { x: false, y: false };
    $('.calc-custom-ratio').hidden = true;
    $('.calc-custom-scale').hidden = true;
    viewError.textContent = '';
    updateViewOptions();
    plot(); persistGraphSettings();
  }
  const axisCoordinate = (value, axis) => logAxes[axis] ? Math.log10(value) : value;
  const axisValue = (coordinate, axis) => logAxes[axis] ? 10 ** coordinate : coordinate;
  function getAxisCoordinateBounds(view, minKey, maxKey, axis) {
    let min = Number(view[minKey]);
    let max = Number(view[maxKey]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return null;
    if (logAxes[axis]) {
      if (max <= 0) return null;
      if (min <= 0) min = Math.max(max / 1000, Number.MIN_VALUE);
    }
    const minCoordinate = axisCoordinate(min, axis);
    const maxCoordinate = axisCoordinate(max, axis);
    return Number.isFinite(minCoordinate) && Number.isFinite(maxCoordinate) && minCoordinate < maxCoordinate
      ? { min: minCoordinate, max: maxCoordinate }
      : null;
  }
  function getPlotRanges() {
    const view = getViewRanges();
    const rect = plotArea.getBoundingClientRect();
    const scaleX = rect.width > 0 ? rect.width / 640 : 1;
    const scaleY = rect.height > 0 ? rect.height / 400 : 1;
    const pixelRatio = (PLOT_FRAME.width * scaleX) / (PLOT_FRAME.height * scaleY);
    if (graphMode === 'polar') {
      const thetaMin = Number(view.thetaMin);
      const thetaMax = Number(view.thetaMax);
      const radiusMin = Number(view.rMin);
      const radiusMax = Number(view.rMax);
      if (![thetaMin, thetaMax, radiusMin, radiusMax].every(Number.isFinite) || thetaMin >= thetaMax || radiusMin >= radiusMax) {
        return { valid: false, reason: 'Graph ranges are invalid.' };
      }
      return {
        valid: true,
        xMinCoord: thetaMin,
        xMaxCoord: thetaMax,
        yMinCoord: radiusMin,
        yMaxCoord: radiusMin + (radiusMax - radiusMin) / viewScaleFactor,
        xMin: thetaMin,
        xMax: thetaMax,
        yMin: radiusMin,
        yMax: radiusMin + (radiusMax - radiusMin) / viewScaleFactor,
        pixelScaleX: scaleX,
        pixelScaleY: scaleY,
        radiusX: Math.min(PLOT_FRAME.width * scaleX, PLOT_FRAME.height * scaleY) / 2 / scaleX,
        radiusY: Math.min(PLOT_FRAME.width * scaleX, PLOT_FRAME.height * scaleY) / 2 / scaleY,
      };
    }
    const xKeys = ['xMin', 'xMax'];
    const yKeys = ['yMin', 'yMax'];
    const xBounds = getAxisCoordinateBounds(view, xKeys[0], xKeys[1], 'x');
    const yBounds = getAxisCoordinateBounds(view, yKeys[0], yKeys[1], 'y');
    if (!xBounds || !yBounds) {
      const invalidAxis = logAxes.x && !xBounds ? 'X' : 'Y';
      return { valid: false, reason: `Logarithmic ${invalidAxis} needs a positive maximum range.` };
    }

    const xCenter = (xBounds.min + xBounds.max) / 2;
    const yCenter = (yBounds.min + yBounds.max) / 2;
    let xSpan = (xBounds.max - xBounds.min) / viewScaleFactor;
    let ySpan = (yBounds.max - yBounds.min) / viewScaleFactor;
    let xMinCoord = xCenter - xSpan / 2;
    let xMaxCoord = xCenter + xSpan / 2;
    let yMinCoord = yCenter - ySpan / 2;
    let yMaxCoord = yCenter + ySpan / 2;

    if (viewRatio !== 'auto') {
      const [ratioX, ratioY] = viewRatio === 'custom'
        ? [customRatioX, customRatioY]
        : viewRatio.split(':').map(Number);
      const targetXSpan = pixelRatio * ratioY / ratioX * ySpan;
      if (xSpan < targetXSpan) {
        xSpan = targetXSpan;
        xMinCoord = xCenter - xSpan / 2;
        xMaxCoord = xCenter + xSpan / 2;
      } else {
        const targetYSpan = xSpan * ratioX / (pixelRatio * ratioY);
        if (ySpan < targetYSpan) {
          ySpan = targetYSpan;
          yMinCoord = yCenter - ySpan / 2;
          yMaxCoord = yCenter + ySpan / 2;
        }
      }
    }

    const xMin = axisValue(xMinCoord, 'x');
    const xMax = axisValue(xMaxCoord, 'x');
    const yMin = axisValue(yMinCoord, 'y');
    const yMax = axisValue(yMaxCoord, 'y');
    if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) return { valid: false, reason: 'The selected graph scale exceeds the supported range.' };
    return { valid: true, xMinCoord, xMaxCoord, yMinCoord, yMaxCoord, xMin, xMax, yMin, yMax };
  }
  function formatDisplayedRanges(plotView, rawView = getViewRanges()) {
    if (graphMode === 'polar') return {
      thetaMin: plotView.xMin,
      thetaMax: plotView.xMax,
      rMin: plotView.yMin,
      rMax: plotView.yMax,
    };
    return graphMode === 'cartesian'
      ? { xMin: plotView.xMin, xMax: plotView.xMax, yMin: plotView.yMin, yMax: plotView.yMax }
      : { tMin: rawView.tMin, tMax: rawView.tMax, xMin: plotView.xMin, xMax: plotView.xMax, yMin: plotView.yMin, yMax: plotView.yMax };
  }
  function storePlotRanges(plotView) {
    const current = { ...getViewRanges() };
    if (graphMode === 'polar') {
      current.thetaMin = plotView.xMinCoord;
      current.thetaMax = plotView.xMaxCoord;
      current.rMin = plotView.yMinCoord;
      current.rMax = plotView.yMinCoord + (plotView.yMaxCoord - plotView.yMinCoord) * viewScaleFactor;
    } else {
      const xCenter = (plotView.xMinCoord + plotView.xMaxCoord) / 2;
      const yCenter = (plotView.yMinCoord + plotView.yMaxCoord) / 2;
      const xSpan = (plotView.xMaxCoord - plotView.xMinCoord) * viewScaleFactor;
      const ySpan = (plotView.yMaxCoord - plotView.yMinCoord) * viewScaleFactor;
      current.xMin = axisValue(xCenter - xSpan / 2, 'x');
      current.xMax = axisValue(xCenter + xSpan / 2, 'x');
      current.yMin = axisValue(yCenter - ySpan / 2, 'y');
      current.yMax = axisValue(yCenter + ySpan / 2, 'y');
    }
    if (!viewRanges) viewRanges = {};
    viewRanges[graphMode] = current;
  }
  function changeView({ scale = 1, anchorX, anchorY = 200, panX = 0, panY = 0 } = {}) {
    const current = getPlotRanges();
    if (!current.valid) return;
    const pointX = Number.isFinite(anchorX) ? anchorX : PLOT_FRAME.centerX;
    const xSpan = current.xMaxCoord - current.xMinCoord;
    const ySpan = current.yMaxCoord - current.yMinCoord;
    const px = Math.max(0, Math.min(1, (pointX - PLOT_FRAME.left) / PLOT_FRAME.width));
    const py = Math.max(0, Math.min(1, (anchorY - PLOT_FRAME.top) / PLOT_FRAME.height));
    const shiftedX = current.xMinCoord - panX / PLOT_FRAME.width * xSpan;
    const shiftedY = current.yMinCoord + panY / PLOT_FRAME.height * ySpan;
    const boundedScale = Number.isFinite(scale) ? Math.max(1e-9, Math.min(1e9, scale)) : 1;
    const nextXSpan = Math.max(1e-9, Math.min(1e9, xSpan * boundedScale));
    const nextYSpan = Math.max(1e-9, Math.min(1e9, ySpan * boundedScale));
    const xAnchor = shiftedX + px * xSpan;
    const yAnchor = shiftedY + (1 - py) * ySpan;
    const next = {
      xMinCoord: xAnchor - px * nextXSpan,
      xMaxCoord: xAnchor + (1 - px) * nextXSpan,
      yMinCoord: yAnchor - (1 - py) * nextYSpan,
      yMaxCoord: yAnchor + py * nextYSpan,
    };
    if (Object.values(next).every(Number.isFinite)) {
      const nextPlotView = {
        ...next,
        xMin: axisValue(next.xMinCoord, 'x'),
        xMax: axisValue(next.xMaxCoord, 'x'),
        yMin: axisValue(next.yMinCoord, 'y'),
        yMax: axisValue(next.yMaxCoord, 'y'),
      };
      storePlotRanges(nextPlotView);
      plot(false);
    }
  }
  const zoomView = (scale, point = { x: PLOT_FRAME.centerX, y: PLOT_FRAME.centerY }) => changeView({ scale, anchorX: point.x, anchorY: point.y });
  function eventPoint(event) {
    const rect = plotArea.getBoundingClientRect();
    const matrix = plotArea.getScreenCTM?.();
    let x = 640 * (event.clientX - rect.left) / rect.width;
    let y = 400 * (event.clientY - rect.top) / rect.height;
    if (matrix && plotArea.createSVGPoint) {
      try {
        const screenPoint = plotArea.createSVGPoint();
        screenPoint.x = event.clientX;
        screenPoint.y = event.clientY;
        const svgPoint = screenPoint.matrixTransform(matrix.inverse());
        x = svgPoint.x;
        y = svgPoint.y;
      } catch {}
    }
    return { x, y };
  }
  function niceStep(span, targetCount = 7) {
    const raw = span / targetCount;
    const power = 10 ** Math.floor(Math.log10(raw));
    const fraction = raw / power;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  }
  function fitBounds(values) {
    if (!values.length) return null;
    let min = Math.min(...values), max = Math.max(...values);
    const span = max - min;
    const padding = span > 0 ? span * 0.08 : Math.max(Math.abs(max) * 0.1, 1);
    min -= padding;
    max += padding;
    const step = niceStep(max - min, 8);
    const lower = Math.floor(min / step) * step;
    const upper = Math.ceil(max / step) * step;
    return Number.isFinite(lower) && Number.isFinite(upper) && lower < upper ? [lower, upper] : null;
  }
  function fitView() {
    // Fit more finely than the rendered path so narrow features between plot
    // samples still contribute to the fitted bounds.
    const sampleCount = 8000;
    const visible = functions.filter(fn => fn.visible);
    if (!visible.length) {
      graphStatus.textContent = 'Show at least one function before fitting the view.';
      return;
    }

    const xValues = [], yValues = [], angleValues = [], radiusValues = [];
    const sourceMin = graphMode === 'cartesian' ? Number(ranges.xMin)
      : graphMode === 'polar' ? Number(ranges.thetaMin) : Number(ranges.tMin);
    const sourceMax = graphMode === 'cartesian' ? Number(ranges.xMax)
      : graphMode === 'polar' ? Number(ranges.thetaMax) : Number(ranges.tMax);
    if (!Number.isFinite(sourceMin) || !Number.isFinite(sourceMax) || sourceMin >= sourceMax) {
      graphStatus.textContent = 'Graph ranges are invalid. Open Graph settings to correct them.';
      return;
    }

    visible.forEach(fn => {
      for (let index = 0; index <= sampleCount; index++) {
        const parameter = sourceMin + (sourceMax - sourceMin) * index / sampleCount;
        try {
          if (graphMode === 'cartesian') {
            const y = evaluateExpression(fn.expression, { x: parameter });
            if (Number.isFinite(y) && Math.abs(y) <= 1e7) yValues.push(y);
          } else if (graphMode === 'polar') {
            const radius = evaluateExpression(fn.expression, { theta: parameter });
            if (Number.isFinite(radius) && Math.abs(radius) <= 1e7) {
              angleValues.push(parameter);
              radiusValues.push(radius);
            }
          } else {
            const x = evaluateExpression(fn.xExpression, { t: parameter });
            const y = evaluateExpression(fn.yExpression, { t: parameter });
            if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 1e7 && Math.abs(y) <= 1e7) {
              xValues.push(x);
              yValues.push(y);
            }
          }
        } catch {}
      }
    });

    const view = Object.fromEntries(VIEW_RANGE_KEYS[graphMode].map(key => [
      key, Number(ranges[key]),
    ]));
    if (graphMode === 'cartesian') {
      const yBounds = fitBounds(yValues);
      if (!yBounds) {
        graphStatus.textContent = 'No visible function has a valid curve to fit.';
        return;
      }
      [view.yMin, view.yMax] = yBounds;
      view.xMin = Number(ranges.xMin);
      view.xMax = Number(ranges.xMax);
    } else if (graphMode === 'polar') {
      const radiusBounds = fitBounds(radiusValues.map(radius => Math.abs(radius)));
      if (!radiusBounds || !angleValues.length) {
        graphStatus.textContent = 'No visible function has a valid curve to fit.';
        return;
      }
      view.thetaMin = Math.min(...angleValues);
      view.thetaMax = Math.max(...angleValues);
      if (view.thetaMin >= view.thetaMax) {
        graphStatus.textContent = 'The visible polar curves do not span a fit-able angular range.';
        return;
      }
      view.rMin = 0;
      view.rMax = Math.max(radiusBounds[1], 1);
    } else {
      const xBounds = fitBounds(xValues), yBounds = fitBounds(yValues);
      if (!xBounds || !yBounds) {
        graphStatus.textContent = 'No visible function has a valid curve to fit.';
        return;
      }
      [view.xMin, view.xMax] = xBounds;
      [view.yMin, view.yMax] = yBounds;
      view.tMin = Number(ranges.tMin);
      view.tMax = Number(ranges.tMax);
    }

    if (!viewRanges) viewRanges = {};
    viewRanges[graphMode] = view;
    viewScaleFactor = 1;
    updateViewOptions();
    plot(false);
    persistGraphSettings();
    graphStatus.textContent = `Fitted the view to ${visible.length} visible ${visible.length === 1 ? 'curve' : 'curves'} in ${graphMode} mode.`;
  }
  function formatTick(number) {
    const clean = Math.abs(number) < 1e-12 ? 0 : number;
    return Math.abs(clean) >= 10000 || (clean !== 0 && Math.abs(clean) < 0.001)
      ? clean.toExponential(1).replace(/\.0e/, 'e')
      : String(Number(clean.toPrecision(5)));
  }
  function renderGraphInformation(displayedView) {
    const axes = graphMode === 'polar'
      ? [['Angle (θ)', 'thetaMin', 'thetaMax'], ['Radius (r)', 'rMin', 'rMax']]
      : graphMode === 'parametric'
        ? [['Parameter (t)', 'tMin', 'tMax'], ['X axis', 'xMin', 'xMax'], ['Y axis', 'yMin', 'yMax']]
        : [['X axis', 'xMin', 'xMax'], ['Y axis', 'yMin', 'yMax']];
    infoRanges.replaceChildren();
    axes.forEach(([label, minKey, maxKey]) => {
      const row = document.createElement('div');
      row.className = 'calc-info-range';
      row.dataset.axis = minKey;
      const term = document.createElement('dt');
      term.textContent = label;
      const value = document.createElement('dd');
      value.textContent = `${formatTick(displayedView[minKey])} – ${formatTick(displayedView[maxKey])}`;
      row.append(term, value);
      infoRanges.append(row);
    });
    $('.calc-info-mode').textContent = graphMode[0].toUpperCase() + graphMode.slice(1);
    $('.calc-info-ratio').textContent = graphMode === 'polar' ? '1:1'
      : viewRatio === 'auto' ? 'Auto'
        : viewRatio === 'custom' ? `${customRatioX}:${customRatioY}` : viewRatio;
    $('.calc-info-scale').textContent = `${formatTick(viewScaleFactor)}×`;
    const activeLogs = ['x', 'y'].filter(axis => logAxes[axis]).map(axis => axis.toUpperCase());
    $('.calc-info-log').textContent = activeLogs.length ? activeLogs.join(' and ') : 'Off';
  }
  function addSvgText(ns, text, x, y, anchor = 'middle', target = plotArea) {
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('class', 'calc-graph-label');
    label.setAttribute('x', x); label.setAttribute('y', y);
    label.setAttribute('text-anchor', anchor);
    label.textContent = text;
    target.append(label);
    return label;
  }
  function plot(announce = true) {
    const ns = 'http://www.w3.org/2000/svg';
    plotArea.setAttribute('preserveAspectRatio', 'none');
    plotArea.dataset.scaleFactor = String(viewScaleFactor);
    const view = getViewRanges();
    const plotView = getPlotRanges();
    if (!plotView.valid) {
      viewError.textContent = plotView.reason;
      if (announce) graphStatus.textContent = plotView.reason;
      return;
    }
    viewError.textContent = '';
    const displayedView = formatDisplayedRanges(plotView, view);
    viewRangeValues.value = formatViewRanges(displayedView);
    renderGraphInformation(displayedView);
    plotArea.dataset.gridStyle = graphDisplay.gridStyle;
    plotArea.dataset.renderedView = JSON.stringify(displayedView);
    plotArea.dataset.viewRatio = graphMode === 'polar' ? '1:1'
      : viewRatio === 'custom' ? `${customRatioX}:${customRatioY}` : viewRatio;
    const limits = graphMode === 'cartesian'
      ? { a: plotView.xMin, b: plotView.xMax, y0: plotView.yMin, y1: plotView.yMax, variable: 'x' }
      : graphMode === 'polar'
        ? { a: view.thetaMin, b: view.thetaMax, y0: plotView.yMin, y1: plotView.yMax, variable: 'theta' }
        : { a: view.tMin, b: view.tMax, x0: plotView.xMin, x1: plotView.xMax, y0: plotView.yMin, y1: plotView.yMax, variable: 't' };
    const invalidRange = [limits.a, limits.b, limits.y0, limits.y1, ...(graphMode === 'parametric' ? [limits.x0, limits.x1] : [])].some(n => !Number.isFinite(n)) ||
      limits.a >= limits.b || limits.y0 >= limits.y1 || (graphMode === 'parametric' && limits.x0 >= limits.x1);
    if (invalidRange) { if (announce) graphStatus.textContent = 'Graph ranges are invalid. Open Graph settings to correct them.'; return; }
    const xCoordinateMin = graphMode === 'polar' ? plotView.xMinCoord : plotView.xMinCoord;
    const xCoordinateMax = graphMode === 'polar' ? plotView.xMaxCoord : plotView.xMaxCoord;
    const yCoordinateMin = plotView.yMinCoord;
    const yCoordinateMax = plotView.yMaxCoord;
    const xMap = x => PLOT_FRAME.left + (axisCoordinate(x, 'x') - xCoordinateMin) / (xCoordinateMax - xCoordinateMin) * PLOT_FRAME.width;
    const yMap = y => PLOT_FRAME.bottom - (axisCoordinate(y, 'y') - yCoordinateMin) / (yCoordinateMax - yCoordinateMin) * PLOT_FRAME.height;
    plotArea.dataset.view = JSON.stringify(view);
    plotArea.setAttribute('aria-valuetext', graphMode === 'polar'
      ? `theta ${formatTick(limits.a)} to ${formatTick(limits.b)}, radius ${formatTick(limits.y0)} to ${formatTick(limits.y1)}`
      : `x ${formatTick(plotView.xMin)} to ${formatTick(plotView.xMax)}, y ${formatTick(limits.y0)} to ${formatTick(limits.y1)}`);
    const makeTicks = (min, max, axis) => {
      if (logAxes[axis]) {
        const ticks = [];
        for (let exponent = Math.ceil(min); exponent <= max + 1e-9 && ticks.length < 100; exponent++) {
          ticks.push({ coordinate: exponent, value: 10 ** exponent });
        }
        return ticks;
      }
      const step = niceStep(max - min, GRAPH_GRID_TARGETS[graphDisplay.gridSpacing]);
      const ticks = [];
      for (let value = Math.ceil(min / step) * step, count = 0; value <= max + step * 1e-8 && count < 100; value += step, count++) {
        ticks.push({ coordinate: value, value });
      }
      return ticks;
    };
    const paths = [];
    let plotError = '';
    const count = 500;
    functions.forEach(fn => {
      if (!fn.visible) return;
      let d = '', drawing = false, failed = null;
      const validate = (expression, variable) => {
        let lastError;
        for (const probe of [0, 1, -1, 2, 0.5]) {
          try { evaluateExpression(expression, { [variable]: probe }); return; } catch (error) { lastError = error; }
        }
        throw lastError || new Error('Expression is invalid.');
      };
      try {
        if (graphMode === 'parametric') { validate(fn.xExpression, 't'); validate(fn.yExpression, 't'); }
        else validate(fn.expression, graphMode === 'polar' ? 'theta' : 'x');
      } catch (error) { plotError = `Cannot plot ${fn.id}: ${error.message} Previous valid plots are preserved.`; return; }
      try {
        for (let i = 0; i <= count; i++) {
          const qCoordinate = graphMode === 'cartesian' && logAxes.x
            ? plotView.xMinCoord + (plotView.xMaxCoord - plotView.xMinCoord) * i / count
            : null;
          const q = graphMode === 'cartesian' && logAxes.x
            ? axisValue(qCoordinate, 'x')
            : limits.a + (limits.b - limits.a) * i / count;
          let x, y, r;
          try {
            if (graphMode === 'cartesian') { x = q; y = evaluateExpression(fn.expression, { x: q }); }
            else if (graphMode === 'polar') r = evaluateExpression(fn.expression, { theta: q });
            else { x = evaluateExpression(fn.xExpression, { t: q }); y = evaluateExpression(fn.yExpression, { t: q }); }
          } catch (error) { drawing = false; continue; }
          if (graphMode === 'polar') {
            if (!Number.isFinite(r) || Math.abs(r) > 1e7) { drawing = false; continue; }
            const radial = (r - limits.y0) / (limits.y1 - limits.y0);
            const px = PLOT_FRAME.centerX + radial * plotView.radiusX * Math.cos(q);
            const py = PLOT_FRAME.centerY - radial * plotView.radiusY * Math.sin(q);
            d += `${drawing ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)} `; drawing = true; continue;
          }
          if (!Number.isFinite(x) || !Number.isFinite(y) || (logAxes.x && x <= 0) || (logAxes.y && y <= 0) || Math.abs(x) > 1e7 || Math.abs(y) > 1e7) { drawing = false; continue; }
          const px = xMap(x), py = yMap(y);
          if (!Number.isFinite(px) || !Number.isFinite(py) || py < -1000 || py > 1400 || px < -1000 || px > 1600) { drawing = false; continue; }
          d += `${drawing ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)} `; drawing = true;
        }
      } catch (error) { failed = error; }
      if (failed) { plotError = `Cannot plot ${fn.id}: ${failed.message} Previous valid plots are preserved.`; return; }
      if (d) { fn.path = d; paths.push(fn); }
    });
    if (plotError) { if (announce) graphStatus.textContent = plotError; return; }
    plotArea.replaceChildren();
    const plotLayer = document.createElementNS(ns, 'g');
    plotArea.append(plotLayer);
    if (graphMode === 'polar') {
      const gridEnabled = graphDisplay.gridStyle !== 'none';
      const targetCount = GRAPH_GRID_TARGETS[graphDisplay.gridSpacing];
      const radialStep = niceStep(limits.y1 - limits.y0, targetCount);
      for (let tick = Math.ceil(limits.y0 / radialStep) * radialStep, count = 0; tick <= limits.y1 + radialStep * 1e-8 && count < 80; tick += radialStep, count++) {
        const fraction = (tick - limits.y0) / (limits.y1 - limits.y0);
        if (fraction < 0 || fraction > 1) continue;
        if (gridEnabled) {
          const ellipse = document.createElementNS(ns, 'ellipse');
          ellipse.setAttribute('class', 'calc-graph-grid');
          ellipse.setAttribute('cx', PLOT_FRAME.centerX); ellipse.setAttribute('cy', PLOT_FRAME.centerY);
          ellipse.setAttribute('rx', plotView.radiusX * fraction); ellipse.setAttribute('ry', plotView.radiusY * fraction);
          plotLayer.append(ellipse);
        }
        if (graphDisplay.axisLabels) {
          const radialLabel = addSvgText(ns, formatTick(tick),
            PLOT_FRAME.centerX + plotView.radiusX * fraction + 4, PLOT_FRAME.centerY + 14, 'start', plotLayer);
          radialLabel.classList.add('calc-graph-radial-label');
        }
      }
      if (gridEnabled) {
        const thetaStep = niceStep(limits.b - limits.a, Math.max(3, Math.round(targetCount * 1.15)));
        const spoke = document.createElementNS(ns, 'path');
        spoke.setAttribute('class', 'calc-graph-grid');
        let spokePath = '';
        for (let angle = Math.ceil(limits.a / thetaStep) * thetaStep, count = 0; angle <= limits.b + thetaStep * 1e-8 && count < 80; angle += thetaStep, count++) {
          const x = PLOT_FRAME.centerX + plotView.radiusX * Math.cos(angle);
          const y = PLOT_FRAME.centerY - plotView.radiusY * Math.sin(angle);
          spokePath += `M${PLOT_FRAME.centerX} ${PLOT_FRAME.centerY}L${x.toFixed(2)} ${y.toFixed(2)} `;
        }
        spoke.setAttribute('d', spokePath); plotLayer.append(spoke);
      }
      if (graphDisplay.xAxisLine) {
        const xAxis = document.createElementNS(ns, 'path');
        xAxis.setAttribute('class', 'calc-graph-axis calc-graph-axis-x');
        xAxis.setAttribute('d', `M${PLOT_FRAME.centerX - plotView.radiusX} ${PLOT_FRAME.centerY}H${PLOT_FRAME.centerX + plotView.radiusX}`);
        plotLayer.append(xAxis);
      }
      if (graphDisplay.yAxisLine) {
        const yAxis = document.createElementNS(ns, 'path');
        yAxis.setAttribute('class', 'calc-graph-axis calc-graph-axis-y');
        yAxis.setAttribute('d', `M${PLOT_FRAME.centerX} ${PLOT_FRAME.centerY - plotView.radiusY}V${PLOT_FRAME.centerY + plotView.radiusY}`);
        plotLayer.append(yAxis);
      }
      if (graphDisplay.axisLabels) {
        const thetaLabel = addSvgText(ns, 'θ', PLOT_FRAME.centerX + plotView.radiusX + 5, PLOT_FRAME.centerY - 4, 'start', plotLayer);
        thetaLabel.classList.add('calc-graph-axis-name-theta');
        addSvgText(ns, 'r', PLOT_FRAME.centerX + 4, PLOT_FRAME.centerY - plotView.radiusY - 5, 'start', plotLayer);
      }
    } else {
      const xTicks = makeTicks(plotView.xMinCoord, plotView.xMaxCoord, 'x');
      const yTicks = makeTicks(plotView.yMinCoord, plotView.yMaxCoord, 'y');
      if (graphDisplay.gridStyle !== 'none') {
        const grid = document.createElementNS(ns, 'path');
        grid.setAttribute('class', 'calc-graph-grid');
        let gridPath = `M${PLOT_FRAME.left} ${PLOT_FRAME.top}H${PLOT_FRAME.right}V${PLOT_FRAME.bottom}H${PLOT_FRAME.left}Z `;
        for (const tick of xTicks) {
          const px = PLOT_FRAME.left + (tick.coordinate - plotView.xMinCoord) / (plotView.xMaxCoord - plotView.xMinCoord) * PLOT_FRAME.width;
          gridPath += `M${px.toFixed(2)} ${PLOT_FRAME.top}V${PLOT_FRAME.bottom} `;
        }
        for (const tick of yTicks) {
          const py = PLOT_FRAME.bottom - (tick.coordinate - plotView.yMinCoord) / (plotView.yMaxCoord - plotView.yMinCoord) * PLOT_FRAME.height;
          gridPath += `M${PLOT_FRAME.left} ${py.toFixed(2)}H${PLOT_FRAME.right} `;
        }
        grid.setAttribute('d', gridPath); plotLayer.prepend(grid);
      }
      if (graphDisplay.axisLabels) {
        for (const tick of xTicks) {
          const px = PLOT_FRAME.left + (tick.coordinate - plotView.xMinCoord) / (plotView.xMaxCoord - plotView.xMinCoord) * PLOT_FRAME.width;
          addSvgText(ns, formatTick(tick.value), px, 390, 'middle', plotLayer);
        }
        for (const tick of yTicks) {
          const py = PLOT_FRAME.bottom - (tick.coordinate - plotView.yMinCoord) / (plotView.yMaxCoord - plotView.yMinCoord) * PLOT_FRAME.height;
          addSvgText(ns, formatTick(tick.value), PLOT_FRAME.left - 5, py + 4, 'end', plotLayer);
        }
      }
      const zeroX = !logAxes.x && plotView.xMin <= 0 && plotView.xMax >= 0 ? xMap(0) : null;
      const zeroY = !logAxes.y && limits.y0 <= 0 && limits.y1 >= 0 ? yMap(0) : null;
      if (graphDisplay.xAxisLine && zeroY !== null) {
        const xAxis = document.createElementNS(ns, 'path');
        xAxis.setAttribute('class', 'calc-graph-axis calc-graph-axis-x');
        xAxis.setAttribute('d', `M${PLOT_FRAME.left} ${zeroY}H${PLOT_FRAME.right}`);
        plotLayer.append(xAxis);
      }
      if (graphDisplay.yAxisLine && zeroX !== null) {
        const yAxis = document.createElementNS(ns, 'path');
        yAxis.setAttribute('class', 'calc-graph-axis calc-graph-axis-y');
        yAxis.setAttribute('d', `M${zeroX} ${PLOT_FRAME.top}V${PLOT_FRAME.bottom}`);
        plotLayer.append(yAxis);
      }
      if (graphDisplay.axisLabels) {
        const xLabelY = zeroY !== null && zeroY > PLOT_FRAME.top + 18
          ? zeroY - 8 : PLOT_FRAME.top + 12;
        const yLabelX = zeroX !== null && zeroX < PLOT_FRAME.right - 20
          ? zeroX + 8 : PLOT_FRAME.right - 8;
        const xLabel = addSvgText(ns, 'x', PLOT_FRAME.right - 5, xLabelY, 'end', plotLayer);
        xLabel.classList.add('calc-graph-axis-name', 'calc-graph-axis-name-x');
        const yLabel = addSvgText(ns, 'y', yLabelX, PLOT_FRAME.top + 10,
          yLabelX === PLOT_FRAME.right - 8 ? 'end' : 'start', plotLayer);
        yLabel.classList.add('calc-graph-axis-name', 'calc-graph-axis-name-y');
      }
    }
    const drawable = functions.filter(fn => fn.visible && fn.path);
    drawable.forEach(fn => { const path = document.createElementNS(ns, 'path'); path.setAttribute('d', fn.path); path.setAttribute('class', 'calc-graph-line'); path.style.setProperty('--function-color', fn.color); path.setAttribute('data-function-id', fn.id); plotLayer.append(path); });
    if (!drawable.length) {
      if (announce) graphStatus.textContent = functions.length
        ? 'No visible function has a valid plotted curve.'
        : 'No functions yet. Add one using Edit functions.';
      return;
    }
    if (announce) graphStatus.textContent = `Plotted ${drawable.length} ${drawable.length === 1 ? 'function' : 'functions'} in ${graphMode} mode.`;
  }
  const pointers = new Map();
  const pointerSnapshot = () => [...pointers.values()].map(point => ({ ...point }));
  const gestureCenter = points => points.reduce((center, point) => ({ x: center.x + point.x / points.length, y: center.y + point.y / points.length }), { x: 0, y: 0 });
  const gestureDistance = points => points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  plotArea.addEventListener('wheel', event => {
    event.preventDefault();
    const point = eventPoint(event);
    zoomView(Math.exp(Math.max(-2, Math.min(2, event.deltaY * 0.0015))), point);
    persistGraphSettings();
  }, { passive: false });
  plotArea.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    event.preventDefault();
    pointers.set(event.pointerId, eventPoint(event));
    plotArea.classList.add('is-panning');
    try { plotArea.setPointerCapture(event.pointerId); } catch {}
  });
  const plotResizeObserver = new ResizeObserver(() => {
    if (graphMode !== 'polar' && viewRatio === 'auto') return;
    plot(false);
  });
  plotResizeObserver.observe(plotArea);
  plotArea.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    const before = pointerSnapshot();
    pointers.set(event.pointerId, eventPoint(event));
    const after = pointerSnapshot();
    const oldCenter = gestureCenter(before), newCenter = gestureCenter(after);
    const delta = { panX: newCenter.x - oldCenter.x, panY: newCenter.y - oldCenter.y };
    if (before.length >= 2 && after.length >= 2) {
      const oldDistance = gestureDistance(before), newDistance = gestureDistance(after);
      changeView({ ...delta, scale: newDistance > 0 ? oldDistance / newDistance : 1, anchorX: newCenter.x, anchorY: newCenter.y });
    } else changeView(delta);
  });
  const endPointer = event => {
    pointers.delete(event.pointerId);
    if (!pointers.size) plotArea.classList.remove('is-panning');
    try { if (plotArea.hasPointerCapture(event.pointerId)) plotArea.releasePointerCapture(event.pointerId); } catch {}
    persistGraphSettings();
  };
  plotArea.addEventListener('pointerup', endPointer);
  plotArea.addEventListener('pointercancel', endPointer);
  plotArea.addEventListener('keydown', event => {
    const pan = { ArrowLeft: [-48, 0], ArrowRight: [48, 0], ArrowUp: [0, -36], ArrowDown: [0, 36] };
    if (pan[event.key]) { event.preventDefault(); changeView({ panX: pan[event.key][0], panY: pan[event.key][1] }); persistGraphSettings(); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomView(0.8); persistGraphSettings(); }
    else if (event.key === '-') { event.preventDefault(); zoomView(1.25); persistGraphSettings(); }
    else if (event.key === 'Home') { event.preventDefault(); resetView(); }
  });
  renderFunctions();

  const onKey = event => {
    if (event.ctrlKey || event.metaKey || event.altKey || !root.isConnected || !root.closest('.app-window')?.classList.contains('focused')) return;
    if (event.target === plotArea) return;
    if (event.target instanceof Element && event.target.closest('button,a,select,[role="button"],[contenteditable="true"]')) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || editorDialog.open || settingsDialog.open) return;
    if (event.key === 'Escape') { clear(); return; }
    const map = { '*': '*', '/': '/', '-': '-', Enter: '=', '=': '=' };
    const key = map[event.key] || event.key;
    if (/^[0-9]$/.test(key)) { event.preventDefault(); insertRadixDigit(key); }
    else if (radix === 16 && /^[a-f]$/i.test(key)) { event.preventDefault(); insertRadixDigit(key.toUpperCase()); }
    else if (key === '.') { event.preventDefault(); insert(key, true); }
    else if (['+', '-', '*', '/'].includes(key)) { event.preventDefault(); insert(key); }
    else if (key === '=') { event.preventDefault(); calculate(true); }
    else if (event.key === 'Backspace') { event.preventDefault(); backspace(); }
  };
  document.addEventListener('keydown', onKey);
  renderHistory();
  setMode(mode);
  if (ctx?.appApis && id) ctx.appApis[id] = { destroy: () => {
    document.removeEventListener('keydown', onKey);
    plotResizeObserver.disconnect();
    window.removeEventListener('storage', onStorageGraphSettings);
    calculatorGraphSubscribers.delete(onGraphSettingsChanged);
  } };
  return root;
}

export function evaluateExpression(source, variableValues = null, radix = 10) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Enter an expression first.');
  if (source.length > 180) throw new Error('Expression is too long.');
  const tokens = tokenize(source, radix); let cursor = 0;
  const peek = () => tokens[cursor], take = () => tokens[cursor++];
  const expect = token => { if (take() !== token) throw new Error(`Expected “${token}”.`); };
  const primary = () => {
    const token = take();
    if (token === undefined) throw new Error('Expression is incomplete.');
    if (token === '+') return primary();
    if (token === '-') return -primary();
    if (token === '(') { const result = sum(); expect(')'); return result; }
    if (/^\d/.test(token) || /^\.\d/.test(token)) return parseRadixNumber(token, radix);
    if (['x', 'theta', 't'].includes(token)) {
      const vars = typeof variableValues === 'number' ? { x: variableValues } : variableValues;
      if (!vars || !Object.hasOwn(vars, token)) throw new Error(`Use ${token} only in the matching graph mode.`);
      return vars[token];
    }
    if (token === 'pi') return Math.PI;
    if (token === 'e') return Math.E;
    if (['sin', 'cos', 'tan', 'ln', 'log', 'sqrt'].includes(token)) {
      expect('('); const argument = sum(); expect(')');
      const functions = { sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, sqrt: Math.sqrt };
      const result = functions[token](argument);
      if (!Number.isFinite(result)) throw new Error(`${token} is undefined for this value.`);
      return result;
    }
    throw new Error(`Unexpected token “${token}”.`);
  };
  const power = () => { const left = primary(); return peek() === '^' ? (take(), left ** power()) : left; };
  const product = () => {
    let result = power();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const operator = take(), right = power();
      if ((operator === '/' || operator === '%') && right === 0) throw new Error('Cannot divide by zero.');
      result = operator === '*' ? result * right : operator === '/' ? result / right : result % right;
    }
    return result;
  };
  const sum = () => { let result = product(); while (peek() === '+' || peek() === '-') { const operator = take(), right = product(); result = operator === '+' ? result + right : result - right; } return result; };
  const result = sum();
  if (cursor !== tokens.length) throw new Error(`Unexpected token “${peek()}”.`);
  if (!Number.isFinite(result)) throw new Error('The result is not a finite number.');
  return result;
}

function tokenize(source, radix = 10) {
  return scanExpressionTokens(source, radix).map(token => token.value);
}
