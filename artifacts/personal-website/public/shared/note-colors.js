import { NOTE_COLOR_VALUES } from './note-color-values.js';

const NOTE_COLOR_DETAILS = [
  ['Yellow', '#e5bb22'],
  ['Orange', '#e47b27'],
  ['Red', '#d94a4a'],
  ['Purple', '#9a69d4'],
  ['Blue', '#3689cf'],
  ['Green', '#48945a'],
];

export const NOTE_COLORS = Object.freeze(NOTE_COLOR_VALUES.map((value, index) => Object.freeze({
  value,
  label: NOTE_COLOR_DETAILS[index][0],
  hex: NOTE_COLOR_DETAILS[index][1],
})));
