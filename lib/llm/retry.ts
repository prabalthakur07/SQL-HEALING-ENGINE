import { logger } from '../logger';

export async function withTransientRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = /503|429|overloaded|unavailable|rate limit|ECONNRESET|ETIMEDOUT/i.test(message);

      if (!isTransient || attempt === maxRetries) {
        throw err;
      }

      const delay = baseDelayMs * 2 ** attempt;
      logger.warn('transient_provider_error_retrying', {
        label: opts.label,
        attempt: attempt + 1,
        delayMs: delay,
        error: message,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}