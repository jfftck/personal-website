import { Chess } from './chess.js';
import { createReversi, reversiMoves } from './reversi.js';

export const GAME_STATE_VERSION = 1;

export function createGameSession(kind, options, state) {
  return {
    version: GAME_STATE_VERSION,
    kind,
    options: structuredClone(options),
    state: structuredClone(state),
  };
}

function isInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function validCards(kind, options, state) {
  if (!options || !state || state.kind !== kind) return false;
  const spider = kind === 'spider';
  const suits = options.suits;
  const drawCount = kind === 'klondike' ? options.drawCount : 1;
  if ((spider && ![1, 2, 4].includes(suits))
    || (!spider && suits !== 1)
    || (kind === 'klondike' && ![1, 3].includes(drawCount))) return false;
  if (!isInteger(state.suits, 1, 4) || state.suits !== suits
    || !isInteger(state.drawCount, 1, 3) || state.drawCount !== drawCount
    || !Array.isArray(state.columns) || state.columns.length !== (spider ? 10 : kind === 'freecell' ? 8 : 7)
    || !Array.isArray(state.stock) || !Array.isArray(state.waste)
    || !Array.isArray(state.foundations) || state.foundations.length !== 4
    || !Array.isArray(state.cells) || state.cells.length !== 4
    || !isInteger(state.completed, 0, 8) || !isInteger(state.moves, 0, Number.MAX_SAFE_INTEGER)
    || typeof state.won !== 'boolean') return false;
  const piles = [...state.columns, state.stock, state.waste, ...state.foundations, ...state.cells];
  if (piles.some(pile => !Array.isArray(pile))) return false;
  if (state.cells.some(pile => pile.length > 1)
    || state.foundations.some(pile => pile.length > 13)
    || state.columns.some(pile => pile.length > 104)) return false;
  const cards = piles.flat();
  const total = spider ? 104 : 52;
  if (cards.some(card => !card || !isInteger(card.id, 0, total - 1)
    || !isInteger(card.rank, 1, 13) || !isInteger(card.suit, 0, spider ? suits - 1 : 3)
    || typeof card.up !== 'boolean'
    || card.rank !== card.id % 13 + 1
    || card.suit !== (spider ? Math.floor(card.id / 13) % suits : Math.floor(card.id / 13)))
    || new Set(cards.map(card => card.id)).size !== cards.length
    || cards.length !== total - (spider ? state.completed * 13 : 0)) return false;
  if (state.won !== (spider ? state.completed === 8
    : state.foundations.reduce((sum, pile) => sum + pile.length, 0) === 52)) return false;
  return true;
}

function validMinesweeper(options, state) {
  const dimensions = {
    beginner: [9, 9, 10],
    intermediate: [16, 16, 40],
    expert: [30, 16, 99],
  };
  const [width, height, mines] = dimensions[options?.level] || [];
  if (!width || !state || state.width !== width || state.height !== height || state.mines !== mines
    || typeof state.planted !== 'boolean' || !['playing', 'won', 'lost'].includes(state.status)
    || !Array.isArray(state.cells) || state.cells.length !== width * height) return false;
  if (state.exploded !== undefined && !isInteger(state.exploded, 0, state.cells.length - 1)) return false;
  const mineCount = state.cells.filter(cell => cell?.mine === true).length;
  if (state.cells.some(cell => !cell || typeof cell.mine !== 'boolean' || typeof cell.open !== 'boolean'
    || typeof cell.flag !== 'boolean' || !isInteger(cell.count, 0, 8))) return false;
  if (state.planted ? mineCount !== mines : mineCount !== 0) return false;
  for (let index = 0; index < state.cells.length; index++) {
    const x = index % width, y = Math.floor(index / width);
    let adjacent = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && nx < width && ny >= 0 && ny < height
        && state.cells[ny * width + nx].mine) adjacent++;
    }
    if (state.cells[index].count !== adjacent || (state.cells[index].open && !state.planted)) return false;
  }
  const openedMines = state.cells.map((cell, index) => cell.mine && cell.open ? index : -1).filter(index => index >= 0);
  if (state.status === 'playing') {
    return openedMines.length === 0 && state.exploded === undefined;
  }
  if (!state.planted) return false;
  if (state.status === 'lost') return openedMines.length === 1 && state.exploded === openedMines[0];
  return openedMines.length === 0 && state.exploded === undefined
    && state.cells.every(cell => cell.mine || cell.open);
}

function validChess(options, state) {
  if (!['computer', 'local'].includes(options?.mode)
    || (options.playerColor !== undefined && !['white', 'black'].includes(options.playerColor))
    || !Array.isArray(state?.history)
    || state.history.length > 500 || state.history.some(move => typeof move !== 'string')) return false;
  try {
    const game = new Chess();
    for (const move of state.history) game.move(move);
    return true;
  } catch {
    return false;
  }
}

function validReversiPosition(state) {
  if (!Array.isArray(state?.board)
    || state.board.length !== 64 || state.board.some(cell => ![-1, 0, 1].includes(cell))
    || ![-1, 1].includes(state.turn) || !['playing', 'finished'].includes(state.status)
    || ![null, -1, 1].includes(state.passed)) return false;
  const initial = createReversi();
  if (state.board.filter(Boolean).length < initial.board.filter(Boolean).length) return false;
  const hasMoves = player => reversiMoves(state.board, player).length > 0;
  return state.status === 'playing'
    ? hasMoves(state.turn) && state.passed !== state.turn
    : !hasMoves(1) && !hasMoves(-1);
}

function validReversi(options, state) {
  if (!['computer', 'local'].includes(options?.mode)
    || (options.playerColor !== undefined && !['white', 'black'].includes(options.playerColor))
    || !validReversiPosition(state)) return false;
  if (state.snapshots !== undefined && (!Array.isArray(state.snapshots) || state.snapshots.length > 64
    || state.snapshots.some(snapshot => !validReversiPosition(snapshot)))) return false;
  return true;
}

export function inspectGameSession(kind, saved) {
  if (saved == null) return { status: 'missing' };
  if (!saved || saved.version !== GAME_STATE_VERSION || saved.kind !== kind
    || !saved.options || !saved.state) return { status: 'invalid' };

  let valid = false, finished = false;
  if (['klondike', 'spider', 'freecell'].includes(kind)) {
    valid = validCards(kind, saved.options, saved.state);
    finished = valid && saved.state.won;
  } else if (kind === 'minesweeper') {
    valid = validMinesweeper(saved.options, saved.state);
    finished = valid && saved.state.status !== 'playing';
  } else if (kind === 'chess') {
    valid = validChess(saved.options, saved.state);
    if (valid) {
      const game = new Chess();
      for (const move of saved.state.history) game.move(move);
      finished = game.isGameOver();
    }
  } else if (kind === 'reversi') {
    valid = validReversi(saved.options, saved.state);
    finished = valid && saved.state.status === 'finished';
  }
  return valid
    ? { status: finished ? 'finished' : 'valid', options: structuredClone(saved.options), state: structuredClone(saved.state) }
    : { status: 'invalid' };
}

export function restoreChess(history) {
  const game = new Chess();
  for (const move of history) game.move(move);
  return game;
}
