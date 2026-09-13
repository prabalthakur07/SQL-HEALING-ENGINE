import { generateSql } from './gemini';
import { getDbAdapter } from './db';
import { checkGuardrails } from './guardrails';
import { logger } from './logger';

export interface Attempt {
  attemptNumber: number;
  sql: string;
  explanation: string;
  status: 'success' | 'guardrail_blocked' | 'execution_error';
  error?: string;
  durationMs: number;
}

export interface HealingResult {
  success: boolean;
  attempts: Attempt[];
  finalSql?: string;
  rows?: unknown[];
  rowCount?: number;
  question: string;
}

const MAX_ATTEMPTS = Number(process.env.MAX_HEALING_ATTEMPTS || 4);

/**
 * The autonomous self-healing loop:
 *   1. Ask the model for SQL (with prior failures as context after attempt 1)
 *   2. Run static guardrails
 *   3. Execute in the sandboxed DB
 *   4. On failure -> capture the EXACT error, loop back to step 1
 *   5. Stop on success, or after MAX_ATTEMPTS with a transparent failure report
 *
 * This never silently "pretends" to succeed - if it exhausts attempts,
 * it returns success: false with the full attempt trail so the caller
 * can see exactly what was tried and why each attempt failed.
 */
export async function runHealingLoop(
  question: string,
  allowWrites = false,
  requestId?: string
): Promise<HealingResult> {
  const adapter = getDbAdapter();
  const schema = await adapter.getSchemaDescription();
  const attempts: Attempt[] = [];
  const history: { attemptSql: string; error: string }[] = [];

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const start = Date.now();
    const { sql, explanation } = await generateSql(question, schema, history);

    const guard = checkGuardrails(sql, allowWrites);
    if (!guard.allowed) {
      const attempt: Attempt = {
        attemptNumber: i,
        sql,
        explanation,
        status: 'guardrail_blocked',
        error: guard.reason,
        durationMs: Date.now() - start,
      };
      attempts.push(attempt);
      history.push({ attemptSql: sql, error: `GUARDRAIL REJECTED: ${guard.reason}` });
      logger.warn('guardrail_blocked', { requestId, attempt: i, sql, reason: guard.reason });
      continue;
    }

    try {
      const { rows, rowCount } = await adapter.runSandboxed(sql);
      attempts.push({
        attemptNumber: i,
        sql,
        explanation,
        status: 'success',
        durationMs: Date.now() - start,
      });
      logger.info('query_succeeded', { requestId, attempts: i, rowCount });
      return { success: true, attempts, finalSql: sql, rows, rowCount, question };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      attempts.push({
        attemptNumber: i,
        sql,
        explanation,
        status: 'execution_error',
        error: message,
        durationMs: Date.now() - start,
      });
      history.push({ attemptSql: sql, error: message });
      logger.warn('execution_error', { requestId, attempt: i, sql, error: message });
      // loop continues -> model sees this exact error on next attempt
    }
  }

  // Exhausted all attempts - fail transparently, never fake success
  logger.error('healing_exhausted', { requestId, question, attempts: attempts.length });
  return { success: false, attempts, question };
}
