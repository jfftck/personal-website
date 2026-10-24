import { WIN_CELEBRATIONS } from './cards.js';

const STORAGE_KEY = 'game-center-win-animation-settings-v1';
const boardEffects = ['pulse', 'fade', 'fireworks', 'knock'];
const settings = {
  solitaire: ['random', ...WIN_CELEBRATIONS],
  chess: ['random', ...boardEffects],
  reversi: ['random', ...boardEffects],
};

export const solitaireWinAnimationChoices = [
  ['random', 'Random'],
  ...WIN_CELEBRATIONS.map(effect => [effect, effect[0].toUpperCase() + effect.slice(1)]),
];
export const boardWinAnimationChoices = [
  ['random', 'Random'],
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
  const choices = settings[game];
  if (!choices) throw new Error(`Unknown game win animation setting: ${game}`);
  const value = readPreferences()[game];
  return choices.includes(value) ? value : 'random';
}

export function setWinAnimationPreference(game, value) {
  const choices = settings[game];
  if (!choices) throw new Error(`Unknown game win animation setting: ${game}`);
  if (!choices.includes(value)) throw new Error(`Unknown ${game} win animation: ${value}`);

  inMemoryPreferences = { ...inMemoryPreferences, [game]: value };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({
      ...readPreferences(),
      [game]: value,
    }));
  } catch {}
  return value;
}
