import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Synchronous statements keep each batch in one event-loop turn: no interleaved writes.
export function openDatabase(dataDir, migrationsDir) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const sql = new DatabaseSync(path.join(dataDir, 'ashare.sqlite'));
  sql.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  sql.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');
  for (const name of fs.readdirSync(migrationsDir).filter(x => x.endsWith('.sql')).sort()) {
    if (sql.prepare('SELECT name FROM _local_migrations WHERE name=?').get(name)) continue;
    sql.exec('BEGIN IMMEDIATE');
    try {
      sql.exec(fs.readFileSync(path.join(migrationsDir, name), 'utf8').replaceAll('--> statement-breakpoint', ''));
      sql.prepare('INSERT INTO _local_migrations(name) VALUES(?)').run(name);
      sql.exec('COMMIT');
    } catch (error) { sql.exec('ROLLBACK'); sql.close(); throw error; }
  }
  const statement = (text, args = []) => ({
    bind(...values) { return statement(text, values); },
    first() { return sql.prepare(text).get(...args) || null; },
    all() { return { results: sql.prepare(text).all(...args) }; },
    run() { const result = sql.prepare(text).run(...args); return { meta: { changes: Number(result.changes) } }; }
  });
  return {
    prepare: text => statement(text),
    batch(items) {
      sql.exec('BEGIN IMMEDIATE');
      try { const results = items.map(item => item.run()); sql.exec('COMMIT'); return results; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
    close() { sql.close(); }
  };
}
