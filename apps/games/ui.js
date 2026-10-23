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

export function gameShell(id, title, rules, ctx, iconSvg) {
  const el = document.createElement('div');
  el.className = 'game-app';
  const toolbar = document.createElement('div');
  toolbar.className = 'game-toolbar';
  const instructionsId = `game-instructions-${String(id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const instructionsButton = button('Instructions', () => setInstructionsOpen(!instructionsOpen));
  instructionsButton.classList.add('game-instructions-toggle');
  const instructionsIcon = document.createElement('span');
  instructionsIcon.className = 'game-instructions-icon';
  instructionsIcon.setAttribute('aria-hidden', 'true');
  instructionsIcon.innerHTML = iconSvg;
  const instructionsLabel = document.createElement('span');
  instructionsLabel.textContent = 'Instructions';
  instructionsButton.replaceChildren(instructionsIcon, instructionsLabel);
  instructionsButton.setAttribute('aria-expanded', 'false');
  instructionsButton.setAttribute('aria-controls', instructionsId);
  const instructionsControl = document.createElement('div');
  instructionsControl.className = 'game-instructions-control';
  instructionsControl.append(instructionsButton);
  toolbar.append(instructionsControl);
  const status = document.createElement('div');
  status.className = 'game-status';
  status.setAttribute('role', 'status');
  const stage = document.createElement('div');
  stage.className = 'game-stage';
  const instructions = document.createElement('aside');
  instructions.className = 'game-instructions';
  instructions.id = instructionsId;
  instructions.hidden = true;
  instructions.setAttribute('aria-labelledby', `${instructionsId}-title`);
  instructions.setAttribute('aria-describedby', `${instructionsId}-copy`);
  const heading = document.createElement('h2');
  heading.id = `${instructionsId}-title`;
  heading.textContent = `How to play ${title}`;
  const closeInstructions = button('Close instructions', () => setInstructionsOpen(false));
  const panelHeader = document.createElement('div');
  panelHeader.className = 'game-instructions-header';
  panelHeader.append(heading, closeInstructions);
  const copy = document.createElement('p');
  copy.id = `${instructionsId}-copy`;
  copy.className = 'game-instructions-copy';
  copy.textContent = rules;
  instructions.append(panelHeader, copy);
  const area = document.createElement('div');
  area.className = 'app-content game-area';
  area.setAttribute('aria-label', `${title} play area`);
  instructionsControl.append(instructions);
  stage.append(area);
  el.append(toolbar, status, stage);
  let instructionsOpen = false;
  function setInstructionsOpen(open) {
    instructionsOpen = Boolean(open);
    instructions.hidden = !instructionsOpen;
    instructionsButton.setAttribute('aria-expanded', String(instructionsOpen));
    if (instructionsOpen) closeInstructions.focus();
    else instructionsButton.focus();
  }
  // Game controls retain normal Tab/arrow navigation instead of desktop shortcuts.
  el.addEventListener('keydown', event => {
    if (event.key === 'Escape' && instructionsOpen) {
      event.preventDefault();
      event.stopPropagation();
      setInstructionsOpen(false);
      return;
    }
    if (!event.ctrlKey && !event.metaKey && event.key !== 'Escape' && event.key !== '?') {
      event.stopPropagation();
    }
  });
  ctx.setAppTitle(id, title);
  return { el, toolbar, status, area, instructions, instructionsButton };
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

export function showNewGameScreen(area, id, headingText, messageText, options, onStart) {
  const game = area.closest('.game-app');
  const screen = document.createElement('section');
  const title = document.createElement('h2');
  const message = document.createElement('p');
  const actions = document.createElement('div');
  const settings = {};
  const savedInert = [];
  const screenId = `new-game-${String(id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  let active = true;
  const priorFocus = document.activeElement;
  let fieldset = null;

  screen.className = 'game-new-game-screen';
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-labelledby', `${screenId}-title`);
  screen.setAttribute('aria-describedby', `${screenId}-message`);
  title.id = `${screenId}-title`;
  title.textContent = headingText;
  message.id = `${screenId}-message`;
  message.textContent = messageText;
  actions.className = 'game-new-game-actions';

  if (options.length) {
    fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    fieldset.className = 'game-new-game-options';
    legend.textContent = 'New game options';
    fieldset.append(legend);
    for (const option of options) {
      settings[option.name] = option.value;
      const control = selectControl(
        option.label,
        option.choices,
        String(option.value),
        value => { settings[option.name] = value; },
      );
      control.classList.add('game-new-game-option');
      fieldset.append(control);
    }
  }

  const start = button('Start new game', () => {
    dismiss(false);
    onStart({ ...settings });
  }, 'game-new-game-primary');
  actions.append(start);
  screen.append(title, message);
  if (fieldset) screen.append(fieldset);
  screen.append(actions);

  const siblings = [...(game?.children || [])].filter(child => !child.contains(area));
  for (const node of [...siblings, ...area.children]) {
    savedInert.push({ node, inert: node.inert });
    node.inert = true;
  }
  area.style.position = 'relative';
  area.append(screen);

  function dismiss(restoreFocus = true) {
    if (!active) return;
    active = false;
    screen.remove();
    savedInert.forEach(({ node, inert }) => { node.inert = inert; });
    if (restoreFocus && priorFocus?.isConnected) priorFocus.focus({ preventScroll: true });
  }

  screen.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...screen.querySelectorAll('select, button')].filter(node => !node.disabled);
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault();
      focusable.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
      event.preventDefault();
      focusable[0].focus();
    }
  });
  screen.querySelector('select, button')?.focus({ preventScroll: true });
  return dismiss;
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
