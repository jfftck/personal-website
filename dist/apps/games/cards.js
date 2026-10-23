// Shared solitaire engine. Rules and state are independent of the DOM.
export const SUITS = ['♠', '♥', '♣', '♦'];
export const rankLabel = rank => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[rank] || String(rank));
export const isRed = card => card.suit === 1 || card.suit === 3;
export const chooseWinCelebration = (random = Math.random) =>
  ['fireworks', 'bounce', 'spiral'][Math.max(0, Math.min(2, Math.floor(random() * 3)))];

export function shuffle(cards, random = Math.random) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function createSolitaire(kind, options = {}, random = Math.random) {
  if (!['klondike', 'spider', 'freecell'].includes(kind)) throw new Error('Unknown card rules');
  const suits = Number(options.suits) || 1;
  const deck = Array.from({ length: kind === 'spider' ? 104 : 52 }, (_, id) => ({
    id, rank: id % 13 + 1,
    suit: kind === 'spider' ? Math.floor(id / 13) % suits : Math.floor(id / 13),
    up: kind === 'freecell',
  }));
  shuffle(deck, random);
  const state = {
    kind, suits, drawCount: Number(options.drawCount) || 1,
    columns: Array.from({ length: kind === 'spider' ? 10 : kind === 'freecell' ? 8 : 7 }, () => []),
    stock: [], waste: [], foundations: Array.from({ length: 4 }, () => []),
    cells: Array.from({ length: 4 }, () => []), completed: 0, moves: 0, won: false,
  };
  if (kind === 'freecell') {
    deck.forEach((card, index) => state.columns[index % 8].push(card));
  } else {
    state.columns.forEach((column, index) => {
      const count = kind === 'spider' ? (index < 4 ? 6 : 5) : index + 1;
      for (let j = 0; j < count; j++) column.push(deck.pop());
      column.at(-1).up = true;
    });
    state.stock = deck;
  }
  return state;
}

export function getPile(state, source) {
  return source.zone === 'waste' ? state.waste : state[source.zone]?.[source.index];
}

export function isSequence(cards, kind) {
  return cards.length > 0 && cards.every((card, index) => card.up && (!index
    || cards[index - 1].rank === card.rank + 1
      && (kind === 'spider' ? cards[index - 1].suit === card.suit
        : isRed(cards[index - 1]) !== isRed(card))));
}

function finish(state) {
  if (state.kind === 'spider') {
    for (const column of state.columns) {
      while (column.length >= 13) {
        const sequence = column.slice(-13);
        if (sequence[0].rank !== 13 || !isSequence(sequence, 'spider')) break;
        column.splice(-13);
        state.completed++;
        if (column.length) column.at(-1).up = true;
      }
    }
    state.won = state.completed === 8;
  } else {
    state.won = state.foundations.reduce((sum, pile) => sum + pile.length, 0) === 52;
  }
}

export function moveCards(state, from, to) {
  if (state.won || (from.zone === to.zone && from.index === to.index)) return false;
  const source = getPile(state, from);
  const target = getPile(state, to);
  if (!source || !target) return false;
  const offset = from.offset ?? source.length - 1;
  if (offset < 0 || offset >= source.length) return false;
  const cards = source.slice(offset);
  if (from.zone !== 'columns' && cards.length !== 1) return false;
  if (!isSequence(cards, state.kind)) return false;
  const card = cards[0], top = target.at(-1);
  if (to.zone === 'foundations') {
    if (state.kind === 'spider' || cards.length !== 1
      || (top ? top.suit !== card.suit || card.rank !== top.rank + 1 : card.rank !== 1)) return false;
  } else if (to.zone === 'cells') {
    if (state.kind !== 'freecell' || target.length || cards.length !== 1) return false;
  } else if (to.zone === 'columns') {
    if (top && (!top.up || top.rank !== card.rank + 1
      || (state.kind !== 'spider' && isRed(top) === isRed(card)))) return false;
    if (!top && state.kind === 'klondike' && card.rank !== 13) return false;
    if (state.kind === 'freecell') {
      const emptyCells = state.cells.filter(pile => !pile.length).length;
      const emptyColumns = state.columns.filter(pile => !pile.length).length - (target.length ? 0 : 1);
      if (cards.length > (emptyCells + 1) * 2 ** Math.max(0, emptyColumns)) return false;
    }
  } else return false;
  source.splice(offset);
  target.push(...cards);
  if (from.zone === 'columns' && source.length) source.at(-1).up = true;
  state.moves++;
  finish(state);
  return true;
}

export function sendEligibleCardsHome(state) {
  if (state.kind === 'spider' || state.won) return 0;
  let moved = 0;
  while (true) {
    const sources = [
      ...state.columns.map((pile, index) => ({ zone: 'columns', index, offset: pile.length - 1 })),
      ...state.cells.map((pile, index) => ({ zone: 'cells', index, offset: pile.length - 1 })),
      { zone: 'waste', index: 0, offset: state.waste.length - 1 },
    ];
    let foundMove = false;
    for (const source of sources) {
      const card = getPile(state, source)?.[source.offset];
      if (!card?.up) continue;
      for (let index = 0; index < state.foundations.length; index++) {
        if (moveCards(state, source, { zone: 'foundations', index })) {
          moved++;
          foundMove = true;
          break;
        }
      }
      if (foundMove) break;
    }
    if (!foundMove) return moved;
  }
}

export function drawCards(state) {
  if (state.won || state.kind === 'freecell') return false;
  if (state.kind === 'spider') {
    if (!state.stock.length || state.columns.some(column => !column.length)) return false;
    state.columns.forEach(column => {
      const card = state.stock.pop();
      card.up = true;
      column.push(card);
    });
    finish(state);
  } else if (state.stock.length) {
    for (let i = 0; i < state.drawCount && state.stock.length; i++) {
      const card = state.stock.pop();
      card.up = true;
      state.waste.push(card);
    }
  } else if (state.waste.length) {
    state.stock = state.waste.reverse();
    state.stock.forEach(card => { card.up = false; });
    state.waste = [];
  } else return false;
  state.moves++;
  return true;
}
