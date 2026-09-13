/**
 * Static safety checks run BEFORE any SQL touches the database.
 * The sandbox in db.ts is the last line of defense; this is the first.
 * Two independent layers is intentional - defense in depth.
 */

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
  severity?: 'blocked' | 'warning';
}

const DESTRUCTIVE_KEYWORDS = ['DROP', 'TRUNCATE', 'ALTER', 'ATTACH', 'DETACH', 'VACUUM', 'PRAGMA'];

export function checkGuardrails(sql: string, allowWrites: boolean): GuardrailResult {
  const cleaned = sql.trim();
  const upper = cleaned.toUpperCase();

  // Multiple statements (a classic injection / accidental-cascade vector)
  const statementCount = cleaned.split(';').filter((s) => s.trim().length > 0).length;
  if (statementCount > 1) {
    return {
      allowed: false,
      severity: 'blocked',
      reason: 'Multiple SQL statements in one request are not allowed. Submit one statement.',
    };
  }

  // Outright forbidden regardless of mode
  for (const kw of DESTRUCTIVE_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`).test(upper)) {
      return {
        allowed: false,
        severity: 'blocked',
        reason: `Statement contains forbidden keyword "${kw}". Schema-altering operations are never permitted.`,
      };
    }
  }

  const isWrite = /^(INSERT|UPDATE|DELETE)\b/.test(upper);
  if (isWrite && !allowWrites) {
    return {
      allowed: false,
      severity: 'blocked',
      reason: 'Write operations (INSERT/UPDATE/DELETE) are disabled in read-only mode.',
    };
  }

  // UPDATE/DELETE without WHERE is almost always a mistake
  if (/^(UPDATE|DELETE)\b/.test(upper) && !/\bWHERE\b/.test(upper)) {
    return {
      allowed: false,
      severity: 'blocked',
      reason: 'UPDATE/DELETE without a WHERE clause would affect every row. Add a filter.',
    };
  }

  return { allowed: true };
}
