import { retryWithBackoff } from '../../shared/retry.js';

let importAttempt = 0;
let loadPromise = null;

function importNotesData() {
  const url = new URL('../sticky-notes-data.js', import.meta.url);
  if (importAttempt > 0) url.searchParams.set('retry', String(importAttempt));
  importAttempt += 1;
  return import(/* @vite-ignore */ url.href);
}

export function initializePinnedNotes(onLoaded) {
  const status = document.getElementById('desktop-widget-load-status');
  const statusText = document.getElementById('desktop-widget-load-error-text');
  const retryButton = document.getElementById('desktop-widget-retry');

  function load({ announceRetry = false } = {}) {
    if (loadPromise) return loadPromise;
    if (announceRetry) {
      statusText.textContent = 'Retrying pinned desktop notes…';
      status.hidden = false;
    } else {
      status.hidden = true;
    }
    retryButton.disabled = true;
    loadPromise = retryWithBackoff(importNotesData, {
      maxRetries: 2,
      initialDelayMs: 180,
      maxDelayMs: 720,
    }).then(({ loadStickyNotes }) => {
      onLoaded(loadStickyNotes());
      status.hidden = true;
    }).catch(() => {
      statusText.textContent = 'Pinned desktop notes could not be loaded. Select Retry to try again.';
      status.hidden = false;
    }).finally(() => {
      retryButton.disabled = false;
      loadPromise = null;
    });
    return loadPromise;
  }

  retryButton.addEventListener('click', () => { void load({ announceRetry: true }); });
  void load();
}
