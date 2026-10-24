import { shuffle } from './cards.js';

export const MINE_LEVELS = {
  beginner: [9, 9, 10], intermediate: [16, 16, 40], expert: [30, 16, 99],
};

export function createMinesweeper(level = 'beginner') {
  const [width, height, mines] = MINE_LEVELS[level];
  return {
    width, height, mines, planted: false, status: 'playing',
    cells: Array.from({ length: width * height }, () => ({
      mine: false, open: false, flag: false, count: 0,
    })),
  };
}

export function neighbors(state, index) {
  const x = index % state.width, y = Math.floor(index / state.width);
  const result = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx || dy) && x + dx >= 0 && x + dx < state.width && y + dy >= 0 && y + dy < state.height) {
      result.push((y + dy) * state.width + x + dx);
    }
  }
  return result;
}

export function revealMineCell(state, index, random = Math.random) {
  const cell = state.cells[index];
  if (!cell || cell.flag || state.status !== 'playing') return false;
  if (!state.planted) {
    const safe = new Set([index, ...neighbors(state, index)]);
    const available = state.cells.map((_, i) => i).filter(i => !safe.has(i));
    shuffle(available, random).slice(0, state.mines).forEach(i => { state.cells[i].mine = true; });
    state.cells.forEach((item, i) => {
      item.count = neighbors(state, i).filter(n => state.cells[n].mine).length;
    });
    state.planted = true;
  }
  // Revealing an open numbered cell chords its neighbors when flags match.
  if (cell.open) {
    const adjacent = neighbors(state, index);
    if (!cell.count || adjacent.filter(i => state.cells[i].flag).length !== cell.count) return false;
    adjacent.filter(i => !state.cells[i].open && !state.cells[i].flag)
      .forEach(i => revealMineCell(state, i, random));
    return true;
  }
  if (cell.mine) {
    cell.open = true;
    state.status = 'lost';
    state.exploded = index;
    return true;
  }
  const queue = [index];
  while (queue.length) {
    const i = queue.pop(), item = state.cells[i];
    if (item.open || item.flag || item.mine) continue;
    item.open = true;
    if (!item.count) queue.push(...neighbors(state, i));
  }
  if (state.cells.every(item => item.mine || item.open)) state.status = 'won';
  return true;
}

export function flagMineCell(state, index) {
  const cell = state.cells[index];
  if (!cell || cell.open || state.status !== 'playing') return false;
  cell.flag = !cell.flag;
  return true;
}
