'use strict';

function platformIsMac(platform = globalThis.navigator?.platform || '', userAgent = globalThis.navigator?.userAgent || '') {
  return /Mac|iPhone|iPad|iPod/i.test(platform)
    || (/Macintosh/i.test(userAgent) && (globalThis.navigator?.maxTouchPoints || 0) > 1);
}

export function getPrimaryModifier(platform, userAgent) {
  return platformIsMac(platform, userAgent) ? 'meta' : 'ctrl';
}

export function getPrimaryModifierLabel(platform, userAgent) {
  return getPrimaryModifier(platform, userAgent) === 'meta' ? '⌘' : 'Ctrl';
}

export function hasPrimaryModifier(event, platform, userAgent) {
  return getPrimaryModifier(platform, userAgent) === 'meta'
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

const SHORTCUT_GROUPS = [
  {
    title: 'Desktop',
    shortcuts: [
      { keys: [['Tab']], description: 'Move to the next control; focus wraps inside dialogs.' },
      { keys: [['Shift', 'Tab']], description: 'Move to the previous control.' },
      { keys: [['←'], ['→']], description: 'Plain arrows focus the previous or next app outside app content.' },
      { keys: [['PRIMARY', 'Alt', '1–9']], description: 'Focus an open app by its order.' },
      {
        keys: [['PRIMARY', 'Alt', 'Shift', 'H/J/K/L or arrows']],
        description: 'Focus the nearest open window in that direction.',
      },
      { keys: [['[']], description: 'Join the column to the left, or separate the window to the left.' },
      { keys: [[']']], description: 'Join the column to the right, or separate the window to the right.' },
      { keys: [['PRIMARY', 'Shift', 'Space']], description: 'Open the app menu.' },
      { keys: [['PRIMARY', 'Shift', ',']], description: 'Make the focused window narrower.' },
      { keys: [['PRIMARY', 'Shift', '.']], description: 'Make the focused window wider.' },
      { keys: [['?']], description: 'Open or close Help.' },
      { keys: [['Escape']], description: 'Close the open menu, panel, or dialog.' },
    ],
  },
  {
    title: 'Calculator',
    shortcuts: [
      { keys: [['0–9, + − × ÷, . ( )']], description: 'Enter numbers and expressions.' },
      { keys: [['Enter']], description: 'Evaluate the expression or apply a graph function.' },
      { keys: [['Backspace']], description: 'Delete the last expression character.' },
      { keys: [['Escape']], description: 'Clear the current expression.' },
      { keys: [['←'], ['→'], ['↑'], ['↓']], description: 'Pan the graph.' },
      { keys: [['+'], ['−']], description: 'Zoom the graph in or out.' },
      { keys: [['Home']], description: 'Reset the graph view.' },
      { keys: [[',']], description: 'Switch between x and y fields in parametric mode.' },
    ],
  },
  {
    title: 'Game boards',
    shortcuts: [
      { keys: [['←'], ['→'], ['↑'], ['↓']], description: 'Move between board spaces.' },
      { keys: [['Home'], ['End']], description: 'Move to the first or last space in the row.' },
      { keys: [['Enter'], ['Space']], description: 'Activate the focused space.' },
      { keys: [['F']], description: 'Flag or unflag the focused Minesweeper cell.' },
    ],
  },
  {
    title: 'File Manager',
    shortcuts: [
      { keys: [['Enter'], ['Space']], description: 'Open the focused file or folder.' },
    ],
  },
  {
    title: 'Suggestions',
    shortcuts: [
      { keys: [['↑'], ['↓']], description: 'Move through location suggestions.' },
      { keys: [['Enter']], description: 'Choose the highlighted suggestion.' },
      { keys: [['Escape']], description: 'Dismiss suggestions.' },
    ],
  },
];

function appendKeyCombo(parent, keys, primaryLabel) {
  const combo = document.createElement('span');
  combo.className = 'shortcut-keys';
  keys.forEach((key, index) => {
    if (index) combo.append(document.createTextNode('+'));
    const kbd = document.createElement('kbd');
    kbd.textContent = key === 'PRIMARY' ? primaryLabel : key;
    combo.append(kbd);
  });
  parent.append(combo);
}

export function renderShortcutReference(container, { platform, userAgent } = {}) {
  if (!container) return;
  const primaryLabel = getPrimaryModifierLabel(platform, userAgent);
  container.classList.add('desktop-shortcut-reference');
  container.replaceChildren();
  for (const group of SHORTCUT_GROUPS) {
    const section = document.createElement('section');
    section.className = 'shortcut-reference-group';
    const heading = document.createElement('h3');
    heading.className = 'help-panel-section-label';
    heading.textContent = group.title;
    section.append(heading);
    const list = document.createElement('dl');
    list.className = 'shortcut-list';
    for (const shortcut of group.shortcuts) {
      const row = document.createElement('div');
      row.className = 'shortcut-row';
      const keys = document.createElement('dt');
      shortcut.keys.forEach((combo, index) => {
        if (index) keys.append(document.createTextNode(' / '));
        appendKeyCombo(keys, combo, primaryLabel);
      });
      const description = document.createElement('dd');
      description.textContent = shortcut.description;
      row.append(keys, description);
      list.append(row);
    }
    section.append(list);
    container.append(section);
  }
}
