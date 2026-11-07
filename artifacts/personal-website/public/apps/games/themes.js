import { chessPieceSvg } from './chess-piece-svg.js';
import { cardFaceMarkup } from './card-artwork.js';
import { readJSON, writeJSON } from '../../data-handler.js';
import { wrapAppControl } from '../../shared/app-controls.js';

const STORAGE_KEY = 'game-center-visual-themes-v1';
let nextThemeGroupId = 1;

const config = {
  cards: {
    dataset: 'cardTheme',
    label: 'Card theme',
    preview: 'cards',
    choices: [['classic', 'Classic'], ['midnight', 'Midnight'], ['botanical', 'Botanical'], ['glass', 'Glass']],
  },
  cardFaces: {
    dataset: 'cardFaceStyle',
    label: 'Card faces',
    preview: 'card-faces',
    choices: [['classic', 'Classic pips'], ['ornate', 'Ornate'], ['minimal', 'Minimal']],
  },
  cardBacks: {
    dataset: 'cardBackStyle',
    label: 'Card backs',
    preview: 'card-backs',
    choices: [['lattice', 'Lattice'], ['diamonds', 'Diamonds'], ['orbit', 'Orbit']],
  },
  cardTable: {
    dataset: 'cardTableTheme',
    label: 'Playfield theme',
    preview: 'card-table',
    choices: [
      ['classic', 'Classic green'],
      ['ocean', 'Ocean'],
      ['midnight', 'Midnight'],
      ['botanical', 'Botanical'],
      ['glass', 'Glass'],
    ],
  },
  chessBoard: {
    dataset: 'chessBoardTheme',
    label: 'Board theme',
    preview: 'chess-board',
    choices: [['wood', 'Wood'], ['slate', 'Slate'], ['glass', 'Glass']],
  },
  chessPieces: {
    dataset: 'chessPiecesTheme',
    label: 'Piece theme',
    preview: 'chess-pieces',
    choices: [['classic', 'Classic'], ['modern', 'Modern'], ['glass', 'Glass']],
  },
  chessArtwork: {
    dataset: 'chessPieceStyle',
    label: 'Piece style',
    preview: 'chess-artwork',
    choices: [['classic', 'Classic'], ['geometric', 'Geometric'], ['carved', 'Carved']],
  },
  reversiBoard: {
    dataset: 'reversiBoardTheme',
    label: 'Board theme',
    preview: 'reversi-board',
    choices: [['classic', 'Classic green'], ['ocean', 'Ocean blue'], ['glass', 'Glass']],
  },
  reversiPieces: {
    dataset: 'reversiPiecesTheme',
    label: 'Piece theme',
    preview: 'reversi-pieces',
    choices: [['classic', 'Classic'], ['amber', 'Amber'], ['glass', 'Glass']],
  },
  minesweeper: {
    dataset: 'minesweeperTheme',
    label: 'Theme',
    preview: 'minesweeper',
    choices: [
      ['classic', 'Classic grey'],
      ['ocean', 'Ocean'],
      ['sunset', 'Sunset'],
      ['glass', 'Glass'],
      ['colorblind', 'Color-blind friendly'],
    ],
  },
};

function readPreferences() {
  return readJSON(STORAGE_KEY, {}, {
    validate: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
  });
}

function normalize(key, value) {
  const themes = config[key];
  return themes?.choices.some(([option]) => option === value)
    ? value
    : themes?.choices[0][0];
}

function currentValue(key) {
  return normalize(key, readPreferences()[key]);
}

