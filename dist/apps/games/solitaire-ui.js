import {
  createSolitaire, getPile, moveCards, drawCards, isSequence, sendEligibleCardsHome,
  chooseWinCelebration, SUITS, rankLabel, isRed,
} from './cards.js';
import { gameShell, button, selectControl, preserveFocus, showRestorePrompt } from './ui.js';
import { createGameSession, inspectGameSession } from './game-state.js';

const rules = {
  klondike: 'Build the four foundations from Ace to King by suit. Tableau piles descend in alternating colors; only Kings fill empty columns. Click an exposed card or sequence, then a destination. Use Send home to move an eligible card to a foundation. Click the stock to draw or recycle. Choose draw one or draw three for a new deal.',
  spider: 'Build King-to-Ace runs of one suit to remove them. You may place a card on the next higher rank of any suit, but only same-suit descending runs move together. Any run can fill an empty column. Stock deals one card to each column; every column must contain a card first. Remove all eight runs to win.',
  freecell: 'Build foundations from Ace to King by suit. Tableau piles descend in alternating colors; any card may fill an empty column. The four free cells each hold one card. Sequence moves are limited by available free cells and empty columns. Click a card or sequence, then a destination. Use Send home to move an eligible card to a foundation.',
};

export function buildSolitaire(kind, id, title, ctx, initialState = null) {
  const shell = gameShell(id, title, rules[kind], ctx);
  const { el, toolbar, area, status } = shell;
  area.classList.add('solitaire-game-area');
  const restored = inspectGameSession(kind, initialState);
  let options = restored.status === 'valid' || restored.status === 'finished'
    ? restored.options : { suits: 1, drawCount: 1 };
  let state = createSolitaire(kind, options), selected = null, history = [];
  let latestTable = null;
  let suppressClick = false, suppressClickTimer = null;
  let pointerDrag = null, activeDropTarget = null;
  const dragAbort = new AbortController();
  let pendingRestore = initialState != null && restored.status !== 'finished';
  function persist() {
    if (!pendingRestore) ctx.saveSession();
  }
  const undo = button('Undo', () => {
    if (!history.length) return;
    state = history.pop(); selected = null; render(); persist();
  });
  function restart() {
    pendingRestore = false;
    state = createSolitaire(kind, options); history = []; selected = null; render(); persist();
  }
  toolbar.append(button('New deal', restart), undo);
  if (kind !== 'spider') toolbar.append(button('Send home', () => {
    const alreadyHome = new Set(state.foundations.flat().map(card => card.id));
    const moved = action(() => sendEligibleCardsHome(state));
    if (!moved) status.textContent = 'No card can move home yet. An Ace starts a home pile; the next card must match its suit.';
    else {
      status.textContent = `Moved ${moved} ${moved === 1 ? 'card' : 'cards'} home.`;
      animateCards(state.foundations.flat().map(card => card.id).filter(id => !alreadyHome.has(id)));
    }
  }));
  if (kind === 'klondike') {
    toolbar.append(selectControl('Draw', [['1', 'One card'], ['3', 'Three cards']], String(options.drawCount), value => {
      options.drawCount = Number(value); restart();
    }));
  }
  if (kind === 'spider') {
    toolbar.append(selectControl('Suits', [['1', 'One suit'], ['2', 'Two suits'], ['4', 'Four suits']], String(options.suits), value => {
      options.suits = Number(value); restart();
    }));
  }
  function action(fn, animateIds = []) {
    const before = structuredClone(state);
    const result = fn();
    if (!result) return false;
    history.push(before);
    if (history.length > 150) history.shift();
    selected = null;
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
  function celebrate(effect) {
    if (!latestTable) return;
    latestTable.dataset.winCelebration = effect;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (effect === 'bounce' || effect === 'spiral') {
      latestTable.querySelectorAll('.playing-card').forEach((card, index) => {
        card.style.setProperty('--celebration-delay', `${index * (effect === 'bounce' ? 24 : 12)}ms`);
        card.style.setProperty('--spiral-x', `${(index - 26) * 5}px`);
        card.classList.add(effect === 'bounce' ? 'win-bounce' : 'win-spiral');
      });
      return;
    }
    const sparks = document.createElement('div');
    sparks.className = 'solitaire-fireworks';
    sparks.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 18; index++) {
      const spark = document.createElement('span');
      spark.style.setProperty('--spark-angle', `${index * 20}deg`);
      spark.style.setProperty('--spark-delay', `${(index % 6) * 55}ms`);
      sparks.append(spark);
    }
    latestTable.append(sparks);
  }
  function autoMove(source) {
    const card = getPile(state, source)?.[source.offset];
    if (kind === 'freecell') {
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
      const movingIds = getPile(state, selected)?.slice(selected.offset).map(card => card.id) || [];
      if (action(() => moveCards(state, selected, { zone, index }), movingIds)) return;
      if (selected.zone === zone && selected.index === index && selected.offset === offset) {
        selected = null; render(); return;
      }
    }
    if (pile?.[offset]?.up && isSequence(pile.slice(offset), kind)) {
      selected = { zone, index, offset };
      render();
      status.textContent += ' Selected — choose a destination.';
    } else {
      selected = null; render();
      status.textContent += ' That move is not allowed.';
    }
  }
  area.addEventListener('click', event => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
    clearTimeout(suppressClickTimer);
  }, true);
  area.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')?.disabled) return;
    const card = event.target.closest('.playing-card');
    if (!card) return;
    pointerDrag = {
      pointerId: event.pointerId,
      card,
      from: {
        zone: card.dataset.zone,
        index: Number(card.dataset.pileIndex),
        offset: Number(card.dataset.offset),
      },
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
  });
  document.addEventListener('pointermove', event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    if (!pointerDrag.dragging && Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) > 8) {
      pointerDrag.dragging = true;
      pointerDrag.card.classList.add('dragging');
    }
    if (!pointerDrag.dragging) return;
    event.preventDefault();
    pointerDrag.card.style.setProperty('--drag-x', `${event.clientX - pointerDrag.x}px`);
    pointerDrag.card.style.setProperty('--drag-y', `${event.clientY - pointerDrag.y}px`);
    const target = resolveDropTarget(event.clientX, event.clientY);
    if (target === activeDropTarget) return;
    activeDropTarget?.classList.remove('drag-over');
    activeDropTarget = target;
    activeDropTarget?.classList.add('drag-over');
  }, { signal: dragAbort.signal, passive: false });
  document.addEventListener('pointerup', event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    const drag = pointerDrag;
    pointerDrag = null;
    drag.card.classList.remove('dragging');
    drag.card.style.removeProperty('--drag-x');
    drag.card.style.removeProperty('--drag-y');
    activeDropTarget?.classList.remove('drag-over');
    activeDropTarget = null;
    if (!drag.dragging) return;
    suppressClick = true;
    clearTimeout(suppressClickTimer);
    suppressClickTimer = setTimeout(() => { suppressClick = false; }, 250);
    const target = resolveDropTarget(event.clientX, event.clientY);
    const destination = target && { zone: target.dataset.dropZone, index: Number(target.dataset.dropIndex) };
    const movingIds = getPile(state, drag.from)?.slice(drag.from.offset).map(card => card.id) || [];
    if (!destination || !action(() => moveCards(state, drag.from, destination), movingIds)) {
      status.textContent = 'That card or sequence cannot move to this pile.';
    }
  }, { signal: dragAbort.signal });
  document.addEventListener('pointercancel', event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    pointerDrag.card.classList.remove('dragging');
    pointerDrag.card.style.removeProperty('--drag-x');
    pointerDrag.card.style.removeProperty('--drag-y');
    pointerDrag = null;
    activeDropTarget?.classList.remove('drag-over');
    activeDropTarget = null;
  }, { signal: dragAbort.signal });
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
    const heading = document.createElement('span');
    heading.className = 'pile-label'; heading.textContent = label;
    div.append(heading);
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
      if (kind === 'freecell') {
        for (let i = 0; i < 4; i++) top.append(pileView('cells', i, `Cell ${i + 1}`));
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
      if (kind !== 'spider') {
        for (let i = 0; i < 4; i++) top.append(pileView('foundations', i, `Home ${i + 1}`));
      } else {
        const completed = document.createElement('span');
        completed.className = 'pile-label'; completed.textContent = `${state.completed} / 8 complete runs`;
        top.append(completed);
      }
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
      clearTimeout(suppressClickTimer);
    },
  };
  if (restored.status === 'finished') ctx.saveSession();
  render();
  return el;
}
