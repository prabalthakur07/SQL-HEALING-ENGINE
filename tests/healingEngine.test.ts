import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM call so tests are deterministic and don't spend API credits.
vi.mock('../lib/anthropic', () => ({
  generateSql: vi.fn(),
}));

// Mock the DB adapter so tests don't need a real database file.
const mockRunSandboxed = vi.fn();
vi.mock('../lib/db', () => ({
  getDbAdapter: () => ({
    getSchemaDescription: async () => 'TABLE customers (cust_id INTEGER, full_name TEXT)',
    runSandboxed: mockRunSandboxed,
  }),
}));

import { generateSql } from '../lib/anthropic';
import { runHealingLoop } from '../lib/healingEngine';

describe('runHealingLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('succeeds immediately when the first generated query is valid', async () => {
    (generateSql as any).mockResolvedValueOnce({
      sql: 'SELECT * FROM customers',
      explanation: 'Returns all customers.',
    });
    mockRunSandboxed.mockResolvedValueOnce({ rows: [{ cust_id: 1 }], rowCount: 1 });

    const result = await runHealingLoop('show me all customers');

    expect(result.success).toBe(true);
    expect(result.attempts).toHaveLength(1);
    expect(generateSql).toHaveBeenCalledTimes(1);
  });

  it('heals after a failed first attempt and succeeds on the second', async () => {
    (generateSql as any)
      .mockResolvedValueOnce({ sql: 'SELECT * FROM custmers', explanation: 'typo attempt' })
      .mockResolvedValueOnce({ sql: 'SELECT * FROM customers', explanation: 'fixed table name' });

    mockRunSandboxed
      .mockRejectedValueOnce(new Error('no such table: custmers'))
      .mockResolvedValueOnce({ rows: [{ cust_id: 1 }], rowCount: 1 });

    const result = await runHealingLoop('show me all customers');

    expect(result.success).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].status).toBe('execution_error');
    expect(result.attempts[1].status).toBe('success');

    // The second call must have received the first error as feedback.
    const secondCallArgs = (generateSql as any).mock.calls[1];
    expect(secondCallArgs[2][0].error).toContain('no such table');
  });

  it('gives up and reports failure honestly after exhausting all attempts', async () => {
    (generateSql as any).mockResolvedValue({ sql: 'SELECT broken', explanation: 'still broken' });
    mockRunSandboxed.mockRejectedValue(new Error('syntax error'));

    const result = await runHealingLoop('an impossible question');

    expect(result.success).toBe(false);
    expect(result.attempts.length).toBeGreaterThan(1);
    expect(result.rows).toBeUndefined();
  });

  it('blocks and does not execute a destructive query even if the model generates one', async () => {
    (generateSql as any).mockResolvedValueOnce({
      sql: 'DROP TABLE customers',
      explanation: 'oops',
    });
    (generateSql as any).mockResolvedValue({
      sql: 'SELECT * FROM customers',
      explanation: 'safe fallback',
    });
    mockRunSandboxed.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await runHealingLoop('delete everything');

    expect(result.attempts[0].status).toBe('guardrail_blocked');
    expect(mockRunSandboxed).not.toHaveBeenCalledWith('DROP TABLE customers');
  });
});
