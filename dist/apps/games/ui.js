export function button(text, onClick, className = '') {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = text;
  el.addEventListener('click', onClick);
  return el;
}

export function selectControl(text, options, value, onChange) {
  const label = document.createElement('label');
  label.append(`${text} `);
  const select = document.createElement('select');
  select.setAttribute('aria-label', text);
  for (const [key, title] of options) {
    const option = document.createElement('option');
    option.value = key; option.textContent = title;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  label.append(select);
  return label;
}

export function gameShell(id, title, rules, ctx) {
  const el = document.createElement('div');
  el.className = 'game-app';
  const toolbar = document.createElement('div');
  toolbar.className = 'game-toolbar';
  const back = button('← Game Center', event => {
    event.stopPropagation();
    ctx.openGameMenu();
  });
  toolbar.append(back);
  const status = document.createElement('div');
  status.className = 'game-status';
  status.setAttribute('role', 'status');
  const instructions = document.createElement('details');
  instructions.className = 'game-rules';
  const summary = document.createElement('summary');
  summary.textContent = `How to play ${title}`;
  const copy = document.createElement('p');
  copy.textContent = rules;
  instructions.append(summary, copy);
  const area = document.createElement('div');
  area.className = 'app-content game-area';
  area.setAttribute('aria-label', `${title} play area`);
  el.append(toolbar, status, instructions, area);
  // Game controls retain normal Tab/arrow navigation instead of desktop shortcuts.
  el.addEventListener('keydown', event => {
    if (!event.ctrlKey && !event.metaKey && event.key !== 'Escape' && event.key !== '?') {
      event.stopPropagation();
    }
  });
  ctx.setAppTitle(id, title);
  return { el, toolbar, status, area };
}

export function showRestorePrompt(area, onResume, onNew, invalid = false) {
  const panel = document.createElement('section');
  panel.className = 'game-restore-prompt';
  panel.setAttribute('aria-labelledby', 'game-restore-title');
  const heading = document.createElement('h2');
  heading.id = 'game-restore-title';
  heading.textContent = invalid ? 'Saved game could not be loaded' : 'You have a saved game';
  const message = document.createElement('p');
  message.textContent = invalid
    ? 'This saved game is invalid or from an older format. Start a new game to continue.'
    : 'Would you like to resume where you left off or start a new game?';
  const actions = document.createElement('div');
  actions.className = 'game-restore-actions';
  if (!invalid) actions.append(button('Resume saved game', onResume));
  actions.append(button('Start new game', onNew));
  panel.append(heading, message, actions);
  area.replaceChildren(panel);
}

export function preserveFocus(container, render) {
  const active = container.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  render();
  if (active) container.querySelector(`[data-key="${CSS.escape(active)}"]`)?.focus({ preventScroll: true });
}

export function wireBoardKeys(board, columns) {
  board.addEventListener('focusin', event => {
    if (!event.target.matches('[data-grid-index]')) return;
    board.querySelectorAll('[data-grid-index]').forEach(cell => { cell.tabIndex = cell === event.target ? 0 : -1; });
  });
  board.addEventListener('keydown', event => {
    const index = Number(event.target.dataset.gridIndex);
    if (!Number.isFinite(index)) return;
    const cells = [...board.querySelectorAll('[data-grid-index]')];
    let next = index;
    if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (event.key === 'ArrowRight') next = Math.min(cells.length - 1, index + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, index - columns);
    else if (event.key === 'ArrowDown') next = Math.min(cells.length - 1, index + columns);
    else if (event.key === 'Home') next = index - index % columns;
    else if (event.key === 'End') next = Math.min(cells.length - 1, index - index % columns + columns - 1);
    else return;
    event.preventDefault(); event.stopPropagation();
    cells[next]?.focus();
  });
}
