import { createSolitaire, getPile, moveCards, drawCards, isSequence, SUITS, rankLabel, isRed } from './cards.js';
import { gameShell, button, selectControl, preserveFocus } from './ui.js';

const rules = {
  klondike: 'Build the four foundations from Ace to King by suit. Tableau piles descend in alternating colors; only Kings fill empty columns. Click an exposed card or sequence, then a destination. Use Send home to move an eligible card to a foundation. Click the stock to draw or recycle. Choose draw one or draw three for a new deal.',
  spider: 'Build King-to-Ace runs of one suit to remove them. You may place a card on the next higher rank of any suit, but only same-suit descending runs move together. Any run can fill an empty column. Stock deals one card to each column; every column must contain a card first. Remove all eight runs to win.',
  freecell: 'Build foundations from Ace to King by suit. Tableau piles descend in alternating colors; any card may fill an empty column. The four free cells each hold one card. Sequence moves are limited by available free cells and empty columns. Click a card or sequence, then a destination. Use Send home to move an eligible card to a foundation.',
};

export function buildSolitaire(kind, id, title, ctx) {
  const shell = gameShell(id, title, rules[kind], ctx);
  const { el, toolbar, area, status } = shell;
  let options = { suits: 1, drawCount: 1 };
  let state = createSolitaire(kind, options), selected = null, history = [];
  const undo = button('Undo', () => {
    if (!history.length) return;
    state = history.pop(); selected = null; render();
  });
  function restart() {
    state = createSolitaire(kind, options); history = []; selected = null; render();
  }
  toolbar.append(button('New deal', restart), undo);
  if (kind !== 'spider') toolbar.append(button('Send home', () => {
    const sources = selected ? [selected] : [
      ...state.columns.map((pile, index) => ({ zone: 'columns', index, offset: pile.length - 1 })),
      ...state.cells.map((pile, index) => ({ zone: 'cells', index, offset: pile.length - 1 })),
      { zone: 'waste', index: 0, offset: state.waste.length - 1 },
    ];
    for (const source of sources) {
      for (let index = 0; index < 4; index++) {
        if (action(() => moveCards(state, source, { zone: 'foundations', index }))) return;
      }
    }
    status.textContent = 'No eligible card can move home. Choose an exposed Ace or the next card of its suit.';
  }));
  if (kind === 'klondike') {
    toolbar.append(selectControl('Draw', [['1', 'One card'], ['3', 'Three cards']], '1', value => {
      options.drawCount = Number(value); restart();
    }));
  }
  if (kind === 'spider') {
    toolbar.append(selectControl('Suits', [['1', 'One suit'], ['2', 'Two suits'], ['4', 'Four suits']], '1', value => {
      options.suits = Number(value); restart();
    }));
  }
  function action(fn) {
    const before = structuredClone(state);
    if (!fn()) return false;
    history.push(before);
    if (history.length > 150) history.shift();
    selected = null; render(); return true;
  }
  function clickPile(zone, index, offset) {
    const pile = getPile(state, { zone, index });
    if (selected) {
      if (action(() => moveCards(state, selected, { zone, index }))) return;
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
  function pileView(zone, index, label, all = false) {
    const pile = getPile(state, { zone, index });
    const div = document.createElement('div');
    div.className = 'card-pile';
    div.setAttribute('role', 'group');
    div.setAttribute('aria-label', label);
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
        btn.setAttribute('aria-label', card.up ? `${face}, ${label}, card ${offset + 1}` : `Face down, ${label}`);
        btn.setAttribute('aria-pressed', String(selected?.zone === zone && selected.index === index && selected.offset === offset));
        div.append(btn);
      });
    }
    return div;
  }
  function render() {
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
      table.append(top, columns); area.replaceChildren(table);
    });
  }
  render();
  return el;
}
