import {
  createSolitaire, getPile, moveCards, drawCards, isSequence, sendEligibleCardsHome,
  removePyramidCards, isPyramidExposed, isTriPeaksExposed,
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
  pyramid: 'Remove exposed cards in pairs that total 13; Kings are removed by themselves. A card is exposed when no cards cover it. Draw from the stock when no pair is available; you may recycle the waste once. Clear all 28 pyramid cards to win.',
  tripeaks: 'Remove an exposed peak card when it is one rank above or below the waste card. Ace and King connect. Draw from the stock when no move is available. Clear all 28 peak cards to win.',
  golf: 'Remove the top card of any column when it is exactly one rank above or below the waste card. Aces and Kings do not connect. Draw from the stock when no move is available. Clear all 35 tableau cards to win.',
};

export function buildSolitaire(kind, id, title, ctx, initialState = null, iconSvg) {
  const shell = gameShell(id, title,
    `${rules[kind]} Slide a finger vertically through a tableau stack to peek at its layers. While peeking, slide left or right by half a card's width to drag that card or a valid sequence. Peeking stops once dragging starts. With a mouse, hold the right button and move up or down to peek. Release to restore the stack.`, ctx, iconSvg);
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
  if (kind === 'klondike' || kind === 'freecell') toolbarLeft.append(button('Send home', () => {
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
    if (!['klondike', 'freecell'].includes(kind)) return;
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
  function canSelectCard(zone, index, offset) {
    const card = getPile(state, { zone, index })?.[offset];
    if (!card?.up) return false;
    if (kind === 'pyramid') {
      return zone === 'waste'
        ? offset === state.waste.length - 1
        : zone === 'columns' && isPyramidExposed(state, index, offset);
    }
    if (kind === 'tripeaks') return zone === 'columns' && isTriPeaksExposed(state, index, offset);
    if (kind === 'golf') {
      const pile = getPile(state, { zone, index });
      return zone === 'columns' && offset === pile.length - 1;
    }
    return true;
  }
  function clickPyramidCard(source) {
    const card = getPile(state, source)?.[source.offset];
    if (!card || !canSelectCard(source.zone, source.index, source.offset)) {
      status.textContent = 'That card is still covered.';
      return;
    }
    if (card.rank === 13) {
      if (action(() => removePyramidCards(state, source), [card.id])) {
        status.textContent = 'Removed a King.';
      }
      return;
    }
    if (!selected) {
      selected = { ...source };
      render();
      status.textContent = 'Card selected. Choose another exposed card that makes 13.';
      return;
    }
    const first = { ...selected };
    if (first.zone === source.zone && first.index === source.index && first.offset === source.offset) {
      selected = null;
      render();
      return;
    }
    const firstCard = getPile(state, first)?.[first.offset];
    if (action(() => removePyramidCards(state, first, source), [firstCard?.id, card.id])) {
      status.textContent = `Removed ${rankLabel(firstCard.rank)} and ${rankLabel(card.rank)}.`;
    } else {
      selected = { ...source };
      render();
      status.textContent = 'Those cards do not make 13. Choose another exposed card.';
    }
  }
  function clickOpenTableauCard(source) {
    const card = getPile(state, source)?.[source.offset];
    if (!card || !canSelectCard(source.zone, source.index, source.offset)) {
      status.textContent = kind === 'golf'
        ? 'Only the top card of each column can be played.'
        : 'That card is still covered by the cards below it.';
      return;
    }
    const wasteCard = state.waste.at(-1);
    const wrap = kind === 'tripeaks' && Math.abs(card.rank - wasteCard.rank) === 12;
    if (kind === 'tripeaks'
      ? !wrap && Math.abs(card.rank - wasteCard.rank) !== 1
      : Math.abs(card.rank - wasteCard.rank) !== 1) {
      status.textContent = `${rankLabel(card.rank)} is not one rank above or below the waste card.`;
      return;
    }
    if (action(() => moveCards(state, source, { zone: 'waste', index: 0 }), [card.id])) {
      status.textContent = `Moved ${rankLabel(card.rank)} to the waste pile.`;
    }
  }
  function clickPile(zone, index, offset) {
    if (suppressClick) return;
    if (['pyramid', 'tripeaks', 'golf'].includes(kind)) {
      if (kind === 'pyramid') clickPyramidCard({ zone, index, offset });
      else clickOpenTableauCard({ zone, index, offset });
      return;
    }
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
  function canStartDrag(from) {
    const source = getPile(state, from);
    const cards = source?.slice(from.offset);
    return !state.won && (from.zone === 'columns' || cards?.length === 1)
      && isSequence(cards || [], kind);
  }
  function updatePeek(gesture, clientY, clientX = gesture.x) {
    // Use the original stack positions: a raised card must not hide the
    // hit regions of the other cards while the finger moves through them.
    const slots = gesture.peekSlots;
    let slot = null;
    if (clientY >= slots[0].top && clientY <= slots.at(-1).bottom) {
      slot = slots.findLast(candidate => clientY >= candidate.top);
    }
    const nextCard = slot?.card || null;
    if (gesture.peekCard !== nextCard) {
      gesture.peekCard?.classList.remove('card-peeking');
      gesture.peekCard = nextCard;
      gesture.peekStartX = clientX;
      gesture.peekCard?.classList.add('card-peeking');
    }
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
    if (!['klondike', 'spider', 'freecell'].includes(kind)
      || ![0, 2].includes(event.button) || event.target.closest('button')?.disabled || pointerDrag) return;
    const card = event.target.closest('.playing-card');
    if (!card) return;
    const inStack = !!card.closest('.card-columns');
    if (event.button === 2 && !inStack) return;
    const from = {
      zone: card.dataset.zone,
      index: Number(card.dataset.pileIndex),
      offset: Number(card.dataset.offset),
    };
    pointerDrag = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      card,
      peeking: event.button === 2,
      peekSlots: inStack ? [...card.parentElement.querySelectorAll(':scope > .playing-card')].map(card => {
        const { top, bottom } = card.getBoundingClientRect();
        return { card, top, bottom };
      }) : null,
      from,
      canDrag: canStartDrag(from),
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    if (pointerDrag.peeking) {
      event.preventDefault();
      updatePeek(pointerDrag, event.clientY, event.clientX);
    }
  });
  area.addEventListener('contextmenu', event => {
    if (event.target.closest('.card-columns .playing-card')) event.preventDefault();
  });
  document.addEventListener('pointermove', event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    if (pointerDrag.peeking) {
      event.preventDefault();
      if (pointerDrag.pointerType === 'touch' && pointerDrag.peekCard
        && Math.abs(event.clientX - pointerDrag.peekStartX)
          >= pointerDrag.peekCard.getBoundingClientRect().width / 2) {
        const card = pointerDrag.peekCard;
        const from = {
          zone: card.dataset.zone,
          index: Number(card.dataset.pileIndex),
          offset: Number(card.dataset.offset),
        };
        if (canStartDrag(from)) {
          card.classList.remove('card-peeking');
          pointerDrag.peekCard = null;
          pointerDrag.card = card;
          pointerDrag.from = from;
          pointerDrag.x = pointerDrag.peekStartX;
          pointerDrag.y = event.clientY;
          pointerDrag.canDrag = true;
          pointerDrag.peeking = false;
          pointerDrag.dragging = true;
          createDragLayer(pointerDrag);
        } else {
          pointerDrag.peekStartX = event.clientX;
          updatePeek(pointerDrag, event.clientY, event.clientX);
          return;
        }
      } else {
        updatePeek(pointerDrag, event.clientY, event.clientX);
        return;
      }
    }
    if (!pointerDrag.dragging && Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) > 8) {
      const verticalSwipe = Math.abs(event.clientY - pointerDrag.y) > Math.abs(event.clientX - pointerDrag.x) * 1.2;
      if (pointerDrag.pointerType === 'touch' && pointerDrag.peekSlots && verticalSwipe) {
        pointerDrag.peeking = true;
        event.preventDefault();
        updatePeek(pointerDrag, event.clientY, event.clientX);
        return;
      }
      if (!pointerDrag.canDrag) return;
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
  function cardButton(card, zone, index, offset, label) {
    const face = `${rankLabel(card.rank)}${SUITS[card.suit]}`;
    const btn = button(card.up ? face : '', () => clickPile(zone, index, offset), 'playing-card');
    if (card.up) paintCardFace(btn, card);
    btn.classList.toggle('face-down', !card.up);
    btn.classList.toggle('red', isRed(card));
    btn.classList.toggle('selected', selected?.zone === zone && selected.index === index && selected.offset === offset);
    const canSelect = canSelectCard(zone, index, offset);
    const consumesCoveredClick = ['pyramid', 'tripeaks'].includes(kind);
    btn.disabled = !card.up || (!canSelect && !consumesCoveredClick);
    btn.dataset.key = `card-${card.id}`;
    btn.dataset.cardId = card.id;
    btn.dataset.gameCardId = card.id;
    btn.dataset.offset = offset;
    btn.dataset.zone = zone;
    btn.dataset.pileIndex = index;
    btn.setAttribute('aria-label', card.up
      ? `${face}, ${label}, card ${offset + 1}${consumesCoveredClick && !canSelect ? ', covered by other cards' : ''}`
      : `Face down, ${label}`);
    btn.setAttribute('aria-pressed', String(selected?.zone === zone && selected.index === index && selected.offset === offset));
    if (['klondike', 'freecell'].includes(kind)) {
      btn.addEventListener('dblclick', event => {
        event.preventDefault();
        event.stopPropagation();
        autoMove({ zone, index, offset });
      });
    }
    return btn;
  }
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
        div.append(cardButton(card, zone, index, offset, label));
      });
    }
    return div;
  }
  function triangleBoard() {
    const isPyramid = kind === 'pyramid';
    const gridColumns = isPyramid ? 7 : 10;
    const peakPositions = [[2, 5, 8], [1, 2, 4, 5, 7, 8],
      Array.from({ length: 9 }, (_, index) => index + 1),
      Array.from({ length: 10 }, (_, index) => index + 1)];
    const board = document.createElement('div');
    board.className = `card-triangle-layout ${isPyramid ? 'pyramid-layout' : 'tripeaks-layout'}`;
    board.style.setProperty('--layout-columns', gridColumns);
    state.columns.forEach((cards, rowIndex) => {
      const row = document.createElement('div');
      row.className = 'card-triangle-row';
      if (isPyramid) row.style.setProperty('--row-card-count', cards.length);
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', `${isPyramid ? 'Pyramid' : 'Peaks'} row ${rowIndex + 1}`);
      cards.forEach((card, offset) => {
        const slot = document.createElement('div');
        slot.className = 'card-triangle-position';
        slot.dataset.gameCardId = card.id;
        slot.style.gridColumn = isPyramid
          ? `${offset + 1}`
          : `${peakPositions[rowIndex][offset]}`;
        if (card.removed) {
          slot.classList.add('removed');
          slot.setAttribute('aria-hidden', 'true');
        } else {
          slot.append(cardButton(card, 'columns', rowIndex, offset, `Row ${rowIndex + 1}`));
        }
        row.append(slot);
      });
      board.append(row);
    });
    return board;
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
      : kind === 'spider' ? `${state.moves} moves · ${state.completed} / 8 runs completed`
        : ['pyramid', 'tripeaks', 'golf'].includes(kind)
          ? `${state.moves} moves · ${kind === 'pyramid'
            ? state.columns.flat().filter(card => !card.removed).length
            : kind === 'tripeaks'
              ? state.columns.flat().filter(card => !card.removed).length
              : state.columns.reduce((total, pile) => total + pile.length, 0)} cards left · ${state.stock.length} stock${kind === 'pyramid' ? ` · ${state.recyclesLeft} recycle${state.recyclesLeft === 1 ? '' : 's'} left` : ''}`
          : `${state.moves} moves · ${state.foundations.reduce((n, p) => n + p.length, 0)} / 52 cards home`;
    preserveFocus(area, () => {
      const table = document.createElement('div');
      table.className = `solitaire-table ${kind}`;
      table.style.setProperty('--pile-count', kind === 'tripeaks' ? 10 : state.columns.length);
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
        const canRecycle = kind === 'klondike'
          ? state.waste.length > 0
          : kind === 'pyramid' && state.recyclesLeft > 0 && state.waste.length > 0;
        const draw = button(state.stock.length ? `${state.stock.length}` : canRecycle ? '↻' : '—', () => {
          if (!action(() => drawCards(state))) status.textContent = kind === 'spider'
            ? 'Fill every empty column before dealing, or no stock remains.' : 'No cards left in stock.';
        });
        draw.disabled = !state.stock.length && !canRecycle;
        draw.setAttribute('aria-label', `Stock: ${state.stock.length} cards. ${state.stock.length
          ? kind === 'spider' ? 'Deal one card to each pile' : 'Draw one card'
          : canRecycle ? 'Recycle waste' : 'No cards remain'}`);
        draw.dataset.key = 'stock';
        stock.append(draw); top.append(stock);
        if (['klondike', 'pyramid', 'tripeaks', 'golf'].includes(kind)) {
          top.append(pileView('waste', 0, 'Waste'));
        }
      }
      if (['klondike', 'spider', 'freecell'].includes(kind)) {
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
      }
      let columns;
      if (kind === 'pyramid' || kind === 'tripeaks') {
        columns = triangleBoard();
      } else {
        columns = document.createElement('div');
        columns.className = 'card-columns';
        columns.style.setProperty('--columns', state.columns.length);
        for (let i = 0; i < state.columns.length; i++) {
          columns.append(pileView('columns', i, `Pile ${i + 1}`, true));
        }
      }
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
