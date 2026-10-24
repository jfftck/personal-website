const base = '<path d="M10 51h28l-2.5-5h-23zM14 43h20l-2-4H16z"/>';

const forms = {
  k: '<path d="M21 4h6v6h6v5h-6v5h-6v-5h-6v-5h6z"/><path d="M16 23h16l2 15-4 4 3 5H15l3-5-4-4z"/>',
  q: '<circle cx="12" cy="11" r="3.3"/><circle cx="24" cy="7.5" r="3.3"/><circle cx="36" cy="11" r="3.3"/><path d="m11 15 5 5 8-8 8 8 5-5-3 17H14z"/><path d="M15 35h18l2 7H13z"/>',
  r: '<path d="M11 8h6v7h4V8h6v7h4V8h6v12H11z"/><path d="M14 21h20l-2 17-4 4 3 5H17l3-5-4-4z"/>',
  b: '<path d="M24 5c-6 6-8 10-8 15 0 3 2 5 5 6l-5 12 5 5-3 4h12l-3-4 5-5-5-12c3-1 5-3 5-6 0-5-2-9-8-15z"/><path class="piece-detail" d="m27 11-7 10"/>',
  n: '<path d="M13 44c2-8 0-13-2-18 5-1 7-5 9-12 1-4 4-8 9-9l1 7 8 4-3 5 5 5-3 5-4 1-2 7 5 5H13z"/><circle class="piece-eye" cx="28" cy="16" r="1.5"/><path class="piece-detail" d="M19 31c4 0 7-2 10-5"/>',
  p: '<circle cx="24" cy="13" r="7"/><path d="M18 22h12l-2 9 7 11H13l7-11z"/><path d="M15 40h18l3 6H12z"/>',
};

const geometric = {
  k: '<path d="M21 4h6v7h7v6h-7v7h-6v-7h-7v-6h7zM15 27h18l-4 12 7 10H12l7-10z"/>',
  q: '<path d="m10 10 10 9 4-14 4 14 10-9-5 24H15zM18 37h12l6 12H12z"/>',
  r: '<path d="M10 8h8v9h4V8h4v9h4V8h8v16H10zM16 27h16v13l5 9H11l5-9z"/>',
  b: '<path d="m24 4 10 16-7 10 8 19H13l8-19-7-10z"/><path class="piece-detail" d="m27 13-7 12"/>',
  n: '<path d="m12 48 5-18-7-6 13-16h9v8l9 9-7 8-5-3-3 9 10 9z"/><path class="piece-detail" d="M27 20h4"/>',
  p: '<path d="m24 5 9 9-9 9-9-9zM20 27h8l9 22H11z"/>',
};

const carved = {
  k: '<path d="M22 4h4v6h6v4h-6v7h-4v-7h-6v-4h6zM14 24q10-7 20 0l-5 12q-2 6 5 10H14q7-4 5-10z"/>',
  q: '<circle cx="10" cy="13" r="3"/><circle cx="24" cy="6" r="3"/><circle cx="38" cy="13" r="3"/><path d="m11 17 9 5 4-11 4 11 9-5-5 15H16zM18 35h12q-3 7 5 12H13q8-5 5-12z"/>',
  r: '<path d="M12 8h6v7h4V8h4v7h4V8h6v13H12zM17 24h14q-5 13 3 22H14q8-9 3-22z"/>',
  b: '<path d="M24 4q16 15 6 24l-4 3q0 9 8 16H14q8-7 8-16l-4-3Q8 19 24 4Z"/><path class="piece-detail" d="m27 12-7 10"/>',
  n: '<path d="M12 47q7-7 4-15l-6-5q9-4 11-13 2-6 10-9l-1 9q11 4 10 10l-4 7-7-2q-4 10 7 18Z"/><circle class="piece-eye" cx="29" cy="19" r="1.6"/><path class="piece-detail" d="M17 28q8-1 10-7"/>',
  p: '<circle cx="24" cy="12" r="6"/><path d="M20 21h8q-4 11 3 18l5 8H12l5-8q7-7 3-18Z"/>',
};

export function chessPieceSvg(type) {
  const shape = forms[type];
  if (!shape) throw new Error(`Unknown Chess piece: ${type}`);
  return `<svg class="chess-piece-svg" viewBox="0 0 48 56" aria-hidden="true" focusable="false"><g class="piece-body">
    <g class="chess-shape-classic">${shape}${base}</g>
    <g class="chess-shape-geometric">${geometric[type]}${base}</g>
    <g class="chess-shape-carved">${carved[type]}${base}</g>
  </g></svg>`;
}
