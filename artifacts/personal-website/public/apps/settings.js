'use strict';

import { enhanceSelect } from '../shared/app-select.js';
import { createAnimationPickerController } from '../shared/animation-picker.js';
import { upgradeAppControls, wrapAppButton } from '../shared/app-controls.js';

const PAGES = [
  { id: 'appearance', title: 'Appearance' },
  { id: 'time', title: 'Time & Date' },
  { id: 'notifications', title: 'Notifications' },
  { id: 'wallpaper', title: 'Wallpaper' },
];
const NOTIFICATION_CATEGORIES = [
  { type: 'reminder', title: 'Reminders', description: 'Calendar and reminder alerts.' },
  { type: 'welcome', title: 'Welcome tips', description: 'Tips for reopening the Welcome window.' },
];
const NOTIFICATION_RETENTION_OPTIONS = [
  ['30', '30 days'],
  ['90', '90 days'],
  ['365', '1 year'],
  ['0', 'Forever'],
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
const ACCENT_COLORS = [
  { value: 'blue', label: 'Blue', hue: 240.76, color: '#006699' },
  { value: 'teal', label: 'Teal', hue: 190, color: 'oklch(48.74% 0.1131 190)' },
  { value: 'green', label: 'Green', hue: 145, color: 'oklch(48.74% 0.1131 145)' },
  { value: 'gold', label: 'Gold', hue: 85, color: 'oklch(48.74% 0.1131 85)' },
  { value: 'coral', label: 'Coral', hue: 25, color: 'oklch(48.74% 0.1131 25)' },
  { value: 'purple', label: 'Purple', hue: 300, color: 'oklch(48.74% 0.1131 300)' },
];
const DEFAULT_WINDOW_TINTS = {
  darkTint: 'blue',
  darkLightness: 25,
  lightTint: 'none',
  lightLightness: 100,
  backgroundOpacity: 92,
  topbar: {
    mode: 'matching-window',
    backgroundOpacity: null,
    darkBackground: { tint: 'blue', lightness: 25 },
    darkForeground: { tint: 'none', lightness: 100 },
    lightBackground: { tint: 'none', lightness: 100 },
    lightForeground: { tint: 'blue', lightness: 25 },
  },
};
const TOPBAR_TINT_MODES = [
  ['matching-window', 'Matching Window'],
  ['reverse-window', 'Reverse of Window'],
  ['dark', 'Dark'],
  ['light', 'Light'],
  ['custom-dark', 'Custom Dark'],
  ['custom-light', 'Custom Light'],
];
const WINDOW_DARK_TINT_OPTIONS = [
  { value: 'none', label: 'None', color: '#000' },
  ...ACCENT_COLORS,
];
const WINDOW_LIGHT_TINT_OPTIONS = [
  { value: 'none', label: 'None', color: '#fff' },
  ...ACCENT_COLORS,
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

function supportsRelativeColors() {
  return Boolean(globalThis.CSS?.supports?.('color', 'oklch(from #006699 calc(l + 0.1) c h)'));
}

function normalizeWindowTints(value) {
  const darkTint = WINDOW_DARK_TINT_OPTIONS.some(option => option.value === value?.darkTint)
    ? value.darkTint
    : DEFAULT_WINDOW_TINTS.darkTint;
  const lightTint = WINDOW_LIGHT_TINT_OPTIONS.some(option => option.value === value?.lightTint)
    ? value.lightTint
    : DEFAULT_WINDOW_TINTS.lightTint;
  const minimumDarkLightness = darkTint === 'none' ? 0 : 5;
  const darkLightness = Number.isFinite(Number(value?.darkLightness))
    ? Math.max(minimumDarkLightness, Math.min(25, Math.round(Number(value.darkLightness))))
    : DEFAULT_WINDOW_TINTS.darkLightness;
  const maximumLightLightness = lightTint === 'none' ? 100 : 95;
  const legacyLightLightness = value?.lightLightness ?? value?.lightness;
  const lightLightness = Number.isFinite(Number(legacyLightLightness))
    ? Math.max(75, Math.min(maximumLightLightness, Math.round(Number(legacyLightLightness))))
    : DEFAULT_WINDOW_TINTS.lightLightness;
  const savedBackgroundOpacity = value?.backgroundOpacity ?? DEFAULT_WINDOW_TINTS.backgroundOpacity;
  const backgroundOpacity = Number.isFinite(Number(savedBackgroundOpacity))
    ? Math.max(0, Math.min(100, Math.round(Number(savedBackgroundOpacity))))
    : DEFAULT_WINDOW_TINTS.backgroundOpacity;
  const normalizeTopbarTint = (saved, fallback, appearance) => {
    const tint = saved?.tint === 'none' || ACCENT_COLORS.some(option => option.value === saved?.tint)
      ? saved.tint
      : fallback.tint;
    const min = appearance === 'dark' ? (tint === 'none' ? 0 : 5) : 75;
    const max = appearance === 'dark' ? 25 : (tint === 'none' ? 100 : 95);
    const lightness = Number.isFinite(Number(saved?.lightness))
      ? Math.max(min, Math.min(max, Math.round(Number(saved.lightness))))
      : fallback.lightness;
    return { tint, lightness };
  };
  const topbarValue = value?.topbar || {};
  const topbarMode = TOPBAR_TINT_MODES.some(([mode]) => mode === topbarValue.mode)
    ? topbarValue.mode
    : DEFAULT_WINDOW_TINTS.topbar.mode;
  const savedTopbarOpacity = topbarValue.backgroundOpacity;
  const topbarBackgroundOpacity = savedTopbarOpacity !== null && savedTopbarOpacity !== undefined
    && Number.isFinite(Number(savedTopbarOpacity))
    ? Math.max(0, Math.min(100, Math.round(Number(savedTopbarOpacity))))
    : null;
  return {
    darkTint,
    darkLightness,
    lightTint,
    lightLightness,
    backgroundOpacity,
    topbar: {
      mode: topbarMode,
      backgroundOpacity: topbarBackgroundOpacity,
      darkBackground: normalizeTopbarTint(
        topbarValue.darkBackground,
        DEFAULT_WINDOW_TINTS.topbar.darkBackground,
        'dark',
      ),
      darkForeground: normalizeTopbarTint(
        topbarValue.darkForeground,
        DEFAULT_WINDOW_TINTS.topbar.darkForeground,
        'light',
      ),
      lightBackground: normalizeTopbarTint(
        topbarValue.lightBackground,
        DEFAULT_WINDOW_TINTS.topbar.lightBackground,
        'light',
      ),
      lightForeground: normalizeTopbarTint(
        topbarValue.lightForeground,
        DEFAULT_WINDOW_TINTS.topbar.lightForeground,
        'dark',
      ),
    },
  };
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
  let notificationPreferences = null;
  let notificationPreferencesLoading = false;
  let notificationPreferencesError = '';
  let notificationPreferencesPromise = null;
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

  function syncNotificationPreferenceControls() {
    if (!notificationPreferences) return;
    for (const input of page.querySelectorAll('[data-notification-category]')) {
      input.checked = notificationPreferences.enabledTypes?.[input.dataset.notificationCategory] !== false;
    }
    const retention = page.querySelector('[data-notification-retention]');
    if (retention) retention.value = String(notificationPreferences.retentionDays);
  }

  function handleNotificationPreferencesChange(event) {
    const next = event.detail;
    if (!next || typeof next !== 'object' || !next.enabledTypes) return;
    notificationPreferences = {
      enabledTypes: { ...next.enabledTypes },
      retentionDays: next.retentionDays,
    };
    if (activePage === 'notifications') syncNotificationPreferenceControls();
  }

  function loadNotificationPreferences() {
    if (notificationPreferences || notificationPreferencesPromise) return notificationPreferencesPromise;
    notificationPreferencesLoading = true;
    notificationPreferencesError = '';
    notificationPreferencesPromise = (async () => {
      try {
        if (typeof settings?.getNotificationPreferences !== 'function') {
          throw new Error('Notification preferences are not available right now.');
        }
        const result = await settings.getNotificationPreferences();
        notificationPreferences = {
          enabledTypes: { ...(result?.enabledTypes || {}) },
          retentionDays: result?.retentionDays ?? 90,
        };
      } catch (error) {
        notificationPreferencesError = error?.message || 'Notification preferences could not be loaded.';
      } finally {
        notificationPreferencesLoading = false;
        notificationPreferencesPromise = null;
        if (!destroyed && activePage === 'notifications') renderPage();
      }
      return notificationPreferences;
    })();
    return notificationPreferencesPromise;
  }

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
        labels.append(el('strong', '', item.title));
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
    if (pageId === 'notifications') void loadNotificationPreferences();
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

  function renderPage({ preserveScroll = false } = {}) {
    if (animationPicker.isOpen) {
      pendingPageRender = true;
      return;
    }
    pendingPageRender = false;
    const scrollContainer = narrow ? page : root.querySelector('.settings-main');
    const previousScrollTop = preserveScroll ? scrollContainer?.scrollTop || 0 : 0;
    page.replaceChildren();
    if (!activePage) {
      if (preserveScroll && scrollContainer) scrollContainer.scrollTop = previousScrollTop;
      return;
    }
    const item = PAGES.find(entry => entry.id === activePage);
    const header = el('header', 'settings-page-header');
    const back = el('button', 'settings-back', 'Back to settings');
    back.type = 'button';
    back.innerHTML = '<span aria-hidden="true">‹</span><span>All settings</span>';
    back.addEventListener('click', () => { activePage = null; renderNavigation(); renderPage(); });
    back.hidden = !narrow;
    const titleBlock = el('div', 'settings-title-block');
    titleBlock.append(el('span', 'settings-kicker', 'PERSONAL DESKTOP'), el('h1', '', item.title), el('p', '', item.detail));
    header.append(wrapAppButton(back), titleBlock);
    page.append(header);
    const body = el('div', 'settings-page-body');
    page.append(body);

    if (activePage === 'appearance') renderAppearance(body);
    else if (activePage === 'time') renderTime(body);
    else if (activePage === 'notifications') renderNotifications(body);
    else if (activePage === 'wallpaper') renderWallpaper(body);
    upgradeAppControls(page);
    if (preserveScroll && scrollContainer) scrollContainer.scrollTop = previousScrollTop;
  }

  function renderAppearance(body) {
    const card = el('section', 'settings-card settings-appearance-card');
    card.append(el('span', 'settings-card-eyebrow', 'SYSTEM'), el('h2', '', 'Color theme'), el('p', 'settings-description', 'Your choice follows you across every desktop window.'));
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
      button.append(preview, detail);
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
    const accentSection = el('div', 'settings-accent-section');
    const accentHeading = el('h3', '', 'Accent color');
    accentSection.append(accentHeading);
    if (supportsRelativeColors()) {
      const accentOptions = el('div', 'settings-accent-options');
      accentOptions.setAttribute('role', 'group');
      accentOptions.setAttribute('aria-labelledby', 'settings-accent-heading');
      accentHeading.id = 'settings-accent-heading';
      for (const option of ACCENT_COLORS) {
        const button = el('button', 'settings-accent-choice');
        button.type = 'button';
        button.dataset.accentColor = option.value;
        button.setAttribute('aria-label', `${option.label}${option.value === 'blue' ? ', default' : ''}`);
        button.setAttribute('aria-pressed', String((current.accentColor || 'blue') === option.value));
        const swatch = el('span', 'settings-accent-swatch');
        swatch.style.backgroundColor = option.color;
        swatch.setAttribute('aria-hidden', 'true');
        const label = el('span', 'settings-accent-label', option.label);
        button.append(swatch, label);
        button.addEventListener('click', () => {
          try {
            settings?.setAccentColor?.(option.value);
            current = snapshot();
            for (const choice of accentOptions.querySelectorAll('.settings-accent-choice')) {
              choice.setAttribute('aria-pressed', String(choice.dataset.accentColor === option.value));
            }
          } catch (error) {
            setMessage(page.querySelector('.settings-inline-status'), error?.message || 'The accent color could not be changed.', 'error');
          }
        });
        accentOptions.append(button);
      }
      accentSection.append(accentOptions, el('p', 'settings-description settings-accent-description', 'Blue is the default. Accent shades are generated to keep text and controls readable.'));
    } else {
      accentSection.append(el('p', 'settings-description', 'Accent color choices require a browser that supports CSS relative colors.'));
    }
    card.append(accentSection);
    const windowTintSection = el('section', 'settings-window-tints');
    windowTintSection.append(
      el('h3', '', 'Window tints'),
      el('p', 'settings-description settings-window-tint-description',
        'Dark appearance uses the dark tint for backgrounds and the light tint for text. Light appearance reverses them.'),
    );
    if (supportsRelativeColors()) {
      const windowTints = normalizeWindowTints(current.windowTints || DEFAULT_WINDOW_TINTS);
      let tintPreviewTimer = 0;
      const darkGroup = el('div', 'settings-tint-group');
      darkGroup.append(el('h4', '', 'Dark tint'));
      const darkOptions = el('div', 'settings-tint-options');
      darkOptions.setAttribute('role', 'group');
      darkOptions.setAttribute('aria-label', 'Dark window tint');
      const lightGroup = el('div', 'settings-tint-group');
      lightGroup.append(el('h4', '', 'Light tint'));
      const lightOptions = el('div', 'settings-tint-options settings-light-tint-options');
      lightOptions.setAttribute('role', 'group');
      lightOptions.setAttribute('aria-label', 'Light window tint');

      const tintGroups = {
        dark: {
          group: darkGroup,
          options: darkOptions,
          choices: WINDOW_DARK_TINT_OPTIONS,
          property: 'darkTint',
          levelProperty: 'darkLightness',
          levelLabel: 'Dark tint lightness',
          min: tint => tint === 'none' ? 0 : 5,
          max: 25,
          noneLevel: 0,
          help: 'Neutral black ranges from 0% to 25%. Colored tints range from 5% to 25%.',
          color: option => option.value === 'none'
            ? `oklch(${windowTints.darkLightness}% 0 0)`
            : `oklch(${windowTints.darkLightness}% 0.0645 ${option.hue})`,
        },
        light: {
          group: lightGroup,
          options: lightOptions,
          choices: WINDOW_LIGHT_TINT_OPTIONS,
          property: 'lightTint',
          levelProperty: 'lightLightness',
          levelLabel: 'Light tint lightness',
          min: () => 75,
          max: tint => tint === 'none' ? 100 : 95,
          noneLevel: 100,
          help: 'None stays neutral; use the slider from 75% to 100%. Colored tints range from 75% to 95%.',
          color: option => option.value === 'none'
            ? `oklch(${windowTints.lightLightness}% 0 0)`
            : `oklch(${windowTints.lightLightness}% 0.0622 ${option.hue})`,
        },
      };

      const previewTints = () => {
        window.clearTimeout(tintPreviewTimer);
        tintPreviewTimer = window.setTimeout(() => {
          tintPreviewTimer = 0;
          settings?.previewWindowTints?.(windowTints);
        }, 70);
      };
      const cancelTintPreview = () => {
        if (tintPreviewTimer) {
          window.clearTimeout(tintPreviewTimer);
          tintPreviewTimer = 0;
        }
      };

      const buildTintChoices = type => {
        const config = tintGroups[type];
        for (const option of config.choices) {
          const button = el('button', 'settings-tint-choice');
          button.type = 'button';
          button.setAttribute('aria-label', `${option.label} ${type} tint`);
          button.setAttribute('aria-pressed', String(windowTints[config.property] === option.value));
          button.dataset.tintValue = option.value;
          const swatch = el('span', `settings-tint-swatch settings-tint-swatch-${type}`);
          swatch.style.backgroundColor = config.color(option);
          swatch.setAttribute('aria-hidden', 'true');
          button.append(swatch, el('span', 'settings-tint-label', option.label));
          button.addEventListener('click', () => {
            const next = { ...windowTints, [config.property]: option.value };
            const minimum = typeof config.min === 'function' ? config.min(option.value) : config.min;
            const maximum = typeof config.max === 'function' ? config.max(option.value) : config.max;
            next[config.levelProperty] = option.value === 'none'
              ? config.noneLevel
              : Math.max(minimum, Math.min(maximum, windowTints[config.levelProperty]));
            try {
              cancelTintPreview();
              settings?.setWindowTints?.(next);
              current = snapshot();
            } catch (error) {
              setMessage(page.querySelector('.settings-inline-status'), error?.message || 'The window tint could not be changed.', 'error');
            }
          });
          config.options.append(button);
        }
      };

      buildTintChoices('dark');
      buildTintChoices('light');
      darkGroup.append(darkOptions);
      lightGroup.append(lightOptions);
      for (const type of ['dark', 'light']) {
        const config = tintGroups[type];
        config.group.append(el('p', 'settings-description settings-tint-help', config.help));
        const slider = document.createElement('input');
        slider.className = 'settings-tint-slider';
        slider.type = 'range';
        slider.min = String(typeof config.min === 'function' ? config.min(windowTints[config.property]) : config.min);
        slider.max = String(typeof config.max === 'function' ? config.max(windowTints[config.property]) : config.max);
        slider.step = '1';
        slider.value = String(windowTints[config.levelProperty]);
        slider.id = `settings-window-tint-${type}-lightness-${id}`;
        slider.setAttribute('aria-label', config.levelLabel);
        slider.dataset.tintType = type;
        const heading = el('div', 'settings-tint-lightness-heading');
        const label = el('label', '', config.levelLabel);
        label.htmlFor = slider.id;
        const value = el('output', 'settings-tint-lightness-value', `${windowTints[config.levelProperty]}%`);
        value.htmlFor = slider.id;
        heading.append(label, value);
        const control = el('div', 'settings-tint-lightness-control');
        control.append(heading, slider);
        slider.addEventListener('input', () => {
          windowTints[config.levelProperty] = Number(slider.value);
          value.textContent = `${slider.value}%`;
          for (const option of config.choices) {
            const swatch = config.options.querySelector(`[data-tint-value="${option.value}"] .settings-tint-swatch`);
            if (swatch) swatch.style.backgroundColor = config.color(option);
          }
          previewTints();
        });
        slider.addEventListener('change', () => {
            const restoreFocus = document.activeElement === slider || slider.parentElement?.matches(':focus-within');
          cancelTintPreview();
          try {
            if (settings?.setWindowTints) settings.setWindowTints(windowTints);
            else settings?.previewWindowTints?.(windowTints);
            current = snapshot();
            if (restoreFocus) requestAnimationFrame(() => {
              const restoredControl = page.querySelector(`.settings-tint-slider[data-tint-type="${type}"]`);
              (restoredControl?.parentElement || restoredControl)?.focus({ preventScroll: true });
            });
          } catch (error) {
            setMessage(page.querySelector('.settings-inline-status'), error?.message || 'The window tint could not be changed.', 'error');
          }
        });
        config.group.append(control);
      }

      const resetTints = el('button', 'settings-tint-reset');
      resetTints.type = 'button';
      resetTints.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.2 9a6.9 6.9 0 1 1 .8 4.6M3 3.8v4.7h4.7"/></svg><span>Reset to defaults</span>';
      const opacitySlider = document.createElement('input');
      opacitySlider.className = 'settings-tint-slider';
      opacitySlider.type = 'range';
      opacitySlider.min = '0';
      opacitySlider.max = '100';
      opacitySlider.step = '1';
      opacitySlider.value = String(windowTints.backgroundOpacity);
      opacitySlider.id = `settings-window-background-opacity-${id}`;
      opacitySlider.setAttribute('aria-label', 'Window background opacity');
      const opacityHeading = el('div', 'settings-tint-lightness-heading');
      const opacityLabel = el('label', '', 'Window background opacity');
      opacityLabel.htmlFor = opacitySlider.id;
      const opacityValue = el('output', 'settings-tint-lightness-value', `${windowTints.backgroundOpacity}%`);
      opacityValue.htmlFor = opacitySlider.id;
      opacityHeading.append(opacityLabel, opacityValue);
      const opacityControl = el('div', 'settings-tint-lightness-control');
      opacityControl.append(opacityHeading, opacitySlider);
      const opacityDescription = el(
        'p',
        'settings-description settings-tint-help',
        'Adjust how much of the desktop shows through the window background.',
      );
      opacitySlider.addEventListener('input', () => {
        windowTints.backgroundOpacity = Number(opacitySlider.value);
        opacityValue.textContent = `${opacitySlider.value}%`;
        previewTints();
      });
      opacitySlider.addEventListener('change', () => {
        const restoreFocus = document.activeElement === opacitySlider || opacitySlider.parentElement?.matches(':focus-within');
        cancelTintPreview();
        try {
          if (settings?.setWindowTints) settings.setWindowTints(windowTints);
          else settings?.previewWindowTints?.(windowTints);
          current = snapshot();
          if (restoreFocus) requestAnimationFrame(() => {
            const restoredControl = page.querySelector('.settings-tint-slider[aria-label="Window background opacity"]');
            (restoredControl?.parentElement || restoredControl)?.focus({ preventScroll: true });
          });
        } catch (error) {
          setMessage(page.querySelector('.settings-inline-status'), error?.message || 'The window opacity could not be changed.', 'error');
        }
      });

      const topbarSection = el('section', 'settings-topbar-tints');
      topbarSection.append(
        el('h3', '', 'Top bar tinting'),
        el('p', 'settings-description settings-window-tint-description',
          'Choose whether the top bar follows the window theme or uses its own colors.'),
      );
      const topbarModeLabel = el('label', 'settings-topbar-mode-label', 'Top bar appearance');
      const topbarMode = document.createElement('select');
      topbarMode.className = 'util-select settings-topbar-mode';
      topbarMode.id = `settings-topbar-mode-${id}`;
      for (const [value, label] of TOPBAR_TINT_MODES) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        topbarMode.append(option);
      }
      topbarMode.value = windowTints.topbar.mode;
      topbarModeLabel.append(topbarMode);
      topbarSection.append(topbarModeLabel);
      enhanceSelect(topbarMode);
      const topbarOpacity = document.createElement('input');
      topbarOpacity.className = 'settings-tint-slider settings-topbar-opacity-slider';
      topbarOpacity.type = 'range';
      topbarOpacity.min = '0';
      topbarOpacity.max = '100';
      topbarOpacity.step = '1';
      topbarOpacity.id = `settings-topbar-background-opacity-${id}`;
      topbarOpacity.setAttribute('aria-label', 'Top bar background opacity');
      const topbarModeTheme = windowTints.topbar.mode === 'reverse-window'
        ? (current.theme === 'dark' ? 'light' : 'dark')
        : (windowTints.topbar.mode === 'dark' || windowTints.topbar.mode === 'custom-dark'
          ? 'dark'
          : windowTints.topbar.mode === 'light' || windowTints.topbar.mode === 'custom-light'
            ? 'light'
            : current.theme);
      const topbarOpacityFallback = topbarModeTheme === 'dark' ? 78 : 82;
      topbarOpacity.value = String(windowTints.topbar.backgroundOpacity ?? topbarOpacityFallback);
      const topbarOpacityHeading = el('div', 'settings-tint-lightness-heading');
      const topbarOpacityLabel = el('label', '', 'Background opacity');
      topbarOpacityLabel.htmlFor = topbarOpacity.id;
      const topbarOpacityValue = el('output', 'settings-tint-lightness-value', `${topbarOpacity.value}%`);
      topbarOpacityValue.htmlFor = topbarOpacity.id;
      topbarOpacityHeading.append(topbarOpacityLabel, topbarOpacityValue);
      const topbarOpacityControl = el('div', 'settings-tint-lightness-control');
      topbarOpacityControl.append(topbarOpacityHeading, topbarOpacity);
      topbarSection.append(
        el('p', 'settings-description settings-tint-help', 'Adjust the transparency of the top bar background.'),
        topbarOpacityControl,
      );

      const topbarCustomConfig = {
        'custom-dark': {
          title: 'Custom dark top bar',
          backgroundKey: 'darkBackground',
          foregroundKey: 'darkForeground',
          backgroundAppearance: 'dark',
          foregroundAppearance: 'light',
        },
        'custom-light': {
          title: 'Custom light top bar',
          backgroundKey: 'lightBackground',
          foregroundKey: 'lightForeground',
          backgroundAppearance: 'light',
          foregroundAppearance: 'dark',
        },
      };
      const topbarCustomPanels = new Map();
      const updateTopbarPreview = () => {
        cancelTintPreview();
        tintPreviewTimer = window.setTimeout(() => {
          tintPreviewTimer = 0;
          settings?.previewWindowTints?.(windowTints);
        }, 70);
      };
      const persistTopbarTints = () => {
        try {
          cancelTintPreview();
          settings?.setWindowTints?.(windowTints);
          current = snapshot();
        } catch (error) {
          setMessage(page.querySelector('.settings-inline-status'), error?.message || 'The top bar tint could not be changed.', 'error');
        }
      };
      topbarOpacity.addEventListener('input', () => {
        windowTints.topbar.backgroundOpacity = Number(topbarOpacity.value);
        topbarOpacityValue.textContent = `${topbarOpacity.value}%`;
        updateTopbarPreview();
      });
      topbarOpacity.addEventListener('change', () => {
        const restoreFocus = document.activeElement === topbarOpacity;
        persistTopbarTints();
        if (restoreFocus) requestAnimationFrame(() => {
          page.querySelector('.settings-topbar-opacity-slider')?.focus({ preventScroll: true });
        });
      });
      const buildTopbarTintGroup = (appearance, role, property) => {
        const isDark = appearance === 'dark';
        const group = el('div', 'settings-tint-group settings-topbar-tint-group');
        const title = `${appearance === 'dark' ? 'Dark' : 'Light'} top bar ${role}`;
        group.append(el('h4', '', role[0].toUpperCase() + role.slice(1)));
        const options = el('div', 'settings-tint-options');
        options.setAttribute('role', 'group');
        options.setAttribute('aria-label', `${title} tint`);
        const choices = isDark ? WINDOW_DARK_TINT_OPTIONS : WINDOW_LIGHT_TINT_OPTIONS;
        const record = windowTints.topbar[property];
        const colorFor = option => option.value === 'none'
          ? `oklch(${record.lightness}% 0 0)`
          : `oklch(${record.lightness}% ${isDark ? '0.0645' : '0.0622'} ${option.hue})`;
        for (const option of choices) {
          const button = el('button', 'settings-tint-choice');
          button.type = 'button';
          button.setAttribute('aria-label', `${option.label} ${title} tint`);
          button.setAttribute('aria-pressed', String(record.tint === option.value));
          button.dataset.tintValue = option.value;
          const swatch = el('span', `settings-tint-swatch settings-tint-swatch-${appearance}`);
          swatch.style.backgroundColor = colorFor(option);
          swatch.setAttribute('aria-hidden', 'true');
          button.append(swatch, el('span', 'settings-tint-label', option.label));
          button.addEventListener('click', () => {
            record.tint = option.value;
            const min = isDark ? (option.value === 'none' ? 0 : 5) : 75;
            const max = isDark ? 25 : (option.value === 'none' ? 100 : 95);
            record.lightness = Math.max(min, Math.min(max, record.lightness));
            slider.min = String(min);
            slider.max = String(max);
            slider.value = String(record.lightness);
            value.textContent = `${record.lightness}%`;
            for (const choice of choices) {
              const choiceButton = options.querySelector(`[data-tint-value="${choice.value}"]`);
              choiceButton?.setAttribute('aria-pressed', String(choice.value === option.value));
              const choiceSwatch = choiceButton?.querySelector('.settings-tint-swatch');
              if (choiceSwatch) choiceSwatch.style.backgroundColor = colorFor(choice);
            }
            persistTopbarTints();
          });
          options.append(button);
        }

        const help = isDark
          ? (role === 'background'
            ? 'Use 5% to 25% lightness for colors, or 0% to 25% for None.'
            : 'Use 75% to 95% lightness for colors, or 75% to 100% for None.')
          : (role === 'background'
            ? 'Use 75% to 95% lightness for colors, or 75% to 100% for None.'
            : 'Use 5% to 25% lightness for colors, or 0% to 25% for None.');
        group.append(options, el('p', 'settings-description settings-tint-help', help));
        const slider = document.createElement('input');
        slider.className = 'settings-tint-slider settings-topbar-tint-slider';
        slider.type = 'range';
        slider.min = String(isDark ? (record.tint === 'none' ? 0 : 5) : 75);
        slider.max = String(isDark ? 25 : (record.tint === 'none' ? 100 : 95));
        slider.step = '1';
        slider.value = String(record.lightness);
        slider.id = `settings-topbar-${property}-lightness-${id}`;
        slider.dataset.tintKey = property;
        slider.setAttribute('aria-label', `${title} lightness`);
        const heading = el('div', 'settings-tint-lightness-heading');
        const label = el('label', '', `${role[0].toUpperCase() + role.slice(1)} lightness`);
        label.htmlFor = slider.id;
        const value = el('output', 'settings-tint-lightness-value', `${record.lightness}%`);
        value.htmlFor = slider.id;
        heading.append(label, value);
        const control = el('div', 'settings-tint-lightness-control');
        control.append(heading, slider);
        slider.addEventListener('input', () => {
          record.lightness = Number(slider.value);
          value.textContent = `${slider.value}%`;
          for (const option of choices) {
            const swatch = options.querySelector(`[data-tint-value="${option.value}"] .settings-tint-swatch`);
            if (swatch) swatch.style.backgroundColor = colorFor(option);
          }
          updateTopbarPreview();
        });
        slider.addEventListener('change', () => {
          const restoreFocus = document.activeElement === slider;
          persistTopbarTints();
          if (restoreFocus) requestAnimationFrame(() => {
            page.querySelector(`.settings-topbar-tint-slider[data-tint-key="${property}"]`)?.focus({ preventScroll: true });
          });
        });
        group.append(control);
        return group;
      };
      for (const [mode, config] of Object.entries(topbarCustomConfig)) {
        const panel = el('div', 'settings-topbar-custom-panel');
        panel.hidden = windowTints.topbar.mode !== mode;
        panel.append(
          el('h4', '', config.title),
          buildTopbarTintGroup(config.backgroundAppearance, 'background', config.backgroundKey),
          buildTopbarTintGroup(config.foregroundAppearance, 'foreground', config.foregroundKey),
        );
        topbarCustomPanels.set(mode, panel);
        topbarSection.append(panel);
      }
      topbarMode.addEventListener('change', () => {
        windowTints.topbar.mode = topbarMode.value;
        for (const [mode, panel] of topbarCustomPanels) panel.hidden = mode !== topbarMode.value;
        persistTopbarTints();
      });

      resetTints.disabled = windowTints.darkTint === DEFAULT_WINDOW_TINTS.darkTint
        && windowTints.darkLightness === DEFAULT_WINDOW_TINTS.darkLightness
        && windowTints.lightTint === DEFAULT_WINDOW_TINTS.lightTint
        && windowTints.lightLightness === DEFAULT_WINDOW_TINTS.lightLightness
        && windowTints.backgroundOpacity === DEFAULT_WINDOW_TINTS.backgroundOpacity
        && JSON.stringify(windowTints.topbar) === JSON.stringify(DEFAULT_WINDOW_TINTS.topbar);
      resetTints.addEventListener('click', () => {
        try {
          cancelTintPreview();
          settings?.setWindowTints?.(DEFAULT_WINDOW_TINTS);
          current = snapshot();
        } catch (error) {
          setMessage(page.querySelector('.settings-inline-status'), error?.message || 'The window tints could not be reset.', 'error');
        }
      });
      windowTintSection.append(
        darkGroup,
        lightGroup,
        opacityDescription,
        opacityControl,
        topbarSection,
        wrapAppButton(resetTints),
      );
    } else {
      windowTintSection.append(el('p', 'settings-description', 'Window tint choices require a browser that supports CSS relative colors.'));
    }
    card.append(windowTintSection);
    const status = el('p', 'settings-inline-status');
    status.setAttribute('role', 'status');
    status.hidden = true;
    card.append(status);
    const note = el('div', 'settings-note');
    note.append(el('span', 'settings-note-dot', 'NOW'), el('span', '', `Currently using ${current.theme === 'dark' ? 'dark' : 'light'} appearance.`));
    card.append(note);
    body.append(card);

    const animationPreferences = current.animationPreferences || {};
    const animationCard = el('section', 'settings-card settings-animations-card');
    animationCard.append(
      el('span', 'settings-card-eyebrow', 'WINDOW'),
      el('h2', '', 'Animations'),
    );
    const animationRows = el('div', 'settings-animation-rows');
    for (const [event, config] of Object.entries(ANIMATION_OPTIONS)) {
      const row = el('div', 'settings-animation-row');
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
    copy.append(el('span', 'settings-card-eyebrow', 'SYSTEM'), el('h2', '', 'System notifications'), el('p', 'settings-description', 'Allow reminder alerts to appear outside the desktop while this page is open.'));
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

    const preferencesCard = el('section', 'settings-card settings-notification-preferences');
    preferencesCard.append(
      el('span', 'settings-card-eyebrow', 'NOTIFICATION CENTER'),
      el('h2', '', 'Notification types'),
      el('p', 'settings-description', 'Choose which notifications appear in the panel and how long read or dismissed items are kept.'),
    );
    const categoryList = el('div', 'settings-notification-category-list');
    for (const category of NOTIFICATION_CATEGORIES) {
      const row = el('div', 'settings-notification-category');
      const detail = el('div', 'settings-notification-category-copy');
      detail.append(
        el('strong', '', category.title),
        el('small', '', category.description),
      );
      const categoryControl = document.createElement('label');
      categoryControl.className = 'settings-switch';
      const categoryInput = document.createElement('input');
      categoryInput.type = 'checkbox';
      categoryInput.dataset.notificationCategory = category.type;
      categoryInput.checked = notificationPreferences?.enabledTypes?.[category.type] !== false;
      categoryInput.disabled = notificationPreferencesLoading || !notificationPreferences;
      categoryInput.setAttribute('aria-label', `Show ${category.title} in the notification center`);
      const categoryTrack = el('span', 'settings-switch-track');
      categoryTrack.setAttribute('aria-hidden', 'true');
      categoryControl.append(categoryInput, categoryTrack);
      categoryInput.addEventListener('change', async () => {
        const requested = categoryInput.checked;
        categoryInput.disabled = true;
        setMessage(preferenceStatus, 'Saving notification preference…');
        try {
          if (typeof settings?.setNotificationCategoryEnabled !== 'function') {
            throw new Error('Notification preferences are not available right now.');
          }
          notificationPreferences = await settings.setNotificationCategoryEnabled(category.type, requested);
          notificationPreferencesError = '';
          setMessage(preferenceStatus, `${category.title} are ${requested ? 'shown' : 'hidden'} in the notification center.`, 'success');
        } catch (error) {
          try {
            notificationPreferences = await settings?.getNotificationPreferences?.() || notificationPreferences;
          } catch { /* Keep the last known value if the preference cannot be read. */ }
          categoryInput.checked = notificationPreferences?.enabledTypes?.[category.type] !== false;
          setMessage(preferenceStatus, error?.message || 'The notification preference could not be saved.', 'error');
        } finally {
          if (categoryInput.isConnected) categoryInput.disabled = false;
        }
      });
      row.append(detail, categoryControl);
      categoryList.append(row);
    }
    preferencesCard.append(categoryList);

    const retentionRow = el('div', 'settings-notification-retention-row');
    const retentionLabel = el('label', '', 'Keep read or dismissed notifications for');
    const retentionSelect = document.createElement('select');
    retentionSelect.className = 'util-select settings-notification-retention-select';
    retentionSelect.dataset.notificationRetention = '';
    retentionSelect.id = `settings-notification-retention-${id}`;
    retentionSelect.setAttribute('aria-label', 'Keep read or dismissed notifications for');
    retentionSelect.disabled = notificationPreferencesLoading || !notificationPreferences;
    for (const [value, label] of NOTIFICATION_RETENTION_OPTIONS) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      retentionSelect.append(option);
    }
    retentionSelect.value = String(notificationPreferences?.retentionDays ?? 90);
    retentionLabel.htmlFor = retentionSelect.id;
    retentionRow.append(retentionLabel, retentionSelect);
    preferencesCard.append(retentionRow);
    const retentionNote = el('p', 'settings-description settings-notification-retention-note', 'Older read or dismissed items are removed automatically.');
    preferencesCard.append(retentionNote);

    const preferenceStatus = el('p', 'settings-inline-status settings-notification-status');
    preferenceStatus.setAttribute('role', 'status');
    preferenceStatus.setAttribute('aria-live', 'polite');
    preferenceStatus.hidden = true;
    preferencesCard.append(preferenceStatus);
    if (notificationPreferencesLoading) {
      setMessage(preferenceStatus, 'Loading notification preferences…');
    } else if (notificationPreferencesError) {
      setMessage(preferenceStatus, notificationPreferencesError, 'error');
    }
    retentionSelect.addEventListener('change', async () => {
      const days = Number(retentionSelect.value);
      retentionSelect.disabled = true;
      setMessage(preferenceStatus, 'Saving retention preference…');
      try {
        if (typeof settings?.setNotificationRetentionDays !== 'function') {
          throw new Error('Notification preferences are not available right now.');
        }
        notificationPreferences = await settings.setNotificationRetentionDays(days);
        notificationPreferencesError = '';
        const label = NOTIFICATION_RETENTION_OPTIONS.find(([value]) => Number(value) === days)?.[1] || 'Forever';
        setMessage(preferenceStatus, `Notification history will be kept for ${label.toLowerCase()}.`, 'success');
      } catch (error) {
        try {
          notificationPreferences = await settings?.getNotificationPreferences?.() || notificationPreferences;
        } catch { /* Keep the last known value if the preference cannot be read. */ }
        retentionSelect.value = String(notificationPreferences?.retentionDays ?? 90);
        setMessage(preferenceStatus, error?.message || 'The retention preference could not be saved.', 'error');
      } finally {
        if (retentionSelect.isConnected) retentionSelect.disabled = false;
      }
    });
    if (notificationPreferences) enhanceSelect(retentionSelect);
    body.append(preferencesCard);
    if (notificationPreferencesError) {
      const retry = el('button', 'util-action settings-notification-retry', 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', () => {
        notificationPreferencesError = '';
        void loadNotificationPreferences();
        renderPage();
      });
      preferencesCard.append(retry);
    }
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
        const name = el('span', 'settings-wallpaper-name', file.displayName || file.title || `Wallpaper ${index + 1}`);
        label.append(input, image, name);
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
        actions.append(
          wrapAppButton(up, { size: 'compact' }),
          wrapAppButton(down, { size: 'compact' }),
        );
        row.append(number, thumb, title, actions);
        order.append(row);
      });
      if (!orderedFiles.length) order.append(el('li', 'settings-cycle-empty', 'Select at least one image to build a cycle.'));
      modeCard.append(order);
    }
    const scheduleCard = el('section', 'settings-card settings-control-card');
    scheduleCard.append(el('span', 'settings-card-eyebrow', 'SCHEDULE'), el('h2', '', 'Change wallpaper'));
    const scheduleOptions = el('div', 'settings-choice-list');
    scheduleOptions.setAttribute('role', 'group');
    scheduleOptions.setAttribute('aria-label', 'Wallpaper schedule');
    const chooseSchedule = value => {
      wallpaperDraft.rotation = value;
      queueWallpaperUpdate();
    };
    scheduleOptions.append(makeChoiceButton(
      'visit', 'On each visit', 'Choose when you return',
      wallpaperDraft.rotation === 'visit', chooseSchedule, !canRotate,
    ));
    const timerOption = el('div', `settings-timer-option${wallpaperDraft.rotation === 'interval' ? ' is-selected' : ''}`);
    const timerButton = makeChoiceButton(
      'interval', 'On a timer', 'Rotate while you are here',
      wallpaperDraft.rotation === 'interval', chooseSchedule, !canRotate,
    );
    timerButton.classList.add('settings-timer-choice');
    timerOption.append(timerButton);
    const intervalSelect = document.createElement('select');
    intervalSelect.className = 'util-field settings-select settings-interval-select';
    intervalSelect.setAttribute('aria-label', 'Wallpaper change interval');
    intervalSelect.disabled = !canRotate || wallpaperDraft.rotation !== 'interval';
    for (const [minutes, label] of [
      [1, '1 minute'],
      [5, '5 minutes'],
      [15, '15 minutes'],
      [30, '30 minutes'],
      [60, '1 hour'],
      [360, '6 hours'],
      [1440, '1 day'],
    ]) {
      const option = document.createElement('option');
      option.value = String(minutes);
      option.textContent = label;
      option.selected = Number(wallpaperDraft.intervalMinutes) === minutes;
      intervalSelect.append(option);
    }
    intervalSelect.addEventListener('change', () => {
      wallpaperDraft.intervalMinutes = Number(intervalSelect.value);
      queueWallpaperUpdate();
    });
    timerOption.append(intervalSelect);
    scheduleOptions.append(timerOption);
    scheduleCard.append(scheduleOptions);
    const transitionPicker = animationPicker.createPicker({
      id: 'wallpaper-transition',
      label: 'Wallpaper transition',
      description: 'Choose one or more transitions. When several are selected, one is chosen at random.',
      choices: WALLPAPER_TRANSITIONS,
      selected: wallpaperDraft.transition,
      onChange: selected => { wallpaperDraft.transition = selected; queueWallpaperUpdate(); },
    });
    transitionPicker.classList.add('settings-wallpaper-transition');
    scheduleCard.append(transitionPicker);
    controlGrid.append(modeCard, scheduleCard);
    body.append(controlGrid);
    enhanceSelect(intervalSelect);

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
    footer.append(wrapAppButton(defaultButton), footerStatus);
    if (wallpaperFailedAction) {
      const retry = el('button', 'util-action settings-wallpaper-retry', 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', () => queueWallpaperAction(wallpaperFailedAction));
      footer.append(wrapAppButton(retry));
    }
    body.append(footer);
  }

  function makeChoiceGroup(label, choices, selected, onChange, disabled = false) {
    const group = el('div', 'settings-choice-list');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    for (const [value, title, description] of choices) {
      group.append(makeChoiceButton(value, title, description, value === selected, onChange, disabled));
    }
    return group;
  }

  function makeChoiceButton(value, title, description, selected, onChange, disabled = false) {
    const button = el('button', 'settings-choice-option');
    button.type = 'button';
    button.disabled = disabled;
    button.setAttribute('aria-pressed', String(selected));
    button.append(el('span', 'settings-choice-radio'), el('span', 'settings-choice-copy'));
    button.querySelector('.settings-choice-copy').append(el('strong', '', title), el('small', '', description));
    button.addEventListener('click', () => onChange(value));
    return button;
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
    if (activePage === 'appearance' && !animationPicker.isOpen) renderPage({ preserveScroll: true });
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

  window.addEventListener('desktop-notification-preferences-change', handleNotificationPreferencesChange);
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
        window.removeEventListener('desktop-notification-preferences-change', handleNotificationPreferencesChange);
        resizeObserver?.disconnect();
        window.removeEventListener('resize', onResize);
        if (ctx.appApis[id]?.destroy) delete ctx.appApis[id];
      },
    };
  }
  return root;
}
