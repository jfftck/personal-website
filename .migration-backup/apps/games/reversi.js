const directions = [-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dy => [dx, dy]))
  .filter(([dx, dy]) => dx || dy);

export function createReversi() {
  const board = Array(64).fill(0);
  board[27] = board[36] = -1;
  board[28] = board[35] = 1;
  return { board, turn: 1, status: 'playing', passed: null };
}

export function reversiFlips(board, index, player) {
  if (index < 0 || index >= 64 || board[index]) return [];
  const x = index % 8, y = Math.floor(index / 8), flips = [];
  for (const [dx, dy] of directions) {
    let nx = x + dx, ny = y + dy;
    const line = [];
    while (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny * 8 + nx] === -player) {
      line.push(ny * 8 + nx);
      nx += dx; ny += dy;
    }
    if (line.length && nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny * 8 + nx] === player) {
      flips.push(...line);
    }
  }
  return flips;
}

export function reversiMoves(board, player) {
  return board.map((_, index) => index).filter(index => reversiFlips(board, index, player).length);
}

export function playReversi(state, index) {
  if (state.status !== 'playing') return false;
  const flips = reversiFlips(state.board, index, state.turn);
  if (!flips.length) return false;
  [...flips, index].forEach(i => { state.board[i] = state.turn; });
  state.turn *= -1;
  state.passed = null;
  if (!reversiMoves(state.board, state.turn).length) {
    state.passed = state.turn;
    state.turn *= -1;
    if (!reversiMoves(state.board, state.turn).length) state.status = 'finished';
  }
  return true;
}

export function reversiScore(board) {
  return { black: board.filter(v => v === 1).length, white: board.filter(v => v === -1).length };
}

const weights = [
  100, -25, 10, 5, 5, 10, -25, 100,
  -25, -45, -2, -2, -2, -2, -45, -25,
  10, -2, 5, 1, 1, 5, -2, 10,
  5, -2, 1, 1, 1, 1, -2, 5,
  5, -2, 1, 1, 1, 1, -2, 5,
  10, -2, 5, 1, 1, 5, -2, 10,
  -25, -45, -2, -2, -2, -2, -45, -25,
  100, -25, 10, 5, 5, 10, -25, 100,
];

export function chooseReversiMove(state, depth = 3) {
  function search(position, remaining, alpha, beta) {
    if (!remaining || position.status !== 'playing') {
      const score = reversiScore(position.board);
      return position.status !== 'playing'
        ? Math.sign(score.black - score.white) * 10000 + score.black - score.white
        : position.board.reduce((sum, value, i) => sum + value * weights[i], 0)
          + 4 * (reversiMoves(position.board, 1).length - reversiMoves(position.board, -1).length);
    }
    let best = position.turn === 1 ? -Infinity : Infinity;
    for (const index of reversiMoves(position.board, position.turn)) {
      const next = structuredClone(position);
      playReversi(next, index);
      const score = search(next, remaining - 1, alpha, beta);
      if (position.turn === 1) { best = Math.max(best, score); alpha = Math.max(alpha, best); }
      else { best = Math.min(best, score); beta = Math.min(beta, best); }
      if (beta <= alpha) break;
    }
    return best;
  }
  const moves = reversiMoves(state.board, state.turn);
  let best = null, score = state.turn === 1 ? -Infinity : Infinity;
  for (const index of moves) {
    const next = structuredClone(state);
    playReversi(next, index);
    const value = search(next, depth - 1, -Infinity, Infinity);
    if (best === null || (state.turn === 1 ? value > score : value < score)) {
      best = index; score = value;
    }
  }
  return best;
}
