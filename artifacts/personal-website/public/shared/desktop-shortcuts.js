'use strict';

import { readJSON, writeJSON } from '../data-handler.js';

export const SHORTCUTS_STORAGE_KEY = 'desktop-keyboard-shortcuts-v1';

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

function combo(code, key, modifiers = {}) {
  return {
    code,
    key,
    ctrl: modifiers.ctrl === true,
    meta: modifiers.meta === true,
    alt: modifiers.alt === true,
    shift: modifiers.shift === true,
    primary: modifiers.primary === true,
  };
}

function action(id, group, title, description, defaultBindings, options = {}) {
  return {
    id,
    group,
    title,
    description,
    defaultBindings,
    editable: options.editable !== false,
    scope: options.scope || 'desktop',
    appType: options.appType || null,
    conflictGroup: options.conflictGroup || options.scope || 'desktop',
    allowInteractiveTargets: options.allowInteractiveTargets === true,
    allowDialog: options.allowDialog === true,
    textEntryKeys: options.textEntryKeys || [],
  };
}

const REFERENCE_ONLY = { editable: false };
const GLOBAL_SHORTCUT = {
  scope: 'desktop',
  conflictGroup: 'global',
  allowInteractiveTargets: true,
};
const DESKTOP_NAVIGATION = {
  scope: 'desktop',
  conflictGroup: 'desktop-navigation',
  allowInteractiveTargets: true,
};
const CALCULATOR_SHORTCUT = { scope: 'app', appType: 'calculator', conflictGroup: 'calculator' };
const MINESWEEPER_SHORTCUT = {
  scope: 'app',
  appType: 'minesweeper',
  conflictGroup: 'minesweeper',
  allowInteractiveTargets: true,
};

