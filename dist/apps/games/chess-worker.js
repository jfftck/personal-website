import { Chess, chooseChessMove } from './chess.js';

self.onmessage = event => {
  try {
    const game = new Chess();
    for (const move of event.data.history) game.move(move);
    self.postMessage({ move: chooseChessMove(game, 3, 900) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
