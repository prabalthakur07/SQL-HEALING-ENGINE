import { Pool } from 'pg';
import { DbAdapter, QueryExecutionResult } from './adapter';

const STATEMENT_TIMEOUT_MS = Number(process.env.PG_STATEMENT_TIMEOUT_MS || 5000);

/**
 * Production-oriented adapter. Two things matter more here than in the
 * SQLite demo adapter, because a real Postgres instance can actually hurt you:
 *
 * 1. Every query - including SELECTs - runs inside a transaction that is
 *    always rolled back and marked READ ONLY at the Postgres level. This
 *    means even a bug in the guardrail layer cannot cause a write to persist,
 *    because the database itself refuses writes in that transaction.
 * 2. A statement_timeout is set per-connection so a pathological generated
 *    query (accidental cross join, missing index) can't hang a connection
 *    or degrade the pool for other requests.
 *
 * Strongly recommended: point DATABASE_URL at a role that ONLY has SELECT
 * grants, e.g.:
 *   CREATE ROLE sql_engine_readonly WITH LOGIN PASSWORD '...';
 *   GRANT CONNECT ON DATABASE yourdb TO sql_engine_readonly;
 *   GRANT USAGE ON SCHEMA public TO sql_engine_readonly;
 *   GRANT SELECT ON ALL TABLES IN SCHEMA public TO sql_engine_readonly;
 * The READ ONLY transaction below is defense-in-depth, not a substitute
 * for a properly scoped database role.
 */
export class PostgresAdapter implements DbAdapter {
  private pool: Pool;

  constructor(connectionString: string = process.env.DATABASE_URL || '') {
    if (!connectionString) {
      throw new Error('DATABASE_URL is required to use the Postgres adapter.');
    }
    this.pool = new Pool({ connectionString });
  }

  async getSchemaDescription(): Promise<string> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query(`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `);

      const byTable = new Map<string, string[]>();
      for (const r of rows) {
        const list = byTable.get(r.table_name) || [];
        list.push(`${r.column_name} ${r.data_type}`);
        byTable.set(r.table_name, list);
      }

      let description = '';
      for (const [table, cols] of byTable) {
        description += `TABLE ${table} (${cols.join(', ')})\n`;
      }
      return description.trim();
    } finally {
      client.release();
    }
  }

  async runSandboxed(sql: string): Promise<QueryExecutionResult> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      await client.query('BEGIN TRANSACTION READ ONLY');
      try {
        const result = await client.query(sql);
        return {
          rows: result.rows as Record<string, unknown>[],
          rowCount: result.rowCount ?? result.rows.length,
        };
      } finally {
        // Always roll back - this is a read sandbox, never a persistence path.
        await client.query('ROLLBACK');
      }
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