export function addGameThemeControl(root, container, key) {
  const theme = config[key];
  if (!theme) throw new Error(`Unknown game theme: ${key}`);
  const control = document.createElement('div');
  control.className = 'game-theme-control';
  control.setAttribute('role', 'radiogroup');
  control.setAttribute('aria-label', theme.label);
  const label = document.createElement('span');
  label.className = 'game-theme-control-label';
  label.textContent = theme.label;
  control.append(label);
  const choices = document.createElement('div');
  choices.className = 'game-theme-choices';
  const radios = new Map();
  const radioGroupName = `game-theme-${key}-${nextThemeGroupId++}`;

  function preview(value) {
    const sample = document.createElement('span');
    sample.className = `game-theme-preview game-theme-preview--${theme.preview}`;
    sample.dataset.previewTheme = value;
    sample.setAttribute('aria-hidden', 'true');
    if (theme.preview === 'card-faces') {
      sample.dataset.cardFaceStyle = value;
      sample.innerHTML = `<span class="game-theme-card-sample">${cardFaceMarkup({ rank: 12, suit: 0 })}</span>`;
    } else if (theme.preview === 'card-backs') {
      sample.dataset.cardBackStyle = value;
      sample.innerHTML = '<span class="game-theme-card-sample face-down"></span>';
    } else if (theme.preview === 'cards') {
      sample.innerHTML = '<span class="game-theme-card-back"></span>';
    } else if (theme.preview === 'card-table') {
      sample.innerHTML = '<span class="game-theme-felt-sample"></span>';
    } else if (theme.preview.endsWith('-board')) {
      sample.innerHTML = theme.preview === 'reversi-board'
        ? '<span></span><span></span><span class="game-theme-disc"></span><span></span><span></span><span class="game-theme-disc game-theme-disc--light"></span><span></span><span></span><span></span>'
        : '<span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>';
    } else if (theme.preview === 'chess-pieces' || theme.preview === 'chess-artwork') {
      if (theme.preview === 'chess-artwork') sample.dataset.chessPieceStyle = value;
      sample.innerHTML = `<span class="game-theme-chess-piece">${chessPieceSvg('k')}</span><span class="game-theme-chess-piece game-theme-chess-piece--dark">${chessPieceSvg('p')}</span>`;
    } else if (theme.preview === 'reversi-pieces') {
      sample.innerHTML = '<span class="game-theme-disc"></span><span class="game-theme-disc game-theme-disc--light"></span>';
    } else {
      sample.innerHTML = '<span></span><span class="game-theme-mine-number">2</span><span class="game-theme-mine-flag">⚑</span>';
    }
    return sample;
  }

  for (const [value, title] of theme.choices) {
    const choice = document.createElement('label');
    choice.className = 'game-theme-choice';
    choice.dataset.themeValue = value;
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = radioGroupName;
    radio.value = value;
    radio.setAttribute('aria-label', `${theme.label}: ${title}`);
    wrapAppControl(radio, { placement: 'overlay' });
    choice.append(preview(value));
    const optionLabel = document.createElement('span');
    optionLabel.className = 'game-theme-choice-label';
    optionLabel.textContent = title;
    choice.append(optionLabel, radio.parentElement);
    radios.set(value, radio);
    choices.append(choice);
  }
  control.append(choices);

  const apply = value => {
    const normalized = normalize(key, value);
    root.dataset[theme.dataset] = normalized;
    for (const [choice, radio] of radios) {
      const selected = choice === normalized;
      radio.checked = selected;
      radio.setAttribute('aria-checked', String(selected));
      radio.closest('.game-theme-choice')?.classList.toggle('is-selected', selected);
    }
  };

  const choose = value => {
    const preferences = readPreferences();
    preferences[key] = normalize(key, value);
    if (!writeJSON(STORAGE_KEY, preferences, {
      validate: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
    })) {
      // Keep the current in-memory choice even if storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent('game-center-theme-change', {
      detail: { key, value: preferences[key] },
    }));
  };

  for (const [value, radio] of radios) {
    radio.addEventListener('change', () => {
      if (radio.checked) choose(value);
    });
  }
  container.hidden = false;
  container.append(control);
  container.hidden = false;
  apply(currentValue(key));

  const onThemeChange = event => {
    if (event.detail?.reset) {
      apply(event.detail.preferences?.[key]);
    } else if (event.detail?.key === key) {
      apply(event.detail.value);
    }
  };
  const onStorage = event => {
    if (event.key === STORAGE_KEY) apply(readPreferences()[key]);
  };
  window.addEventListener('game-center-theme-change', onThemeChange);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener('game-center-theme-change', onThemeChange);
    window.removeEventListener('storage', onStorage);
    control.remove();
  };
}

export function addGameThemeResetControl(container) {
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'game-theme-reset';
  reset.textContent = 'Reset all game themes';
  const onClick = () => {
    const preferences = Object.fromEntries(
      Object.entries(config).map(([key, theme]) => [key, theme.choices[0][0]]),
    );
    if (!writeJSON(STORAGE_KEY, preferences, {
      validate: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
    })) {
      // Apply the reset to open games even if browser storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent('game-center-theme-change', {
      detail: { reset: true, preferences },
    }));
  };
  reset.addEventListener('click', onClick);
  container.hidden = false;
  container.append(reset);
  return () => {
    reset.removeEventListener('click', onClick);
    reset.remove();
  };
}
