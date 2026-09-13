import Database from 'better-sqlite3';
import path from 'path';
import { DbAdapter, QueryExecutionResult } from './adapter';

export class SqliteAdapter implements DbAdapter {
  private db: Database.Database;

  constructor(dbPath: string = path.join(process.cwd(), 'data', 'app.db')) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  async getSchemaDescription(): Promise<string> {
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];

    let description = '';
    for (const { name } of tables) {
      const columns = this.db.prepare(`PRAGMA table_info(${name})`).all() as {
        name: string;
        type: string;
        pk: number;
      }[];
      const colDesc = columns.map((c) => `${c.name} ${c.type}${c.pk ? ' PRIMARY KEY' : ''}`).join(', ');
      description += `TABLE ${name} (${colDesc})\n`;
    }
    return description.trim();
  }

  async runSandboxed(sql: string): Promise<QueryExecutionResult> {
    const trimmed = sql.trim().toUpperCase();
    const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('WITH');

    if (isSelect) {
      const rows = this.db.prepare(sql).all() as Record<string, unknown>[];
      return { rows, rowCount: rows.length };
    }

    this.db.exec('SAVEPOINT sandbox_txn');
    try {
      const info = this.db.prepare(sql).run();
      return { rows: [], rowCount: info.changes };
    } finally {
      this.db.exec('ROLLBACK TO sandbox_txn');
      this.db.exec('RELEASE sandbox_txn');
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
