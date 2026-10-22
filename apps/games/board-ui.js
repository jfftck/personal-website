import { Chess, chessStatus } from './chess.js';
import { createReversi, reversiMoves, playReversi, reversiScore, chooseReversiMove } from './reversi.js';
import { gameShell, button, selectControl, preserveFocus, wireBoardKeys } from './ui.js';

const pieces = { w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' } };
const names = { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' };
const squareName = index => `${'abcdefgh'[index % 8]}${8 - Math.floor(index / 8)}`;

export function buildBoardGame(kind, id, title, ctx) {
  const isChess = kind === 'chess';
  const { el, toolbar, status, area } = gameShell(id, title, isChess
    ? 'White moves first. Select a piece, then a highlighted destination. Checkmate the opposing king to win. Castling, en passant, pawn promotion, stalemate, repetition, insufficient material, and the fifty-move rule are supported. In computer mode you play White. Arrow keys move between squares; Enter or Space selects.'
    : 'Black moves first. Place a disc so it brackets at least one opposing disc between the new disc and one of yours, in any direction. All bracketed discs flip. Legal moves are marked. A player with no move automatically passes; the game ends when neither player can move. Most discs wins. In computer mode you play Black. Arrow keys navigate; Enter or Space plays.', ctx);
  let game = isChess ? new Chess() : createReversi();
  let mode = 'computer', selected = null, promotion = null, snapshots = [];
  let worker = null, timer = null, thinking = false, disposed = false, aiError = '';
  const undo = button('Undo', undoMove);
  const retry = button('Retry computer', () => { aiError = ''; maybeComputer(); render(); });
  retry.hidden = true;
  toolbar.append(button('New game', restart), undo,
    selectControl('Opponent', [['computer', 'Computer'], ['local', 'Local two-player']], mode, value => {
      mode = value; restart();
    }), retry);

  function cancelComputer() {
    worker?.terminate(); worker = null;
    clearTimeout(timer); timer = null; thinking = false; aiError = '';
  }
  function restart() {
    cancelComputer();
    game = isChess ? new Chess() : createReversi();
    selected = null; promotion = null; snapshots = []; render();
  }
  function undoMove() {
    cancelComputer(); selected = null; promotion = null;
    if (isChess) {
      game.undo();
      if (mode === 'computer' && game.turn() === 'b') game.undo();
    } else if (snapshots.length) {
      game = snapshots.pop();
      while (mode === 'computer' && game.turn === -1 && snapshots.length) game = snapshots.pop();
    }
    render();
    maybeComputer();
  }
  function ended() { return isChess ? game.isGameOver() : game.status !== 'playing'; }
  function computerTurn() { return mode === 'computer' && (isChess ? game.turn() === 'b' : game.turn === -1) && !ended(); }
  function commit(move) {
    if (isChess) game.move(move);
    else { snapshots.push(structuredClone(game)); playReversi(game, move); }
    selected = null; promotion = null;
    render(); maybeComputer();
  }
  function failComputer(message) {
    cancelComputer(); aiError = `Computer could not move: ${message}. Retry or choose local two-player.`;
    render();
  }
  function maybeComputer() {
    if (disposed || thinking || !computerTurn()) return;
    thinking = true; render();
    if (isChess) {
      try {
        worker = new Worker(new URL('./chess-worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = event => {
          if (event.data.error || !event.data.move) {
            failComputer(event.data.error || 'no move returned'); return;
          }
          const move = event.data.move;
          cancelComputer();
          try { commit(move); } catch (error) { failComputer(error.message); }
        };
        worker.onerror = event => { event.preventDefault(); failComputer(event.message || 'worker unavailable'); };
        worker.postMessage({ history: game.history() });
      } catch (error) { failComputer(error.message); }
    } else {
      timer = setTimeout(() => {
        try {
          const move = chooseReversiMove(game);
          thinking = false;
          if (move === null) throw new Error('no legal move');
          commit(move);
        } catch (error) { failComputer(error.message); }
      }, 220);
    }
  }
  function clickSquare(index) {
    if (ended() || computerTurn() || promotion) return;
    if (!isChess) {
      if (reversiMoves(game.board, game.turn).includes(index)) commit(index);
      return;
    }
    const square = squareName(index), piece = game.get(square);
    if (selected) {
      const moves = game.moves({ square: selected, verbose: true }).filter(move => move.to === square);
      if (moves.length) {
        if (moves.some(move => move.promotion)) {
          promotion = { from: selected, to: square }; render();
          area.querySelector('.game-promotion button')?.focus();
        } else commit({ from: selected, to: square });
        return;
      }
    }
    selected = piece?.color === game.turn() && selected !== square ? square : null;
    render();
  }
  function render() {
    undo.disabled = isChess ? !game.history().length : !snapshots.length;
    retry.hidden = !aiError;
    if (isChess) status.textContent = chessStatus(game);
    else {
      const score = reversiScore(game.board);
      status.textContent = `Black ${score.black} · White ${score.white} — ${
        ended() ? score.black === score.white ? 'Draw.' : `${score.black > score.white ? 'Black' : 'White'} wins.`
          : `${game.turn === 1 ? 'Black' : 'White'} to move.${game.passed ? ` ${game.passed === 1 ? 'Black' : 'White'} has no moves and passes.` : ''}`}`;
    }
    if (promotion) status.textContent += ' Choose a promotion piece.';
    if (thinking) status.textContent += ' Computer is thinking…';
    if (aiError) status.textContent = aiError;
    preserveFocus(area, () => {
      const board = document.createElement('div');
      board.className = `game-board ${isChess ? 'chess-board' : 'reversi-board'}`;
      board.setAttribute('role', 'group'); board.setAttribute('aria-label', `${title} board`);
      const legal = isChess ? selected ? game.moves({ square: selected, verbose: true }).map(move => move.to) : []
        : reversiMoves(game.board, game.turn);
      for (let index = 0; index < 64; index++) {
        const square = squareName(index);
        const btn = button('', () => clickSquare(index), 'board-square');
        btn.classList.add((index + Math.floor(index / 8)) % 2 ? 'dark' : 'light');
        btn.classList.toggle('selected', isChess && selected === square);
        const isLegal = legal.includes(isChess ? square : index) && !computerTurn();
        btn.classList.toggle('legal', isLegal);
        btn.dataset.gridIndex = index; btn.dataset.key = `square-${index}`; btn.dataset.square = square;
        btn.tabIndex = index ? -1 : 0;
        let description = 'empty';
        if (isChess) {
          const piece = game.get(square);
          if (piece) {
            const span = document.createElement('span');
            span.className = piece.color === 'w' ? 'piece-white' : 'piece-black';
            span.textContent = pieces[piece.color][piece.type];
            span.setAttribute('aria-hidden', 'true'); btn.append(span);
            description = `${piece.color === 'w' ? 'White' : 'Black'} ${names[piece.type]}`;
          }
        } else if (game.board[index]) {
          const span = document.createElement('span');
          span.className = `disc ${game.board[index] === 1 ? 'black' : 'white'}`;
          span.setAttribute('aria-hidden', 'true'); btn.append(span);
          description = game.board[index] === 1 ? 'Black disc' : 'White disc';
        }
        btn.setAttribute('aria-label', `${square}: ${description}${isLegal ? ', legal move' : ''}`);
        btn.setAttribute('aria-pressed', String(isChess && selected === square));
        board.append(btn);
      }
      wireBoardKeys(board, 8); area.replaceChildren(board);
      if (promotion) {
        const picker = document.createElement('div'); picker.className = 'game-promotion';
        picker.setAttribute('role', 'group'); picker.setAttribute('aria-label', 'Promote pawn');
        for (const type of ['q', 'r', 'b', 'n']) {
          const option = button(names[type], () => commit({ ...promotion, promotion: type }));
          picker.append(option);
        }
        area.append(picker);
      }
    });
  }
  ctx.appApis[id] = { destroy() { disposed = true; cancelComputer(); } };
  render();
  return el;
}
