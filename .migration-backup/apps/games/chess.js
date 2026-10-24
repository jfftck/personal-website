import { Chess } from './vendor/chess.js';
export { Chess };

const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

function evaluate(game) {
  if (game.isCheckmate()) return -100000;
  if (game.isDraw()) return 0;
  let score = 0;
  for (const row of game.board()) for (const piece of row) {
    if (!piece) continue;
    const file = piece.square.charCodeAt(0) - 97;
    const rank = Number(piece.square[1]) - 1;
    const center = 3.5 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5)) / 2;
    const bonus = piece.type === 'p' ? (piece.color === 'w' ? rank : 7 - rank) * 5 : center * 8;
    score += (values[piece.type] + bonus) * (piece.color === game.turn() ? 1 : -1);
  }
  return score;
}

export function chooseChessMove(game, depth = 2, budget = 800) {
  const deadline = Date.now() + budget;
  const ordered = () => game.moves({ verbose: true }).sort((a, b) =>
    ((values[b.captured] || 0) + (b.promotion ? 800 : 0))
    - ((values[a.captured] || 0) + (a.promotion ? 800 : 0)));
  function search(remaining, alpha, beta) {
    if (!remaining || game.isGameOver() || Date.now() > deadline) return evaluate(game);
    let best = -Infinity;
    for (const move of ordered()) {
      game.move(move);
      const score = -search(remaining - 1, -beta, -alpha);
      game.undo();
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
      if (alpha >= beta || Date.now() > deadline) break;
    }
    return best;
  }
  let best = null, score = -Infinity;
  for (const move of ordered()) {
    game.move(move);
    const value = -search(depth - 1, -Infinity, Infinity);
    game.undo();
    if (best === null || value > score) { best = move; score = value; }
    if (Date.now() > deadline) break;
  }
  return best && { from: best.from, to: best.to, promotion: best.promotion || 'q' };
}

export function chessStatus(game) {
  const player = game.turn() === 'w' ? 'White' : 'Black';
  if (game.isCheckmate()) return `Checkmate — ${player === 'White' ? 'Black' : 'White'} wins.`;
  if (game.isStalemate()) return 'Draw — stalemate.';
  if (game.isThreefoldRepetition()) return 'Draw — threefold repetition.';
  if (game.isInsufficientMaterial()) return 'Draw — insufficient material.';
  if (game.isDrawByFiftyMoves()) return 'Draw — fifty-move rule.';
  return `${player} to move${game.isCheck() ? ' — check' : ''}.`;
}
