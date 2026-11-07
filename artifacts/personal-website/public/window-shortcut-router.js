'use strict';

const TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

const DIRECTION_BY_KEY = {
  arrowleft: 'left',
  arrowright: 'right',
  arrowup: 'up',
  arrowdown: 'down',
  h: 'left',
  l: 'right',
  k: 'up',
  j: 'down',
};

function closest(target, selector) {
  return target?.closest?.(selector) || null;
}

function isTypingTarget(target) {
  const path = target?.composedPath?.() || [target];
  return path.some(node =>
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(node?.tagName) || Boolean(node?.isContentEditable),
  );
}

function isTextEntryTarget(target) {
  const path = target?.composedPath?.() || [target];
  return path.some(node => {
    if (!node) return false;
    if (node.isContentEditable || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') return true;
    return node.tagName === 'INPUT' && !TEXT_INPUT_TYPES.has(node.type);
  });
}

export function createWindowShortcutRouter({
  document,
  state,
  windowController,
  appMenu,
  helpOverlay,
  systemPanel,
  systemTimeButton,
  appMenuButton,
  closeSystemPanel,
  closeHelp,
  closeAppMenu,
  closeWinMenu,
  openAppMenu,
  toggleHelp,
  exitOverview,
}) {
  function handleTab(event) {
    const appWindow = closest(event.target, '.app-window');
    const focusScope = closest(event.target, 'dialog[open], [role="dialog"]')
      || (appWindow?.dataset.id === state.focusedId ? appWindow : null);
    const controls = windowController.getFocusableControls(focusScope);
    if (!controls.length) return;

    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === focusScope)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleKeyDown(event) {
    const target = event.target;
    const menuOpen = !appMenu.hasAttribute('hidden');
    const helpOpen = !helpOverlay.hasAttribute('hidden');
    const isTyping = isTypingTarget(event);
    const isTextEntry = isTextEntryTarget(event);
    const inContent = Boolean(closest(target, '.app-content'));

    if (event.key === 'Tab') {
      handleTab(event);
      return;
    }

    if (event.key === 'Escape') {
      if (!systemPanel.hidden) {
        closeSystemPanel();
        systemTimeButton.focus();
        return;
      }
      if (helpOpen) {
        closeHelp();
        appMenuButton.focus();
        return;
      }
      if (menuOpen) {
        closeAppMenu();
        appMenuButton.focus();
        return;
      }
      if (document.getElementById('win-menu-open')) {
        closeWinMenu();
        return;
      }
      if (document.body.classList.contains('mod-overview')) {
        exitOverview();
      }
      return;
    }

    if (event.key === '?' && !isTyping && !menuOpen) {
      event.preventDefault();
      toggleHelp();
      return;
    }

    const windowDirection = DIRECTION_BY_KEY[event.key.toLowerCase()];
    if (event.ctrlKey && windowDirection && !isTextEntry && !helpOpen && !menuOpen
      && systemPanel.hidden && !document.getElementById('win-menu-open')
      && !closest(target, '[role="dialog"], dialog[open]')) {
      event.preventDefault();
      windowController.focusWindowInDirection(windowDirection);
      return;
    }

    if ((event.key === '[' || event.key === ']') && !isTyping && !helpOpen && !menuOpen) {
      event.preventDefault();
      const focusedColumn = state.focusedId
        ? windowController.getAppColumn(state.focusedId)
        : null;
      const inSharedColumn = focusedColumn && focusedColumn.appIds.length > 1;
      if (event.key === '[') {
        inSharedColumn ? windowController.expelLeft() : windowController.consumeLeft();
      } else {
        inSharedColumn ? windowController.expelRight() : windowController.consumeRight();
      }
      return;
    }

    if (helpOpen || menuOpen || isTyping) return;

    if ((event.metaKey || event.ctrlKey) && event.key === 'd') {
      event.preventDefault();
      openAppMenu();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key >= '1' && event.key <= '9') {
      event.preventDefault();
      windowController.focusAppByIndex(Number.parseInt(event.key, 10));
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === '<') {
      event.preventDefault();
      windowController.cycleFocusedWidthNarrower();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === '>') {
      event.preventDefault();
      windowController.cycleFocusedWidthWider();
      return;
    }

    if (!inContent) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        windowController.focusPrevApp();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        windowController.focusNextApp();
        return;
      }
      const focusedColumn = state.focusedId
        ? windowController.getAppColumn(state.focusedId)
        : null;
      const inSharedColumn = focusedColumn && focusedColumn.appIds.length > 1;
      if (inSharedColumn && event.key === 'ArrowUp') {
        event.preventDefault();
        windowController.moveWindowUp();
        return;
      }
      if (inSharedColumn && event.key === 'ArrowDown') {
        event.preventDefault();
        windowController.moveWindowDown();
      }
    }
  }

  return { handleKeyDown };
}
