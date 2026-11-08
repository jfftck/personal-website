import { refreshCustomSelect } from '../../shared/app-select.js';

import { Chess, chessStatus } from './chess.js';
import { createReversi, reversiMoves, playReversi, reversiScore } from './reversi.js';
import {
  gameShell, button, toolbarButton, selectControl, preserveFocus, wireBoardKeys, showRestorePrompt,
  showNewGameScreen, showComputerErrorScreen,
} from './ui.js';
import { createGameSession, inspectGameSession, restoreChess } from './game-state.js';
import { addGameThemeControl, addGameThemeResetControl } from './themes.js';
import { chessPieceSvg } from './chess-piece-svg.js';
import { createBoardCelebration, chooseBoardCelebration } from './game-celebrations.js';
import { boardWinAnimationChoices, getWinAnimationPreferences, setWinAnimationPreferences } from './win-animation-settings.js';

const names = { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' };
const squareName = index => `${'abcdefgh'[index % 8]}${8 - Math.floor(index / 8)}`;
const difficultyOptions = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
const computerMoveTimeoutMs = 5000;
const maxComputerMoveFailures = 3;
const retryBackoffBaseMs = 500;

export function buildBoardGame(kind, id, title, ctx, initialState = null, iconSvg) {
  const isChess = kind === 'chess';
  const { el, toolbarLeft, toolbarCenter, status, area, settings } = gameShell(id, title, isChess
    ? 'White moves first. Select a piece, then a highlighted destination. Checkmate the opposing king to win. Castling, en passant, pawn promotion, stalemate, repetition, insufficient material, and the fifty-move rule are supported. In computer mode, choose your color and difficulty in Settings. Arrow keys move between squares; Enter or Space selects.'
      : 'Black moves first. Place a disc so it brackets at least one opposing disc between the new disc and one of yours, in any direction. All bracketed discs flip. Legal moves are marked. A player with no move automatically passes; the game ends when neither player can move. Most discs wins. In computer mode, choose your color and difficulty in Settings. Arrow keys navigate; Enter or Space plays.', ctx, iconSvg);
  const restored = inspectGameSession(kind, initialState);
  let game = isChess ? new Chess() : createReversi();
  let mode = restored.status === 'valid' || restored.status === 'finished'
    ? restored.options.mode : 'computer';
  let playerColor = restored.status === 'valid' || restored.status === 'finished'
    ? restored.options.playerColor || (isChess ? 'white' : 'black')
    : isChess ? 'white' : 'black';
  let difficulty = restored.status === 'valid' || restored.status === 'finished'
    ? restored.options.difficulty || 'medium' : 'medium';
  let pendingRestore = initialState != null && restored.status !== 'finished';
  let selected = null, promotion = null, snapshots = [];
  if (restored.status === 'finished') {
    if (isChess) game = restoreChess(restored.state.history);
    else {
      const { snapshots: savedSnapshots = [], ...savedGame } = restored.state;
      game = savedGame;
      snapshots = savedSnapshots;
    }
  }
  let worker = null, timer = null, thinking = false, disposed = false;
  let aiFailures = 0, aiNotice = '', aiAttemptId = 0;
  let endScreenTimer = null, newGameScreenCleanup = null, computerErrorCleanup = null, endScreenShown = false;
  let celebrationCleanup = null;
  const undo = toolbarButton('Undo', 'undo', undoMove);
  toolbarLeft.append(undo);
  toolbarCenter.append(toolbarButton('New game', 'newGame', restart));
  const colorControl = selectControl('Play as', [['white', 'White'], ['black', 'Black']], playerColor, value => {
    playerColor = value; restart();
  });
  colorControl.hidden = mode !== 'computer';
  const difficultyControl = selectControl('Difficulty', difficultyOptions, difficulty, value => {
    difficulty = value; restart();
  });
  difficultyControl.hidden = mode !== 'computer';
  settings.addGameOption(selectControl('Opponent', [['computer', 'Computer'], ['local', 'Local two-player']], mode, value => {
    mode = value;
    colorControl.hidden = mode !== 'computer';
    difficultyControl.hidden = mode !== 'computer';
    restart();
  }));
  settings.addGameOption(colorControl);
  settings.addGameOption(difficultyControl);
  settings.addGameAnimationOption({
    id: `${kind}-win-animation-${id}`,
    label: 'Win animation',
    description: 'Choose the effects that can celebrate a win. Multiple choices are randomized.',
    choices: boardWinAnimationChoices,
    selected: getWinAnimationPreferences(kind),
    onChange: value => setWinAnimationPreferences(kind, value),
  });
  const removeBoardTheme = addGameThemeControl(el, settings.appearanceOptions, isChess ? 'chessBoard' : 'reversiBoard');
  const removePieceTheme = addGameThemeControl(el, settings.appearanceOptions, isChess ? 'chessPieces' : 'reversiPieces');
  const removePieceStyle = isChess ? addGameThemeControl(el, settings.appearanceOptions, 'chessArtwork') : null;
  const removeThemeResetControl = addGameThemeResetControl(settings.appearanceOptions);

  function cancelComputer() {
    aiAttemptId += 1;
    worker?.terminate(); worker = null;
    clearTimeout(timer); timer = null; thinking = false;
    aiNotice = '';
  }
  function clearEndSequence() {
    clearTimeout(endScreenTimer); endScreenTimer = null;
    celebrationCleanup?.(); celebrationCleanup = null;
  }
  function restart() {
    settings.close();
    clearEndSequence();
    newGameScreenCleanup?.(); newGameScreenCleanup = null;
    computerErrorCleanup?.(); computerErrorCleanup = null;
    endScreenShown = false;
    cancelComputer();
    aiFailures = 0;
    pendingRestore = false;
    game = isChess ? new Chess() : createReversi();
    selected = null; promotion = null; snapshots = []; render(); persist(); maybeComputer();
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
    clearEndSequence();
    newGameScreenCleanup?.(); newGameScreenCleanup = null;
    endScreenShown = false;
    cancelComputer(); selected = null; promotion = null;
    aiFailures = 0;
    let transition = null;
    if (isChess) {
      const moves = [...chessMoveSegments(game.undo(), true)];
      if (mode === 'computer' && computerTurn() && game.history().length) {
        moves.push(...chessMoveSegments(game.undo(), true));
      }
      transition = { type: 'chess', moves };
    } else if (snapshots.length) {
      const previous = game.board.slice();
      game = snapshots.pop();
      while (computerTurn() && snapshots.length) game = snapshots.pop();
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
  function computerTurn() {
    const computerColor = playerColor === 'white' ? 'b' : 'w';
    const computerDisc = playerColor === 'white' ? 1 : -1;
    return mode === 'computer' && (isChess ? game.turn() === computerColor : game.turn === computerDisc) && !ended();
  }
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
    aiFailures = 0;
    aiNotice = '';
    selected = null; promotion = null;
    render(transition); persist(); maybeComputer();
    if (ended()) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) showEndScreen();
      else {
        endScreenTimer = setTimeout(() => {
          endScreenTimer = null;
          if (disposed || !ended() || endScreenShown) return;
          const board = area.querySelector('.game-board');
          const winner = isChess
            ? game.isCheckmate() ? game.turn() === 'w' ? 'black' : 'white' : null
            : (() => {
              const score = reversiScore(game.board);
              return score.black === score.white ? null : score.black > score.white ? 'black' : 'white';
            })();
          const effect = chooseBoardCelebration(kind);
          if (!effect) {
            showEndScreen();
          } else {
            celebrationCleanup = createBoardCelebration(kind, board, winner, effect, () => {
              celebrationCleanup = null;
              showEndScreen();
            });
          }
        }, isChess ? 380 : 560);
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
      }, {
        name: 'playerColor',
        label: 'Play as',
        choices: [['white', 'White'], ['black', 'Black']],
        value: playerColor,
        visibleWhen: nextOptions => nextOptions.mode === 'computer',
      }, {
        name: 'difficulty',
        label: 'Difficulty',
        choices: difficultyOptions,
        value: difficulty,
        visibleWhen: nextOptions => nextOptions.mode === 'computer',
      }],
      nextOptions => {
        mode = nextOptions.mode;
        if (nextOptions.playerColor) playerColor = nextOptions.playerColor;
        if (nextOptions.difficulty) difficulty = nextOptions.difficulty;
        const toolbarSelect = settings.element.querySelector('select[data-game-option="Opponent"]');
        if (toolbarSelect) {
          toolbarSelect.value = mode;
          refreshCustomSelect(toolbarSelect);
        }
        const playerColorSelect = colorControl.querySelector('select');
        playerColorSelect.value = playerColor;
        refreshCustomSelect(playerColorSelect);
        const difficultySelect = difficultyControl.querySelector('select');
        difficultySelect.value = difficulty;
        refreshCustomSelect(difficultySelect);
        colorControl.hidden = mode !== 'computer';
        difficultyControl.hidden = mode !== 'computer';
        restart();
      },
    );
  }
  function persist() {
    if (!pendingRestore) ctx.saveSession();
  }
  function failComputer(message, attemptId) {
    if (attemptId !== aiAttemptId || disposed) return;
    aiAttemptId += 1;
    worker?.terminate(); worker = null;
    clearTimeout(timer); timer = null; thinking = false;
    aiFailures += 1;
    if (aiFailures < maxComputerMoveFailures) {
      const delay = retryBackoffBaseMs * (2 ** (aiFailures - 1));
      aiNotice = `Computer move failed (${aiFailures} of ${maxComputerMoveFailures}). Retrying in ${delay / 1000} second${delay === 1000 ? '' : 's'}…`;
      render();
      const retryId = aiAttemptId;
      timer = setTimeout(() => {
        if (retryId !== aiAttemptId) return;
        timer = null;
        maybeComputer();
      }, delay);
      return;
    }
    aiNotice = `The computer couldn't recover after ${maxComputerMoveFailures} attempts: ${message}. You can retry or switch to local two-player.`;
    render();
    computerErrorCleanup?.();
    computerErrorCleanup = showComputerErrorScreen(
      area,
      id,
      aiNotice,
      () => {
        computerErrorCleanup = null;
        aiFailures = 0;
        aiNotice = '';
        maybeComputer();
      },
      () => {
        computerErrorCleanup = null;
        restart();
      },
    );
  }
  function maybeComputer() {
    if (disposed || thinking || !computerTurn() || aiFailures >= maxComputerMoveFailures) return;
    thinking = true;
    aiNotice = aiFailures
      ? `Computer is retrying (attempt ${aiFailures + 1} of ${maxComputerMoveFailures})…`
      : '';
    const attemptId = ++aiAttemptId;
    render();
    try {
      worker = new Worker(new URL(isChess ? './chess-worker.js' : './reversi-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = event => {
        if (attemptId !== aiAttemptId) return;
        const move = event.data.move;
        if (event.data.error || move == null) {
          failComputer(event.data.error || 'no move returned', attemptId); return;
        }
        cancelComputer();
        try { commit(move); } catch (error) { failComputer(error.message, aiAttemptId); }
      };
      worker.onerror = event => {
        if (attemptId !== aiAttemptId) return;
        event.preventDefault();
        failComputer(event.message || 'worker unavailable', attemptId);
      };
      timer = setTimeout(() => failComputer(`move timed out after ${computerMoveTimeoutMs / 1000} seconds`, attemptId), computerMoveTimeoutMs);
      worker.postMessage(isChess
        ? { history: game.history(), difficulty }
        : { state: game, depth: difficulty === 'easy' ? 1 : difficulty === 'hard' ? 5 : 3 });
    } catch (error) {
      failComputer(error.message || 'worker unavailable', attemptId);
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
    if (isChess) status.textContent = chessStatus(game);
    else {
      const score = reversiScore(game.board);
      status.textContent = `Black ${score.black} · White ${score.white} — ${
        ended() ? score.black === score.white ? 'Draw.' : `${score.black > score.white ? 'Black' : 'White'} wins.`
          : `${game.turn === 1 ? 'Black' : 'White'} to move.${game.passed ? ` ${game.passed === 1 ? 'Black' : 'White'} has no moves and passes.` : ''}`}`;
    }
    if (promotion) status.textContent += ' Choose a promotion piece.';
    if (thinking) status.textContent += ' Computer is thinking…';
    if (aiNotice) status.textContent = aiNotice;
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
      const fit = document.createElement('div');
      fit.className = 'game-board-fit';
      fit.append(board);
      wireBoardKeys(board, 8); area.replaceChildren(fit);
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
      return createGameSession(kind, { mode, playerColor, difficulty }, state);
    },
    destroy() {
      disposed = true;
      clearEndSequence();
      computerErrorCleanup?.(); computerErrorCleanup = null;
      removeBoardTheme();
      removePieceTheme();
      removePieceStyle?.();
      removeThemeResetControl();
      settings.destroy();
      newGameScreenCleanup?.();
      cancelComputer();
    },
  };
  if (restored.status === 'finished') ctx.saveSession();
  render();
  if (restored.status === 'finished') showEndScreen();
  return el;
}
