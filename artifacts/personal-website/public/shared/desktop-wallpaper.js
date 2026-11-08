'use strict';

const WALLPAPER_KEY = 'desktop-wallpaper-settings-v1';
const WALLPAPER_INTERVALS = [1, 5, 15, 30, 60, 360, 1440];
const WALLPAPER_TRANSITION_EFFECTS = ['fade', 'zoom', 'slide-left', 'slide-right', 'wipe'];
const WALLPAPER_FADE_MS = 650;

export function createDesktopWallpaperController({
  document,
  window,
  readJSON,
  writeJSON,
  ensureManifest,
  hasManifestError,
  normalizeAnimationChoices,
  chooseAnimation,
  notifySettingsChanged,
}) {
  let wallpaperFiles = [];
  let wallpaperTimer = 0;
  let appliedWallpaperUrl = '';
  let wallpaperTransitionToken = 0;
  let wallpaperTransitionLayer = null;
  let initialized = false;
  let initializationPromise = null;
  const wallpaperPreloads = new Map();

  function readWallpaperSettings() {
    const stored = readJSON(WALLPAPER_KEY, {}, {
      validate: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
    });
    const transition = normalizeAnimationChoices(stored.transition, WALLPAPER_TRANSITION_EFFECTS, ['fade']);
    return {
      selected: Array.isArray(stored.selected) ? stored.selected.filter(url => typeof url === 'string') : [],
      mode: stored.mode === 'cycle' ? 'cycle' : 'random',
      rotation: stored.rotation === 'interval' ? 'interval' : 'visit',
      intervalMinutes: WALLPAPER_INTERVALS.includes(Number(stored.intervalMinutes))
        ? Number(stored.intervalMinutes)
        : 60,
      transition,
      currentUrl: typeof stored.currentUrl === 'string' ? stored.currentUrl : '',
      nextUrl: typeof stored.nextUrl === 'string' ? stored.nextUrl : '',
      nextChangeAt: Number.isFinite(stored.nextChangeAt) ? stored.nextChangeAt : 0,
    };
  }

  let wallpaperSettings = readWallpaperSettings();

  function saveWallpaperSettings() {
    writeJSON(WALLPAPER_KEY, wallpaperSettings, {
      validate: value => Boolean(value && Array.isArray(value.selected) && Array.isArray(value.transition)),
    });
  }

  function wallpaperAbsoluteUrl(url) {
    return new URL(url, window.location.href).href;
  }

  function preloadWallpaper(url) {
    if (!url) return Promise.resolve();
    const absoluteUrl = wallpaperAbsoluteUrl(url);
    if (wallpaperPreloads.has(absoluteUrl)) return wallpaperPreloads.get(absoluteUrl);
    const image = new window.Image();
    image.decoding = 'async';
    const loaded = new Promise((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => reject(new Error('The selected wallpaper could not be loaded.')), { once: true });
      image.src = absoluteUrl;
      if (image.complete) {
        if (image.naturalWidth > 0) resolve();
        else reject(new Error('The selected wallpaper could not be loaded.'));
      }
      if (typeof image.decode === 'function') {
        image.decode().then(resolve, () => {
          if (image.complete && image.naturalWidth > 0) resolve();
        });
      }
    });
    wallpaperPreloads.set(absoluteUrl, loaded);
    loaded.catch(() => wallpaperPreloads.delete(absoluteUrl));
    return loaded;
  }

  function backgroundLayersFor(url) {
    return [
      'repeating-linear-gradient(to right, transparent 0, transparent 2px, #0004 2px, #0004 4px)',
      'repeating-linear-gradient(to bottom, transparent 0, transparent 2px, #0004 2px, #0004 4px)',
      'repeating-radial-gradient(transparent 0, transparent 3px, #0001 3px, #0001 6px)',
      `url(${JSON.stringify(url)})`,
    ].join(', ');
  }

  async function setDesktopWallpaper(url, transition = 'none') {
    const token = ++wallpaperTransitionToken;
    if (wallpaperTransitionLayer) {
      wallpaperTransitionLayer.remove();
      wallpaperTransitionLayer = null;
    }
    if (!url) {
      document.body.style.removeProperty('--desktop-wallpaper-image');
      appliedWallpaperUrl = '';
      return;
    }

    const absoluteUrl = wallpaperAbsoluteUrl(url);
    await preloadWallpaper(absoluteUrl);
    if (token !== wallpaperTransitionToken) return;
    if (appliedWallpaperUrl === absoluteUrl) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const effects = normalizeAnimationChoices(transition, WALLPAPER_TRANSITION_EFFECTS, ['fade']);
    const effect = chooseAnimation(effects);
    if (effect !== 'none' && !reduceMotion) {
      const layer = document.createElement('div');
      layer.className = 'desktop-wallpaper-transition';
      layer.dataset.transition = effect;
      layer.style.backgroundImage = backgroundLayersFor(absoluteUrl);
      layer.style.transitionDuration = `${WALLPAPER_FADE_MS}ms`;
      wallpaperTransitionLayer = layer;
      document.body.append(layer);
      await new Promise(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        layer.addEventListener('transitionend', finish, { once: true });
        window.setTimeout(finish, WALLPAPER_FADE_MS + 100);
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          if (token === wallpaperTransitionToken) layer.classList.add('is-visible');
          else finish();
        }));
      });
      if (token !== wallpaperTransitionToken) {
        layer.remove();
        return;
      }
      document.body.style.setProperty('--desktop-wallpaper-image', `url(${JSON.stringify(absoluteUrl)})`);
      layer.remove();
      wallpaperTransitionLayer = null;
    } else {
      document.body.style.setProperty('--desktop-wallpaper-image', `url(${JSON.stringify(absoluteUrl)})`);
    }
    appliedWallpaperUrl = absoluteUrl;
  }

  function pickNextWallpaper(settings) {
    const { selected } = settings;
    if (!selected.length) return '';
    if (selected.length === 1) return selected[0];
    if (settings.mode === 'cycle') {
      const currentIndex = selected.indexOf(settings.currentUrl);
      return selected[(currentIndex + 1 + selected.length) % selected.length];
    }
    const choices = selected.filter(url => url !== settings.currentUrl);
    return choices[Math.floor(Math.random() * choices.length)];
  }

  function queueNextWallpaper() {
    if (wallpaperSettings.rotation !== 'interval' ||
        wallpaperSettings.selected.length < 2 ||
        !wallpaperSettings.currentUrl) {
      wallpaperSettings.nextUrl = '';
      return;
    }
    if (!wallpaperSettings.selected.includes(wallpaperSettings.nextUrl) ||
        wallpaperSettings.nextUrl === wallpaperSettings.currentUrl) {
      wallpaperSettings.nextUrl = pickNextWallpaper(wallpaperSettings);
    }
    void preloadWallpaper(wallpaperSettings.nextUrl).catch(error => {
      console.warn('[wallpaper] Could not preload the next image.', error);
    });
  }

  async function applyNextWallpaper({ transition = 'none', persist = true } = {}) {
    window.clearTimeout(wallpaperTimer);
    wallpaperTimer = 0;
    wallpaperSettings.selected = wallpaperSettings.selected.filter(url =>
      wallpaperFiles.some(file => file.isWallpaper && file.url === url));
    if (!wallpaperSettings.selected.length) {
      wallpaperSettings.currentUrl = '';
      wallpaperSettings.nextUrl = '';
      wallpaperSettings.nextChangeAt = 0;
      await setDesktopWallpaper('');
      if (persist) saveWallpaperSettings();
      return;
    }
    const nextUrl = pickNextWallpaper(wallpaperSettings);
    try {
      await setDesktopWallpaper(nextUrl, transition);
    } catch (error) {
      console.warn('[wallpaper] Could not apply the selected image.', error);
      return;
    }
    wallpaperSettings.currentUrl = nextUrl;
    wallpaperSettings.nextChangeAt = wallpaperSettings.rotation === 'interval'
      ? Date.now() + wallpaperSettings.intervalMinutes * 60_000
      : 0;
    wallpaperSettings.nextUrl = '';
    queueNextWallpaper();
    if (persist) saveWallpaperSettings();
    scheduleWallpaperChange();
  }

  function scheduleWallpaperChange() {
    window.clearTimeout(wallpaperTimer);
    wallpaperTimer = 0;
    if (
      wallpaperSettings.rotation !== 'interval' ||
      wallpaperSettings.selected.length < 2 ||
      !wallpaperSettings.currentUrl
    ) return;
    const delay = Math.max(0, wallpaperSettings.nextChangeAt - Date.now());
    queueNextWallpaper();
    wallpaperTimer = window.setTimeout(rotateWallpaperOnTimer, delay);
  }

  async function readWallpaperManifest() {
    const files = await ensureManifest();
    return {
      files: Array.isArray(files) ? files : [],
      failed: hasManifestError(),
    };
  }

  async function rotateWallpaperOnTimer({ persist = true } = {}) {
    const { files, failed } = await readWallpaperManifest();
    if (failed) {
      wallpaperSettings.nextChangeAt = Date.now() + 60_000;
      if (persist) saveWallpaperSettings();
      scheduleWallpaperChange();
      return;
    }
    wallpaperFiles = files.filter(file => file.type === 'image' && file.isWallpaper);
    wallpaperSettings.selected = wallpaperSettings.selected.filter(url =>
      wallpaperFiles.some(file => file.isWallpaper && file.url === url));
    if (!wallpaperSettings.selected.length) {
      await applyNextWallpaper({ persist });
      return;
    }
    const nextUrl = wallpaperSettings.selected.includes(wallpaperSettings.nextUrl)
      ? wallpaperSettings.nextUrl
      : pickNextWallpaper(wallpaperSettings);
    try {
      await setDesktopWallpaper(nextUrl, wallpaperSettings.transition);
    } catch (error) {
      console.warn('[wallpaper] Could not load the next wallpaper.', error);
      wallpaperSettings.nextChangeAt = Date.now() + 60_000;
      wallpaperSettings.nextUrl = '';
      if (persist) saveWallpaperSettings();
      scheduleWallpaperChange();
      return;
    }
    wallpaperSettings.currentUrl = nextUrl;
    wallpaperSettings.nextUrl = '';
    wallpaperSettings.nextChangeAt = Date.now() + wallpaperSettings.intervalMinutes * 60_000;
    queueNextWallpaper();
    if (persist) saveWallpaperSettings();
    scheduleWallpaperChange();
  }

  async function initialize() {
    if (initialized) return;
    if (initializationPromise) return initializationPromise;
    initializationPromise = (async () => {
      const { files, failed } = await readWallpaperManifest();
      if (failed) {
        if (wallpaperSettings.currentUrl) {
          try { await setDesktopWallpaper(wallpaperSettings.currentUrl, 'none'); }
          catch (error) { console.warn('[wallpaper] The saved wallpaper could not be restored.', error); }
        }
        scheduleWallpaperChange();
        return;
      }
      wallpaperFiles = files.filter(file => file.type === 'image' && file.isWallpaper);
      const validUrls = new Set(wallpaperFiles.map(file => file.url));
      wallpaperSettings.selected = wallpaperSettings.selected.filter(url => validUrls.has(url));
      if (wallpaperSettings.rotation === 'interval' &&
          wallpaperSettings.selected.length > 0 &&
          wallpaperSettings.selected.includes(wallpaperSettings.currentUrl)) {
        if (wallpaperSettings.nextChangeAt > Date.now()) {
          try { await setDesktopWallpaper(wallpaperSettings.currentUrl, 'none'); }
          catch (error) { console.warn('[wallpaper] The saved wallpaper could not be restored.', error); }
          queueNextWallpaper();
          scheduleWallpaperChange();
        } else {
          await rotateWallpaperOnTimer({ persist: false });
        }
      } else {
        await applyNextWallpaper({ transition: 'none', persist: false });
      }
    })().then(() => {
      initialized = true;
    }).finally(() => {
      initializationPromise = null;
    });
    return initializationPromise;
  }

  async function loadForSettings() {
    const { files, failed } = await readWallpaperManifest();
    if (failed) {
      throw new Error('The picture library could not be loaded. Check your connection and try again.');
    }
    wallpaperFiles = files.filter(file => file.type === 'image' && file.isWallpaper);
    const validUrls = new Set(wallpaperFiles.map(file => file.url));
    wallpaperSettings.selected = wallpaperSettings.selected.filter(url => validUrls.has(url));
    if (!validUrls.has(wallpaperSettings.currentUrl)) {
      wallpaperSettings.currentUrl = '';
      wallpaperSettings.nextUrl = '';
    }
    return {
      files: wallpaperFiles.map(file => ({
        url: file.url,
        title: file.title || file.displayName,
        displayName: file.displayName,
      })),
      settings: {
        selected: [...wallpaperSettings.selected],
        mode: wallpaperSettings.mode,
        rotation: wallpaperSettings.rotation,
        intervalMinutes: wallpaperSettings.intervalMinutes,
        transition: wallpaperSettings.transition,
      },
    };
  }

  async function savePreferences(draft) {
    const allowedUrls = new Set(wallpaperFiles.map(file => file.url));
    const selected = [...new Set(Array.isArray(draft?.selected) ? draft.selected : [])]
      .filter(url => allowedUrls.has(url));
    if (!selected.length) throw new Error('Select at least one eligible wallpaper, or use the default random wallpaper.');
    const mode = draft?.mode === 'cycle' ? 'cycle' : 'random';
    const rotation = draft?.rotation === 'interval' ? 'interval' : 'visit';
    const intervalMinutes = WALLPAPER_INTERVALS.includes(Number(draft?.intervalMinutes))
      ? Number(draft.intervalMinutes)
      : 60;
    const transition = normalizeAnimationChoices(draft?.transition, WALLPAPER_TRANSITION_EFFECTS, ['fade']);
    const currentUrl = selected.includes(wallpaperSettings.currentUrl)
      ? wallpaperSettings.currentUrl
      : mode === 'cycle'
        ? selected[0]
        : selected[Math.floor(Math.random() * selected.length)];
    await setDesktopWallpaper(currentUrl, transition);
    wallpaperSettings = {
      selected,
      mode,
      rotation,
      intervalMinutes,
      transition,
      currentUrl,
      nextUrl: '',
      nextChangeAt: rotation === 'interval' && selected.length > 1
        ? Date.now() + intervalMinutes * 60_000
        : 0,
    };
    queueNextWallpaper();
    saveWallpaperSettings();
    scheduleWallpaperChange();
    notifySettingsChanged();
  }

  async function useDefault() {
    window.clearTimeout(wallpaperTimer);
    wallpaperSettings = {
      selected: [],
      mode: 'random',
      rotation: 'visit',
      intervalMinutes: 60,
      transition: ['fade'],
      currentUrl: '',
      nextUrl: '',
      nextChangeAt: 0,
    };
    await setDesktopWallpaper('');
    saveWallpaperSettings();
    notifySettingsChanged();
  }

  return {
    initialize,
    loadForSettings,
    savePreferences,
    useDefault,
  };
}
