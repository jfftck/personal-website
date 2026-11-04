'use strict';

const MATH_SYMBOL_ALIASES = Object.freeze({
  'θ': 'theta', 'Θ': 'theta', 'π': 'pi', 'Π': 'pi', '√': 'sqrt',
  '×': '*', '÷': '/', '−': '-',
});

export function parseRadixNumber(raw, radix) {
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

export function scanExpressionTokens(source, radix = 10) {
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

export function formatRadixNumber(number, radix) {
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

export function convertExpressionRadix(source, fromRadix, toRadix) {
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

export function evaluateExpression(source, variableValues = null, radix = 10) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Enter an expression first.');
  if (source.length > 180) throw new Error('Expression is too long.');
  const tokens = scanExpressionTokens(source, radix).map(token => token.value);
  let cursor = 0;
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
