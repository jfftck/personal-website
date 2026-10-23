import { createMinesweeper, revealMineCell, flagMineCell } from './minesweeper.js';
import {
  gameShell, button, selectControl, preserveFocus, wireBoardKeys, showRestorePrompt, showNewGameScreen,
} from './ui.js';
import { createGameSession, inspectGameSession } from './game-state.js';
import { addGameThemeControl, addGameThemeResetControl } from './themes.js';

export function buildMinesweeper(id, ctx, initialState = null, iconSvg) {
  const { el, toolbarCenter, status, area, settings } = gameShell(id, 'Minesweeper',
    'Reveal every safe square without hitting a mine. Numbers count neighboring mines. The first reveal and its neighbors are safe. Right-click or press F on a square to flag it; on touch, turn on Flag mode. Click an open number to reveal its neighbors when the neighboring flag count matches. Use arrow keys to move and Enter or Space to reveal.', ctx, iconSvg);
  const restored = inspectGameSession('minesweeper', initialState);
  let level = restored.status === 'valid' || restored.status === 'finished'
    ? restored.options.level : 'beginner';
  let state = createMinesweeper(level);
  let flagMode = Boolean(restored.options?.flagMode);
  let pendingRestore = initialState != null && restored.status !== 'finished';
  let newGameScreenCleanup = null;
  let promptedStatus = null;
  function persist() {
    if (!pendingRestore) ctx.saveSession();
  }
  function restart() {
    settings.close();
    newGameScreenCleanup?.();
    newGameScreenCleanup = null;
    promptedStatus = null;
    pendingRestore = false;
    state = createMinesweeper(level); render(); persist();
  }
  function showGameEndScreen() {
    if (promptedStatus === state.status) return;
    promptedStatus = state.status;
    newGameScreenCleanup?.();
    newGameScreenCleanup = showNewGameScreen(
      area,
      id,
      state.status === 'won' ? 'Minefield cleared!' : 'Mine hit.',
      state.status === 'won' ? 'Choose a difficulty for your next game.' : 'Choose a difficulty to try again.',
      [{
        name: 'level',
        label: 'Difficulty',
        choices: [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['expert', 'Expert']],
        value: level,
      }],
      nextOptions => {
        level = nextOptions.level;
        const toolbarSelect = settings.element.querySelector('select[aria-label="Difficulty"]');
        if (toolbarSelect) toolbarSelect.value = level;
        restart();
      },
    );
  }
  const flag = button('Flag mode', () => {
    flagMode = !flagMode;
    flag.setAttribute('aria-pressed', String(flagMode));
    render(); persist();
  });
  flag.setAttribute('aria-pressed', 'false');
  toolbarCenter.append(button('New game', restart));
  settings.addGameOption(selectControl('Difficulty', [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['expert', 'Expert']], level, value => {
      level = value; restart();
    }));
  settings.addGameOption(flag);
  const removeThemeControl = addGameThemeControl(el, settings.appearanceOptions, 'minesweeper');
  const removeThemeResetControl = addGameThemeResetControl(settings.appearanceOptions);
  function act(index, mark = flagMode) {
    const changed = mark ? flagMineCell(state, index) : revealMineCell(state, index);
    render();
    if (changed) persist();
  }
  function render() {
    if (pendingRestore) {
      showRestorePrompt(area, () => {
        level = restored.options.level;
        flagMode = Boolean(restored.options.flagMode);
        state = restored.state;
        pendingRestore = false;
        flag.setAttribute('aria-pressed', String(flagMode));
        render(); persist();
      }, restart, restored.status === 'invalid');
      return;
    }
    const flags = state.cells.filter(cell => cell.flag).length;
    status.textContent = state.status === 'won' ? 'You won — every safe square is revealed!'
      : state.status === 'lost' ? 'You hit a mine. Start a new game to try again.'
        : `${state.mines - flags} mines unflagged · ${flagMode ? 'Flag mode' : 'Reveal mode'}`;
    preserveFocus(area, () => {
      const wrap = document.createElement('div'); wrap.className = 'mine-board-wrap';
      const board = document.createElement('div'); board.className = 'mine-board';
      board.style.setProperty('--columns', state.width);
      board.setAttribute('role', 'group'); board.setAttribute('aria-label', `${level} minefield`);
      state.cells.forEach((cell, index) => {
        const shownMine = cell.mine && state.status === 'lost';
        const btn = button(shownMine ? '✹' : cell.open && cell.count ? String(cell.count) : '', () => act(index), 'mine-cell');
        btn.classList.toggle('revealed', cell.open || shownMine);
        btn.classList.toggle('flagged', cell.flag && !shownMine);
        btn.classList.toggle('exploded', index === state.exploded);
        if (cell.open && !cell.mine) btn.dataset.number = cell.count;
        btn.dataset.gridIndex = index; btn.dataset.key = `mine-${index}`; btn.tabIndex = index ? -1 : 0;
        btn.setAttribute('aria-label', `Row ${Math.floor(index / state.width) + 1}, column ${index % state.width + 1}: ${
          shownMine ? 'mine' : cell.flag ? 'flagged' : cell.open ? `${cell.count} adjacent mines` : 'hidden'}`);
        btn.addEventListener('contextmenu', event => { event.preventDefault(); act(index, true); });
        btn.addEventListener('keydown', event => {
          if (event.key.toLowerCase() === 'f') { event.preventDefault(); act(index, true); }
        });
        board.append(btn);
      });
      wireBoardKeys(board, state.width);
      wrap.append(board); area.replaceChildren(wrap);
    });
    if (state.status !== 'playing') showGameEndScreen();
  }
  ctx.appApis[id] = {
    getSessionState() {
      return pendingRestore ? initialState
        : createGameSession('minesweeper', { level, flagMode }, state);
    },
    destroy() {
      newGameScreenCleanup?.();
      removeThemeControl();
      removeThemeResetControl();
      settings.destroy();
    },
  };
  if (restored.status === 'finished') ctx.saveSession();
  render();
  return el;
}
