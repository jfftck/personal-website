'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
let cards, mines, reversi, chess;
test.before(async () => {
  [cards, mines, reversi, chess] = await Promise.all([
    import('../apps/games/cards.js'), import('../apps/games/minesweeper.js'),
    import('../apps/games/reversi.js'), import('../apps/games/chess.js'),
  ]);
});
const card = (rank, suit = 0, up = true) => ({ id: `${rank}-${suit}`, rank, suit, up });
const from = (zone, index = 0, offset = 0) => ({ zone, index, offset });
const to = (zone, index = 0) => ({ zone, index });
function blank(kind) {
  const state = cards.createSolitaire(kind);
  state.columns.forEach(pile => pile.splice(0)); state.stock = [];
  return state;
}

test('all solitaire deals conserve cards, unique IDs, and the correct exposed layout', () => {
  for (const [kind, count, sizes, stock] of [
    ['klondike', 52, [1, 2, 3, 4, 5, 6, 7], 24],
    ['spider', 104, [6, 6, 6, 6, 5, 5, 5, 5, 5, 5], 50],
    ['freecell', 52, [7, 7, 7, 7, 6, 6, 6, 6], 0],
  ]) {
    const s = cards.createSolitaire(kind, {}, () => 0.25);
    const deck = [...s.columns.flat(), ...s.stock];
    assert.equal(deck.length, count); assert.equal(new Set(deck.map(c => c.id)).size, count);
    assert.deepEqual(s.columns.map(p => p.length), sizes);
    assert.equal(s.stock.length, stock);
    assert.equal(s.columns.flat().filter(c => c.up).length, kind === 'freecell' ? 52 : sizes.length);
  }
});

test('Klondike enforces alternating colors, descending runs, King-only spaces, and flips exposed cards', () => {
  const s = blank('klondike');
  s.columns[0] = [card(8, 0, false), card(7, 1), card(6, 0)];
  s.columns[1] = [card(8, 2)]; // black
  assert.equal(cards.moveCards(s, from('columns', 0, 1), to('columns', 1)), true);
  assert.equal(s.columns[0][0].up, true);
  assert.equal(cards.moveCards(s, from('columns', 1, 1), to('columns', 2)), false);
  s.columns[3] = [card(13, 1)];
  assert.equal(cards.moveCards(s, from('columns', 3), to('columns', 2)), true);
  s.columns[4] = [card(12, 1)];
  assert.equal(cards.moveCards(s, from('columns', 4), to('columns', 2)), false);
});

test('foundations start with Aces and ascend by matching suit', () => {
  const s = blank('freecell');
  s.columns[0] = [card(2)];
  assert.equal(cards.moveCards(s, from('columns'), to('foundations')), false);
  s.columns[1] = [card(1)];
  assert.equal(cards.moveCards(s, from('columns', 1), to('foundations')), true);
  assert.equal(cards.moveCards(s, from('columns'), to('foundations')), true);
  s.columns[2] = [card(3, 1)];
  assert.equal(cards.moveCards(s, from('columns', 2), to('foundations')), false);
});

test('Klondike draw-three and recycling preserve order without duplicating cards', () => {
  const s = blank('klondike');
  s.drawCount = 3; s.stock = [card(1), card(2), card(3), card(4)];
  cards.drawCards(s);
  assert.deepEqual(s.waste.map(c => c.rank), [4, 3, 2]);
  cards.drawCards(s); cards.drawCards(s);
  assert.equal(s.waste.length, 0);
  assert.deepEqual(s.stock.map(c => c.rank), [1, 2, 3, 4]);
  cards.drawCards(s);
  assert.deepEqual(s.waste.map(c => c.rank), [4, 3, 2]);
});

