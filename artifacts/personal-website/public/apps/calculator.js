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
let nextFunctionId = 1;

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
                <button type="button" class="calc-plot calc-primary-action">Plot</button>
              </div></div>
              <ul class="calc-function-list" aria-label="Plotted functions"></ul>
            </div>
            <svg class="calc-plot-area" role="img" aria-label="Function graph" viewBox="0 0 640 400" preserveAspectRatio="none"></svg>
            <p class="calc-graph-status" role="status" aria-live="polite">Add a function, then choose Plot.</p>
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
  const editorDialog = $('.calc-editor-dialog');
  const settingsDialog = $('.calc-settings-dialog');
  let lastEditorField = null;
  const history = [];
  let mode = 'basic';
  let resultFresh = false;
  let graphMode = 'cartesian';
  let settingsMode = graphMode;
  let ranges = { xMin: '-10', xMax: '10', yMin: '-10', yMax: '10', thetaMin: '0', thetaMax: '6.283', rMin: '0', rMax: '10', tMin: '0', tMax: '6.283' };
  let functions = [makeFunction('sin(x)')];
  let activeFunctionId = functions[0].id;
  let editorDraft = [];

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
      toggle.addEventListener('click', () => { fn.visible = !fn.visible; renderFunctions(); plot(); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'calc-function-remove'; remove.setAttribute('aria-label', `Remove function ${fn.id}`); remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        if (functions.length === 1) { graphStatus.textContent = 'Keep at least one function in the graph.'; return; }
        functions = functions.filter(item => item.id !== fn.id);
        if (activeFunctionId === fn.id) activeFunctionId = functions[0].id;
        renderFunctions(); plot();
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
    $('.calc-mode-label').textContent = graphMode.toUpperCase(); renderFunctions(); settingsDialog.close(); plot();
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
    $('.calc-editor-error').textContent = ''; editorDialog.close(); renderFunctions(); plot();
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

  function plot() {
    const ns = 'http://www.w3.org/2000/svg';
    const numeric = key => Number(ranges[key]);
    const limits = graphMode === 'cartesian' ? { a: numeric('xMin'), b: numeric('xMax'), y0: numeric('yMin'), y1: numeric('yMax'), variable: 'x' }
      : graphMode === 'polar' ? { a: numeric('thetaMin'), b: numeric('thetaMax'), y0: numeric('rMin'), y1: numeric('rMax'), variable: 'theta' }
        : { a: numeric('tMin'), b: numeric('tMax'), x0: numeric('xMin'), x1: numeric('xMax'), y0: numeric('yMin'), y1: numeric('yMax'), variable: 't' };
    const invalidRange = [limits.a, limits.b, limits.y0, limits.y1, ...(graphMode === 'parametric' ? [limits.x0, limits.x1] : [])].some(n => !Number.isFinite(n)) ||
      limits.a >= limits.b || limits.y0 >= limits.y1 || (graphMode === 'parametric' && limits.x0 >= limits.x1);
    if (invalidRange) { graphStatus.textContent = 'Graph ranges are invalid. Open Graph settings to correct them.'; return; }
    const xMap = x => 48 + (x - (graphMode === 'parametric' ? limits.x0 : limits.a)) / ((graphMode === 'parametric' ? limits.x1 : limits.b) - (graphMode === 'parametric' ? limits.x0 : limits.a)) * 568;
    const yMap = y => 362 - (y - limits.y0) / (limits.y1 - limits.y0) * 324;
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
            const radial = (r - limits.y0) / (limits.y1 - limits.y0) * 160;
            const px = 320 + radial * Math.cos(q), py = 200 - radial * Math.sin(q);
            if (!Number.isFinite(r) || Math.abs(r) > 1e7) { drawing = false; continue; }
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
    if (plotError) { graphStatus.textContent = plotError; return; }
    plotArea.replaceChildren();
    const axis = document.createElementNS(ns, 'path'); axis.setAttribute('class', 'calc-graph-axis');
    if (graphMode === 'polar') axis.setAttribute('d', 'M48 200H616 M320 26V374');
    else {
      const zeroX = graphMode === 'parametric' ? (limits.x0 <= 0 && limits.x1 >= 0 ? xMap(0) : null) : (limits.a <= 0 && limits.b >= 0 ? xMap(0) : null);
      const zeroY = limits.y0 <= 0 && limits.y1 >= 0 ? yMap(0) : null;
      axis.setAttribute('d', `M48 26V374H616${zeroY === null ? '' : ` M48 ${zeroY}H616`}${zeroX === null ? '' : ` M${zeroX} 26V374`}`);
    }
    plotArea.append(axis);
    const drawable = functions.filter(fn => fn.visible && fn.path);
    drawable.forEach(fn => { const path = document.createElementNS(ns, 'path'); path.setAttribute('d', fn.path); path.setAttribute('class', 'calc-graph-line'); path.style.setProperty('--function-color', fn.color); path.setAttribute('data-function-id', fn.id); plotArea.append(path); });
    if (!drawable.length) { graphStatus.textContent = 'No visible function has a valid plotted curve.'; return; }
    graphStatus.textContent = `Plotted ${drawable.length} ${drawable.length === 1 ? 'function' : 'functions'} in ${graphMode} mode.`;
  }
  renderFunctions();

  const onKey = event => {
    if (event.ctrlKey || event.metaKey || event.altKey || !root.isConnected || !root.closest('.app-window')?.classList.contains('focused')) return;
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
  if (ctx?.appApis && id) ctx.appApis[id] = { destroy: () => document.removeEventListener('keydown', onKey) };
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
