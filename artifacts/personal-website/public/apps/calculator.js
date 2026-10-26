'use strict';

const BASIC_KEYS = [
  ['AC', 'clear'], ['±', 'sign'], ['%', 'percent'], ['÷', 'operator'],
  ['7', 'digit'], ['8', 'digit'], ['9', 'digit'], ['×', 'operator'],
  ['4', 'digit'], ['5', 'digit'], ['6', 'digit'], ['−', 'operator'],
  ['1', 'digit'], ['2', 'digit'], ['3', 'digit'], ['+', 'operator'],
  ['0', 'wide digit'], ['.', 'decimal'], ['=', 'equals'],
];
const SCIENTIFIC_KEYS = ['sin(', 'cos(', 'tan(', 'ln(', 'log(', '√(', '^', '(', ')'];
const HISTORY_LIMIT = 24;

export function buildCalculator(id, ctx) {
  const root = document.createElement('section');
  root.className = 'utility-app calc-wrap';
  const expressionId = `${id || 'calculator'}-expression`;
  root.innerHTML = `
    <div class="calc" aria-label="Calculator">
      <header class="calc-header"><div><span class="calc-kicker">DESK / 04</span><h2>Calculator</h2></div>
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
            <div class="calc-graph-controls">
              <label>y = <input class="calc-function" aria-label="Function of x" value="sin(x)" spellcheck="false"></label>
              <label>x from <input class="calc-range-min" aria-label="Minimum x" type="number" value="-10" step="1"></label>
              <label>to <input class="calc-range-max" aria-label="Maximum x" type="number" value="10" step="1"></label>
              <button type="button" class="calc-plot">Plot</button>
            </div>
            <svg class="calc-plot-area" role="img" aria-label="Graph of the entered function" viewBox="0 0 640 300" preserveAspectRatio="none"></svg>
            <p class="calc-graph-status" role="status" aria-live="polite">Enter an expression in x and choose Plot.</p>
          </section>
        </main>
        <aside class="calc-history" aria-label="Calculation history">
          <div class="calc-history-heading"><div><span class="calc-kicker">RECENT</span><h3>History</h3></div><button type="button" class="calc-history-clear">Clear</button></div>
          <ol class="calc-history-list"></ol>
          <p class="calc-history-empty">Your completed calculations will appear here.</p>
        </aside>
      </div>
    </div>`;

  const input = root.querySelector('.calc-expression');
  const value = root.querySelector('.calc-value');
  const message = root.querySelector('.calc-message');
  const keys = root.querySelector('.calc-keys');
  const scientific = root.querySelector('.calc-scientific');
  const historyList = root.querySelector('.calc-history-list');
  const historyEmpty = root.querySelector('.calc-history-empty');
  const graph = root.querySelector('.calc-graph');
  const plotArea = root.querySelector('.calc-plot-area');
  const graphStatus = root.querySelector('.calc-graph-status');
  const history = [];
  let mode = 'basic';
  let resultFresh = false;

  const format = number => {
    if (!Number.isFinite(number)) throw new Error('The result is not a finite number.');
    return String(Number(number.toPrecision(12)));
  };
  const renderHistory = () => {
    historyList.replaceChildren();
    history.forEach((entry, index) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calc-history-entry';
      button.setAttribute('aria-label', `Reuse result ${entry.result} from ${entry.expression}`);
      const expression = document.createElement('span');
      expression.textContent = entry.expression;
      const result = document.createElement('strong');
      result.textContent = entry.result;
      button.append(expression, result);
      button.addEventListener('click', () => {
        input.value = entry.result;
        value.textContent = entry.result;
        message.textContent = 'History result loaded into the expression.';
        resultFresh = true;
        input.focus({ preventScroll: true });
      });
      li.dataset.historyIndex = String(index);
      li.append(button);
      historyList.append(li);
    });
    historyEmpty.hidden = history.length > 0;
  };
  const calculate = (record = true) => {
    try {
      const expression = input.value.trim();
      const result = format(evaluateExpression(expression));
      value.textContent = result;
      message.textContent = '';
      input.setSelectionRange(input.value.length, input.value.length);
      if (record && expression) {
        history.unshift({ expression, result });
        history.splice(HISTORY_LIMIT);
        renderHistory();
        resultFresh = true;
      }
      return result;
    } catch (error) {
      value.textContent = '—';
      message.textContent = error.message || 'Check the expression and try again.';
      resultFresh = false;
      return null;
    }
  };
  const updatePreview = () => {
    if (!input.value.trim()) {
      value.textContent = '0';
      message.textContent = '';
      return;
    }
    const result = calculate(false);
    if (result !== null) message.textContent = '';
  };
  const setMode = next => {
    mode = next;
    root.dataset.mode = next;
    root.querySelectorAll('.calc-modes button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === next));
    });
    scientific.hidden = next !== 'scientific';
    graph.hidden = next !== 'graph';
    keys.hidden = next === 'graph';
    if (next === 'graph') plot();
  };
  const insert = (text, replaceResult = false) => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const replace = resultFresh && replaceResult;
    const replaceZero = input.value === '0' && replaceResult;
    const base = replace || replaceZero ? '' : input.value;
    const offset = replace || replaceZero ? 0 : start;
    const suffixStart = replace || replaceZero ? 0 : end;
    const insertion = (replace || replaceZero) && text === '.' ? '0.' : text;
    input.value = `${base.slice(0, offset)}${insertion}${base.slice(suffixStart)}`;
    const caret = offset + insertion.length;
    input.setSelectionRange(caret, caret);
    resultFresh = false;
    input.focus({ preventScroll: true });
    updatePreview();
  };
  const clear = () => { input.value = '0'; value.textContent = '0'; message.textContent = ''; resultFresh = false; input.focus({ preventScroll: true }); };

  BASIC_KEYS.forEach(([label, kind]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `calc-key ${kind.includes('operator') ? 'operator' : ''} ${kind.includes('equals') ? 'equals' : ''} ${kind.includes('wide') ? 'wide' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      if (kind.includes('clear')) clear();
      else if (kind.includes('equals')) calculate(true);
      else if (kind.includes('sign')) {
        const match = input.value.match(/(-?\d*\.?\d+)$/);
        if (match) {
          const start = match.index;
          input.setRangeText(String(-Number(match[0])), start, input.value.length, 'end');
          resultFresh = false;
          updatePreview();
        }
      }
      else if (kind.includes('percent')) insert('/100');
      else if (kind.includes('operator')) insert(({ '÷': '/', '×': '*', '−': '-' })[label] || label);
      else insert(label, kind.includes('digit') || kind.includes('decimal'));
    });
    keys.append(button);
  });
  SCIENTIFIC_KEYS.forEach(label => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calc-science-key';
    button.textContent = label;
    button.addEventListener('click', () => insert(label === '√(' ? 'sqrt(' : label, true));
    scientific.append(button);
  });
  root.querySelectorAll('.calc-modes button').forEach(button =>
    button.addEventListener('click', () => setMode(button.dataset.mode)));
  root.querySelector('.calc-history-clear').addEventListener('click', () => {
    history.splice(0);
    renderHistory();
  });
  input.addEventListener('input', () => { resultFresh = false; updatePreview(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); calculate(true); }
    if (event.key === 'Escape') clear();
  });
  root.querySelector('.calc-plot').addEventListener('click', plot);
  root.querySelector('.calc-function').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); plot(); }
  });

  function plot() {
    const expression = root.querySelector('.calc-function').value.trim();
    const min = Number(root.querySelector('.calc-range-min').value);
    const max = Number(root.querySelector('.calc-range-max').value);
    plotArea.replaceChildren();
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      graphStatus.textContent = 'Choose a valid x range where the start is less than the end.';
      return;
    }
    let points = [];
    try {
      const count = 320;
      for (let index = 0; index <= count; index++) {
        const x = min + (max - min) * index / count;
        const y = evaluateExpression(expression, x);
        points.push(Number.isFinite(y) && Math.abs(y) < 1e7 ? { x, y } : null);
      }
    } catch (error) {
      graphStatus.textContent = `Cannot plot this expression: ${error.message}`;
      return;
    }
    const valid = points.filter(Boolean);
    if (!valid.length) {
      graphStatus.textContent = 'This expression has no finite values in the selected x range.';
      return;
    }
    let low = Math.min(...valid.map(point => point.y));
    let high = Math.max(...valid.map(point => point.y));
    if (low === high) { low -= 1; high += 1; }
    const pad = (high - low) * .08;
    low -= pad; high += pad;
    const yAt = y => 280 - (y - low) / (high - low) * 260;
    const xAt = x => 40 + (x - min) / (max - min) * 580;
    const ns = 'http://www.w3.org/2000/svg';
    const grid = document.createElementNS(ns, 'path');
    const zeroY = low <= 0 && high >= 0 ? yAt(0) : null;
    const zeroX = min <= 0 && max >= 0 ? xAt(0) : null;
    grid.setAttribute('d', `M40 20V280H620${zeroY === null ? '' : ` M40 ${zeroY}H620`}${zeroX === null ? '' : ` M${zeroX} 20V280`}`);
    grid.setAttribute('class', 'calc-graph-axis');
    plotArea.append(grid);
    const rangeLabels = [
      { x: 42, y: 296, anchor: 'start', text: format(min) },
      { x: 618, y: 296, anchor: 'end', text: format(max) },
      { x: 35, y: 25, anchor: 'end', text: format(high) },
      { x: 35, y: 278, anchor: 'end', text: format(low) },
    ];
    rangeLabels.forEach(({ x, y, anchor, text }) => {
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(y));
      label.setAttribute('text-anchor', anchor);
      label.setAttribute('class', 'calc-graph-label');
      label.textContent = text;
      plotArea.append(label);
    });
    const path = document.createElementNS(ns, 'path');
    let d = '';
    let drawing = false;
    points.forEach(point => {
      if (!point) { drawing = false; return; }
      const y = yAt(point.y);
      if (y < -1000 || y > 1300) { drawing = false; return; }
      d += `${drawing ? 'L' : 'M'}${xAt(point.x).toFixed(2)} ${y.toFixed(2)} `;
      drawing = true;
    });
    path.setAttribute('d', d);
    path.setAttribute('class', 'calc-graph-line');
    plotArea.append(path);
    graphStatus.textContent = `Plotted y = ${expression} from x = ${format(min)} to ${format(max)}.`;
  }

  const onKey = event => {
    if (event.ctrlKey || event.metaKey || event.altKey || !root.isConnected || !root.closest('.app-window')?.classList.contains('focused')) return;
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'Escape') { clear(); return; }
    const map = { '*': '*', '/': '/', '-': '-', Enter: '=', '=': '=' };
    const key = map[event.key] || event.key;
    if (/^[0-9.]$/.test(key)) { event.preventDefault(); insert(key, true); }
    else if (['+', '-', '*', '/'].includes(key)) { event.preventDefault(); insert(key); }
    else if (key === '=') { event.preventDefault(); calculate(true); }
    else if (event.key === 'Backspace') {
      event.preventDefault();
      input.value = input.value.length > 1 ? input.value.slice(0, -1) : '0';
      updatePreview();
    }
  };
  document.addEventListener('keydown', onKey);
  renderHistory();
  if (ctx?.appApis && id) ctx.appApis[id] = { destroy: () => document.removeEventListener('keydown', onKey) };
  return root;
}

export function evaluateExpression(source, xValue = null) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Enter an expression first.');
  if (source.length > 180) throw new Error('Expression is too long.');
  const tokens = tokenize(source);
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];
  const expect = token => {
    if (take() !== token) throw new Error(`Expected “${token}”.`);
  };
  const primary = () => {
    const token = take();
    if (token === undefined) throw new Error('Expression is incomplete.');
    if (token === '+') return primary();
    if (token === '-') return -primary();
    if (token === '(') {
      const result = sum();
      expect(')');
      return result;
    }
    if (/^\d/.test(token) || /^\.\d/.test(token)) return Number(token);
    if (token === 'x') {
      if (xValue === null) throw new Error('Use x only in graph mode.');
      return xValue;
    }
    if (token === 'pi') return Math.PI;
    if (token === 'e') return Math.E;
    if (['sin', 'cos', 'tan', 'ln', 'log', 'sqrt'].includes(token)) {
      expect('(');
      const argument = sum();
      expect(')');
      const functions = { sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, sqrt: Math.sqrt };
      const result = functions[token](argument);
      if (!Number.isFinite(result)) throw new Error(`${token} is undefined for this value.`);
      return result;
    }
    throw new Error(`Unexpected token “${token}”.`);
  };
  const power = () => {
    const left = primary();
    return peek() === '^' ? (take(), left ** power()) : left;
  };
  const product = () => {
    let result = power();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const operator = take();
      const right = power();
      if ((operator === '/' || operator === '%') && right === 0) throw new Error('Cannot divide by zero.');
      result = operator === '*' ? result * right : operator === '/' ? result / right : result % right;
    }
    return result;
  };
  const sum = () => {
    let result = product();
    while (peek() === '+' || peek() === '-') {
      const operator = take();
      const right = product();
      result = operator === '+' ? result + right : result - right;
    }
    return result;
  };
  const result = sum();
  if (cursor !== tokens.length) throw new Error(`Unexpected token “${peek()}”.`);
  if (!Number.isFinite(result)) throw new Error('The result is not a finite number.');
  return result;
}

function tokenize(source) {
  const tokens = [];
  const pattern = /\s*([0-9]+(?:\.[0-9]*)?|\.[0-9]+|[a-zA-Z]+|[+\-*/%^()])/gy;
  let position = 0;
  while (position < source.length) {
    if (!source.slice(position).trim()) break;
    pattern.lastIndex = position;
    const match = pattern.exec(source);
    if (!match) throw new Error(`Unsupported character “${source[position]}”.`);
    const token = match[1].toLowerCase();
    if (/^[a-z]+$/.test(token) && !['x', 'pi', 'e', 'sin', 'cos', 'tan', 'ln', 'log', 'sqrt'].includes(token)) {
      throw new Error(`Unknown function or name “${token}”.`);
    }
    tokens.push(token);
    position = pattern.lastIndex;
  }
  return tokens;
}