test('FreeCell moves respect free-cell occupancy and sequence capacity', () => {
  const s = blank('freecell');
  s.columns = s.columns.map(() => [card(13, 1)]);
  s.columns[0] = [card(12), card(11, 1)];
  s.cells = s.cells.map(() => [card(5)]);
  assert.equal(cards.moveCards(s, from('columns'), to('columns', 1)), false);
  s.cells[0] = [];
  assert.equal(cards.moveCards(s, from('columns'), to('columns', 1)), true);
  assert.equal(cards.moveCards(s, from('columns', 1, 2), to('cells')), true);
  assert.equal(cards.moveCards(s, from('columns', 2), to('cells')), false);
});

test('FreeCell excludes an empty destination from staging-space capacity', () => {
  const s = blank('freecell');
  s.columns = s.columns.map(() => [card(13)]);
  s.columns[0] = [card(12), card(11, 1)];
  s.columns[1] = [];
  s.cells = s.cells.map(() => [card(5)]);
  assert.equal(cards.moveCards(s, from('columns'), to('columns', 1)), false);
});

test('Spider only moves same-suit runs and accepts mixed suits at the destination', () => {
  const s = blank('spider');
  s.columns[0] = [card(7), card(6, 1)];
  s.columns[1] = [card(8, 1)];
  assert.equal(cards.moveCards(s, from('columns'), to('columns', 1)), false);
  s.columns[2] = [card(7)];
  assert.equal(cards.moveCards(s, from('columns', 0, 1), to('columns', 2)), true);
});

test('Spider deals only onto filled columns and clears complete King-to-Ace runs', () => {
  const s = blank('spider');
  s.stock = Array.from({ length: 10 }, () => card(2));
  assert.equal(cards.drawCards(s), false);
  s.columns.forEach(p => p.push(card(5)));
  assert.equal(cards.drawCards(s), true);
  assert.equal(s.stock.length, 0);
  s.columns[0] = Array.from({ length: 12 }, (_, i) => card(13 - i));
  s.columns[1] = [card(1)]; s.completed = 7;
  assert.equal(cards.moveCards(s, from('columns', 1), to('columns')), true);
  assert.equal(s.completed, 8); assert.equal(s.won, true);
});

test('finishing all solitaire foundations wins and blocks further play', () => {
  const s = blank('klondike');
  s.foundations = Array.from({ length: 4 }, (_, suit) => Array.from({ length: suit ? 13 : 12 }, (_, i) => card(i + 1, suit)));
  s.columns[0] = [card(13)];
  assert.equal(cards.moveCards(s, from('columns'), to('foundations')), true);
  assert.equal(s.won, true); assert.equal(cards.drawCards(s), false);
});

test('Minesweeper difficulty sizes, mine counts, and safe-first-reveal hold', () => {
  for (const level of Object.keys(mines.MINE_LEVELS)) {
    const s = mines.createMinesweeper(level);
    mines.revealMineCell(s, 0, () => 0.5);
    assert.equal(s.cells.filter(c => c.mine).length, s.mines);
    assert.equal(s.cells[0].count, 0);
    assert.equal(mines.neighbors(s, 0).some(i => s.cells[i].mine), false);
    assert.equal(s.cells[0].open, true);
  }
});

test('Minesweeper flags prevent accidental reveal and a mine ends play', () => {
  const s = mines.createMinesweeper();
  mines.flagMineCell(s, 0);
  assert.equal(mines.revealMineCell(s, 0), false);
  assert.equal(s.planted, false);
  mines.flagMineCell(s, 0); mines.revealMineCell(s, 0, () => 0.5);
  const mine = s.cells.findIndex(c => c.mine);
  mines.revealMineCell(s, mine);
  assert.equal(s.status, 'lost');
  assert.equal(mines.flagMineCell(s, 80), false);
});

