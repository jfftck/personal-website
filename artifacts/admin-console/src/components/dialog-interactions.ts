import type { KeyboardEvent } from 'react';

export function handleDialogKeyDown<T extends HTMLElement>(
  event: KeyboardEvent<T>,
  onClose: () => void,
  allowEscape: boolean,
) {
  if (event.key === 'Escape' && allowEscape) {
    event.preventDefault();
    onClose();
    return;
  }

  if (event.key !== 'Tab') return;

  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
    'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hasAttribute('hidden') && element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
