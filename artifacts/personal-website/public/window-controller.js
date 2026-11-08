'use strict';

export const SESSION_KEY = 'desktop-session-v2';
export const SESSION_KEY_V1 = 'desktop-session-v1';

export function createWindowController({
  state,
  appDefinitions = {},
  document,
  window,
  appStrip,
  widthPresets,
  createColumnElement,
  wireColumnEvents,
  persistSession,
  updateTopBar,
  updateEmptyState,
  updateStripLayout,
  setShowDesktop,
  positionOverview,
}) {
  function getAppColumn(appId) {
    return state.columns.find(column => column.appIds.includes(appId));
  }

  function getAppOrder() {
    return state.columns.flatMap(column => column.appIds);
  }

  function getFocusableControls(container) {
    if (!container) return [];
    return [...container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
    )].filter(element => (
      !element.disabled
      && !element.closest('[hidden], [inert], [aria-hidden="true"]')
      && window.getComputedStyle(element).visibility !== 'hidden'
      && element.getClientRects().length > 0
    ));
  }

  function saveSession() {
    if (state._skipSave) return;
    try {
      const focusedColumnIndex = state.columns.findIndex(column => column.appIds.includes(state.focusedId));
      const focusedPosition = focusedColumnIndex < 0 ? null : {
        columnIndex: focusedColumnIndex,
        appIndex: state.columns[focusedColumnIndex].appIds.indexOf(state.focusedId),
      };
      persistSession({
        v: 2,
        focused: focusedPosition,
        columns: state.columns.map(column => ({
          widthPreset: column.widthPreset,
          apps: column.appIds.map(appId => {
            const app = state.apps.find(candidate => candidate.id === appId);
            const snapshotMethod = appDefinitions[app.type]?.state?.snapshotMethod || 'getSessionState';
            const appState = snapshotMethod
              ? state.appApis[appId]?.[snapshotMethod]?.()
              : undefined;
            return { type: app.type, ...(appState ? { state: appState } : {}) };
          }),
        })),
      });
    } catch {
      // Preserve window state even when the browser storage is unavailable.
    }
  }

  function scrollToApp(id) {
    const column = getAppColumn(id);
    if (!column) return;
    column.el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }

  function focusApp(id) {
    if (document.body.classList.contains('mod-show-desktop')) setShowDesktop(false);
    if (state.focusedId === id) return;

    if (state.focusedId) {
      const previous = state.apps.find(app => app.id === state.focusedId);
      if (previous) previous.el.classList.remove('focused');
    }

    state.focusedId = id;
    const next = state.apps.find(app => app.id === id);
    if (next) {
      next.el.classList.add('focused');
      if (!state._skipSave && !document.body.classList.contains('mod-overview')) {
        window.requestAnimationFrame(() => scrollToApp(id));
      }
    }

    updateTopBar();
    if (document.body.classList.contains('mod-overview')) {
      window.requestAnimationFrame(() => positionOverview());
    }
    if (!state._skipSave) saveSession();
  }

  function addApp(record, insertIntoColumnId = null) {
    state.apps.push(record);
    const existingColumn = insertIntoColumnId
      ? state.columns.find(column => column.id === insertIntoColumnId)
      : null;

    if (existingColumn) {
      existingColumn.appIds.push(record.id);
      existingColumn.el.appendChild(record.el);
    } else {
      const columnId = `col-${state.nextColId++}`;
      const columnElement = createColumnElement(columnId);
      columnElement.appendChild(record.el);
      const column = { id: columnId, appIds: [record.id], widthPreset: 'full', el: columnElement };
      state.columns.push(column);
      appStrip.appendChild(columnElement);
      wireColumnEvents(columnElement);
    }
    focusApp(record.id);
  }

  function removeApp(id) {
    const appIndex = state.apps.findIndex(app => app.id === id);
    if (appIndex === -1) return;

    const { el } = state.apps[appIndex];
    const column = getAppColumn(id);
    state.apps.splice(appIndex, 1);
    el.remove();

    if (column) {
      const columnIndex = column.appIds.indexOf(id);
      column.appIds.splice(columnIndex, 1);
      if (column.appIds.length === 0) {
        const index = state.columns.indexOf(column);
        column.el.remove();
        state.columns.splice(index, 1);
      }
    }

    if (state.focusedId === id) {
      state.focusedId = null;
      const order = getAppOrder();
      if (order.length > 0) {
        let nextId = null;
        if (column && column.appIds.length > 0) {
          nextId = column.appIds[0];
        } else {
          nextId = order[Math.max(0, order.indexOf(id) - 1)] || order[0];
        }
        if (nextId) focusApp(nextId);
      }
    }

    updateTopBar();
    updateEmptyState();
    updateStripLayout();
    saveSession();
  }

  function focusWindowInDirection(direction) {
    const current = state.apps.find(app => app.id === state.focusedId);
    if (!current?.el?.isConnected) return;
    const origin = current.el.getBoundingClientRect();
    const originX = origin.left + origin.width / 2;
    const originY = origin.top + origin.height / 2;
    let nearest = null;
    let nearestScore = Infinity;

    for (const candidate of state.apps) {
      if (candidate.id === current.id || !candidate.el?.isConnected) continue;
      const rect = candidate.el.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - originX;
      const dy = rect.top + rect.height / 2 - originY;
      const primary = direction === 'left' ? -dx
        : direction === 'right' ? dx
          : direction === 'up' ? -dy : dy;
      if (primary <= 0) continue;
      const perpendicular = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = primary + perpendicular * 1.5;
      if (score < nearestScore) {
        nearest = candidate;
        nearestScore = score;
      }
    }

    if (!nearest) return;
    focusApp(nearest.id);
    window.requestAnimationFrame(() => {
      if (state.focusedId !== nearest.id || !nearest.el?.isConnected) return;
      const controls = getFocusableControls(nearest.el);
      if (controls.length) controls[0].focus({ preventScroll: true });
      else {
        nearest.el.tabIndex = -1;
        nearest.el.focus({ preventScroll: true });
      }
    });
  }

  function setFocusedWidth(preset) {
    if (!state.focusedId) return;
    const column = getAppColumn(state.focusedId);
    if (!column) return;
    column.el.classList.remove('width-shrink', 'width-grow');
    void column.el.offsetWidth;
    column.el.classList.add('width-shrink');
    column.el.addEventListener('animationend', () => {
      column.el.classList.remove('width-shrink');
      column.el.dataset.width = preset;
      void column.el.offsetWidth;
      column.el.classList.add('width-grow');
      column.el.addEventListener('animationend', () => column.el.classList.remove('width-grow'), { once: true });
    }, { once: true });

    column.widthPreset = preset;
    saveSession();
  }

  function cycleFocusedWidthWider() {
    if (!state.focusedId) return;
    const column = getAppColumn(state.focusedId);
    if (!column) return;
    const index = widthPresets.indexOf(column.widthPreset);
    setFocusedWidth(widthPresets[Math.min(index + 1, widthPresets.length - 1)]);
  }

  function cycleFocusedWidthNarrower() {
    if (!state.focusedId) return;
    const column = getAppColumn(state.focusedId);
    if (!column) return;
    const index = widthPresets.indexOf(column.widthPreset);
    setFocusedWidth(widthPresets[Math.max(index - 1, 0)]);
  }

  function consumeLeft() {
    if (!state.focusedId) return;
    const column = getAppColumn(state.focusedId);
    if (!column) return;
    const columnIndex = state.columns.indexOf(column);
    if (columnIndex === 0) return;

    const leftColumn = state.columns[columnIndex - 1];
    if (!leftColumn.appIds.length) return;
    const takenId = leftColumn.appIds[leftColumn.appIds.length - 1];
    const takenApp = state.apps.find(app => app.id === takenId);
    if (!takenApp) return;

    leftColumn.appIds.pop();
    takenApp.el.remove();
    if (leftColumn.appIds.length === 0) {
      leftColumn.el.remove();
      state.columns.splice(columnIndex - 1, 1);
    }

    column.appIds.push(takenId);
    column.el.appendChild(takenApp.el);
    saveSession();
    updateTopBar();
    updateStripLayout();
  }

  function expelRight() {
    if (!state.focusedId) return;
    const column = getAppColumn(state.focusedId);
    if (!column || column.appIds.length <= 1) return;

    const columnIndex = state.columns.indexOf(column);
    const appIndex = column.appIds.indexOf(state.focusedId);
    column.appIds.splice(appIndex, 1);
    const app = state.apps.find(candidate => candidate.id === state.focusedId);
    app.el.remove();

    const newColumnId = `col-${state.nextColId++}`;
    const newColumnElement = createColumnElement(newColumnId);
    newColumnElement.appendChild(app.el);
    newColumnElement.dataset.width = column.widthPreset;
    const newColumn = { id: newColumnId, appIds: [state.focusedId], widthPreset: column.widthPreset, el: newColumnElement };
    state.columns.splice(columnIndex + 1, 0, newColumn);
    column.el.after(newColumnElement);
    wireColumnEvents(newColumnElement);

    saveSession();
    updateTopBar();
    updateStripLayout();
    window.requestAnimationFrame(() => scrollToApp(state.focusedId));
  }

  function expelLeft() {
    if (!state.focusedId) return;
    const column = getAppColumn(state.focusedId);
    if (!column || column.appIds.length <= 1) return;

    const columnIndex = state.columns.indexOf(column);
    const appIndex = column.appIds.indexOf(state.focusedId);
    column.appIds.splice(appIndex, 1);
    const app = state.apps.find(candidate => candidate.id === state.focusedId);
    app.el.remove();

    const newColumnId = `col-${state.nextColId++}`;
    const newColumnElement = createColumnElement(newColumnId);
    newColumnElement.appendChild(app.el);
    newColumnElement.dataset.width = column.widthPreset;
    const newColumn = { id: newColumnId, appIds: [state.focusedId], widthPreset: column.widthPreset, el: newColumnElement };
    state.columns.splice(columnIndex, 0, newColumn);
    column.el.before(newColumnElement);
    wireColumnEvents(newColumnElement);

    saveSession();
    updateTopBar();
    updateStripLayout();
    window.requestAnimationFrame(() => scrollToApp(state.focusedId));
  }

  function consumeRight() {
    if (!state.focusedId) return;
    const column = getAppColumn(state.focusedId);
    if (!column) return;
    const columnIndex = state.columns.indexOf(column);
    if (columnIndex === state.columns.length - 1) return;

    const rightColumn = state.columns[columnIndex + 1];
    if (!rightColumn.appIds.length) return;
    const takenId = rightColumn.appIds[0];
    const takenApp = state.apps.find(app => app.id === takenId);
    if (!takenApp) return;

    rightColumn.appIds.shift();
    takenApp.el.remove();
    if (rightColumn.appIds.length === 0) {
      rightColumn.el.remove();
      state.columns.splice(columnIndex + 1, 1);
    }

    column.appIds.push(takenId);
    column.el.appendChild(takenApp.el);
    saveSession();
    updateTopBar();
    updateStripLayout();
  }

  function moveWindowUp() {
    if (!state.focusedId) return;
    const column = getAppColumn(state.focusedId);
    if (!column || column.appIds.length <= 1) return;
    const index = column.appIds.indexOf(state.focusedId);
    if (index === 0) return;
    [column.appIds[index - 1], column.appIds[index]] = [column.appIds[index], column.appIds[index - 1]];
    const app = state.apps.find(candidate => candidate.id === state.focusedId);
    const previousElement = state.apps.find(candidate => candidate.id === column.appIds[index]).el;
    column.el.insertBefore(app.el, previousElement);
    saveSession();
    updateTopBar();
  }

  function moveWindowDown() {
    if (!state.focusedId) return;
    const column = getAppColumn(state.focusedId);
    if (!column || column.appIds.length <= 1) return;
    const index = column.appIds.indexOf(state.focusedId);
    if (index === column.appIds.length - 1) return;
    [column.appIds[index], column.appIds[index + 1]] = [column.appIds[index + 1], column.appIds[index]];
    const app = state.apps.find(candidate => candidate.id === state.focusedId);
    const nextElement = state.apps.find(candidate => candidate.id === column.appIds[index]).el;
    column.el.insertBefore(app.el, nextElement.nextSibling);
    saveSession();
    updateTopBar();
  }

  function completeOverviewRearrangement() {
    saveSession();
    updateTopBar();
    updateStripLayout();
    if (document.body.classList.contains('mod-overview')) {
      window.requestAnimationFrame(() => positionOverview());
    }
  }

  function moveColumn(columnId, targetIndex) {
    const sourceIndex = state.columns.findIndex(column => column.id === columnId);
    if (sourceIndex < 0 || !Number.isInteger(targetIndex)) return false;

    const destinationIndex = Math.max(0, Math.min(targetIndex, state.columns.length - 1));
    if (sourceIndex === destinationIndex) return false;

    const [column] = state.columns.splice(sourceIndex, 1);
    column.el.remove();
    state.columns.splice(destinationIndex, 0, column);
    appStrip.insertBefore(column.el, appStrip.children[destinationIndex] || null);

    completeOverviewRearrangement();
    return true;
  }

  function rearrangeWindow(appId, meta) {
    const app = state.apps.find(candidate => candidate.id === appId);
    const sourceColumn = getAppColumn(appId);
    if (!app || !sourceColumn || !meta || typeof meta !== 'object') return false;

    const insertAt = Number(meta.insertAt);
    if (!Number.isInteger(insertAt) || insertAt < 0) return false;

    if (meta.type === 'new-col') {
      if (insertAt > state.columns.length) return false;

      if (sourceColumn.appIds.length === 1) {
        const sourceIndex = state.columns.indexOf(sourceColumn);
        if (insertAt === sourceIndex || insertAt === sourceIndex + 1) return false;
        return moveColumn(
          sourceColumn.id,
          insertAt > sourceIndex ? insertAt - 1 : insertAt,
        );
      }

      sourceColumn.appIds.splice(sourceColumn.appIds.indexOf(appId), 1);
      app.el.remove();

      const columnId = `col-${state.nextColId++}`;
      const columnElement = createColumnElement(columnId);
      columnElement.dataset.width = sourceColumn.widthPreset;
      columnElement.appendChild(app.el);
      const column = {
        id: columnId,
        appIds: [appId],
        widthPreset: sourceColumn.widthPreset,
        el: columnElement,
      };

      state.columns.splice(insertAt, 0, column);
      appStrip.insertBefore(columnElement, appStrip.children[insertAt] || null);
      wireColumnEvents(columnElement);
      completeOverviewRearrangement();
      return true;
    }

    if (meta.type !== 'within') return false;

    const destinationColumn = state.columns.find(column => column.id === meta.colId);
    if (!destinationColumn || insertAt > destinationColumn.appIds.length) return false;
    if (sourceColumn === destinationColumn) {
      const currentIndex = sourceColumn.appIds.indexOf(appId);
      if (sourceColumn.appIds.length === 1
        || currentIndex === insertAt
        || currentIndex === insertAt - 1) return false;
    }

    sourceColumn.appIds.splice(sourceColumn.appIds.indexOf(appId), 1);
    app.el.remove();
    if (sourceColumn.appIds.length === 0) {
      sourceColumn.el.remove();
      state.columns.splice(state.columns.indexOf(sourceColumn), 1);
    }

    const targetIndex = Math.min(insertAt, destinationColumn.appIds.length);
    destinationColumn.appIds.splice(targetIndex, 0, appId);
    destinationColumn.el.insertBefore(
      app.el,
      destinationColumn.el.querySelectorAll('.app-window')[targetIndex] || null,
    );

    completeOverviewRearrangement();
    return true;
  }

  function focusNextApp() {
    const order = getAppOrder();
    if (!order.length) return;
    focusApp(order[(order.indexOf(state.focusedId) + 1) % order.length]);
  }

  function focusPrevApp() {
    const order = getAppOrder();
    if (!order.length) return;
    focusApp(order[(order.indexOf(state.focusedId) - 1 + order.length) % order.length]);
  }

  function focusAppByIndex(index) {
    const order = getAppOrder();
    if (index < 1 || index > order.length) return;
    focusApp(order[index - 1]);
  }

  return {
    addApp,
    consumeLeft,
    consumeRight,
    cycleFocusedWidthNarrower,
    cycleFocusedWidthWider,
    focusApp,
    focusAppByIndex,
    focusNextApp,
    focusPrevApp,
    focusWindowInDirection,
    getAppColumn,
    getAppOrder,
    getFocusableControls,
    moveColumn,
    moveWindowDown,
    moveWindowUp,
    rearrangeWindow,
    removeApp,
    saveSession,
    scrollToApp,
    setFocusedWidth,
    expelLeft,
    expelRight,
  };
}