test('Minesweeper recognizes a win and chording reveals unflagged neighbors', () => {
  const s = mines.createMinesweeper();
  mines.revealMineCell(s, 0, () => 0.4);
  s.cells.forEach((c, i) => { if (c.mine) mines.flagMineCell(s, i); });
  const number = s.cells.findIndex(c => c.open && c.count);
  assert.equal(mines.revealMineCell(s, number), true);
  s.cells.forEach((c, i) => { if (!c.mine) mines.revealMineCell(s, i); });
  assert.equal(s.status, 'won');
});

test('Reversi opening, flips, invalid moves, and computer move are legal', () => {
  const s = reversi.createReversi();
  assert.deepEqual(reversi.reversiMoves(s.board, 1), [19, 26, 37, 44]);
  assert.equal(reversi.playReversi(s, 0), false);
  assert.equal(reversi.playReversi(s, 19), true);
  assert.deepEqual(reversi.reversiScore(s.board), { black: 4, white: 1 });
  assert.equal(s.turn, -1);
  const before = structuredClone(s);
  const move = reversi.chooseReversiMove(s, 2);
  assert.ok(reversi.reversiMoves(s.board, -1).includes(move));
  assert.deepEqual(s, before);
});

test('Reversi handles forced passes and ends when neither side can move', () => {
  let s = reversi.createReversi(), passed = false;
  // Deterministic full games exercise forced-pass cases without relying on UI.
  for (let game = 0; game < 8 && !passed; game++) {
    s = reversi.createReversi();
    let step = 0;
    while (s.status === 'playing') {
      const legal = reversi.reversiMoves(s.board, s.turn);
      assert.ok(legal.length);
      reversi.playReversi(s, legal[(step++ * (game + 1)) % legal.length]);
      if (s.passed && s.status === 'playing') passed = true;
    }
    const score = reversi.reversiScore(s.board);
    assert.ok(score.black + score.white <= 64);
    assert.equal(reversi.reversiMoves(s.board, 1).length, 0);
    assert.equal(reversi.reversiMoves(s.board, -1).length, 0);
  }
  assert.equal(passed, true);
});

test('Chess rejects illegal and self-check moves, permits castling and en passant', () => {
  const g = new chess.Chess();
  assert.equal(g.moves().length, 20);
  assert.throws(() => g.move({ from: 'e2', to: 'e5' }));
  const castle = new chess.Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  castle.move('O-O'); assert.equal(castle.get('f1').type, 'r');
  const pinned = new chess.Chess('k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1');
  assert.equal(pinned.moves({ square: 'e2', verbose: true }).some(m => m.to === 'd2'), false);
  ['e4', 'a6', 'e5', 'd5'].forEach(m => g.move(m));
  g.move('exd6'); assert.equal(g.get('d5'), undefined);
});

test('Chess promotion, checkmate, stalemate, material, repetition and fifty-move draws', () => {
  const promote = new chess.Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');
  promote.move({ from: 'a7', to: 'a8', promotion: 'n' });
  assert.equal(promote.get('a8').type, 'n');
  const mate = new chess.Chess();
  ['f3', 'e5', 'g4', 'Qh4#'].forEach(m => mate.move(m));
  assert.match(chess.chessStatus(mate), /Black wins/);
  const stale = new chess.Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.match(chess.chessStatus(stale), /stalemate/);
  assert.match(chess.chessStatus(new chess.Chess('7k/8/6K1/8/8/8/8/8 w - - 0 1')), /insufficient material/);
  const repeat = new chess.Chess();
  ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach(m => repeat.move(m));
  assert.match(chess.chessStatus(repeat), /repetition/);
  assert.match(chess.chessStatus(new chess.Chess('7k/8/6K1/8/8/8/8/R7 w - - 100 51')), /fifty-move/);
});

test('Chess computer chooses a legal move without mutating the game', () => {
  const g = new chess.Chess(); g.move('e4');
  const before = g.fen(), history = g.history();
  const move = chess.chooseChessMove(g, 2, 1000);
  assert.equal(g.fen(), before); assert.deepEqual(g.history(), history);
  assert.ok(g.move(move));
});
