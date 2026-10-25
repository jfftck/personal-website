'use strict';

const KEYS = [
  ['AC', 'clear'], ['±', 'sign'], ['%', 'percent'], ['÷', 'operator'],
  ['7', 'digit'], ['8', 'digit'], ['9', 'digit'], ['×', 'operator'],
  ['4', 'digit'], ['5', 'digit'], ['6', 'digit'], ['−', 'operator'],
  ['1', 'digit'], ['2', 'digit'], ['3', 'digit'], ['+', 'operator'],
  ['0', 'digit wide'], ['.', 'decimal'], ['=', 'equals'],
];

export function buildCalculator(id, ctx) {
  const root = document.createElement('section');
  root.className = 'utility-app calc-wrap';
  root.innerHTML = `<div class="calc" aria-label="Calculator"><div class="calc-display" aria-live="polite"><div class="calc-expression"></div><output class="calc-value">0</output></div><div class="calc-keys"></div></div>`;
  const keys = root.querySelector('.calc-keys'), value = root.querySelector('.calc-value'), expr = root.querySelector('.calc-expression');
  let current = '0', stored = null, operation = null, fresh = false;
  const show = () => {
    const displayValue = current === 'Error'
      ? current
      : current.length > 13
        ? Number(current).toPrecision(8).replace(/\.?0+$/, '')
        : current;
    value.textContent = displayValue;
    expr.textContent = stored !== null && operation ? `${stored} ${operation}` : '';
  };
  const calculate = (a, b, op) => op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : op === '÷' ? (b === 0 ? NaN : a / b) : b;
  const activate = action => {
    if (action.type === 'digit') { current = fresh || current === '0' || current === 'Error' ? action.value : current.length < 14 ? current + action.value : current; fresh = false; }
    else if (action.type === 'clear') { current = '0'; stored = null; operation = null; fresh = false; }
    else if (action.type === 'decimal') { if (fresh || current === 'Error') current = '0'; if (!current.includes('.')) current += '.'; fresh = false; }
    else if (action.type === 'sign') { current = String(-Number(current)); }
    else if (action.type === 'percent') { current = String(Number(current) / 100); }
    else if (action.type === 'operator') {
      if (stored !== null && operation && !fresh) stored = calculate(stored, Number(current), operation);
      else stored = Number(current);
      operation = action.value; fresh = true;
    } else if (action.type === 'equals') {
      if (stored !== null && operation) current = String(calculate(stored, Number(current), operation));
      if (!Number.isFinite(Number(current))) current = 'Error';
      stored = null; operation = null; fresh = true;
    }
    show();
  };
  KEYS.forEach(([label, type]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `calc-key ${type.includes('operator') ? 'operator' : ''} ${type.includes('equals') ? 'equals' : ''} ${type.includes('wide') ? 'wide' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => activate({ type: type.split(' ')[0], value: label }));
    keys.append(button);
  });
  const onKey = event => {
    if (event.ctrlKey || event.metaKey || event.altKey || !root.isConnected || !root.closest('.app-window')?.classList.contains('focused')) return;
    const map = { '*': '×', '/': '÷', '-': '−', Enter: '=', '=': '=', Escape: 'AC', Backspace: 'AC', '%': '%' };
    const key = map[event.key] || event.key;
    const button = [...keys.children].find(item => item.textContent === key);
    if (button && (/^[0-9.]$/.test(key) || ['×', '÷', '−', '+', '=', 'AC', '±', '%'].includes(key))) { event.preventDefault(); button.click(); }
  };
  document.addEventListener('keydown', onKey);
  if (ctx?.appApis && id) ctx.appApis[id] = { destroy: () => document.removeEventListener('keydown', onKey) };
  return root;
}
