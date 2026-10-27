'use strict';

import { enhanceSelect } from './custom-select.js';
import { NOTE_COLORS } from './sticky-notes.js';

const BASIC_KEYS = [
  ['AC', 'clear'], ['±', 'sign'], ['%', 'percent'], ['÷', 'operator'],
  ['7', 'digit'], ['8', 'digit'], ['9', 'digit'], ['×', 'operator'],
  ['4', 'digit'], ['5', 'digit'], ['6', 'digit'], ['−', 'operator'],
  ['1', 'digit'], ['2', 'digit'], ['3', 'digit'], ['+', 'operator'],
  ['0', 'wide digit'], ['.', 'decimal'], ['=', 'equals'],
];
const SCIENTIFIC_KEYS = ['sin(', 'cos(', 'tan(', 'ln(', 'log(', '√(', '^', '(', ')'];
const GRAPH_KEYS = [
  'sin(', 'cos(', 'tan(', 'sqrt(', 'ln(', 'log(',
  'pi', 'e', 'x', 'theta', 't', '^',
  '7', '8', '9', '÷', '(', ')',
  '4', '5', '6', '×', '+', '−',
  '1', '2', '3', '%', '/', '.',
  '0', 'Clear', '⌫',
];
const HISTORY_LIMIT = 24;
const GRAPH_SETTINGS_KEY = 'personal-desktop-calculator-graph-v1';
const GRAPH_SETTINGS_VERSION = 1;
const GRAPH_MODES = ['cartesian', 'polar', 'parametric'];
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
let nextFunctionId = 1;
const calculatorGraphSubscribers = new Set();

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
    if (!saved || saved.version !== GRAPH_SETTINGS_VERSION || !GRAPH_MODES.includes(saved.graphMode) ||
        !saved.ranges || typeof saved.ranges !== 'object' || Array.isArray(saved.ranges) ||
        !Array.isArray(saved.functions) || saved.functions.length < 1 || saved.functions.length > 20) {
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

    const ids = new Set();
    const functions = saved.functions.map(fn => {
      if (!fn || typeof fn !== 'object' || typeof fn.id !== 'string' || !/^fn-\d+$/.test(fn.id) || ids.has(fn.id) ||
          typeof fn.expression !== 'string' || !fn.expression.trim() || fn.expression.length > 180 ||
          typeof fn.xExpression !== 'string' || !fn.xExpression.trim() || fn.xExpression.length > 180 ||
          typeof fn.yExpression !== 'string' || !fn.yExpression.trim() || fn.yExpression.length > 180 ||
          typeof fn.visible !== 'boolean' || !NOTE_COLORS.some(color => color.hex === fn.color)) return null;
      ids.add(fn.id);
      return { id: fn.id, expression: fn.expression, xExpression: fn.xExpression, yExpression: fn.yExpression, color: fn.color, visible: fn.visible, path: '' };
    });
    if (functions.some(fn => !fn)) return { status: 'invalid' };
    const acceptsExpression = (expression, variable) => {
      for (const probe of [0, 1, -1, 2, 0.5]) {
        try { evaluateExpression(expression, { [variable]: probe }); return true; } catch {}
      }
      return false;
    };
    if (functions.some(fn => saved.graphMode === 'parametric'
      ? !acceptsExpression(fn.xExpression, 't') || !acceptsExpression(fn.yExpression, 't')
      : !acceptsExpression(fn.expression, saved.graphMode === 'polar' ? 'theta' : 'x'))) return { status: 'invalid' };

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
    return { status: 'valid', graphMode: saved.graphMode, ranges, functions, viewRanges };
  } catch {
    return { status: 'invalid' };
  }
}

