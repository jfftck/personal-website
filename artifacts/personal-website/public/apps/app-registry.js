import { calendarApp } from './calendar.app.js';
import { calculatorApp } from './calculator.app.js';
import { docViewerApp } from './doc-viewer.app.js';
import { fileManagerApp } from './file-manager.app.js';
import { gameCenterApp, gameWindowDescriptors } from './game-center.app.js';
import { imgViewerApp } from './img-viewer.app.js';
import { mediaPlayerApp } from './media-player.app.js';
import { settingsApp } from './settings.app.js';
import { stickyNotesApp } from './sticky-notes.app.js';
import { weatherApp } from './weather.app.js';
import { worldClockApp } from './world-clock.app.js';

const standaloneApps = Object.freeze([
  docViewerApp,
  imgViewerApp,
  fileManagerApp,
  mediaPlayerApp,
  calendarApp,
  worldClockApp,
  calculatorApp,
  stickyNotesApp,
  weatherApp,
  settingsApp,
]);

export const APP_DESCRIPTORS = Object.freeze([
  ...standaloneApps,
  ...gameWindowDescriptors,
]);

export const APP_REGISTRY = Object.freeze(
  Object.fromEntries(APP_DESCRIPTORS.map(descriptor => [descriptor.type, descriptor])),
);

export const APP_LAUNCHERS = Object.freeze([
  ...standaloneApps,
  gameCenterApp,
]);

export { gameCenterApp as GAME_CENTER_DESCRIPTOR };
