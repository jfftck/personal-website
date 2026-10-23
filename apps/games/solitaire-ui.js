import {
  createSolitaire, getPile, moveCards, drawCards, isSequence, sendEligibleCardsHome,
  chooseWinCelebration, SUITS, rankLabel, isRed,
} from './cards.js';
import { createWinCelebration } from './celebrations.js';
import { paintCardFace } from './card-artwork.js';
import {
  gameShell, button, selectControl, preserveFocus, showRestorePrompt, showNewGameScreen,
} from './ui.js';
import { createGameSession, inspectGameSession } from './game-state.js';
import { addGameThemeControl, addGameThemeResetControl } from './themes.js';

const rules = {
  klondike: 'Build the four foundations from Ace to King by suit. Tableau piles descend in alternating colors; only Kings fill empty columns. Click an exposed card or sequence, then a destination. Use Send home to move an eligible card to a foundation. Click the stock to draw or recycle. Choose draw one or draw three for a new deal.',
  spider: 'Build King-to-Ace runs of one suit to remove them. You may place a card on the next higher rank of any suit, but only same-suit descending runs move together. Any run can fill an empty column. Stock deals one card to each column; every column must contain a card first. Remove all eight runs to win.',
  freecell: 'Build foundations from Ace to King by suit. Tableau piles descend in alternating colors; any card may fill an empty column. The four free cells each hold one card. Sequence moves are limited by available free cells and empty columns. Click a card or sequence, then a destination. Use Send home to move an eligible card to a foundation.',
};

