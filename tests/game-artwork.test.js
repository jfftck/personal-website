import assert from 'node:assert/strict';
import test from 'node:test';
import { cardFaceMarkup } from '../apps/games/card-artwork.js';
import { chessPieceSvg } from '../apps/games/chess-piece-svg.js';
import { rankLabel, SUITS } from '../apps/games/cards.js';

test('every playing card provides independent pip, ornate, and minimal SVG artwork with one corner label', () => {
  for (let suit = 0; suit < 4; suit++) for (let rank = 1; rank <= 13; rank++) {
    const markup = cardFaceMarkup({ rank, suit });
    for (const style of ['classic', 'ornate', 'minimal']) assert.ok(markup.includes(`card-art-${style}`));
    assert.ok(markup.includes(`${rankLabel(rank)}${SUITS[suit]}`));
    assert.ok(!markup.includes('undefined'));
    assert.ok(!markup.includes('id='));
    assert.equal((markup.match(/card-corner/g) || []).length, 1);
  }
});

test('all six Chess figures include three distinct vector silhouettes without shared SVG identifiers', () => {
  for (const type of ['k', 'q', 'r', 'b', 'n', 'p']) {
    const markup = chessPieceSvg(type);
    for (const style of ['classic', 'geometric', 'carved']) assert.ok(markup.includes(`chess-shape-${style}`));
    assert.ok(!markup.includes('undefined'));
    assert.ok(!markup.includes('id='));
  }
  assert.throws(() => chessPieceSvg('invalid'));
});
