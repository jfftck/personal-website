import { WIN_CELEBRATIONS } from './cards.js';

const STORAGE_KEY = 'game-center-win-animation-settings-v1';
const boardEffects = ['pulse', 'fade', 'fireworks', 'knock'];
const settings = {
  solitaire: [...WIN_CELEBRATIONS],
  chess: [...boardEffects],
  reversi: [...boardEffects],
};

export const solitaireWinAnimationChoices = [
  ...WIN_CELEBRATIONS.map(effect => [effect, effect === 'kitchen-sink'
    ? 'Kitchen Sink' : effect[0].toUpperCase() + effect.slice(1)]),
];
export const boardWinAnimationChoices = [
  ...boardEffects.map(effect => [effect, effect[0].toUpperCase() + effect.slice(1)]),
];

let inMemoryPreferences = {};

function readPreferences() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved)
      ? { ...inMemoryPreferences, ...saved }
      : inMemoryPreferences;
  } catch {
    return inMemoryPreferences;
  }
}

export function getWinAnimationPreference(game) {
  const selected = getWinAnimationPreferences(game);
  if (!selected.length) return 'none';
  return selected.length === 1 ? selected[0] : 'random';
}

export function getWinAnimationPreferences(game) {
  const choices = settings[game];
  if (!choices) throw new Error(`Unknown game win animation setting: ${game}`);
  const value = readPreferences()[game];
  if (Array.isArray(value)) return [...new Set(value.filter(effect => choices.includes(effect)))];
  if (value === 'none') return [];
  if (value === 'random') return [...choices];
  return choices.includes(value) ? [value] : [...choices];
}

export function setWinAnimationPreferences(game, selected) {
  const choices = settings[game];
  if (!choices) throw new Error(`Unknown game win animation setting: ${game}`);
  if (!Array.isArray(selected) || selected.some(effect => !choices.includes(effect))) {
    throw new Error(`Unknown ${game} win animation.`);
  }
  const value = [...new Set(selected)];
  inMemoryPreferences = { ...inMemoryPreferences, [game]: value };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({
      ...readPreferences(),
      [game]: value,
    }));
  } catch {}
  return value;
}

export function setWinAnimationPreference(game, value) {
  const choices = settings[game];
  if (!choices) throw new Error(`Unknown game win animation setting: ${game}`);
  if (value === 'random') return setWinAnimationPreferences(game, choices);
  if (value === 'none') return setWinAnimationPreferences(game, []);
  return setWinAnimationPreferences(game, [value]);
}
