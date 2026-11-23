'use strict';

import { renderShortcutReference } from './desktop-shortcuts.js';

export function createDesktopHelpController({
  helpOverlay,
  helpCloseButton,
  helpOpenLauncherButton,
  closeAppMenu,
  openAppMenu,
}) {
  renderShortcutReference(helpOverlay.querySelector('#help-shortcut-reference'));
  const close = () => helpOverlay.setAttribute('hidden', '');

  const open = () => {
    helpOverlay.removeAttribute('hidden');
    closeAppMenu();
    requestAnimationFrame(() => helpCloseButton.focus());
  };

  const toggle = () => {
    if (helpOverlay.hasAttribute('hidden')) open();
    else close();
  };

  helpOpenLauncherButton.addEventListener('click', () => {
    close();
    openAppMenu();
  });
  helpCloseButton.addEventListener('click', close);
  helpOverlay.addEventListener('click', event => {
    if (event.target === helpOverlay) close();
  });

  helpOverlay.querySelectorAll('.help-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      helpOverlay.querySelectorAll('.help-tab').forEach(item => {
        item.classList.remove('active');
        item.setAttribute('aria-selected', 'false');
      });
      helpOverlay.querySelectorAll('.help-panel').forEach(panel => {
        panel.setAttribute('hidden', '');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const panel = helpOverlay.querySelector(`#help-panel-${tab.dataset.panel}`);
      panel?.removeAttribute('hidden');
    });
  });

  return { open, close, toggle };
}