const ACTIONS = [
  action('desktop.nextControl', 'Desktop', 'Move to the next control', 'Tab moves forward; focus wraps inside dialogs.', [
    combo('Tab', 'Tab'),
  ], REFERENCE_ONLY),
  action('desktop.previousControl', 'Desktop', 'Move to the previous control', 'Shift+Tab moves backward.', [
    combo('Tab', 'Tab', { shift: true }),
  ], REFERENCE_ONLY),
  action('desktop.focusPreviousApp', 'Desktop', 'Focus the previous app', 'Plain Left Arrow focuses the previous app outside app content.', [
    combo('ArrowLeft', '←'),
  ], DESKTOP_NAVIGATION),
  action('desktop.focusNextApp', 'Desktop', 'Focus the next app', 'Plain Right Arrow focuses the next app outside app content.', [
    combo('ArrowRight', '→'),
  ], DESKTOP_NAVIGATION),
  action('desktop.focusWindowLeft', 'Desktop', 'Focus the window to the left', 'Focus the nearest open window to the left.', [
    combo('ArrowLeft', '←', { primary: true, alt: true, shift: true }),
    combo('KeyH', 'H', { primary: true, alt: true, shift: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.focusWindowRight', 'Desktop', 'Focus the window to the right', 'Focus the nearest open window to the right.', [
    combo('ArrowRight', '→', { primary: true, alt: true, shift: true }),
    combo('KeyL', 'L', { primary: true, alt: true, shift: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.focusWindowUp', 'Desktop', 'Focus the window above', 'Focus the nearest open window above.', [
    combo('ArrowUp', '↑', { primary: true, alt: true, shift: true }),
    combo('KeyK', 'K', { primary: true, alt: true, shift: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.focusWindowDown', 'Desktop', 'Focus the window below', 'Focus the nearest open window below.', [
    combo('ArrowDown', '↓', { primary: true, alt: true, shift: true }),
    combo('KeyJ', 'J', { primary: true, alt: true, shift: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.joinOrSeparateLeft', 'Desktop', 'Join or separate left', 'Join the column to the left, or separate this window to the left.', [
    combo('BracketLeft', '['),
  ], GLOBAL_SHORTCUT),
  action('desktop.joinOrSeparateRight', 'Desktop', 'Join or separate right', 'Join the column to the right, or separate this window to the right.', [
    combo('BracketRight', ']'),
  ], GLOBAL_SHORTCUT),
  action('desktop.focusApp1', 'Desktop', 'Focus app 1', 'Focus the first open app.', [
    combo('Digit1', '1', { primary: true, alt: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.focusApp2', 'Desktop', 'Focus app 2', 'Focus the second open app.', [
    combo('Digit2', '2', { primary: true, alt: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.focusApp3', 'Desktop', 'Focus app 3', 'Focus the third open app.', [
    combo('Digit3', '3', { primary: true, alt: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.focusApp4', 'Desktop', 'Focus app 4', 'Focus the fourth open app.', [
    combo('Digit4', '4', { primary: true, alt: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.focusApp5', 'Desktop', 'Focus app 5', 'Focus the fifth open app.', [
    combo('Digit5', '5', { primary: true, alt: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.focusApp6', 'Desktop', 'Focus app 6', 'Focus the sixth open app.', [
    combo('Digit6', '6', { primary: true, alt: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.focusApp7', 'Desktop', 'Focus app 7', 'Focus the seventh open app.', [
    combo('Digit7', '7', { primary: true, alt: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.focusApp8', 'Desktop', 'Focus app 8', 'Focus the eighth open app.', [
    combo('Digit8', '8', { primary: true, alt: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.focusApp9', 'Desktop', 'Focus app 9', 'Focus the ninth open app.', [
    combo('Digit9', '9', { primary: true, alt: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.openAppMenu', 'Desktop', 'Open the app menu', 'Open the apps menu.', [
    combo('Space', 'Space', { primary: true, shift: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.narrowerWindow', 'Desktop', 'Make the window narrower', 'Cycle the focused window to a narrower width.', [
    combo('Comma', '<', { primary: true, shift: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.widerWindow', 'Desktop', 'Make the window wider', 'Cycle the focused window to a wider width.', [
    combo('Period', '>', { primary: true, shift: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.toggleHelp', 'Desktop', 'Open or close Help', 'Open or close the Help panel.', [
    combo('Slash', '?', { shift: true }),
  ], GLOBAL_SHORTCUT),
  action('desktop.moveWindowUp', 'Desktop', 'Move the window up', 'Move the focused window up within a shared column.', [
    combo('ArrowUp', '↑'),
  ], DESKTOP_NAVIGATION),
  action('desktop.moveWindowDown', 'Desktop', 'Move the window down', 'Move the focused window down within a shared column.', [
    combo('ArrowDown', '↓'),
  ], DESKTOP_NAVIGATION),
  action('desktop.dismiss', 'Desktop', 'Close the open panel or dialog', 'Escape closes the open menu, panel, dialog, or overview.', [
    combo('Escape', 'Escape'),
  ], REFERENCE_ONLY),

  action('calculator.input', 'Calculator', 'Enter numbers and expressions', 'Type digits and arithmetic operators into the calculator.', [
    combo('CalculatorInput', '0–9, + − × ÷, . ( )'),
  ], REFERENCE_ONLY),
  action('calculator.evaluate', 'Calculator', 'Evaluate the expression', 'Enter evaluates an expression or applies a graph function.', [
    combo('Enter', 'Enter'),
    combo('Equal', '='),
  ], { ...CALCULATOR_SHORTCUT, textEntryKeys: ['Enter'] }),
  action('calculator.backspace', 'Calculator', 'Delete the last expression character', 'Backspace removes the last character when the expression is not being edited in a text field.', [
    combo('Backspace', 'Backspace'),
  ], CALCULATOR_SHORTCUT),
  action('calculator.clear', 'Calculator', 'Clear the current expression', 'Escape clears the current expression.', [
    combo('Escape', 'Escape'),
  ], { ...CALCULATOR_SHORTCUT, textEntryKeys: ['Escape'] }),
  action('calculator.panLeft', 'Calculator', 'Pan the graph left', 'Move the graph to the left.', [
    combo('ArrowLeft', '←'),
  ], CALCULATOR_SHORTCUT),
  action('calculator.panRight', 'Calculator', 'Pan the graph right', 'Move the graph to the right.', [
    combo('ArrowRight', '→'),
  ], CALCULATOR_SHORTCUT),
  action('calculator.panUp', 'Calculator', 'Pan the graph up', 'Move the graph upward.', [
    combo('ArrowUp', '↑'),
  ], CALCULATOR_SHORTCUT),
  action('calculator.panDown', 'Calculator', 'Pan the graph down', 'Move the graph downward.', [
    combo('ArrowDown', '↓'),
  ], CALCULATOR_SHORTCUT),
  action('calculator.zoomIn', 'Calculator', 'Zoom the graph in', 'Zoom in on the graph.', [
    combo('Equal', '+', { shift: true }),
  ], CALCULATOR_SHORTCUT),
  action('calculator.zoomOut', 'Calculator', 'Zoom the graph out', 'Zoom out from the graph.', [
    combo('Minus', '-'),
  ], CALCULATOR_SHORTCUT),
  action('calculator.resetGraph', 'Calculator', 'Reset the graph view', 'Home resets the graph view.', [
    combo('Home', 'Home'),
  ], CALCULATOR_SHORTCUT),
  action('calculator.switchParametricField', 'Calculator', 'Switch parametric fields', 'Comma moves from the x field to the y field in parametric mode.', [
    combo('Comma', ','),
  ], { ...CALCULATOR_SHORTCUT, allowDialog: true, textEntryKeys: [','] }),

  action('games.boardNavigation', 'Game boards', 'Move between board spaces', 'Use the arrow keys to move between board spaces.', [
    combo('ArrowLeft', '←'), combo('ArrowRight', '→'), combo('ArrowUp', '↑'), combo('ArrowDown', '↓'),
  ], REFERENCE_ONLY),
  action('games.rowNavigation', 'Game boards', 'Move to the start or end of a row', 'Home and End move to the first or last space in the row.', [
    combo('Home', 'Home'), combo('End', 'End'),
  ], REFERENCE_ONLY),
  action('games.activateSpace', 'Game boards', 'Activate the focused space', 'Enter or Space activates the focused board space.', [
    combo('Enter', 'Enter'), combo('Space', 'Space'),
  ], REFERENCE_ONLY),
  action('minesweeper.toggleFlag', 'Game boards', 'Flag or unflag a Minesweeper cell', 'F flags or unflags the focused cell.', [
    combo('KeyF', 'F'),
  ], MINESWEEPER_SHORTCUT),

  action('fileManager.open', 'File Manager', 'Open the focused file or folder', 'Enter or Space opens the focused file or folder.', [
    combo('Enter', 'Enter'), combo('Space', 'Space'),
  ], REFERENCE_ONLY),

  action('suggestions.move', 'Suggestions', 'Move through location suggestions', 'Use the arrow keys to move through suggestions.', [
    combo('ArrowUp', '↑'), combo('ArrowDown', '↓'),
  ], REFERENCE_ONLY),
  action('suggestions.choose', 'Suggestions', 'Choose a location suggestion', 'Enter chooses the highlighted suggestion.', [
    combo('Enter', 'Enter'),
  ], REFERENCE_ONLY),
  action('suggestions.dismiss', 'Suggestions', 'Dismiss suggestions', 'Escape closes the suggestion list.', [
    combo('Escape', 'Escape'),
  ], REFERENCE_ONLY),
];

const ACTION_BY_ID = new Map(ACTIONS.map(item => [item.id, item]));
const GROUP_ORDER = ['Desktop', 'Calculator', 'Game boards', 'File Manager', 'Suggestions'];
const MODIFIER_KEYS = new Set(['Alt', 'AltGraph', 'Control', 'Meta', 'Shift']);
const KEY_LABELS = {
  ' ': 'Space',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  Backspace: 'Backspace',
  Escape: 'Escape',
  Enter: 'Enter',
  Home: 'Home',
  End: 'End',
  Tab: 'Tab',
};

function cloneBinding(binding) {
  return {
    code: binding.code,
    key: binding.key,
    ctrl: binding.ctrl === true,
    meta: binding.meta === true,
    alt: binding.alt === true,
    shift: binding.shift === true,
    primary: binding.primary === true,
  };
}

function normalizeBinding(binding) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return null;
  if (typeof binding.code !== 'string' || binding.code.length < 1 || binding.code.length > 40) return null;
  if (typeof binding.key !== 'string' || binding.key.length < 1 || binding.key.length > 32) return null;
  return {
    code: binding.code,
    key: binding.key,
    ctrl: binding.ctrl === true,
    meta: binding.meta === true,
    alt: binding.alt === true,
    shift: binding.shift === true,
    primary: binding.primary === true,
  };
}

function validStoredBindings(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every(bindings => Array.isArray(bindings)
      && bindings.length <= 24
      && bindings.every(binding => normalizeBinding(binding) !== null)));
}

function eventPath(event) {
  return event.composedPath?.() || [event.target];
}

function isTextEntryTarget(event) {
  return eventPath(event).some(node => {
    if (!node) return false;
    if (node.isContentEditable || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') return true;
    if (node.tagName !== 'INPUT') return false;
    return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']
      .includes(node.type);
  });
}

function isInteractiveTarget(event) {
  return eventPath(event).some(node => node?.matches?.(
    'button, a, select, input, textarea, [role="button"], [contenteditable="true"]',
  ));
}

function bindingParts(binding, primaryLabel) {
  const parts = [];
  if (binding.primary) parts.push(primaryLabel);
  else {
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.meta) parts.push('⌘');
  }
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  parts.push(binding.key);
  return parts;
}

function signature(binding, primaryModifier) {
  const ctrl = binding.primary ? primaryModifier === 'ctrl' : binding.ctrl;
  const meta = binding.primary ? primaryModifier === 'meta' : binding.meta;
  return [
    binding.code,
    ctrl ? 'c' : '',
    meta ? 'm' : '',
    binding.alt ? 'a' : '',
    binding.shift ? 's' : '',
  ].join(':');
}

function keyLabel(event) {
  return KEY_LABELS[event.key] || (event.key.length === 1 ? event.key.toUpperCase() : event.key);
}

export function createShortcutBindingFromEvent(event) {
  if (!event || MODIFIER_KEYS.has(event.key) || !event.code || event.code === 'Unidentified') return null;
  return {
    code: event.code,
    key: keyLabel(event),
    ctrl: event.ctrlKey === true,
    meta: event.metaKey === true,
    alt: event.altKey === true,
    shift: event.shiftKey === true,
    primary: false,
  };
}

export function createShortcutManager({
  getFocusedAppId = () => null,
  platform,
  userAgent,
} = {}) {
  const primaryModifier = getPrimaryModifier(platform, userAgent);
  const primaryLabel = getPrimaryModifierLabel(platform, userAgent);
  const listeners = new Set();
  const handlers = new Map();
  let stored = readJSON(SHORTCUTS_STORAGE_KEY, {}, { validate: validStoredBindings });
  let overrides = Object.fromEntries(Object.entries(stored || {})
    .filter(([id]) => ACTION_BY_ID.get(id)?.editable)
    .map(([id, bindings]) => [id, bindings.map(normalizeBinding).filter(Boolean)]));

  function getBindings(actionId) {
    const definition = ACTION_BY_ID.get(actionId);
    if (!definition) return [];
    const bindings = Object.prototype.hasOwnProperty.call(overrides, actionId)
      ? overrides[actionId]
      : definition.defaultBindings;
    return bindings.map(cloneBinding);
  }

  function getGroups() {
    return GROUP_ORDER.map(title => ({
      title,
      actions: ACTIONS.filter(item => item.group === title).map(item => ({
        ...item,
        defaultBindings: item.defaultBindings.map(cloneBinding),
        bindings: getBindings(item.id),
      })),
    }));
  }

  function notify(origin) {
    listeners.forEach(listener => listener(origin));
  }

  function commit(next) {
    if (!writeJSON(SHORTCUTS_STORAGE_KEY, next, { validate: validStoredBindings })) {
      return { status: 'error', error: 'Shortcut changes could not be saved.' };
    }
    overrides = next;
    notify('local');
    return { status: 'saved' };
  }

  function areConflictingScopes(left, right) {
    return left.conflictGroup === right.conflictGroup
      || left.conflictGroup === 'global'
      || right.conflictGroup === 'global';
  }

  function getConflicts(actionId, binding) {
    const definition = ACTION_BY_ID.get(actionId);
    if (!definition?.editable) return [];
    const bindingSignature = signature(binding, primaryModifier);
    return ACTIONS.filter(other => other.id !== actionId && other.editable
      && areConflictingScopes(definition, other)
      && getBindings(other.id).some(candidate => signature(candidate, primaryModifier) === bindingSignature))
      .map(other => ({ id: other.id, title: other.title }));
  }

  function addBinding(actionId, value, { moveConflicts = false } = {}) {
    const definition = ACTION_BY_ID.get(actionId);
    const binding = normalizeBinding(value);
    if (!definition?.editable || !binding) return { status: 'invalid' };
    const ownBindings = getBindings(actionId);
    const ownSignature = signature(binding, primaryModifier);
    if (ownBindings.some(candidate => signature(candidate, primaryModifier) === ownSignature)) {
      return { status: 'exists' };
    }
    const conflicts = getConflicts(actionId, binding);
    if (conflicts.length && !moveConflicts) return { status: 'conflict', conflicts };

    const next = { ...overrides };
    for (const conflict of conflicts) {
      next[conflict.id] = getBindings(conflict.id)
        .filter(candidate => signature(candidate, primaryModifier) !== ownSignature);
    }
    next[actionId] = [...ownBindings, binding];
    const saved = commit(next);
    return saved.status === 'saved' ? { status: 'added', conflicts } : saved;
  }

  function removeBinding(actionId, value) {
    const definition = ACTION_BY_ID.get(actionId);
    const binding = normalizeBinding(value);
    if (!definition?.editable || !binding) return { status: 'invalid' };
    const ownBindings = getBindings(actionId);
    const ownSignature = signature(binding, primaryModifier);
    const nextBindings = ownBindings.filter(candidate => signature(candidate, primaryModifier) !== ownSignature);
    if (nextBindings.length === ownBindings.length) return { status: 'missing' };
    return commit({ ...overrides, [actionId]: nextBindings });
  }

  function matchesBinding(event, binding) {
    if (event.code !== binding.code) return false;
    const expectedCtrl = binding.primary ? primaryModifier === 'ctrl' : binding.ctrl;
    const expectedMeta = binding.primary ? primaryModifier === 'meta' : binding.meta;
    return event.ctrlKey === expectedCtrl
      && event.metaKey === expectedMeta
      && event.altKey === binding.alt
      && event.shiftKey === binding.shift;
  }

  function registerHandler(actionId, ownerId, handler) {
    if (!ACTION_BY_ID.has(actionId) || typeof handler !== 'function') return () => {};
    const registration = { ownerId: ownerId ?? null, handler };
    if (!handlers.has(actionId)) handlers.set(actionId, new Set());
    handlers.get(actionId).add(registration);
    return () => {
      handlers.get(actionId)?.delete(registration);
      if (!handlers.get(actionId)?.size) handlers.delete(actionId);
    };
  }

  function findHandler(actionId, ownerId) {
    return [...(handlers.get(actionId) || [])].find(item => item.ownerId === (ownerId ?? null));
  }

  function dispatch(event, scope, ownerId = null) {
    for (const definition of ACTIONS) {
      if (!definition.editable || definition.scope !== scope) continue;
      if (!getBindings(definition.id).some(binding => matchesBinding(event, binding))) continue;
      const registration = findHandler(definition.id, ownerId);
      if (!registration) continue;
      const path = eventPath(event);
      const inDialog = path.some(node => node?.matches?.('dialog[open], [role="dialog"]')
        && !node.classList?.contains('app-window'));
      if (inDialog && !definition.allowDialog) continue;
      const typing = isTextEntryTarget(event);
      if (typing && !definition.textEntryKeys.includes(event.key)) continue;
      if (!typing && isInteractiveTarget(event) && !definition.allowInteractiveTargets) continue;
      const handled = registration.handler(event);
      if (handled === false) continue;
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
    return false;
  }

  function dispatchAppKeyDown(event) {
    const ownerId = getFocusedAppId();
    if (!ownerId) return false;
    const path = eventPath(event);
    const appWindow = path.find(node => node?.matches?.('.app-window'));
    if (!appWindow || appWindow.dataset.id !== ownerId) return false;
    return dispatch(event, 'app', ownerId);
  }

  function handleStorage(event) {
    if (event.key !== SHORTCUTS_STORAGE_KEY) return;
    const next = readJSON(SHORTCUTS_STORAGE_KEY, {}, { validate: validStoredBindings });
    overrides = Object.fromEntries(Object.entries(next || {})
      .filter(([id]) => ACTION_BY_ID.get(id)?.editable)
      .map(([id, bindings]) => [id, bindings.map(normalizeBinding).filter(Boolean)]));
    notify('external');
  }
  globalThis.window?.addEventListener('storage', handleStorage);

  return {
    getAction(actionId) {
      const item = ACTION_BY_ID.get(actionId);
      return item ? { ...item, bindings: getBindings(actionId) } : null;
    },
    getGroups,
    getBindings,
    getConflicts,
    addBinding,
    removeBinding,
    registerHandler,
    dispatchDesktop(event) {
      return dispatch(event, 'desktop');
    },
    dispatchAppKeyDown,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    createBindingFromEvent: createShortcutBindingFromEvent,
    formatBinding(binding) {
      return bindingParts(binding, primaryLabel);
    },
    destroy() {
      globalThis.window?.removeEventListener('storage', handleStorage);
      listeners.clear();
      handlers.clear();
    },
  };
}

function appendKeyCombo(parent, binding, primaryLabel) {
  const comboNode = document.createElement('span');
  comboNode.className = 'shortcut-keys';
  bindingParts(binding, primaryLabel).forEach((key, index) => {
    if (index) comboNode.append(document.createTextNode('+'));
    const kbd = document.createElement('kbd');
    kbd.textContent = key;
    comboNode.append(kbd);
  });
  parent.append(comboNode);
}

export function renderShortcutReference(container, manager) {
  if (!container) return;
  const primaryLabel = getPrimaryModifierLabel();
  const currentGroups = manager?.getGroups?.();
  const groups = currentGroups?.length ? currentGroups : GROUP_ORDER.map(title => ({
    title,
    actions: ACTIONS.filter(item => item.group === title)
      .map(item => ({ ...item, bindings: item.defaultBindings })),
  }));
  container.classList.add('desktop-shortcut-reference');
  container.replaceChildren();
  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'shortcut-reference-group';
    const heading = document.createElement('h3');
    heading.className = 'help-panel-section-label';
    heading.textContent = group.title;
    section.append(heading);
    const list = document.createElement('dl');
    list.className = 'shortcut-list';
    for (const shortcut of group.actions) {
      const row = document.createElement('div');
      row.className = 'shortcut-row';
      const keys = document.createElement('dt');
      shortcut.bindings.forEach((binding, index) => {
        if (index) keys.append(document.createTextNode(' / '));
        appendKeyCombo(keys, binding, primaryLabel);
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
