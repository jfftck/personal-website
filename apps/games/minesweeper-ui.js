import { createMinesweeper, revealMineCell, flagMineCell } from './minesweeper.js';
import { gameShell, button, selectControl, preserveFocus, wireBoardKeys } from './ui.js';

export function buildMinesweeper(id, ctx) {
  const { el, toolbar, status, area } = gameShell(id, 'Minesweeper',
    'Reveal every safe square without hitting a mine. Numbers count neighboring mines. The first reveal and its neighbors are safe. Right-click or press F on a square to flag it; on touch, turn on Flag mode. Click an open number to reveal its neighbors when the neighboring flag count matches. Use arrow keys to move and Enter or Space to reveal.', ctx);
  let level = 'beginner', state = createMinesweeper(level), flagMode = false;
  function restart() { state = createMinesweeper(level); render(); }
  const flag = button('Flag mode', () => {
    flagMode = !flagMode;
    flag.setAttribute('aria-pressed', String(flagMode));
    render();
  });
  flag.setAttribute('aria-pressed', 'false');
  toolbar.append(button('New game', restart),
    selectControl('Difficulty', [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['expert', 'Expert']], level, value => {
      level = value; restart();
    }), flag);
  function act(index, mark = flagMode) {
    if (mark) flagMineCell(state, index);
    else revealMineCell(state, index);
    render();
  }
  function render() {
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
  }
  render();
  return el;
}
