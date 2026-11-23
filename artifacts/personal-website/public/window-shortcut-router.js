'use strict';

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
    return node.tagName === 'INPUT'
      && !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']
        .includes(node.type);
  });
}

export function createWindowShortcutRouter({
  document,
  state,
  windowController,
  shortcutManager,
  helpOverlay,
  systemPanel,
  notificationPanel,
  systemTimeButton,
  appMenuButton,
  closeSystemPanel,
  closeNotifications,
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

  function register(actionId, handler) {
    shortcutManager.registerHandler(actionId, null, handler);
  }

  function helpOverlayIsClosed() {
    return helpOverlay?.hasAttribute('hidden') !== false;
  }

  function menusClosed() {
    return appMenu.hasAttribute('hidden') && helpOverlayIsClosed();
  }

  const appMenu = document.getElementById('app-menu');
  register('desktop.openAppMenu', event => {
    if (!menusClosed() || isTypingTarget(event)) return false;
    openAppMenu();
  });
  register('desktop.toggleHelp', event => {
    if (!appMenu.hasAttribute('hidden') || isTypingTarget(event)) return false;
    toggleHelp();
  });
  for (let index = 1; index <= 9; index++) {
    register(`desktop.focusApp${index}`, event => {
      if (!menusClosed() || isTypingTarget(event)) return false;
      windowController.focusAppByIndex(index);
    });
  }
  register('desktop.focusWindowLeft', event => focusWindowInDirection(event, 'left'));
  register('desktop.focusWindowRight', event => focusWindowInDirection(event, 'right'));
  register('desktop.focusWindowUp', event => focusWindowInDirection(event, 'up'));
  register('desktop.focusWindowDown', event => focusWindowInDirection(event, 'down'));
  register('desktop.joinOrSeparateLeft', event => {
    if (!menusClosed() || isTypingTarget(event)) return false;
    const focusedColumn = state.focusedId ? windowController.getAppColumn(state.focusedId) : null;
    const inSharedColumn = focusedColumn && focusedColumn.appIds.length > 1;
    if (inSharedColumn) windowController.expelLeft();
    else windowController.consumeLeft();
  });
  register('desktop.joinOrSeparateRight', event => {
    if (!menusClosed() || isTypingTarget(event)) return false;
    const focusedColumn = state.focusedId ? windowController.getAppColumn(state.focusedId) : null;
    const inSharedColumn = focusedColumn && focusedColumn.appIds.length > 1;
    if (inSharedColumn) windowController.expelRight();
    else windowController.consumeRight();
  });
  register('desktop.narrowerWindow', event => {
    if (!menusClosed() || isTypingTarget(event)) return false;
    windowController.cycleFocusedWidthNarrower();
  });
  register('desktop.widerWindow', event => {
    if (!menusClosed() || isTypingTarget(event)) return false;
    windowController.cycleFocusedWidthWider();
  });
  register('desktop.focusPreviousApp', event => {
    if (!menusClosed() || isTypingTarget(event) || closest(event.target, '.app-content')) return false;
    windowController.focusPrevApp();
  });
  register('desktop.focusNextApp', event => {
    if (!menusClosed() || isTypingTarget(event) || closest(event.target, '.app-content')) return false;
    windowController.focusNextApp();
  });
  register('desktop.moveWindowUp', event => moveWithinSharedColumn(event, 'up'));
  register('desktop.moveWindowDown', event => moveWithinSharedColumn(event, 'down'));

  function focusWindowInDirection(event, direction) {
    const activeDialog = closest(event.target, 'dialog[open], [role="dialog"]');
    const insideAppWindowDialog = activeDialog?.classList.contains('app-window');
    if (!menusClosed() || !systemPanel.hidden || isTextEntryTarget(event)
      || (activeDialog && !insideAppWindowDialog)) return false;
    windowController.focusWindowInDirection(direction);
  }

  function moveWithinSharedColumn(event, direction) {
    if (!menusClosed() || isTypingTarget(event) || closest(event.target, '.app-content')) return false;
    const focusedColumn = state.focusedId ? windowController.getAppColumn(state.focusedId) : null;
    if (!focusedColumn || focusedColumn.appIds.length <= 1) return false;
    if (direction === 'up') windowController.moveWindowUp();
    else windowController.moveWindowDown();
  }

  function handleKeyDown(event) {
    if (event.key === 'Tab') {
      handleTab(event);
      return;
    }

    if (event.key === 'Escape') {
      if (notificationPanel && !notificationPanel.hidden) {
        closeNotifications?.({ restoreFocus: true });
        return;
      }
      if (!systemPanel.hidden) {
        closeSystemPanel();
        systemTimeButton.focus();
        return;
      }
      if (helpOverlay && !helpOverlay.hasAttribute('hidden')) {
        closeHelp();
        appMenuButton.focus();
        return;
      }
      if (appMenu && !appMenu.hasAttribute('hidden')) {
        closeAppMenu();
        appMenuButton.focus();
        return;
      }
      if (document.getElementById('win-menu-open')) {
        closeWinMenu();
        return;
      }
      if (document.body.classList.contains('mod-overview')) exitOverview();
      return;
    }

    shortcutManager.dispatchDesktop(event);
  }

  return { handleKeyDown };
}
