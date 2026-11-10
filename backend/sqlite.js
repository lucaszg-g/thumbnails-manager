import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const name of readdirSync(migrations)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    if (sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get(name)) continue;
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(readFileSync(new URL(name, migrations), 'utf8'));
      sqlite.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    close: () => sqlite.close(),
    prepare(sql) {
      let values = [];
      return {
        bind(...args) {
          values = args.map((v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v));
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...values) || null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...values) };
        },
        async run() {
          const result = sqlite.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
  };
}
