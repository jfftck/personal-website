import { Chess, chessStatus } from './chess.js';
import { createReversi, reversiMoves, playReversi, reversiScore, chooseReversiMove } from './reversi.js';
import {
  gameShell, button, selectControl, preserveFocus, wireBoardKeys, showRestorePrompt, showNewGameScreen,
} from './ui.js';
import { createGameSession, inspectGameSession, restoreChess } from './game-state.js';
import { addGameThemeControl, addGameThemeResetControl } from './themes.js';
import { chessPieceSvg } from './chess-piece-svg.js';

const names = { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' };
const squareName = index => `${'abcdefgh'[index % 8]}${8 - Math.floor(index / 8)}`;

export function buildBoardGame(kind, id, title, ctx, initialState = null, iconSvg) {
  const isChess = kind === 'chess';
  const { el, toolbarLeft, toolbarCenter, status, area, settings } = gameShell(id, title, isChess
    ? 'White moves first. Select a piece, then a highlighted destination. Checkmate the opposing king to win. Castling, en passant, pawn promotion, stalemate, repetition, insufficient material, and the fifty-move rule are supported. In computer mode you play White. Arrow keys move between squares; Enter or Space selects.'
      : 'Black moves first. Place a disc so it brackets at least one opposing disc between the new disc and one of yours, in any direction. All bracketed discs flip. Legal moves are marked. A player with no move automatically passes; the game ends when neither player can move. Most discs wins. In computer mode you play Black. Arrow keys navigate; Enter or Space plays.', ctx, iconSvg);
  const restored = inspectGameSession(kind, initialState);
  let game = isChess ? new Chess() : createReversi();
  let mode = restored.status === 'valid' || restored.status === 'finished'
    ? restored.options.mode : 'computer';
  let pendingRestore = initialState != null && restored.status !== 'finished';
  let selected = null, promotion = null, snapshots = [];
  let worker = null, timer = null, thinking = false, disposed = false, aiError = '';
  let endScreenTimer = null, newGameScreenCleanup = null, endScreenShown = false;
  const undo = button('Undo', undoMove);
  const retry = button('Retry computer', () => { aiError = ''; maybeComputer(); render(); });
  retry.hidden = true;
  toolbarLeft.append(undo, retry);
  toolbarCenter.append(button('New game', restart));
  settings.addGameOption(selectControl('Opponent', [['computer', 'Computer'], ['local', 'Local two-player']], mode, value => {
      mode = value; restart();
    }));
  const removeBoardTheme = addGameThemeControl(el, settings.appearanceOptions, isChess ? 'chessBoard' : 'reversiBoard');
  const removePieceTheme = addGameThemeControl(el, settings.appearanceOptions, isChess ? 'chessPieces' : 'reversiPieces');
  const removeThemeResetControl = addGameThemeResetControl(settings.appearanceOptions);

  function cancelComputer() {
    worker?.terminate(); worker = null;
    clearTimeout(timer); timer = null; thinking = false; aiError = '';
  }
  function restart() {
    settings.close();
    clearTimeout(endScreenTimer); endScreenTimer = null;
    newGameScreenCleanup?.(); newGameScreenCleanup = null;
    endScreenShown = false;
    cancelComputer();
    pendingRestore = false;
    game = isChess ? new Chess() : createReversi();
    selected = null; promotion = null; snapshots = []; render(); persist();
  }
  function chessMoveSegments(move, reverse = false) {
    if (!move) return [];
    const segments = [{ from: move.from, to: move.to }];
    const rank = move.from[1];
    if (move.flags.includes('k')) segments.push({ from: `h${rank}`, to: `f${rank}` });
    else if (move.flags.includes('q')) segments.push({ from: `a${rank}`, to: `d${rank}` });
    return reverse
      ? segments.map(segment => ({ from: segment.to, to: segment.from }))
      : segments;
  }
  function undoMove() {
    clearTimeout(endScreenTimer); endScreenTimer = null;
    newGameScreenCleanup?.(); newGameScreenCleanup = null;
    endScreenShown = false;
    cancelComputer(); selected = null; promotion = null;
    let transition = null;
    if (isChess) {
      const moves = [...chessMoveSegments(game.undo(), true)];
      if (mode === 'computer' && game.turn() === 'b') moves.push(...chessMoveSegments(game.undo(), true));
      transition = { type: 'chess', moves };
    } else if (snapshots.length) {
      const previous = game.board.slice();
      game = snapshots.pop();
      while (mode === 'computer' && game.turn === -1 && snapshots.length) game = snapshots.pop();
      transition = {
        type: 'reversi',
        placed: -1,
        flipped: game.board.flatMap((piece, index) =>
          piece && previous[index] && piece !== previous[index]
            ? [{ index, from: previous[index] }]
            : []),
      };
    }
    render(transition); persist();
    maybeComputer();
  }
  function ended() { return isChess ? game.isGameOver() : game.status !== 'playing'; }
  function computerTurn() { return mode === 'computer' && (isChess ? game.turn() === 'b' : game.turn === -1) && !ended(); }
  function commit(move) {
    clearTimeout(endScreenTimer); endScreenTimer = null;
    let transition = null;
    if (isChess) {
      const played = game.move(move);
      transition = { type: 'chess', moves: chessMoveSegments(played) };
    } else {
      const before = game.board.slice();
      snapshots.push(structuredClone(game));
      playReversi(game, move);
      transition = {
        type: 'reversi',
        placed: move,
        flipped: game.board.flatMap((piece, index) =>
          before[index] && before[index] !== piece ? [{ index, from: before[index] }] : []),
      };
    }
    selected = null; promotion = null;
    render(transition); persist(); maybeComputer();
    if (ended()) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) showEndScreen();
      else {
        endScreenTimer = setTimeout(showEndScreen, isChess ? 380 : 560);
      }
    }
  }
  function showEndScreen() {
    if (!ended() || endScreenShown) return;
    endScreenShown = true;
    const message = isChess ? chessStatus(game) : status.textContent;
    newGameScreenCleanup?.();
    newGameScreenCleanup = showNewGameScreen(
      area,
      id,
      'Game over',
      message,
      [{
        name: 'mode',
        label: 'Opponent',
        choices: [['computer', 'Computer'], ['local', 'Local two-player']],
        value: mode,
      }],
      nextOptions => {
        mode = nextOptions.mode;
        const toolbarSelect = settings.element.querySelector('select[aria-label="Opponent"]');
        if (toolbarSelect) toolbarSelect.value = mode;
        restart();
      },
    );
  }
  function persist() {
    if (!pendingRestore) ctx.saveSession();
  }
  function failComputer(message) {
    cancelComputer(); aiError = `Computer could not move: ${message}. Retry or choose local two-player.`;
    render();
  }
  function maybeComputer() {
    if (disposed || thinking || !computerTurn()) return;
    thinking = true;
    status.textContent += ' Computer is thinking…';
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
  function animateChessMoves(board, moves) {
    if (!moves?.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cellSize = board.clientWidth / 8;
    for (const move of moves) {
      const piece = board.querySelector(`[data-square="${move.to}"] .chess-piece`);
      if (!piece) continue;
      const fromFile = move.from.charCodeAt(0) - 97;
      const toFile = move.to.charCodeAt(0) - 97;
      const fromRow = 8 - Number(move.from[1]);
      const toRow = 8 - Number(move.to[1]);
      piece.classList.add('chess-piece-moving');
      const animation = piece.animate([
        {
          transform: `translate3d(${(fromFile - toFile) * cellSize}px, ${(fromRow - toRow) * cellSize}px, 0) scale(.88)`,
        },
        { transform: 'translate3d(0, 0, 0) scale(1)' },
      ], {
        duration: 340,
        easing: 'cubic-bezier(.2,.72,.28,1)',
        fill: 'both',
      });
      animation.onfinish = () => {
        piece.classList.remove('chess-piece-moving');
        animation.cancel();
      };
    }
  }
  function render(transition = null) {
    if (pendingRestore) {
      showRestorePrompt(area, () => {
        mode = restored.options.mode;
        if (isChess) {
          game = restoreChess(restored.state.history);
        } else {
          const { snapshots: savedSnapshots = [], ...savedGame } = restored.state;
          game = savedGame;
          snapshots = savedSnapshots;
        }
        pendingRestore = false;
        render(); persist(); maybeComputer();
      }, restart, restored.status === 'invalid');
      return;
    }
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
            span.className = `chess-piece ${piece.color === 'w' ? 'piece-white' : 'piece-black'}`;
            span.innerHTML = chessPieceSvg(piece.type);
            span.setAttribute('aria-hidden', 'true'); btn.append(span);
            description = `${piece.color === 'w' ? 'White' : 'Black'} ${names[piece.type]}`;
          }
        } else if (game.board[index]) {
          const span = document.createElement('span');
          span.className = `disc ${game.board[index] === 1 ? 'black' : 'white'}`;
          if (transition?.type === 'reversi' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
            if (transition.placed === index) span.classList.add('disc-placed');
            const flip = transition.flipped.find(item => item.index === index);
            if (flip) {
              span.classList.add(
                'disc-flipping',
                `flip-from-${flip.from === 1 ? 'black' : 'white'}`,
                `flip-to-${game.board[index] === 1 ? 'black' : 'white'}`,
              );
            }
          }
          span.setAttribute('aria-hidden', 'true'); btn.append(span);
          description = game.board[index] === 1 ? 'Black disc' : 'White disc';
        }
        btn.setAttribute('aria-label', `${square}: ${description}${isLegal ? ', legal move' : ''}`);
        btn.setAttribute('aria-pressed', String(isChess && selected === square));
        board.append(btn);
      }
      wireBoardKeys(board, 8); area.replaceChildren(board);
      if (transition?.type === 'chess') animateChessMoves(board, transition.moves);
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
  ctx.appApis[id] = {
    getSessionState() {
      if (pendingRestore) return initialState;
      const state = isChess ? { history: game.history() }
        : { ...structuredClone(game), snapshots: structuredClone(snapshots) };
      return createGameSession(kind, { mode }, state);
    },
    destroy() {
      disposed = true;
      clearTimeout(endScreenTimer);
      removeBoardTheme();
      removePieceTheme();
      removeThemeResetControl();
      settings.destroy();
      newGameScreenCleanup?.();
      cancelComputer();
    },
  };
  if (restored.status === 'finished') ctx.saveSession();
  render();
  return el;
}
