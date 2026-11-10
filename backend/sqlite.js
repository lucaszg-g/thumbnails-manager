import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
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
