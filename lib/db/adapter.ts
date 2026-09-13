export interface QueryExecutionResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

/**
 * Every backend (SQLite for local demo, Postgres for real use) implements
 * this interface. The healing loop and API route depend only on this —
 * swapping backends is a one-line change in lib/db/index.ts.
 */
export interface DbAdapter {
  /** Human-readable schema description fed to the LLM as grounding context. */
  getSchemaDescription(): Promise<string>;

  /**
   * Executes SQL in a sandbox. Writes must be rolled back unconditionally -
   * this is a hard requirement for every adapter, not an implementation detail.
   * Must enforce a statement timeout so a runaway query can't hang the process.
   */
  runSandboxed(sql: string): Promise<QueryExecutionResult>;

  /** Cleanly closes any open connections/pools. Call on process shutdown. */
  close(): Promise<void>;
}
