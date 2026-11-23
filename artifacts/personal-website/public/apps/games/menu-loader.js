import { retryWithBackoff } from '../../shared/retry.js';

let gameMenuPromise = null;
let prefetchScheduled = false;

export function ensureGameMenu(options) {
  if (!gameMenuPromise) {
    let attempt = 0;
    gameMenuPromise = retryWithBackoff(
      () => {
        const url = new URL('./catalog.js', import.meta.url);
        if (attempt > 0) url.searchParams.set('retry', String(attempt));
        attempt += 1;
        return import(/* @vite-ignore */ url.href);
      },
      { maxRetries: 2, initialDelayMs: 180, maxDelayMs: 720 },
    ).then(({ initGameMenu }) => initGameMenu(
      options.menu,
      options.openGame,
      null,
      options.bindIntentPrefetch,
    )).catch(error => {
      gameMenuPromise = null;
      throw error;
    });
  }
  return gameMenuPromise;
}

export function prefetchGameMenu(options, canPrefetch) {
  if (prefetchScheduled || !canPrefetch()) return;
  prefetchScheduled = true;
  const prefetch = () => {
    if (!canPrefetch()) {
      prefetchScheduled = false;
      return;
    }
    void ensureGameMenu(options).catch(() => {});
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(prefetch, { timeout: 1200 });
  } else {
    window.setTimeout(prefetch, 120);
  }
}
