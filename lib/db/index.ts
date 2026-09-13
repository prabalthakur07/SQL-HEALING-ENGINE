import { DbAdapter } from './adapter';
import { SqliteAdapter } from './sqliteAdapter';
import { PostgresAdapter } from './postgresAdapter';

let instance: DbAdapter | null = null;

/**
 * Set DB_DRIVER=postgres and DATABASE_URL=... in .env to point this at a
 * real database. Defaults to the bundled SQLite demo database.
 *
 * NOTE: the Postgres adapter always runs inside a READ ONLY transaction
 * that is rolled back (see postgresAdapter.ts) - it does not support writes
 * by design. If you need INSERT/UPDATE/DELETE against a real database,
 * that is a separate, more carefully permissioned code path you'd build
 * on top of this, not a flag you flip here.
 */
export function getDbAdapter(): DbAdapter {
  if (instance) return instance;

  const driver = process.env.DB_DRIVER || 'sqlite';
  instance = driver === 'postgres' ? new PostgresAdapter() : new SqliteAdapter();
  return instance;
}
