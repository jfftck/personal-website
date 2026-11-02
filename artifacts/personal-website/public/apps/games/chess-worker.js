import { Chess, chooseChessMove } from './chess.js';

self.onmessage = event => {
  try {
    const game = new Chess();
    for (const move of event.data.history) game.move(move);
    const levels = {
      easy: { depth: 1, budget: 250 },
      medium: { depth: 3, budget: 900 },
      hard: { depth: 4, budget: 2200 },
    };
    const { depth, budget } = levels[event.data.difficulty] || levels.medium;
    self.postMessage({ move: chooseChessMove(game, depth, budget) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
