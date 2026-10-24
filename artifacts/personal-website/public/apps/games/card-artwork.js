import { rankLabel, SUITS } from './cards.js';

const suitPaths = [
  'M0-8C-3-4-8-1-8 3c0 4 5 5 7 1l-2 7h6L1 4c2 4 7 3 7-1C8-1 3-4 0-8Z',
  'M0 8C-2 5-8 1-8-3c0-6 6-7 8-2 2-5 8-4 8 2C8 1 2 5 0 8Z',
  'M0-8c-6 0-6 7-2 8-7-4-10 5-5 7 3 2 5 0 6-2l-2 6h6L1 5c1 2 3 4 6 2 5-2 2-11-5-7 4-1 4-8-2-8Z',
  'M0-10 8 0 0 10-8 0Z',
];

function pip(suit, x, y, scale = .6) {
  return `<path d="${suitPaths[suit]}" transform="translate(${x} ${y}) scale(${scale})"/>`;
}

function pips(card) {
  if (card.rank === 1) return pip(card.suit, 30, 45, 1.15);
  const count = card.rank;
  if (count <= 3) return Array.from({ length: count }, (_, index) =>
    pip(card.suit, 30, 25 + index * 40 / (count - 1))).join('');
  const pairs = Math.floor(count / 2);
  const rows = Array.from({ length: pairs }, (_, index) => 24 + index * 42 / (pairs - 1));
  return rows.map(y => pip(card.suit, 19, y, .49) + pip(card.suit, 41, y, .49)).join('')
    + (count % 2 ? pip(card.suit, 30, 45, .49) : '');
}

function royal(card) {
  const crown = card.rank === 11
    ? '<path d="m19 28 3-7 10-1 8 7-8 2Z"/>'
    : '<path d="m19 28-3-10 9 4 5-10 5 10 9-4-3 10Z"/>';
  const portrait = `${crown}<path d="M22 30h16v8l-5 6h-6l-5-6Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="m17 55 7-11h12l7 11Z" opacity=".7"/><path d="M27 33h2m5 0h2m-9 6h6" fill="none" stroke="currentColor" stroke-width="1.3"/>`;
  return `<g>${portrait}${pip(card.suit, 13, 38, .35)}</g><g transform="rotate(180 30 43)">${portrait}${pip(card.suit, 13, 38, .35)}</g>`;
}

export function cardFaceMarkup(card) {
  const face = `${rankLabel(card.rank)}${SUITS[card.suit]}`;
  const art = card.rank > 10 ? royal(card) : pips(card);
  return `<span class="card-corner" aria-hidden="true">${face}</span>
    <svg class="card-face-art" viewBox="0 0 60 84" aria-hidden="true" focusable="false">
      <g class="card-art-classic">${art}</g>
      <g class="card-art-ornate"><path d="M11 18h38v52H11Z" fill="none" stroke="currentColor" stroke-width=".6"/>
        <path d="m11 18 5 5-5 5m38-10-5 5 5 5M11 70l5-5-5-5m38 10-5-5 5-5" fill="none" stroke="currentColor"/>
        <g transform="translate(6 8) scale(.8)">${art}</g></g>
      <g class="card-art-minimal">${pip(card.suit, 30, 47, 1.8)}</g>
    </svg>`;
}

export function paintCardFace(element, card) {
  element.innerHTML = cardFaceMarkup(card);
}