export function buildSolitaire(kind, id, title, ctx, initialState = null, iconSvg) {
  const shell = gameShell(id, title,
    `${rules[kind]} Slide a finger vertically through a tableau stack to peek at its layers; drag sideways to move cards. With a mouse, hold the right button and move up or down to peek. Release to restore the stack.`, ctx, iconSvg);
  const { el, toolbarLeft, toolbarCenter, area, status, settings } = shell;
  area.classList.add('solitaire-game-area');
  const restored = inspectGameSession(kind, initialState);
  let options = restored.status === 'valid' || restored.status === 'finished'
    ? restored.options : { suits: 1, drawCount: 1 };
  let state = createSolitaire(kind, options), selected = null, history = [];
  let latestTable = null, targetHints = [];
  let suppressClick = false, suppressClickTimer = null;
  let pointerDrag = null, activeDropTarget = null;
  let celebrationCleanup = null;
  let newGameScreenCleanup = null;
  const dragAbort = new AbortController();
  let pendingRestore = initialState != null && restored.status !== 'finished';
  function persist() {
    if (!pendingRestore) ctx.saveSession();
  }
  function clearCelebration() {
    celebrationCleanup?.();
    celebrationCleanup = null;
    latestTable?.removeAttribute('data-win-celebration');
  }
  function clearNewGameScreen() {
    newGameScreenCleanup?.();
    newGameScreenCleanup = null;
  }
  const undo = button('Undo', () => {
    if (!history.length) return;
    clearCelebration();
    clearNewGameScreen();
    state = history.pop(); selected = null; render(); persist();
  });
  function restart() {
    settings.close();
    clearCelebration();
    clearNewGameScreen();
    pendingRestore = false;
    state = createSolitaire(kind, options); history = []; selected = null; render(); persist();
  }
  toolbarCenter.append(button('New deal', restart));
  toolbarLeft.append(undo);
  if (kind !== 'spider') toolbarLeft.append(button('Send home', () => {
    const alreadyHome = new Set(state.foundations.flat().map(card => card.id));
    const moved = action(() => sendEligibleCardsHome(state));
    if (!moved) status.textContent = 'No card can move home yet. An Ace starts a home pile; the next card must match its suit.';
    else {
      status.textContent = `Moved ${moved} ${moved === 1 ? 'card' : 'cards'} home.`;
      animateCards(state.foundations.flat().map(card => card.id).filter(id => !alreadyHome.has(id)));
    }
  }));
  if (kind === 'klondike') {
    settings.addGameOption(selectControl('Draw', [['1', 'One card'], ['3', 'Three cards']], String(options.drawCount), value => {
      options.drawCount = Number(value); restart();
    }));
  }
  if (kind === 'spider') {
    settings.addGameOption(selectControl('Suits', [['1', 'One suit'], ['2', 'Two suits'], ['4', 'Four suits']], String(options.suits), value => {
      options.suits = Number(value); restart();
    }));
  }
  const removeThemeControl = addGameThemeControl(el, settings.appearanceOptions, 'cards');
  const removeTableThemeControl = addGameThemeControl(el, settings.appearanceOptions, 'cardTable');
  const removeFaceStyle = addGameThemeControl(el, settings.appearanceOptions, 'cardFaces');
  const removeBackStyle = addGameThemeControl(el, settings.appearanceOptions, 'cardBacks');
  const removeThemeResetControl = addGameThemeResetControl(settings.appearanceOptions);
  function action(fn, animateIds = []) {
    const before = structuredClone(state);
    const result = fn();
    if (!result) return false;
    history.push(before);
    if (history.length > 150) history.shift();
    selected = null;
    targetHints = [];
    render();
    animateCards(animateIds);
    if (!before.won && state.won) celebrate(chooseWinCelebration());
    persist();
    return result;
  }
  function animateCards(ids) {
    for (const id of ids) {
      const card = latestTable?.querySelector(`[data-key="card-${CSS.escape(String(id))}"]`);
      if (!card) continue;
      card.classList.remove('card-moved');
      void card.offsetWidth;
      card.classList.add('card-moved');
    }
  }
  function moveAnnouncement(from, destination) {
    const cards = getPile(state, from)?.slice(from.offset) || [];
    const first = cards[0];
    if (!first) return '';
    const cardName = `${rankLabel(first.rank)}${SUITS[first.suit]}`;
    const extraCards = cards.length - 1;
    const cardDescription = extraCards > 0
      ? `${cardName} and ${extraCards} more ${extraCards === 1 ? 'card' : 'cards'}`
      : cardName;
    const destinationName = destination.zone === 'foundations' ? `Home ${destination.index + 1}`
      : destination.zone === 'columns' ? `Pile ${destination.index + 1}`
        : destination.zone === 'cells' ? `Cell ${destination.index + 1}`
          : destination.zone;
    return `Moved ${cardDescription} to ${destinationName}.`;
  }
  function celebrate(effect) {
    if (!latestTable) return;
    clearCelebration();
    latestTable.dataset.winCelebration = effect;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      showVictoryScreen();
      return;
    }
    celebrationCleanup = createWinCelebration(effect, kind, state, latestTable, el, showVictoryScreen);
  }
  function showVictoryScreen() {
    const newGameOptions = kind === 'klondike'
      ? [{ name: 'drawCount', label: 'Draw', choices: [['1', 'One card'], ['3', 'Three cards']], value: String(options.drawCount) }]
      : kind === 'spider'
        ? [{ name: 'suits', label: 'Suits', choices: [['1', 'One suit'], ['2', 'Two suits'], ['4', 'Four suits']], value: String(options.suits) }]
        : [];
    const settingLabel = kind === 'klondike' ? 'Draw' : kind === 'spider' ? 'Suits' : null;
    newGameScreenCleanup?.();
    newGameScreenCleanup = showNewGameScreen(
      area,
      id,
      'Victory!',
      newGameOptions.length ? 'Choose settings for your next deal.' : 'Start another game whenever you are ready.',
      newGameOptions,
      nextOptions => {
        if (kind === 'klondike') options.drawCount = Number(nextOptions.drawCount);
        if (kind === 'spider') options.suits = Number(nextOptions.suits);
        const toolbarSelect = settingLabel && settings.element.querySelector(`select[aria-label="${settingLabel}"]`);
        if (toolbarSelect) toolbarSelect.value = String(nextOptions[kind === 'klondike' ? 'drawCount' : 'suits']);
        restart();
      },
    );
  }
  function autoMove(source) {
    const card = getPile(state, source)?.[source.offset];
    if (kind === 'freecell') {
      const sourcePile = getPile(state, source);
      const foundation = card && sourcePile?.at(-1)?.id === card.id
        && (state.foundations[card.suit].at(-1)?.rank || 0) + 1 === card.rank
        ? card.suit : -1;
      if (foundation !== -1) {
        const emptyCell = state.cells.findIndex(cell => !cell.length);
        if (emptyCell !== -1) {
          selected = { ...source };
          targetHints = [
            { zone: 'cells', index: emptyCell },
            { zone: 'foundations', index: foundation },
          ];
          render();
          status.textContent = `Choose Cell ${emptyCell + 1} or Home ${foundation + 1}.`;
          return;
        }
        const movedHome = action(
          () => moveCards(state, source, { zone: 'foundations', index: foundation }),
          [card.id],
        );
        if (movedHome) {
          status.textContent = `Moved ${rankLabel(card.rank)}${SUITS[card.suit]} to Home ${foundation + 1}.`;
          return;
        }
      }
      if (source.zone === 'columns') {
        const emptyCell = state.cells.findIndex(cell => !cell.length);
        const moved = emptyCell !== -1 && card && action(
          () => moveCards(state, source, { zone: 'cells', index: emptyCell }),
          [card.id],
        );
        if (!moved) status.textContent = 'No available cell can accept this card.';
        return;
      }
      if (source.zone === 'cells') {
        const destinations = state.columns.map((pile, index) => ({ pile, index }))
          .sort((a, b) => Number(!a.pile.length) - Number(!b.pile.length));
        const moved = card && action(() => {
          for (const { index } of destinations) {
            if (moveCards(state, source, { zone: 'columns', index })) return true;
          }
          return false;
        }, [card.id]);
        if (!moved) status.textContent = 'This card cannot move to a tableau pile.';
        return;
      }
      return;
    }
    if (kind === 'spider') return;
    const moved = card && action(() => {
      for (let index = 0; index < state.foundations.length; index++) {
        if (moveCards(state, source, { zone: 'foundations', index })) return true;
      }
      return false;
    }, card ? [card.id] : []);
    if (!moved) status.textContent = 'This card cannot move home yet. It must be an Ace or the next rank in its suit.';
  }
  function clickPile(zone, index, offset) {
    if (suppressClick) return;
    const pile = getPile(state, { zone, index });
    if (selected) {
      const from = { ...selected };
      const destination = { zone, index };
      const movingIds = getPile(state, selected)?.slice(selected.offset).map(card => card.id) || [];
      const announcement = moveAnnouncement(from, destination);
      if (action(() => moveCards(state, from, destination), movingIds)) {
        status.textContent = announcement;
        return;
      }
      if (selected.zone === zone && selected.index === index && selected.offset === offset) {
        selected = null; render(); return;
      }
    }
    if (pile?.[offset]?.up && isSequence(pile.slice(offset), kind)) {
      selected = { zone, index, offset };
      targetHints = [];
      render();
      status.textContent += ' Selected — choose a destination.';
    } else {
      selected = null; render();
      status.textContent += ' That move is not allowed.';
    }
  }
  function createDragLayer(drag) {
    const firstRect = drag.card.getBoundingClientRect();
    const cards = [...drag.card.parentElement.querySelectorAll(':scope > .playing-card')]
      .filter(card => Number(card.dataset.offset) >= drag.from.offset);
    const layer = document.createElement('div');
    layer.className = 'card-drag-layer';
    layer.dataset.cardTheme = el.dataset.cardTheme;
    layer.dataset.cardFaceStyle = el.dataset.cardFaceStyle;
    layer.dataset.cardBackStyle = el.dataset.cardBackStyle;
    layer.setAttribute('aria-hidden', 'true');
    for (const property of [
      '--card-face', '--card-ink', '--card-red',
      '--card-back-start', '--card-back-end', '--card-back-pattern', '--card-back-border',
    ]) {
      layer.style.setProperty(property, getComputedStyle(el).getPropertyValue(property));
    }
    drag.originX = firstRect.left;
    drag.originY = firstRect.top;
    drag.sourceCards = cards;
    for (const source of cards) {
      const rect = source.getBoundingClientRect();
      const clone = document.createElement('div');
      clone.className = 'playing-card card-drag-layer-card';
      for (const className of ['red', 'face-down']) {
        clone.classList.toggle(className, source.classList.contains(className));
      }
      clone.innerHTML = source.innerHTML;
      clone.style.left = `${rect.left - firstRect.left}px`;
      clone.style.top = `${rect.top - firstRect.top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      layer.append(clone);
    }
    document.body.append(layer);
    drag.layer = layer;
    drag.sourceCards.forEach(card => card.classList.add('drag-source-hidden'));
  }
  function updateDragLayer(drag, clientX, clientY) {
    if (!drag.layer) return;
    drag.layer.style.transform = `translate3d(${drag.originX + clientX - drag.x}px, ${drag.originY + clientY - drag.y}px, 0)`;
  }
  function clearDragLayer(drag) {
    drag.sourceCards?.forEach(card => card.classList.remove('drag-source-hidden'));
    drag.layer?.remove();
    drag.layer = null;
  }
  function suppressPointerClick() {
    suppressClick = true;
    clearTimeout(suppressClickTimer);
    suppressClickTimer = setTimeout(() => { suppressClick = false; }, 250);
  }
  function updatePeek(gesture, clientY) {
    // Use the original stack positions: a raised card must not hide the
    // hit regions of the other cards while the finger moves through them.
    const slots = gesture.peekSlots;
    let slot = null;
    if (clientY >= slots[0].top && clientY <= slots.at(-1).bottom) {
      slot = slots.findLast(candidate => clientY >= candidate.top);
    }
    gesture.peekCard?.classList.remove('card-peeking');
    gesture.peekCard = slot?.card || null;
    gesture.peekCard?.classList.add('card-peeking');
  }
  function clearPointerGesture() {
    if (pointerDrag) {
      pointerDrag.peekCard?.classList.remove('card-peeking');
      clearDragLayer(pointerDrag);
    }
    pointerDrag = null;
    activeDropTarget?.classList.remove('drag-over');
    activeDropTarget = null;
  }
  area.addEventListener('click', event => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
    clearTimeout(suppressClickTimer);
  }, true);
  area.addEventListener('pointerdown', event => {
    if (![0, 2].includes(event.button) || event.target.closest('button')?.disabled || pointerDrag) return;
    const card = event.target.closest('.playing-card');
    if (!card) return;
    const inStack = !!card.closest('.card-columns');
    if (event.button === 2 && !inStack) return;
    pointerDrag = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      card,
      peeking: event.button === 2,
      peekSlots: inStack ? [...card.parentElement.querySelectorAll(':scope > .playing-card')].map(card => {
        const { top, bottom } = card.getBoundingClientRect();
        return { card, top, bottom };
      }) : null,
      from: {
        zone: card.dataset.zone,
        index: Number(card.dataset.pileIndex),
        offset: Number(card.dataset.offset),
      },
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    if (pointerDrag.peeking) {
      event.preventDefault();
      updatePeek(pointerDrag, event.clientY);
    }
  });
  area.addEventListener('contextmenu', event => {
    if (event.target.closest('.card-columns .playing-card')) event.preventDefault();
  });
  document.addEventListener('pointermove', event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    if (pointerDrag.peeking) {
      event.preventDefault();
      updatePeek(pointerDrag, event.clientY);
      return;
    }
    if (!pointerDrag.dragging && Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) > 8) {
      const verticalSwipe = Math.abs(event.clientY - pointerDrag.y) > Math.abs(event.clientX - pointerDrag.x) * 1.2;
      if (pointerDrag.pointerType === 'touch' && pointerDrag.peekSlots && verticalSwipe) {
        pointerDrag.peeking = true;
        event.preventDefault();
        updatePeek(pointerDrag, event.clientY);
        return;
      }
      pointerDrag.dragging = true;
      createDragLayer(pointerDrag);
    }
    if (!pointerDrag.dragging) return;
    event.preventDefault();
    updateDragLayer(pointerDrag, event.clientX, event.clientY);
    const target = resolveDropTarget(event.clientX, event.clientY);
    if (target === activeDropTarget) return;
    activeDropTarget?.classList.remove('drag-over');
    activeDropTarget = target;
    activeDropTarget?.classList.add('drag-over');
  }, { signal: dragAbort.signal, passive: false });
  document.addEventListener('pointerup', event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    const drag = pointerDrag;
    clearPointerGesture();
    if (drag.peeking) {
      if (drag.pointerType === 'touch') suppressPointerClick();
      return;
    }
    if (!drag.dragging) return;
    suppressPointerClick();
    const target = resolveDropTarget(event.clientX, event.clientY);
    const destination = target && { zone: target.dataset.dropZone, index: Number(target.dataset.dropIndex) };
    const movingIds = getPile(state, drag.from)?.slice(drag.from.offset).map(card => card.id) || [];
    const announcement = destination && moveAnnouncement(drag.from, destination);
    if (!destination || !action(() => moveCards(state, drag.from, destination), movingIds)) {
      status.textContent = 'That card or sequence cannot move to this pile.';
    } else {
      status.textContent = announcement;
    }
  }, { signal: dragAbort.signal });
  document.addEventListener('pointercancel', event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    clearPointerGesture();
  }, { signal: dragAbort.signal });
  window.addEventListener('blur', clearPointerGesture, { signal: dragAbort.signal });
  function pileView(zone, index, label, all = false) {
    const pile = getPile(state, { zone, index });
    const div = document.createElement('div');
    div.className = 'card-pile';
    div.setAttribute('role', 'group');
    div.setAttribute('aria-label', label);
    div.dataset.zone = zone;
    div.dataset.pileIndex = index;
    if (zone === 'columns' || zone === 'cells' || zone === 'foundations') {
      div.dataset.dropZone = zone;
      div.dataset.dropIndex = index;
    }
    if (targetHints.some(target => target.zone === zone && target.index === index)) {
      div.classList.add('available-move');
    }
    if (!pile.length) {
      const empty = button('', () => clickPile(zone, index, -1), 'empty-pile');
      empty.setAttribute('aria-label', `Empty ${label}`);
      empty.dataset.key = `${zone}-${index}-empty`;
      div.append(empty);
    } else {
      pile.forEach((card, offset) => {
        if (!all && offset !== pile.length - 1) return;
        const face = `${rankLabel(card.rank)}${SUITS[card.suit]}`;
        const btn = button(card.up ? face : '', () => clickPile(zone, index, offset), 'playing-card');
        if (card.up) paintCardFace(btn, card);
        btn.classList.toggle('face-down', !card.up);
        btn.classList.toggle('red', isRed(card));
        btn.classList.toggle('selected', selected?.zone === zone && selected.index === index && selected.offset === offset);
        btn.disabled = !card.up;
        btn.dataset.key = `card-${card.id}`;
        btn.dataset.cardId = card.id;
        btn.dataset.offset = offset;
        btn.dataset.zone = zone;
        btn.dataset.pileIndex = index;
        btn.setAttribute('aria-label', card.up ? `${face}, ${label}, card ${offset + 1}` : `Face down, ${label}`);
        btn.setAttribute('aria-pressed', String(selected?.zone === zone && selected.index === index && selected.offset === offset));
        btn.addEventListener('dblclick', event => {
          event.preventDefault();
          event.stopPropagation();
          autoMove({ zone, index, offset });
        });
        div.append(btn);
      });
    }
    return div;
  }
  function resolveDropTarget(clientX, clientY) {
    const direct = document.elementFromPoint(clientX, clientY)?.closest('[data-drop-zone]');
    if (direct) return direct;
    const columns = latestTable?.querySelector('.card-columns');
    if (!columns) return null;
    const bounds = columns.getBoundingClientRect();
    if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) return null;
    const piles = [...columns.querySelectorAll(':scope > .card-pile')];
    return piles
      .filter(pile => {
        const rect = pile.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right;
      })
      .sort((a, b) => {
        const aCenter = a.getBoundingClientRect().left + a.getBoundingClientRect().width / 2;
        const bCenter = b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2;
        return Math.abs(clientX - aCenter) - Math.abs(clientX - bCenter);
      })[0] || null;
  }
  function render() {
    clearPointerGesture();
    if (pendingRestore) {
      showRestorePrompt(area, () => {
        options = restored.options;
        state = restored.state;
        pendingRestore = false;
        render(); persist();
      }, restart, restored.status === 'invalid');
      return;
    }
    undo.disabled = !history.length;
    status.textContent = state.won ? 'You won! Start a new deal to play again.'
      : `${state.moves} moves · ${kind === 'spider' ? `${state.completed} / 8 runs completed` : `${state.foundations.reduce((n, p) => n + p.length, 0)} / 52 cards home`}`;
    preserveFocus(area, () => {
      const table = document.createElement('div');
      table.className = `solitaire-table ${kind}`;
      table.style.setProperty('--pile-count', state.columns.length);
      const top = document.createElement('div'); top.className = 'card-top-row';
      const fieldGroup = (label, className) => {
        const group = document.createElement('div');
        group.className = `card-field-group ${className}`;
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', label);
        const heading = document.createElement('span');
        heading.className = 'card-field-group-label';
        heading.textContent = label;
        const contents = document.createElement('div');
        contents.className = 'card-field-group-content';
        group.append(heading, contents);
        group.pileContainer = contents;
        return group;
      };
      if (kind === 'freecell') {
        const cells = fieldGroup('Cells', 'cell-group');
        for (let i = 0; i < 4; i++) {
          cells.pileContainer.append(pileView('cells', i, `Cell ${i + 1}`));
        }
        top.append(cells);
      } else {
        const stock = document.createElement('div');
        stock.className = 'card-pile card-stock';
        const draw = button(state.stock.length ? `${state.stock.length}` : '↻', () => {
          if (!action(() => drawCards(state))) status.textContent = kind === 'spider'
            ? 'Fill every empty column before dealing, or no stock remains.' : 'No cards left in stock.';
        });
        draw.setAttribute('aria-label', `Stock: ${state.stock.length} cards. ${state.stock.length ? 'Deal cards' : 'Recycle waste'}`);
        draw.dataset.key = 'stock';
        stock.append(draw); top.append(stock);
        if (kind === 'klondike') top.append(pileView('waste', 0, 'Waste'));
      }
      const home = fieldGroup('Home', 'home-group');
      if (kind !== 'spider') {
        for (let i = 0; i < 4; i++) {
          home.pileContainer.append(pileView('foundations', i, `Home ${i + 1}`));
        }
      } else {
        const completedHomes = document.createElement('div');
        completedHomes.className = 'spider-home-spaces';
        completedHomes.setAttribute('role', 'group');
        completedHomes.setAttribute('aria-label', `${state.completed} of 8 completed runs`);
        for (let i = 0; i < 8; i++) {
          const space = document.createElement('span');
          const completed = i < state.completed;
          space.className = `spider-home-space${completed ? ' completed' : ''}`;
          space.setAttribute('aria-label', completed ? `Completed home run ${i + 1}` : `Empty home space ${i + 1}`);
          space.textContent = completed ? '✓' : '';
          completedHomes.append(space);
        }
        home.pileContainer.append(completedHomes);
      }
      top.append(home);
      const columns = document.createElement('div'); columns.className = 'card-columns';
      columns.style.setProperty('--columns', state.columns.length);
      for (let i = 0; i < state.columns.length; i++) columns.append(pileView('columns', i, `Pile ${i + 1}`, true));
      const tableau = document.createElement('div');
      tableau.className = 'card-tableau-scroll';
      tableau.append(columns);
      table.append(top, tableau);
      latestTable = table;
      area.replaceChildren(table);
    });
  }
  ctx.appApis[id] = {
    getSessionState() {
      return pendingRestore ? initialState : createGameSession(kind, options, state);
    },
    destroy() {
      dragAbort.abort();
      removeThemeControl();
      removeTableThemeControl();
      removeFaceStyle();
      removeBackStyle();
      removeThemeResetControl();
      settings.destroy();
      clearTimeout(suppressClickTimer);
      clearCelebration();
      clearNewGameScreen();
      clearPointerGesture();
    },
  };
  if (restored.status === 'finished') ctx.saveSession();
  render();
  return el;
}
