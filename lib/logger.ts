type LogLevel = 'info' | 'warn' | 'error';

/**
 * Deliberately dependency-free structured logger. Every line is a single
 * JSON object, so it plugs into any log aggregator (Datadog, CloudWatch,
 * Axiom, etc.) without modification - just point the aggregator at stdout.
 *
 * Swap this file's internals for pino/winston if you want more features
 * (log rotation, pretty-printing locally); the call sites elsewhere in the
 * codebase (`logger.info(...)`) will not need to change.
 */
function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields?: Record<string, unknown>) => log('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => log('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => log('error', event, fields),
};
