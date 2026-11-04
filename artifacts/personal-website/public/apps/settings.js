'use strict';

import { enhanceSelect } from './custom-select.js';
import { createAnimationPickerController } from './animation-picker.js';

const PAGES = [
  { id: 'appearance', title: 'Appearance', detail: 'Choose how your desktop looks.' },
  { id: 'time', title: 'Time & Date', detail: 'Set the time format used across the desktop.' },
  { id: 'notifications', title: 'Notifications', detail: 'Control system reminders and alerts.' },
  { id: 'wallpaper', title: 'Wallpaper', detail: 'Choose the images and rhythm of your desktop.' },
];

const ICONS = {
  appearance: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9c0-.5 0-1-.1-1.5A7 7 0 0 1 12 3z"/></svg>',
  time: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 10.4 4 2.4-1 1.7-5-3V6h2v6.4z"/></svg>',
  notifications: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-6-6.92V2h-2v2.08A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"/></svg>',
  wallpaper: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2ZM5 5h14v9l-3.5-3.5-3 3L9 10l-4 5V5zm3 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>',
};

const WALLPAPER_TRANSITIONS = [
  ['fade', 'Fade', 'Blend between images'],
  ['zoom', 'Zoom', 'Scale the new image into view'],
  ['slide-left', 'Slide from right', 'Move the new image in from the right'],
  ['slide-right', 'Slide from left', 'Move the new image in from the left'],
  ['wipe', 'Wipe', 'Reveal the new image across the screen'],
];
const WINDOW_OPEN_CLOSE_ANIMATIONS = [
  ['fade', 'Fade', 'Fade in and out'],
  ['zoom', 'Zoom', 'Scale into and out of view'],
  ['slide-up', 'Slide Up', 'Move gently from below'],
  ['slide-left', 'Slide', 'Move horizontally'],
  ['flip', 'Flip', 'Turn into and out of view'],
];
const SHOW_DESKTOP_ANIMATIONS = [
  ['zoom', 'Zoom', 'Scale windows away and back'],
  ['fade', 'Fade', 'Fade windows out and back'],
  ['tilt-up', 'Tilt Up', 'Tilt and slide windows up off the desktop'],
  ['slide-up', 'Slide Up', 'Move windows up and back'],
  ['flip', 'Flip', 'Turn windows away and back'],
];
const OVERVIEW_ANIMATIONS = [
  ['zoom', 'Zoom', 'Zoom the windows into the overview'],
  ['rubber-band', 'Rubber Band', 'Zoom windows out from the center toward both sides'],
  ['fade', 'Fade', 'Fade windows into and out of the overview'],
  ['slide-up', 'Slide Up', 'Move windows up into and out of the overview'],
];
const ANIMATION_OPTIONS = {
  windowOpen: { label: 'Opening windows', choices: WINDOW_OPEN_CLOSE_ANIMATIONS },
  windowClose: { label: 'Closing windows', choices: WINDOW_OPEN_CLOSE_ANIMATIONS },
  showDesktop: { label: 'Show desktop', choices: SHOW_DESKTOP_ANIMATIONS },
  overview: { label: 'Show overview', choices: OVERVIEW_ANIMATIONS },
};

