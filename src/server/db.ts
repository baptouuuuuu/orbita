import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec('CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const [version, file] of [[1, '001_initial.sql'], [2, '002_scenarios.sql']] as const) {
    if (db.prepare('SELECT version FROM migrations WHERE version = ?').get(version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'));
      db.prepare('INSERT INTO migrations VALUES (?, ?)').run(version, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}

export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