export function buildCalculator(id, ctx) {
  const root = document.createElement('section');
  root.className = 'utility-app calc-wrap';
  const expressionId = `${id || 'calculator'}-expression`;
  root.innerHTML = `
    <div class="calc" aria-label="Calculator">
      <header class="calc-header"><div><h2>Calculator</h2></div>
        <div class="calc-modes" role="group" aria-label="Calculator mode">
          <button type="button" data-mode="basic" aria-pressed="true">Basic</button>
          <button type="button" data-mode="scientific" aria-pressed="false">Scientific</button>
          <button type="button" data-mode="graph" aria-pressed="false">Graph</button>
        </div>
      </header>
      <div class="calc-workspace">
        <main class="calc-main">
          <div class="calc-display">
            <label class="calc-expression-label" for="${expressionId}">Expression</label>
            <input class="calc-expression" id="${expressionId}" aria-label="Expression" inputmode="decimal" autocomplete="off" spellcheck="false" value="0">
            <div class="calc-result-line"><span class="calc-result-caption">RESULT</span><output class="calc-value" aria-live="polite">0</output></div>
            <p class="calc-message" role="status" aria-live="polite"></p>
          </div>
          <div class="calc-scientific" hidden></div>
          <div class="calc-keys" aria-label="Calculator keypad"></div>
          <section class="calc-graph" hidden aria-label="Function graph">
            <div class="calc-graph-toolbar">
              <div><span class="calc-kicker">PLOT / ${'<span class="calc-mode-label">CARTESIAN</span>'}</span><div class="calc-graph-tools">
                <button type="button" class="calc-open-editor">Edit functions</button>
                <button type="button" class="calc-open-settings">Graph settings</button>
                <button type="button" class="calc-zoom-out" aria-label="Zoom out">−</button>
                <button type="button" class="calc-zoom-in" aria-label="Zoom in">+</button>
                <button type="button" class="calc-fit-view">Fit curves</button>
                <button type="button" class="calc-reset-view">Reset view</button>
                <button type="button" class="calc-plot calc-primary-action">Plot</button>
              </div></div>
              <ul class="calc-function-list" aria-label="Plotted functions"></ul>
            </div>
            <div class="calc-view-ranges">
              <span class="calc-view-ranges-label" id="${expressionId}-view-ranges-label">Current view</span>
              <code class="calc-view-ranges-values" aria-labelledby="${expressionId}-view-ranges-label"></code>
              <button type="button" class="calc-copy-view-ranges">Copy ranges</button>
              <span class="calc-copy-view-ranges-status" role="status" aria-live="polite"></span>
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
        <header class="calc-dialog-header"><div><span class="calc-kicker">FUNCTION LAB</span><h3 id="${expressionId}-editor-title">Edit functions</h3></div><button type="button" class="calc-dialog-close" aria-label="Close function editor">Close</button></header>
        <div class="calc-editor-layout">
          <nav class="calc-editor-nav" aria-label="Functions"></nav>
          <div class="calc-editor-fields">
            <label class="calc-editor-expression-label">Expression
            <input class="calc-editor-expression" aria-label="Function expression" autocomplete="off" spellcheck="false">
            </label>
            <div class="calc-editor-function-fields" hidden></div>
            <fieldset class="note-color-picker calc-color-picker"><legend>Line color</legend><div class="note-color-options calc-color-options"></div></fieldset>
            <p class="calc-editor-error" role="alert" aria-live="polite"></p>
            <div class="calc-function-keypad" aria-label="Function keypad"></div>
            <footer class="calc-dialog-actions"><button type="button" class="calc-add-function">Add function</button><button type="button" class="calc-apply-functions calc-primary-action">Apply</button></footer>
          </div>
        </div>
      </form>
    </dialog>
    <dialog class="calc-dialog calc-settings-dialog" aria-labelledby="${expressionId}-settings-title">
      <form method="dialog" class="calc-dialog-card calc-settings-card">
        <header class="calc-dialog-header"><div><span class="calc-kicker">PLOT / CONFIGURE</span><h3 id="${expressionId}-settings-title">Graph settings</h3></div><button type="button" class="calc-dialog-close" aria-label="Close graph settings">Close</button></header>
        <label class="calc-setting-field">Graph mode
          <select class="calc-graph-mode" aria-label="Graph mode">
            <option value="cartesian">Cartesian · y = f(x)</option>
            <option value="polar">Polar · r = f(theta)</option>
            <option value="parametric">Parametric · x(t), y(t)</option>
          </select>
        </label>
        <div class="calc-range-fields"></div>
        <p class="calc-settings-error" role="alert" aria-live="polite"></p>
        <footer class="calc-dialog-actions"><button type="button" class="calc-apply-settings calc-primary-action">Apply settings</button></footer>
      </form>
    </dialog>`;

  enhanceSelect(root.querySelector('.calc-graph-mode'));
  const $ = selector => root.querySelector(selector);
  const input = $('.calc-expression');
  const value = $('.calc-value');
  const message = $('.calc-message');
  const keys = $('.calc-keys');
  const scientific = $('.calc-scientific');
  const historyList = $('.calc-history-list');
  const historyEmpty = $('.calc-history-empty');
  const graph = $('.calc-graph');
  const plotArea = $('.calc-plot-area');
  const graphStatus = $('.calc-graph-status');
  const viewRangeValues = $('.calc-view-ranges-values');
  const copyViewRangesButton = $('.calc-copy-view-ranges');
  const copyViewRangesStatus = $('.calc-copy-view-ranges-status');
  const editorDialog = $('.calc-editor-dialog');
  const settingsDialog = $('.calc-settings-dialog');
  let lastEditorField = null;
  const history = [];
  let mode = 'basic';
  let resultFresh = false;
  let graphMode = 'cartesian';
  let settingsMode = graphMode;
  let ranges = { ...DEFAULT_GRAPH_RANGES };
  let viewRanges = null;
  let functions = [makeFunction('sin(x)')];
  let activeFunctionId = functions[0].id;
  let editorDraft = [];
  const storageWarning = $('.calc-storage-warning');
  const recoveryNotice = $('.calc-storage-recovery');
  const recoveryMessage = recoveryNotice.querySelector('span');
  const savedGraph = readSavedGraphSettings();
  if (savedGraph.status === 'valid') {
    graphMode = savedGraph.graphMode;
    ranges = savedGraph.ranges;
    functions = savedGraph.functions;
    viewRanges = Object.keys(savedGraph.viewRanges).length ? savedGraph.viewRanges : null;
    activeFunctionId = functions[0].id;
    nextFunctionId = Math.max(nextFunctionId, ...functions.map(fn => Number(fn.id.slice(3)) + 1));
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
      viewRanges = null;
      functions = [makeFunction('sin(x)')];
      activeFunctionId = functions[0].id;
      recoveryNotice.hidden = true;
    } else if (saved.status === 'valid') {
      graphMode = saved.graphMode;
      settingsMode = graphMode;
      ranges = saved.ranges;
      viewRanges = Object.keys(saved.viewRanges).length ? saved.viewRanges : null;
      functions = saved.functions;
      activeFunctionId = functions.some(fn => fn.id === activeFunctionId)
        ? activeFunctionId
        : functions[0].id;
      nextFunctionId = Math.max(nextFunctionId, ...functions.map(fn => Number(fn.id.slice(3)) + 1));
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
      functions: functions.map(({ id: functionId, expression, xExpression, yExpression, color, visible }) => ({
        id: functionId, expression, xExpression, yExpression, color, visible,
      })),
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

  function persistGraphSettings() {
    try {
      const serialized = JSON.stringify({
        version: GRAPH_SETTINGS_VERSION,
        graphMode,
        ranges,
        functions: functions.map(({ id: functionId, expression, xExpression, yExpression, color, visible }) => ({
          id: functionId, expression, xExpression, yExpression, color, visible,
        })),
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
      viewRanges = null;
      functions = [makeFunction('sin(x)')];
      activeFunctionId = functions[0].id;
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
    if (!Number.isFinite(number)) throw new Error('The result is not a finite number.');
    return String(Number(number.toPrecision(12)));
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
        input.value = entry.result; value.textContent = entry.result;
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
      const result = format(evaluateExpression(expression));
      value.textContent = result; message.textContent = '';
      input.setSelectionRange(input.value.length, input.value.length);
      if (record && expression) {
        history.unshift({ expression, result }); history.splice(HISTORY_LIMIT); renderHistory(); resultFresh = true;
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
    mode = next; root.dataset.mode = next;
    root.querySelectorAll('.calc-modes button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === next)));
    scientific.hidden = next !== 'scientific'; graph.hidden = next !== 'graph'; keys.hidden = next === 'graph';
    root.classList.toggle('calc-graph-mode', next === 'graph');
    root.querySelector('.calc-display').hidden = next === 'graph';
    root.querySelector('.calc-history').hidden = next === 'graph';
    if (next === 'graph') plot();
  };
  const insert = (text, replaceResult = false) => {
    const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
    const replace = resultFresh && replaceResult, replaceZero = input.value === '0' && replaceResult;
    const base = replace || replaceZero ? '' : input.value, offset = replace || replaceZero ? 0 : start, suffixStart = replace || replaceZero ? 0 : end;
    const insertion = (replace || replaceZero) && text === '.' ? '0.' : text;
    input.value = `${base.slice(0, offset)}${insertion}${base.slice(suffixStart)}`;
    const caret = offset + insertion.length; input.setSelectionRange(caret, caret);
    resultFresh = false; input.focus({ preventScroll: true }); updatePreview();
  };
  const clear = () => { input.value = '0'; value.textContent = '0'; message.textContent = ''; resultFresh = false; input.focus({ preventScroll: true }); };

  BASIC_KEYS.forEach(([label, kind]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `calc-key ${kind.includes('operator') ? 'operator' : ''} ${kind.includes('equals') ? 'equals' : ''} ${kind.includes('wide') ? 'wide' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      if (kind.includes('clear')) clear();
      else if (kind.includes('equals')) calculate(true);
      else if (kind.includes('sign')) {
        const match = input.value.match(/(-?\d*\.?\d+)$/);
        if (match) { input.setRangeText(String(-Number(match[0])), match.index, input.value.length, 'end'); resultFresh = false; updatePreview(); }
      } else if (kind.includes('percent')) insert('/100');
      else if (kind.includes('operator')) insert(({ '÷': '/', '×': '*', '−': '-' })[label] || label);
      else insert(label, kind.includes('digit') || kind.includes('decimal'));
    });
    keys.append(button);
  });
  SCIENTIFIC_KEYS.forEach(label => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'calc-science-key'; button.textContent = label;
    button.addEventListener('click', () => insert(label === '√(' ? 'sqrt(' : label, true)); scientific.append(button);
  });
  root.querySelectorAll('.calc-modes button').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('.calc-history-clear').addEventListener('click', () => { history.splice(0); renderHistory(); });
  input.addEventListener('input', () => { resultFresh = false; updatePreview(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); calculate(true); }
    if (event.key === 'Escape') clear();
  });
  root.querySelector('.calc-plot').addEventListener('click', plot);
  $('.calc-zoom-in').addEventListener('click', () => { zoomView(0.8); persistGraphSettings(); });
  $('.calc-zoom-out').addEventListener('click', () => { zoomView(1.25); persistGraphSettings(); });
  $('.calc-fit-view').addEventListener('click', fitView);
  $('.calc-reset-view').addEventListener('click', resetView);
  $('.calc-reset-saved').addEventListener('click', resetSavedGraph);
  $('.calc-open-editor').addEventListener('click', openEditor);
  $('.calc-open-settings').addEventListener('click', openSettings);
  root.querySelectorAll('.calc-dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

  function renderFunctions() {
    const list = $('.calc-function-list'); list.replaceChildren();
    functions.forEach(fn => {
      const row = document.createElement('li'); row.className = 'calc-function-item';
      const swatch = document.createElement('span'); swatch.className = 'calc-function-swatch'; swatch.style.setProperty('--function-color', fn.color);
      const label = document.createElement('span'); label.className = 'calc-function-summary';
      label.textContent = graphMode === 'parametric' ? `x(t)=${fn.xExpression} · y(t)=${fn.yExpression}` : `${graphMode === 'polar' ? 'r(θ)' : 'y'} = ${fn.expression}`;
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'calc-function-toggle';
      toggle.setAttribute('aria-pressed', String(fn.visible)); toggle.setAttribute('aria-label', `${fn.visible ? 'Hide' : 'Show'} function ${fn.id}`); toggle.textContent = fn.visible ? 'Visible' : 'Hidden';
      toggle.addEventListener('click', () => { fn.visible = !fn.visible; renderFunctions(); plot(); persistGraphSettings(); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'calc-function-remove'; remove.setAttribute('aria-label', `Remove function ${fn.id}`); remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        if (functions.length === 1) { graphStatus.textContent = 'Keep at least one function in the graph.'; return; }
        functions = functions.filter(item => item.id !== fn.id);
        if (activeFunctionId === fn.id) activeFunctionId = functions[0].id;
        renderFunctions(); plot(); persistGraphSettings();
      });
      row.append(swatch, label, toggle, remove); list.append(row);
    });
  }
  function renderSettingsFields(fieldMode = graphMode) {
    const holder = $('.calc-range-fields'); holder.replaceChildren();
    const fields = fieldMode === 'cartesian'
      ? [['xMin', 'Minimum x'], ['xMax', 'Maximum x'], ['yMin', 'Minimum y'], ['yMax', 'Maximum y']]
      : fieldMode === 'polar'
        ? [['thetaMin', 'Minimum theta'], ['thetaMax', 'Maximum theta'], ['rMin', 'Minimum r'], ['rMax', 'Maximum r']]
        : [['tMin', 'Minimum t'], ['tMax', 'Maximum t'], ['xMin', 'Minimum x'], ['xMax', 'Maximum x'], ['yMin', 'Minimum y'], ['yMax', 'Maximum y']];
    fields.forEach(([key, label]) => {
      const wrapper = document.createElement('label'); wrapper.className = 'calc-setting-field';
      wrapper.textContent = label;
      const field = document.createElement('input'); field.type = 'number'; field.step = 'any'; field.dataset.range = key; field.value = ranges[key];
      field.setAttribute('aria-label', label); wrapper.append(field); holder.append(wrapper);
    });
  }
  function openSettings() {
    settingsMode = graphMode;
    $('.calc-graph-mode').value = settingsMode; $('.calc-settings-error').textContent = ''; renderSettingsFields(settingsMode);
    settingsDialog.showModal(); $('.calc-graph-mode').focus();
  }
  $('.calc-graph-mode').addEventListener('change', event => {
    settingsMode = event.target.value; renderSettingsFields(settingsMode);
  });
  $('.calc-apply-settings').addEventListener('click', () => {
    const nextRanges = { ...ranges }; let error = '';
    $('.calc-range-fields').querySelectorAll('input').forEach(field => { nextRanges[field.dataset.range] = field.value; });
    const required = settingsMode === 'cartesian' ? ['xMin', 'xMax', 'yMin', 'yMax'] : settingsMode === 'polar' ? ['thetaMin', 'thetaMax', 'rMin', 'rMax'] : ['tMin', 'tMax', 'xMin', 'xMax', 'yMin', 'yMax'];
    const nums = Object.fromEntries(required.map(key => [key, Number(nextRanges[key])]));
    if (required.some(key => !String(nextRanges[key]).trim() || !Number.isFinite(nums[key]))) error = 'Enter a finite value for every range.';
    const pairs = settingsMode === 'cartesian' ? [['xMin', 'xMax', 'x'], ['yMin', 'yMax', 'y']]
      : settingsMode === 'polar' ? [['thetaMin', 'thetaMax', 'theta'], ['rMin', 'rMax', 'r']]
        : [['tMin', 'tMax', 't'], ['xMin', 'xMax', 'x'], ['yMin', 'yMax', 'y']];
    if (!error && pairs.some(([a, b]) => nums[a] >= nums[b])) error = 'Each range start must be less than its end.';
    if (error) { $('.calc-settings-error').textContent = error; return; }
    ranges = nextRanges; graphMode = settingsMode;
    viewRanges = null;
    $('.calc-mode-label').textContent = graphMode.toUpperCase(); renderFunctions(); settingsDialog.close(); plot(); persistGraphSettings();
  });

  function renderEditorNav() {
    const nav = $('.calc-editor-nav'); nav.replaceChildren();
    editorDraft.forEach((fn, index) => {
      const row = document.createElement('div'); row.className = 'calc-editor-function-row';
      const select = document.createElement('button'); select.type = 'button'; select.className = 'calc-editor-select';
      select.setAttribute('aria-current', String(fn.id === activeFunctionId)); select.textContent = `Function ${index + 1}`;
      select.addEventListener('click', () => { saveEditorDraft(); activeFunctionId = fn.id; renderEditor(); });
      const visible = document.createElement('input'); visible.type = 'checkbox'; visible.checked = fn.visible; visible.setAttribute('aria-label', `Show function ${index + 1}`);
      visible.addEventListener('change', () => { fn.visible = visible.checked; });
      row.append(select, visible); nav.append(row);
    });
  }
  function saveEditorDraft() {
    const fn = editorDraft.find(item => item.id === activeFunctionId); if (!fn) return;
    if (graphMode === 'parametric') {
      fn.xExpression = $('.calc-editor-x').value; fn.yExpression = $('.calc-editor-y').value;
    } else fn.expression = $('.calc-editor-expression').value;
    fn.color = $('.calc-color-picker input:checked')?.value || NOTE_COLORS.find(item => item.value === 'blue').hex;
  }
  function renderEditor() {
    renderEditorNav();
    const fn = editorDraft.find(item => item.id === activeFunctionId); if (!fn) return;
    const regularLabel = $('.calc-editor-expression-label');
    const fieldWrap = $('.calc-editor-function-fields');
    const regularInput = $('.calc-editor-expression');
    if (graphMode === 'parametric') {
      regularLabel.hidden = true; fieldWrap.hidden = false; fieldWrap.replaceChildren();
      [['xExpression', 'x(t)'], ['yExpression', 'y(t)']].forEach(([key, label]) => {
        const fieldLabel = document.createElement('label'); fieldLabel.textContent = label;
        const field = document.createElement('input'); field.className = key === 'xExpression' ? 'calc-editor-x' : 'calc-editor-y'; field.setAttribute('aria-label', label); field.autocomplete = 'off'; field.spellcheck = false; field.value = fn[key];
        fieldLabel.append(field); fieldWrap.append(fieldLabel);
      });
    } else {
      regularLabel.hidden = false; fieldWrap.hidden = true;
      regularLabel.firstChild.textContent = graphMode === 'polar' ? 'r(theta)' : 'y = f(x)';
      regularInput.value = fn.expression;
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
    editorDraft = functions.map(fn => ({ ...fn })); renderEditor(); editorDialog.showModal();
    lastEditorField = graphMode === 'parametric' ? $('.calc-editor-x') : $('.calc-editor-expression');
    lastEditorField.focus();
  }
  $('.calc-add-function').addEventListener('click', () => {
    saveEditorDraft(); const fn = makeFunction(graphMode === 'polar' ? '1' : 'sin(x)');
    if (graphMode === 'parametric') { fn.xExpression = 'cos(t)'; fn.yExpression = 'sin(t)'; }
    editorDraft.push(fn); activeFunctionId = fn.id; renderEditor();
    lastEditorField = graphMode === 'parametric' ? $('.calc-editor-x') : $('.calc-editor-expression');
    lastEditorField.focus();
  });
  $('.calc-apply-functions').addEventListener('click', () => {
    saveEditorDraft();
    const bad = editorDraft.find(fn => {
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
    functions = editorDraft.map(fn => ({ ...fn }));
    $('.calc-editor-error').textContent = ''; editorDialog.close(); renderFunctions(); plot(); persistGraphSettings();
  });
  GRAPH_KEYS.forEach(key => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'calc-function-key'; button.textContent = key;
    if (key === 'Clear') button.setAttribute('aria-label', 'Clear expression');
    if (key === '⌫') button.setAttribute('aria-label', 'Delete previous character');
    button.addEventListener('click', () => {
      const field = lastEditorField?.isConnected ? lastEditorField : (graphMode === 'parametric' ? $('.calc-editor-x') : $('.calc-editor-expression'));
      const start = field.selectionStart ?? field.value.length, end = field.selectionEnd ?? start;
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
      field.focus();
    });
    $('.calc-function-keypad').append(button);
  });
  editorDialog.addEventListener('focusin', event => {
    if (event.target.matches('.calc-editor-expression,.calc-editor-x,.calc-editor-y')) lastEditorField = event.target;
  });
  editorDialog.addEventListener('keydown', event => {
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
    const copied = await copyText(formatViewRanges(getViewRanges()));
    copyViewRangesStatus.textContent = copied
      ? 'Current graph ranges copied.'
      : 'Could not copy the ranges. Select the values and copy them manually.';
  });
  function resetView() {
    if (viewRanges) delete viewRanges[graphMode];
    plot(); persistGraphSettings();
  }
  function changeView({ scale = 1, anchorX = 332, anchorY = 200, panX = 0, panY = 0 } = {}) {
    const current = getViewRanges();
    const xKeys = graphMode === 'polar' ? ['thetaMin', 'thetaMax'] : ['xMin', 'xMax'];
    const yKeys = graphMode === 'polar' ? ['rMin', 'rMax'] : ['yMin', 'yMax'];
    const xSpan = current[xKeys[1]] - current[xKeys[0]];
    const ySpan = current[yKeys[1]] - current[yKeys[0]];
    const px = Math.max(0, Math.min(1, (anchorX - 48) / 568));
    const py = Math.max(0, Math.min(1, (anchorY - 26) / 348));
    const shiftedX = current[xKeys[0]] - panX / 568 * xSpan;
    const shiftedY = current[yKeys[0]] + panY / 348 * ySpan;
    const boundedScale = Number.isFinite(scale) ? Math.max(1e-9, Math.min(1e9, scale)) : 1;
    const nextXSpan = Math.max(1e-9, Math.min(1e9, xSpan * boundedScale));
    const nextYSpan = Math.max(1e-9, Math.min(1e9, ySpan * boundedScale));
    const xAnchor = shiftedX + px * xSpan;
    const yAnchor = shiftedY + (1 - py) * ySpan;
    const next = {
      [xKeys[0]]: xAnchor - px * nextXSpan,
      [xKeys[1]]: xAnchor + (1 - px) * nextXSpan,
      [yKeys[0]]: yAnchor - (1 - py) * nextYSpan,
      [yKeys[1]]: yAnchor + py * nextYSpan,
    };
    if (Object.values(next).every(Number.isFinite)) {
      current[xKeys[0]] = next[xKeys[0]]; current[xKeys[1]] = next[xKeys[1]];
      current[yKeys[0]] = next[yKeys[0]]; current[yKeys[1]] = next[yKeys[1]];
      plot(false);
    }
  }
  const zoomView = (scale, point = { x: 332, y: 200 }) => changeView({ scale, anchorX: point.x, anchorY: point.y });
  function eventPoint(event) {
    const rect = plotArea.getBoundingClientRect();
    return { x: 640 * (event.clientX - rect.left) / rect.width, y: 400 * (event.clientY - rect.top) / rect.height };
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
    const sampleCount = 500;
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
  function addSvgText(ns, text, x, y, anchor = 'middle') {
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('class', 'calc-graph-label');
    label.setAttribute('x', x); label.setAttribute('y', y);
    label.setAttribute('text-anchor', anchor);
    label.textContent = text;
    plotArea.append(label);
  }
  function plot(announce = true) {
    const ns = 'http://www.w3.org/2000/svg';
    const view = getViewRanges();
    viewRangeValues.textContent = formatViewRanges(view);
    const limits = graphMode === 'cartesian'
      ? { a: view.xMin, b: view.xMax, y0: view.yMin, y1: view.yMax, variable: 'x' }
      : graphMode === 'polar'
        ? { a: view.thetaMin, b: view.thetaMax, y0: view.rMin, y1: view.rMax, variable: 'theta' }
        : { a: view.tMin, b: view.tMax, x0: view.xMin, x1: view.xMax, y0: view.yMin, y1: view.yMax, variable: 't' };
    const invalidRange = [limits.a, limits.b, limits.y0, limits.y1, ...(graphMode === 'parametric' ? [limits.x0, limits.x1] : [])].some(n => !Number.isFinite(n)) ||
      limits.a >= limits.b || limits.y0 >= limits.y1 || (graphMode === 'parametric' && limits.x0 >= limits.x1);
    if (invalidRange) { if (announce) graphStatus.textContent = 'Graph ranges are invalid. Open Graph settings to correct them.'; return; }
    const x0 = graphMode === 'parametric' ? limits.x0 : limits.a;
    const x1 = graphMode === 'parametric' ? limits.x1 : limits.b;
    const xMap = x => 48 + (x - x0) / (x1 - x0) * 568;
    const yMap = y => 362 - (y - limits.y0) / (limits.y1 - limits.y0) * 324;
    plotArea.dataset.view = JSON.stringify(view);
    plotArea.setAttribute('aria-valuetext', graphMode === 'polar'
      ? `theta ${formatTick(limits.a)} to ${formatTick(limits.b)}, radius ${formatTick(limits.y0)} to ${formatTick(limits.y1)}`
      : `x ${formatTick(x0)} to ${formatTick(x1)}, y ${formatTick(limits.y0)} to ${formatTick(limits.y1)}`);
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
          const q = limits.a + (limits.b - limits.a) * i / count;
          let x, y, r;
          try {
            if (graphMode === 'cartesian') { x = q; y = evaluateExpression(fn.expression, { x: q }); }
            else if (graphMode === 'polar') r = evaluateExpression(fn.expression, { theta: q });
            else { x = evaluateExpression(fn.xExpression, { t: q }); y = evaluateExpression(fn.yExpression, { t: q }); }
          } catch (error) { drawing = false; continue; }
          if (graphMode === 'polar') {
            if (!Number.isFinite(r) || Math.abs(r) > 1e7) { drawing = false; continue; }
            const radial = (r - limits.y0) / (limits.y1 - limits.y0) * 160;
            const px = 320 + radial * Math.cos(q), py = 200 - radial * Math.sin(q);
            d += `${drawing ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)} `; drawing = true; continue;
          }
          if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e7 || Math.abs(y) > 1e7) { drawing = false; continue; }
          const px = xMap(x), py = yMap(y);
          if (py < -1000 || py > 1400 || px < -1000 || px > 1600) { drawing = false; continue; }
          d += `${drawing ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)} `; drawing = true;
        }
      } catch (error) { failed = error; }
      if (failed) { plotError = `Cannot plot ${fn.id}: ${failed.message} Previous valid plots are preserved.`; return; }
      if (d) { fn.path = d; paths.push(fn); }
    });
    if (plotError) { if (announce) graphStatus.textContent = plotError; return; }
    plotArea.replaceChildren();
    if (graphMode === 'polar') {
      const radialStep = niceStep(limits.y1 - limits.y0, 6);
      for (let tick = Math.ceil(limits.y0 / radialStep) * radialStep, count = 0; tick <= limits.y1 + radialStep * 1e-8 && count < 80; tick += radialStep, count++) {
        const radius = (tick - limits.y0) / (limits.y1 - limits.y0) * 160;
        if (radius < 0 || radius > 160) continue;
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('class', 'calc-graph-grid'); circle.setAttribute('cx', '320'); circle.setAttribute('cy', '200'); circle.setAttribute('r', radius);
        plotArea.append(circle);
        addSvgText(ns, formatTick(tick), 324 + radius, 196, 'start');
      }
      const thetaStep = niceStep(limits.b - limits.a, 8);
      const spoke = document.createElementNS(ns, 'path');
      spoke.setAttribute('class', 'calc-graph-grid');
      let spokePath = '';
      for (let angle = Math.ceil(limits.a / thetaStep) * thetaStep, count = 0; angle <= limits.b + thetaStep * 1e-8 && count < 80; angle += thetaStep, count++) {
        const x = 320 + 160 * Math.cos(angle), y = 200 - 160 * Math.sin(angle);
        spokePath += `M320 200L${x.toFixed(2)} ${y.toFixed(2)} `;
      }
      spoke.setAttribute('d', spokePath); plotArea.append(spoke);
      const axis = document.createElementNS(ns, 'path');
      axis.setAttribute('class', 'calc-graph-axis'); axis.setAttribute('d', 'M160 200H480 M320 40V360');
      plotArea.append(axis);
      addSvgText(ns, 'θ', 486, 196, 'start'); addSvgText(ns, 'r', 324, 36, 'start');
    } else {
      const grid = document.createElementNS(ns, 'path');
      grid.setAttribute('class', 'calc-graph-grid');
      let gridPath = '';
      const xStep = niceStep(x1 - x0), yStep = niceStep(limits.y1 - limits.y0);
      for (let tick = Math.ceil(x0 / xStep) * xStep, count = 0; tick <= x1 + xStep * 1e-8 && count < 100; tick += xStep, count++) {
        const px = xMap(tick); gridPath += `M${px.toFixed(2)} 26V374 `;
        addSvgText(ns, formatTick(tick), px, 390);
      }
      for (let tick = Math.ceil(limits.y0 / yStep) * yStep, count = 0; tick <= limits.y1 + yStep * 1e-8 && count < 100; tick += yStep, count++) {
        const py = yMap(tick); gridPath += `M48 ${py.toFixed(2)}H616 `;
        addSvgText(ns, formatTick(tick), 43, py + 4, 'end');
      }
      grid.setAttribute('d', gridPath); plotArea.prepend(grid);
      const zeroX = x0 <= 0 && x1 >= 0 ? xMap(0) : null;
      const zeroY = limits.y0 <= 0 && limits.y1 >= 0 ? yMap(0) : null;
      const axis = document.createElementNS(ns, 'path'); axis.setAttribute('class', 'calc-graph-axis');
      axis.setAttribute('d', `M48 26V374H616${zeroY === null ? '' : ` M48 ${zeroY}H616`}${zeroX === null ? '' : ` M${zeroX} 26V374`}`);
      plotArea.append(axis);
      addSvgText(ns, 'x', 609, 386, 'end'); addSvgText(ns, 'y', 56, 36, 'start');
    }
    const drawable = functions.filter(fn => fn.visible && fn.path);
    drawable.forEach(fn => { const path = document.createElementNS(ns, 'path'); path.setAttribute('d', fn.path); path.setAttribute('class', 'calc-graph-line'); path.style.setProperty('--function-color', fn.color); path.setAttribute('data-function-id', fn.id); plotArea.append(path); });
    if (!drawable.length) { if (announce) graphStatus.textContent = 'No visible function has a valid plotted curve.'; return; }
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
    if (/^[0-9.]$/.test(key)) { event.preventDefault(); insert(key, true); }
    else if (['+', '-', '*', '/'].includes(key)) { event.preventDefault(); insert(key); }
    else if (key === '=') { event.preventDefault(); calculate(true); }
    else if (event.key === 'Backspace') { event.preventDefault(); input.value = input.value.length > 1 ? input.value.slice(0, -1) : '0'; updatePreview(); }
  };
  document.addEventListener('keydown', onKey);
  renderHistory();
  if (ctx?.appApis && id) ctx.appApis[id] = { destroy: () => {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('storage', onStorageGraphSettings);
    calculatorGraphSubscribers.delete(onGraphSettingsChanged);
  } };
  return root;
}

export function evaluateExpression(source, variableValues = null) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Enter an expression first.');
  if (source.length > 180) throw new Error('Expression is too long.');
  const tokens = tokenize(source); let cursor = 0;
  const peek = () => tokens[cursor], take = () => tokens[cursor++];
  const expect = token => { if (take() !== token) throw new Error(`Expected “${token}”.`); };
  const primary = () => {
    const token = take();
    if (token === undefined) throw new Error('Expression is incomplete.');
    if (token === '+') return primary();
    if (token === '-') return -primary();
    if (token === '(') { const result = sum(); expect(')'); return result; }
    if (/^\d/.test(token) || /^\.\d/.test(token)) return Number(token);
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

function tokenize(source) {
  const tokens = [], pattern = /\s*([0-9]+(?:\.[0-9]*)?|\.[0-9]+|[a-zA-Z]+|[+\-*/%^()])/gy;
  let position = 0;
  while (position < source.length) {
    if (!source.slice(position).trim()) break;
    pattern.lastIndex = position; const match = pattern.exec(source);
    if (!match) throw new Error(`Unsupported character “${source[position]}”.`);
    const token = match[1].toLowerCase();
    if (/^[a-z]+$/.test(token) && !['x', 'theta', 't', 'pi', 'e', 'sin', 'cos', 'tan', 'ln', 'log', 'sqrt'].includes(token)) throw new Error(`Unknown function or name “${token}”.`);
    tokens.push(token); position = pattern.lastIndex;
  }
  return tokens;
}
