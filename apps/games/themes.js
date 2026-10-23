import { selectControl } from './ui.js';

const STORAGE_KEY = 'game-center-visual-themes-v1';

const config = {
  cards: {
    dataset: 'cardTheme',
    label: 'Card theme',
    choices: [['classic', 'Classic'], ['midnight', 'Midnight'], ['botanical', 'Botanical'], ['glass', 'Glass']],
  },
  chessBoard: {
    dataset: 'chessBoardTheme',
    label: 'Board theme',
    choices: [['wood', 'Wood'], ['slate', 'Slate'], ['glass', 'Glass']],
  },
  chessPieces: {
    dataset: 'chessPiecesTheme',
    label: 'Piece theme',
    choices: [['classic', 'Classic'], ['modern', 'Modern'], ['glass', 'Glass']],
  },
  reversiBoard: {
    dataset: 'reversiBoardTheme',
    label: 'Board theme',
    choices: [['classic', 'Classic green'], ['ocean', 'Ocean blue'], ['glass', 'Glass']],
  },
  reversiPieces: {
    dataset: 'reversiPiecesTheme',
    label: 'Piece theme',
    choices: [['classic', 'Classic'], ['amber', 'Amber'], ['glass', 'Glass']],
  },
  minesweeper: {
    dataset: 'minesweeperTheme',
    label: 'Theme',
    choices: [['classic', 'Classic grey'], ['ocean', 'Ocean'], ['sunset', 'Sunset'], ['glass', 'Glass']],
  },
};

function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
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

export function addGameThemeControl(root, toolbar, key) {
  const theme = config[key];
  if (!theme) throw new Error(`Unknown game theme: ${key}`);

  const apply = value => {
    const normalized = normalize(key, value);
    root.dataset[theme.dataset] = normalized;
    control.querySelector('select').value = normalized;
  };

  const control = selectControl(theme.label, theme.choices, currentValue(key), value => {
    const preferences = readPreferences();
    preferences[key] = normalize(key, value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Keep the current in-memory choice even if storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent('game-center-theme-change', {
      detail: { key, value: preferences[key] },
    }));
  });
  control.classList.add('game-theme-control');
  toolbar.append(control);
  apply(currentValue(key));

  const onThemeChange = event => {
    if (event.detail?.key === key) apply(event.detail.value);
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
