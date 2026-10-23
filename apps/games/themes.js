const STORAGE_KEY = 'game-center-visual-themes-v1';

const config = {
  cards: {
    dataset: 'cardTheme',
    label: 'Card theme',
    preview: 'cards',
    choices: [['classic', 'Classic'], ['midnight', 'Midnight'], ['botanical', 'Botanical'], ['glass', 'Glass']],
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
  const buttons = new Map();

  function preview(value) {
    const sample = document.createElement('span');
    sample.className = `game-theme-preview game-theme-preview--${theme.preview}`;
    sample.dataset.previewTheme = value;
    sample.setAttribute('aria-hidden', 'true');
    if (theme.preview === 'cards') {
      sample.innerHTML = '<span class="game-theme-card-back"></span>';
    } else if (theme.preview.endsWith('-board')) {
      sample.innerHTML = theme.preview === 'reversi-board'
        ? '<span></span><span></span><span class="game-theme-disc"></span><span></span><span></span><span class="game-theme-disc game-theme-disc--light"></span><span></span><span></span><span></span>'
        : '<span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>';
    } else if (theme.preview === 'chess-pieces') {
      sample.innerHTML = '<span class="game-theme-chess-piece">♔</span><span class="game-theme-chess-piece game-theme-chess-piece--dark">♟</span>';
    } else {
      sample.innerHTML = '<span></span><span class="game-theme-mine-number">2</span><span class="game-theme-mine-flag">⚑</span>';
    }
    return sample;
  }

  for (const [value, title] of theme.choices) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'game-theme-choice';
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-label', `${theme.label}: ${title}`);
    option.dataset.themeValue = value;
    option.append(preview(value));
    const optionLabel = document.createElement('span');
    optionLabel.className = 'game-theme-choice-label';
    optionLabel.textContent = title;
    option.append(optionLabel);
    buttons.set(value, option);
    choices.append(option);
  }
  control.append(choices);

  const apply = value => {
    const normalized = normalize(key, value);
    root.dataset[theme.dataset] = normalized;
    for (const [choice, option] of buttons) {
      const selected = choice === normalized;
      option.setAttribute('aria-checked', String(selected));
      option.tabIndex = selected ? 0 : -1;
    }
  };

  const choose = value => {
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
  };

  for (const [value, option] of buttons) {
    option.addEventListener('click', () => choose(value));
    option.addEventListener('keydown', event => {
      const index = theme.choices.findIndex(([choice]) => choice === value);
      let nextIndex;
      if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = theme.choices.length - 1;
      else if (['ArrowRight', 'ArrowDown'].includes(event.key)) {
        nextIndex = (index + 1) % theme.choices.length;
      } else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) {
        nextIndex = (index - 1 + theme.choices.length) % theme.choices.length;
      } else return;
      event.preventDefault();
      const next = theme.choices[nextIndex][0];
      buttons.get(next).focus();
      choose(next);
    });
  }
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
