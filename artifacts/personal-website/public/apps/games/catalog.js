import { GAME_WINDOW_TYPES } from '../game-types.js';

export const GAMES = GAME_WINDOW_TYPES;

export function initGameMenu(menu, openGame, gameCenterDescriptor = null, bindIntentPrefetch = null) {
  const root = menu.querySelector('#launcher-root');
  const submenu = menu.querySelector('#game-submenu');
  const entry = menu.querySelector('#game-center-entry');
  const back = menu.querySelector('#game-menu-back');
  const heading = menu.querySelector('#app-menu-title');
  const games = menu.querySelector('#game-list');
  if (gameCenterDescriptor) {
    const icon = entry.querySelector('.app-launcher-icon');
    const name = entry.querySelector('.app-launcher-name');
    if (icon) icon.innerHTML = gameCenterDescriptor.launcherIconSvg;
    if (name) name.textContent = gameCenterDescriptor.title;
    entry.setAttribute('aria-label', gameCenterDescriptor.title);
  }
  for (const game of GAMES) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'app-launcher';
    btn.dataset.game = game.type;
    const icon = document.createElement('span');
    icon.className = 'app-launcher-icon game-launcher-icon';
    icon.innerHTML = game.iconSvg;
    icon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span'); name.className = 'app-launcher-name';
    name.textContent = game.title;
    btn.append(icon, name);
    bindIntentPrefetch?.(btn, game.type);
    btn.addEventListener('click', () => openGame(game.type));
    games.append(btn);
  }
  function showGames(focus = true) {
    root.hidden = true; submenu.hidden = false; back.hidden = false;
    heading.textContent = 'Game Center';
    menu.dataset.menuView = 'games';
    menu.setAttribute('aria-label', 'Game Center');
    entry.setAttribute('aria-expanded', 'true');
    if (focus) back.focus();
  }
  function showRoot(focus = true) {
    root.hidden = false; submenu.hidden = true; back.hidden = true;
    heading.textContent = 'Apps';
    menu.dataset.menuView = 'root';
    menu.setAttribute('aria-label', 'App launcher');
    entry.setAttribute('aria-expanded', 'false');
    if (focus) entry.focus();
  }
  entry.addEventListener('click', () => showGames());
  back.addEventListener('click', () => showRoot());
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !submenu.hidden) {
      event.preventDefault(); event.stopPropagation(); showRoot();
    }
    if (event.key === 'Tab') {
      const focusable = [...menu.querySelectorAll('button')].filter(btn => !btn.disabled && btn.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  return { showRoot, showGames };
}
