const base = '<path d="M10 51h28l-2.5-5h-23zM14 43h20l-2-4H16z"/>';

const forms = {
  k: '<path d="M21 4h6v6h6v5h-6v5h-6v-5h-6v-5h6z"/><path d="M16 23h16l2 15-4 4 3 5H15l3-5-4-4z"/>',
  q: '<circle cx="12" cy="11" r="3.3"/><circle cx="24" cy="7.5" r="3.3"/><circle cx="36" cy="11" r="3.3"/><path d="m11 15 5 5 8-8 8 8 5-5-3 17H14z"/><path d="M15 35h18l2 7H13z"/>',
  r: '<path d="M11 8h6v7h4V8h6v7h4V8h6v12H11z"/><path d="M14 21h20l-2 17-4 4 3 5H17l3-5-4-4z"/>',
  b: '<path d="M24 5c-6 6-8 10-8 15 0 3 2 5 5 6l-5 12 5 5-3 4h12l-3-4 5-5-5-12c3-1 5-3 5-6 0-5-2-9-8-15z"/><path class="piece-detail" d="m27 11-7 10"/>',
  n: '<path d="M13 44c2-8 0-13-2-18 5-1 7-5 9-12 1-4 4-8 9-9l1 7 8 4-3 5 5 5-3 5-4 1-2 7 5 5H13z"/><circle class="piece-eye" cx="28" cy="16" r="1.5"/><path class="piece-detail" d="M19 31c4 0 7-2 10-5"/>',
  p: '<circle cx="24" cy="13" r="7"/><path d="M18 22h12l-2 9 7 11H13l7-11z"/><path d="M15 40h18l3 6H12z"/>',
};

export function chessPieceSvg(type) {
  const shape = forms[type];
  if (!shape) throw new Error(`Unknown Chess piece: ${type}`);
  return `<svg class="chess-piece-svg" viewBox="0 0 48 56" aria-hidden="true" focusable="false"><g class="piece-body">${shape}${base}</g></svg>`;
}
