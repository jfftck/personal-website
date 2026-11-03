export async function retryWithBackoff(operation, {
  maxRetries = 3,
  initialDelayMs = 400,
  maxDelayMs = 3200,
  shouldRetry = error => error?.retryable !== false && error?.name !== 'AbortError',
  onRetry,
} = {}) {
  let retryCount = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (retryCount >= maxRetries || !shouldRetry(error)) throw error;
      const delayMs = Math.min(initialDelayMs * (2 ** retryCount), maxDelayMs);
      retryCount += 1;
      try { onRetry?.({ attempt: retryCount, maxRetries, delayMs, error }); } catch {}
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

export function responseLoadError(response, resourceName) {
  const error = new Error(`Could not load ${resourceName} (${response.status}).`);
  error.retryable = response.status === 408
    || response.status === 425
    || response.status === 429
    || response.status >= 500;
  return error;
}
