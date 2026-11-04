const assert = require('node:assert/strict');
const { test } = require('node:test');

const mathModule = import('../artifacts/personal-website/public/apps/calculator-math.js');

test('radix parsing supports fractional digits and explicit prefixes', async () => {
  const { parseRadixNumber } = await mathModule;
  assert.equal(parseRadixNumber('101.01', 2), 5.25);
  assert.equal(parseRadixNumber('17', 8), 15);
  assert.equal(parseRadixNumber('0o17', 10), 15);
  assert.equal(parseRadixNumber('0xFF', 2), 255);
  assert.throws(() => parseRadixNumber('2', 2), {
    message: 'Digit “2” is not valid in base 2.',
  });
});

test('token scanning normalizes math symbols and preserves source locations', async () => {
  const { scanExpressionTokens } = await mathModule;
  const tokens = scanExpressionTokens(' π + √(4) × θ ');
  assert.deepEqual(tokens.map(({ value }) => value), ['pi', '+', 'sqrt', '(', '4', ')', '*', 'theta']);
  assert.equal(tokens[0].start, 1);
  assert.equal(tokens[0].end, 2);
  assert.equal(tokens[4].numeric, true);
  assert.equal(tokens[7].numeric, false);
  assert.throws(() => scanExpressionTokens('unknown(1)'), {
    message: 'Unknown function or name “unknown”.',
  });
  assert.throws(() => scanExpressionTokens('1&2'), {
    message: 'Unsupported character “&”.',
  });
});

test('radix formatting and expression conversion preserve expected notation', async () => {
  const { convertExpressionRadix, formatRadixNumber } = await mathModule;
  assert.equal(formatRadixNumber(-10.5, 2), '-0b1010.1');
  assert.equal(formatRadixNumber(10.5, 8), '0o12.4');
  assert.equal(formatRadixNumber(15.5, 16), '0xf.8');
  assert.equal(formatRadixNumber(1 / 3, 10), '0.333333333333');
  assert.equal(convertExpressionRadix('0xA + 0b11', 16, 10), '10 + 3');
  assert.equal(convertExpressionRadix('101+1', 2, 16), '0x5+0x1');
  assert.throws(() => formatRadixNumber(Number.POSITIVE_INFINITY, 2), {
    message: 'The result is not a finite number.',
  });
  assert.throws(() => formatRadixNumber(1, 3), { message: 'Unsupported number base.' });
});

test('expression evaluation keeps operator precedence and calculator syntax', async () => {
  const { evaluateExpression } = await mathModule;
  assert.equal(evaluateExpression('1 + 2 * 3'), 7);
  assert.equal(evaluateExpression('(1 + 2) * 3'), 9);
  assert.equal(evaluateExpression('2^3^2'), 512);
  assert.equal(evaluateExpression('-2^2'), 4);
  assert.equal(evaluateExpression('5 % 2'), 1);
  assert.equal(evaluateExpression('0b101 + 0o2 + 0xF'), 22);
  assert.equal(evaluateExpression('0xA + 1', null, 16), 11);
});

test('expressions support variables, constants, aliases, and math functions', async () => {
  const { evaluateExpression } = await mathModule;
  assert.equal(evaluateExpression('x^2 + 1', { x: 3 }), 10);
  assert.equal(evaluateExpression('x + 1', 2), 3);
  assert.equal(evaluateExpression('theta + t', { theta: 4, t: 2 }), 6);
  assert.ok(Math.abs(evaluateExpression('sin(π / 2)') - 1) < 1e-12);
  assert.equal(evaluateExpression('sqrt(9) + log(100) + ln(e)'), 6);
});

test('expression errors retain their current messages', async () => {
  const { evaluateExpression } = await mathModule;
  assert.throws(() => evaluateExpression(''), { message: 'Enter an expression first.' });
  assert.throws(() => evaluateExpression('1'.repeat(181)), { message: 'Expression is too long.' });
  assert.throws(() => evaluateExpression('x + 1'), {
    message: 'Use x only in the matching graph mode.',
  });
  assert.throws(() => evaluateExpression('1 / 0'), { message: 'Cannot divide by zero.' });
  assert.throws(() => evaluateExpression('sqrt(-1)'), {
    message: 'sqrt is undefined for this value.',
  });
  assert.throws(() => evaluateExpression('1 +'), { message: 'Expression is incomplete.' });
  assert.throws(() => evaluateExpression('1 2'), { message: 'Unexpected token “2”.' });
  assert.throws(() => evaluateExpression('10^1000'), {
    message: 'The result is not a finite number.',
  });
});