function normalizeChoices(value, choices, fallback = ['fade']) {
  const allowed = new Set(choices.map(([choice]) => choice));
  if (Array.isArray(value)) return [...new Set(value.filter(choice => allowed.has(choice)))];
  if (value === 'none') return [];
  if (value === 'random') return choices.map(([choice]) => choice);
  return allowed.has(value) ? [value] : [...fallback];
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function copyWallpaper(settings) {
  return {
    selected: Array.isArray(settings?.selected) ? [...settings.selected] : [],
    mode: settings?.mode === 'cycle' ? 'cycle' : 'random',
    rotation: settings?.rotation === 'interval' ? 'interval' : 'visit',
    intervalMinutes: Number(settings?.intervalMinutes) || 60,
    transition: normalizeChoices(settings?.transition, WALLPAPER_TRANSITIONS),
  };
}

export function buildSettings(id, ctx, initialState) {
  const settings = ctx?.settings;
  const root = el('section', 'utility-app settings-app');
  root.setAttribute('aria-label', 'Settings');
  root.innerHTML = `
    <div class="settings-layout">
      <aside class="settings-sidebar" aria-label="Settings sections">
        <div class="settings-brand"><span class="settings-brand-mark" aria-hidden="true">S</span><div><strong>Settings</strong><small>Desktop preferences</small></div></div>
        <nav class="settings-nav" aria-label="Settings pages"></nav>
      </aside>
      <main class="settings-main">
        <div class="settings-page-list" hidden>
          <div class="settings-mobile-heading"><span class="settings-kicker">PERSONAL DESKTOP</span><h1>Settings</h1><p>Make this space feel like yours.</p></div>
          <nav class="settings-mobile-nav" aria-label="Settings pages"></nav>
        </div>
        <section class="settings-page" aria-live="polite"></section>
      </main>
    </div>`;
  let pendingPageRender = false;
  const animationPicker = createAnimationPickerController(root, {
    label: 'Animation selection',
    onClose: pickerId => {
      if (!pendingPageRender || destroyed) return;
      pendingPageRender = false;
      renderPage();
      requestAnimationFrame(() => root.querySelector(
        `[data-animation-picker="${CSS.escape(pickerId)}"] .animation-picker-trigger`,
      )?.focus({ preventScroll: true }));
    },
  });
  const sidebarNav = root.querySelector('.settings-nav');
  const mobileList = root.querySelector('.settings-page-list');
  const mobileNav = root.querySelector('.settings-mobile-nav');
  const page = root.querySelector('.settings-page');
  const snapshot = () => {
    try { return settings?.getSnapshot?.() || {}; } catch { return {}; }
  };
  let current = snapshot();
  let activePage = null;
  let narrow = false;
  let destroyed = false;
  let wallpaperFiles = [];
  let wallpaperDraft = null;
  let wallpaperLoading = false;
  let wallpaperError = '';
  let wallpaperStatus = '';
  let notificationError = '';
  let notificationBusy = false;
  let wallpaperPendingAction = null;
  let wallpaperFailedAction = null;
  let wallpaperRevision = 0;
  let wallpaperActionRunner = null;
  let firstResize = true;
  let resizeObserver;
  let unsubscribe = () => {};
  const buttons = new Map();

  const setMessage = (node, message, kind = '') => {
    node.textContent = message;
    node.dataset.kind = kind;
    node.hidden = !message;
  };

  function buildNavigation() {
    for (const [nav, mobile] of [[sidebarNav, false], [mobileNav, true]]) {
      nav.replaceChildren();
      for (const item of PAGES) {
        const button = el('button', mobile ? 'settings-mobile-item' : 'settings-nav-item');
        button.type = 'button';
        button.dataset.page = item.id;
        button.setAttribute('aria-label', item.title);
        const icon = document.createElement('span');
        icon.className = 'settings-nav-icon';
        icon.innerHTML = ICONS[item.id];
        const labels = el('span', 'settings-nav-copy');
        labels.append(el('strong', '', item.title), el('small', '', item.detail));
        button.append(icon, labels);
        button.addEventListener('click', () => selectPage(item.id));
        nav.append(button);
        if (!mobile) buttons.set(item.id, button);
      }
    }
  }

  function selectPage(pageId) {
    if (!PAGES.some(item => item.id === pageId)) return;
    animationPicker.close({ restoreFocus: false, notify: false });
    pendingPageRender = false;
    activePage = pageId;
    if (pageId === 'wallpaper' && !wallpaperDraft && !wallpaperLoading && !wallpaperError) loadWallpapers();
    renderNavigation();
    renderPage();
  }

  function renderNavigation() {
    for (const [pageId, button] of buttons) {
      const selected = activePage === pageId;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
    }
    for (const button of mobileNav.querySelectorAll('button')) {
      const selected = activePage === button.dataset.page;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
    }
    root.dataset.narrow = String(narrow);
    root.dataset.mobilePage = String(narrow && Boolean(activePage));
    mobileList.hidden = !(narrow && !activePage);
    page.hidden = narrow && !activePage;
  }

  function renderPage() {
    if (animationPicker.isOpen) {
      pendingPageRender = true;
      return;
    }
    pendingPageRender = false;
    page.replaceChildren();
    if (!activePage) return;
    const item = PAGES.find(entry => entry.id === activePage);
    const header = el('header', 'settings-page-header');
    const back = el('button', 'settings-back', 'Back to settings');
    back.type = 'button';
    back.innerHTML = '<span aria-hidden="true">‹</span><span>All settings</span>';
    back.addEventListener('click', () => { activePage = null; renderNavigation(); renderPage(); });
    back.hidden = !narrow;
    const titleBlock = el('div', 'settings-title-block');
    titleBlock.append(el('span', 'settings-kicker', 'PERSONAL DESKTOP'), el('h1', '', item.title), el('p', '', item.detail));
    header.append(back, titleBlock);
    page.append(header);
    const body = el('div', 'settings-page-body');
    page.append(body);

    if (activePage === 'appearance') renderAppearance(body);
    else if (activePage === 'time') renderTime(body);
    else if (activePage === 'notifications') renderNotifications(body);
    else if (activePage === 'wallpaper') renderWallpaper(body);
  }

  function renderAppearance(body) {
    const card = el('section', 'settings-card settings-appearance-card');
    card.append(el('span', 'settings-card-eyebrow', 'DISPLAY'), el('h2', '', 'Color theme'), el('p', 'settings-description', 'Your choice follows you across every desktop window.'));
    const options = el('div', 'settings-theme-options');
    options.setAttribute('role', 'group');
    options.setAttribute('aria-label', 'Color theme');
    for (const option of [
      { value: 'system', title: 'System', caption: 'Follow your device' },
      { value: 'light', title: 'Light', caption: 'Bright and clear' },
      { value: 'dark', title: 'Dark', caption: 'Soft on the eyes' },
    ]) {
      const button = el('button', 'settings-theme-choice');
      button.type = 'button';
      button.dataset.theme = option.value;
      button.setAttribute('aria-pressed', String(current.themeOverride === option.value));
      const preview = el('span', `settings-theme-preview theme-preview-${option.value}`);
      preview.setAttribute('aria-hidden', 'true');
      preview.append(el('i'), el('i'), el('i'));
      const detail = el('span', 'settings-theme-label');
      detail.append(el('strong', '', option.title), el('small', '', option.caption));
      const check = el('span', 'settings-theme-check', 'Selected');
      button.append(preview, detail, check);
      button.addEventListener('click', () => {
        try {
          settings?.setTheme?.(option.value);
          current = snapshot();
          if (!current.themeOverride) current.themeOverride = option.value;
          notificationError = '';
          renderPage();
        } catch (error) {
          const status = page.querySelector('.settings-inline-status');
          setMessage(status, error?.message || 'The theme could not be changed.', 'error');
        }
      });
      options.append(button);
    }
    card.append(options);
    const status = el('p', 'settings-inline-status');
    status.setAttribute('role', 'status');
    status.hidden = true;
    card.append(status);
    const note = el('div', 'settings-note');
    note.append(el('span', 'settings-note-dot', 'NOW'), el('span', '', `Currently using ${current.theme === 'dark' ? 'dark' : 'light'} appearance.`));
    card.append(note);
    body.append(card);

    const animationCard = el('section', 'settings-card settings-control-card settings-animation-card');
    animationCard.append(
      el('span', 'settings-card-eyebrow', 'MOTION'),
      el('h2', '', 'Window animations'),
      el('p', 'settings-description', 'Choose animations for each desktop action. When several are selected, one is chosen at random.')
    );
    const animationPreferences = current.animationPreferences || {};
    const animationRows = el('div', 'settings-animation-rows');
    for (const [event, config] of Object.entries(ANIMATION_OPTIONS)) {
      const row = el('section', 'settings-animation-row');
      row.append(el('h3', '', config.label));
      row.append(animationPicker.createPicker({
        id: `animation-${event}`,
        label: config.label,
        description: 'Choose one or more effects. When several are selected, one is chosen at random.',
        choices: config.choices,
        selected: normalizeChoices(animationPreferences[event], config.choices, event === 'showDesktop' || event === 'overview' ? ['zoom'] : ['fade']),
        onChange: selected => {
          try {
            settings?.setAnimationPreferences?.(event, selected);
            current = snapshot();
          } catch (error) {
            setMessage(animationStatus, error?.message || 'The animation preference could not be changed.', 'error');
          }
        },
      }));
      animationRows.append(row);
    }
    animationCard.append(animationRows);
    const animationStatus = el('p', 'settings-inline-status');
    animationStatus.setAttribute('role', 'status');
    animationStatus.hidden = true;
    animationCard.append(animationStatus);
    body.append(animationCard);
  }

  function renderTime(body) {
    const card = el('section', 'settings-card settings-setting-row');
    const copy = el('div', 'settings-setting-copy');
    copy.append(el('span', 'settings-card-eyebrow', 'CLOCK'), el('h2', '', '24-hour time'), el('p', 'settings-description', 'Use a 24-hour clock everywhere on your desktop, including the system panel.'));
    const control = document.createElement('label');
    control.className = 'settings-switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = current.use24HourTime === true;
    input.setAttribute('aria-label', 'Use 24-hour time');
    const track = el('span', 'settings-switch-track');
    track.setAttribute('aria-hidden', 'true');
    control.append(input, track);
    input.addEventListener('change', () => {
      try { settings?.set24HourTime?.(input.checked); current = snapshot(); }
      catch (error) { input.checked = current.use24HourTime === true; setMessage(status, error?.message || 'The time format could not be changed.', 'error'); }
    });
    card.append(copy, control);
    const status = el('p', 'settings-inline-status');
    status.setAttribute('role', 'status');
    status.hidden = true;
    card.append(status);
    body.append(card);
    const example = el('div', 'settings-example');
    example.append(el('span', 'settings-card-eyebrow', 'PREVIEW'), el('strong', '', current.use24HourTime ? '17:42' : '5:42 PM'), el('small', '', 'Displayed in the system panel'));
    body.append(example);
  }

  function renderNotifications(body) {
    const card = el('section', 'settings-card settings-setting-row');
    const copy = el('div', 'settings-setting-copy');
    copy.append(el('span', 'settings-card-eyebrow', 'SYSTEM'), el('h2', '', 'System notifications'), el('p', 'settings-description', 'Allow reminder alerts and other desktop notifications.'));
    const control = document.createElement('label');
    control.className = 'settings-switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = current.notificationsEnabled === true;
    input.disabled = notificationBusy;
    input.setAttribute('aria-label', 'Enable system notifications');
    const track = el('span', 'settings-switch-track');
    track.setAttribute('aria-hidden', 'true');
    control.append(input, track);
    input.addEventListener('change', async () => {
      const requested = input.checked;
      notificationError = '';
      if (requested && typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        input.checked = false;
        notificationError = 'Notifications are blocked by your browser. Change the site permission in your browser settings, then try again.';
        const errorNode = page.querySelector('.settings-inline-status');
        setMessage(errorNode, notificationError, 'error');
        return;
      }
      notificationBusy = true;
      input.disabled = true;
      setMessage(status, 'Updating notification preference…');
      try {
        await settings?.setNotificationsEnabled?.(requested);
        current = snapshot();
        notificationError = '';
        setMessage(status, requested ? 'System notifications are on.' : 'System notifications are off.', 'success');
      } catch (error) {
        current = snapshot();
        input.checked = current.notificationsEnabled === true;
        notificationError = error?.message || 'The notification preference could not be updated.';
        setMessage(status, notificationError, 'error');
      } finally {
        notificationBusy = false;
        input.disabled = false;
      }
    });
    card.append(copy, control);
    const status = el('p', 'settings-inline-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = !notificationError;
    if (notificationError) status.textContent = notificationError;
    card.append(status);
    body.append(card);
    const note = el('div', 'settings-note');
    note.append(el('span', 'settings-note-dot', current.notificationsEnabled ? 'ON' : 'OFF'), el('span', '', current.notificationsEnabled ? 'Reminders can reach you on this device.' : 'Reminders will stay quiet.'));
    body.append(note);
  }

  async function loadWallpapers() {
    if (!settings?.loadWallpaper) {
      wallpaperError = 'Wallpaper settings are not available right now.';
      renderPage();
      return;
    }
    wallpaperLoading = true;
    wallpaperError = '';
    wallpaperStatus = '';
    renderPage();
    try {
      const data = await settings.loadWallpaper();
      if (destroyed) return;
      wallpaperFiles = Array.isArray(data?.files) ? data.files.filter(file => file && typeof file.url === 'string') : [];
      wallpaperDraft = copyWallpaper(data?.settings);
      wallpaperDraft.selected = wallpaperDraft.selected.filter(url => wallpaperFiles.some(file => file.url === url));
      wallpaperLoading = false;
      renderPage();
    } catch (error) {
      if (destroyed) return;
      wallpaperLoading = false;
      wallpaperError = error?.message || 'Wallpaper choices could not be loaded.';
      renderPage();
    }
  }

  function renderWallpaper(body) {
    if (wallpaperLoading) {
      const loading = el('div', 'settings-wallpaper-loading');
      loading.setAttribute('role', 'status');
      loading.setAttribute('aria-label', 'Loading wallpaper choices');
      for (let i = 0; i < 4; i++) loading.append(el('span', 'settings-skeleton'));
      body.append(loading);
      return;
    }
    if (wallpaperError) {
      const state = el('div', 'settings-state settings-state-error');
      state.setAttribute('role', 'alert');
      state.append(el('span', 'settings-state-mark', '!'), el('h2', '', 'Could not load wallpapers'), el('p', '', wallpaperError));
      const retry = el('button', 'util-action', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', loadWallpapers);
      state.append(retry);
      body.append(state);
      return;
    }
    if (!wallpaperDraft) return;

    const selectionCard = el('section', 'settings-card settings-wallpaper-card');
    const selectionHead = el('div', 'settings-section-heading');
    selectionHead.append(el('div', '', ''));
    selectionHead.firstChild.append(el('span', 'settings-card-eyebrow', 'YOUR COLLECTION'), el('h2', '', 'Eligible wallpapers'), el('p', 'settings-description', 'Only images available to this desktop are shown here.'));
    selectionHead.append(el('span', 'settings-count', `${wallpaperDraft.selected.length} selected`));
    selectionCard.append(selectionHead);
    if (!wallpaperFiles.length) {
      const empty = el('div', 'settings-empty');
      empty.append(el('span', 'settings-empty-art', '—'), el('strong', '', 'No wallpapers available'), el('p', '', 'Add eligible images to your desktop collection to choose a wallpaper.'));
      selectionCard.append(empty);
    } else {
      const grid = el('div', 'settings-wallpaper-grid');
      wallpaperFiles.forEach((file, index) => {
        const label = document.createElement('label');
        label.className = 'settings-wallpaper-tile';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = wallpaperDraft.selected.includes(file.url);
        input.setAttribute('aria-label', `Select ${file.displayName || file.title || `wallpaper ${index + 1}`}`);
        const image = document.createElement('img');
        image.src = file.url;
        image.alt = '';
        image.loading = 'lazy';
        const overlay = el('span', 'settings-wallpaper-check', 'Selected');
        const name = el('span', 'settings-wallpaper-name', file.displayName || file.title || `Wallpaper ${index + 1}`);
        label.append(input, image, overlay, name);
        input.addEventListener('change', () => {
          if (input.checked) {
            if (!wallpaperDraft.selected.includes(file.url)) wallpaperDraft.selected.push(file.url);
          } else wallpaperDraft.selected = wallpaperDraft.selected.filter(url => url !== file.url);
          queueWallpaperUpdate();
        });
        grid.append(label);
      });
      selectionCard.append(grid);
    }
    body.append(selectionCard);

    const controlGrid = el('div', 'settings-wallpaper-controls');
    const modeCard = el('section', 'settings-card settings-control-card');
    modeCard.append(el('span', 'settings-card-eyebrow', 'SELECTION'), el('h2', '', 'Wallpaper order'));
    const canRotate = wallpaperDraft.selected.length > 1;
    const modeOptions = makeChoiceGroup('Wallpaper order', [
      ['random', 'Random', 'Pick from your selected images'],
      ['cycle', 'Cycle', 'Follow your ordered list'],
    ], wallpaperDraft.mode, value => { wallpaperDraft.mode = value; queueWallpaperUpdate(); }, !canRotate);
    modeCard.append(modeOptions);
    if (!canRotate) modeCard.append(el('p', 'settings-description settings-rotation-hint', 'Select at least two wallpapers to enable automatic rotation.'));
    if (wallpaperDraft.mode === 'cycle') {
      const order = el('ol', 'settings-cycle-list');
      const orderedFiles = wallpaperDraft.selected.map(url => wallpaperFiles.find(file => file.url === url)).filter(Boolean);
      orderedFiles.forEach((file, index) => {
        const row = el('li', 'settings-cycle-item');
        const number = el('span', 'settings-cycle-number', String(index + 1).padStart(2, '0'));
        const thumb = document.createElement('img');
        thumb.src = file.url;
        thumb.alt = '';
        const title = el('span', 'settings-cycle-title', file.displayName || file.title || 'Wallpaper');
        const actions = el('span', 'settings-cycle-actions');
        const up = el('button', 'settings-icon-button', '↑');
        up.type = 'button'; up.setAttribute('aria-label', `Move ${title.textContent} up`); up.disabled = index === 0;
        up.addEventListener('click', () => moveSelected(index, -1));
        const down = el('button', 'settings-icon-button', '↓');
        down.type = 'button'; down.setAttribute('aria-label', `Move ${title.textContent} down`); down.disabled = index === orderedFiles.length - 1;
        down.addEventListener('click', () => moveSelected(index, 1));
        actions.append(up, down);
        row.append(number, thumb, title, actions);
        order.append(row);
      });
      if (!orderedFiles.length) order.append(el('li', 'settings-cycle-empty', 'Select at least one image to build a cycle.'));
      modeCard.append(order);
    }
    const scheduleCard = el('section', 'settings-card settings-control-card');
    scheduleCard.append(el('span', 'settings-card-eyebrow', 'SCHEDULE'), el('h2', '', 'Change wallpaper'));
    scheduleCard.append(makeChoiceGroup('Wallpaper schedule', [
      ['visit', 'On each visit', 'Choose when you return'],
      ['interval', 'On a timer', 'Rotate while you are here'],
    ], wallpaperDraft.rotation, value => { wallpaperDraft.rotation = value; queueWallpaperUpdate(); }, !canRotate));
    if (wallpaperDraft.rotation === 'interval') {
      const field = el('label', 'settings-select-label');
      field.append(el('span', '', 'Change every'));
      const select = document.createElement('select');
      select.className = 'util-field settings-select';
      select.setAttribute('aria-label', 'Wallpaper interval');
      for (const minutes of [1, 5, 15, 30, 60, 360, 1440]) {
        const option = document.createElement('option');
        option.value = String(minutes);
        option.textContent = minutes === 1 ? '1 minute' : `${minutes} minutes`;
        option.selected = Number(wallpaperDraft.intervalMinutes) === minutes;
        select.append(option);
      }
      select.addEventListener('change', () => { wallpaperDraft.intervalMinutes = Number(select.value); queueWallpaperUpdate(); });
      field.append(select);
      scheduleCard.append(field);
      enhanceSelect(select);
    }
    scheduleCard.append(el('div', 'settings-subheading', 'Transition'));
    scheduleCard.append(animationPicker.createPicker({
      id: 'wallpaper-transition',
      label: 'Wallpaper transition',
      description: 'Choose one or more transitions. When several are selected, one is chosen at random.',
      choices: WALLPAPER_TRANSITIONS,
      selected: wallpaperDraft.transition,
      onChange: selected => { wallpaperDraft.transition = selected; queueWallpaperUpdate(); },
    }));
    controlGrid.append(modeCard, scheduleCard);
    body.append(controlGrid);

    const footer = el('div', 'settings-wallpaper-footer');
    const footerStatus = el('p', 'settings-inline-status');
    footerStatus.setAttribute('role', 'status');
    footerStatus.setAttribute('aria-live', 'polite');
    footerStatus.hidden = !wallpaperStatus;
    if (wallpaperStatus) {
      footerStatus.textContent = wallpaperStatus;
      footerStatus.dataset.kind = wallpaperFailedAction ? 'error' : 'success';
    }
    const defaultButton = el('button', 'util-action settings-default-button', 'Use Default Random Wallpaper');
    defaultButton.type = 'button';
    defaultButton.addEventListener('click', useDefaultWallpaper);
    footer.append(defaultButton, footerStatus);
    if (wallpaperFailedAction) {
      const retry = el('button', 'util-action settings-wallpaper-retry', 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', () => queueWallpaperAction(wallpaperFailedAction));
      footer.append(retry);
    }
    body.append(footer);
  }

  function makeChoiceGroup(label, choices, selected, onChange, disabled = false) {
    const group = el('div', 'settings-choice-list');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    for (const [value, title, description] of choices) {
      const button = el('button', 'settings-choice-option');
      button.type = 'button';
      button.disabled = disabled;
      button.setAttribute('aria-pressed', String(value === selected));
      button.append(el('span', 'settings-choice-radio'), el('span', 'settings-choice-copy'));
      button.querySelector('.settings-choice-copy').append(el('strong', '', title), el('small', '', description));
      button.addEventListener('click', () => onChange(value));
      group.append(button);
    }
    return group;
  }

  function moveSelected(index, delta) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= wallpaperDraft.selected.length) return;
    const [item] = wallpaperDraft.selected.splice(index, 1);
    wallpaperDraft.selected.splice(nextIndex, 0, item);
    queueWallpaperUpdate();
  }

  function queueWallpaperUpdate() {
    if (!wallpaperDraft) return;
    const action = wallpaperDraft.selected.length
      ? { type: 'save', payload: copyWallpaper(wallpaperDraft) }
      : { type: 'default' };
    queueWallpaperAction(action);
  }

  function queueWallpaperAction(action) {
    wallpaperPendingAction = action ? {
      type: action.type,
      payload: action.payload ? copyWallpaper(action.payload) : undefined,
    } : null;
    wallpaperFailedAction = null;
    wallpaperRevision += 1;
    wallpaperStatus = action?.type === 'default'
      ? 'Applying the default random wallpaper…'
      : 'Applying wallpaper changes…';
    renderPage();
    startWallpaperActionRunner();
  }

  function startWallpaperActionRunner() {
    if (wallpaperActionRunner || !wallpaperPendingAction || destroyed) return;
    wallpaperActionRunner = drainWallpaperActions().finally(() => {
      wallpaperActionRunner = null;
      startWallpaperActionRunner();
    });
  }

  async function drainWallpaperActions() {
    while (wallpaperPendingAction && !destroyed) {
      const action = wallpaperPendingAction;
      wallpaperPendingAction = null;
      const revision = wallpaperRevision;
      try {
        if (action.type === 'default') {
          if (!settings?.useDefaultWallpaper) throw new Error('Wallpaper settings are not available right now.');
          await settings.useDefaultWallpaper();
          if (revision === wallpaperRevision) wallpaperDraft = copyWallpaper(null);
        } else {
          if (!settings?.saveWallpaper) throw new Error('Wallpaper settings are not available right now.');
          await settings.saveWallpaper(copyWallpaper(action.payload));
        }
        wallpaperFailedAction = null;
        if (revision === wallpaperRevision) {
          wallpaperStatus = action.type === 'default'
            ? 'Default random wallpaper applied.'
            : 'Wallpaper preferences applied.';
        }
      } catch (error) {
        if (revision === wallpaperRevision) {
          wallpaperFailedAction = action;
          wallpaperStatus = error?.message || 'Wallpaper preferences could not be applied.';
        }
      }
      if (!destroyed) renderPage();
    }
    if (!destroyed) renderPage();
  }

  function useDefaultWallpaper() {
    wallpaperDraft = copyWallpaper(null);
    queueWallpaperAction({ type: 'default' });
  }

  function updateFromHost() {
    current = snapshot();
    if (!activePage) return;
    if (activePage === 'appearance' && !animationPicker.isOpen) renderPage();
    else if (activePage === 'time') {
      const input = page.querySelector('.settings-switch input');
      if (input) input.checked = current.use24HourTime === true;
    } else if (activePage === 'notifications' && !notificationBusy) renderPage();
  }

  function onResize() {
    const width = root.getBoundingClientRect().width;
    const next = width > 0 && width < 620;
    if (firstResize && width > 0) {
      firstResize = false;
      narrow = next;
      activePage = next ? null : 'appearance';
      renderNavigation();
      if (activePage) renderPage();
      return;
    }
    if (next === narrow) return;
    narrow = next;
    activePage = next ? null : (activePage || 'appearance');
    renderNavigation();
    if (activePage) renderPage();
  }

  buildNavigation();
  current = snapshot();
  // The first measured size chooses the compact page list or desktop's Appearance page.
  activePage = null;
  renderNavigation();
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(root);
  } else {
    window.addEventListener('resize', onResize);
  }
  onResize();
  if (settings?.subscribe) {
    try {
      const cleanup = settings.subscribe(updateFromHost);
      if (typeof cleanup === 'function') unsubscribe = cleanup;
    } catch { /* The controls remain usable if host subscriptions are unavailable. */ }
  }
  if (ctx?.appApis && id) {
    ctx.appApis[id] = {
      destroy() {
        if (destroyed) return;
        destroyed = true;
        animationPicker.destroy();
        unsubscribe();
        resizeObserver?.disconnect();
        window.removeEventListener('resize', onResize);
        if (ctx.appApis[id]?.destroy) delete ctx.appApis[id];
      },
    };
  }
  return root;
}
