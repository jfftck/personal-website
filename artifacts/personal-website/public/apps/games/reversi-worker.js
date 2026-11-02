import { chooseReversiMove } from './reversi.js';

self.onmessage = event => {
  try {
    const move = chooseReversiMove(event.data.state, event.data.depth);
    self.postMessage({ move });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
