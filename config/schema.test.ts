import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

test("schema upgrades legacy restore tables before creating indexes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cloudsave-schema-"));
  const databasePath = path.join(directory, "test.sqlite");
  const legacyDatabase = new Database(databasePath);
  legacyDatabase.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT,
      role TEXT DEFAULT 'User',
      password_hash TEXT NOT NULL
    );
    CREATE TABLE games (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, game_name TEXT NOT NULL);
    CREATE TABLE saves (id INTEGER PRIMARY KEY, game_id INTEGER NOT NULL, file_path TEXT NOT NULL);
    CREATE TABLE restore_commands (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      device_name TEXT,
      status TEXT,
      created_at TEXT
    );
    INSERT INTO users (id, username, display_name, role, password_hash)
    VALUES (1, 'admin', 'admin', 'Admin', 'test');
    INSERT INTO restore_commands (id, user_id, device_name, status, created_at)
    VALUES (1, 1, 'legacy-device', 'Pending', CURRENT_TIMESTAMP);
  `);
  legacyDatabase.close();
  process.env.DATABASE_PATH = databasePath;

  const { initializeSchema } = await import("../database/schema.js");
  const { pool } = await import("./database.js");

  try {
    await initializeSchema();
    const { rows } = await pool.query("PRAGMA table_info(restore_commands)");
    const columns = new Set(rows.map((row: any) => row.name));
    for (const column of ["game_id", "save_id", "game_name", "save_path", "retry_count", "max_retries", "lease_token"]) {
      assert.equal(columns.has(column), true, `missing migrated column ${column}`);
    }

    const indexes = await pool.query("PRAGMA index_list(restore_commands)");
    assert.equal(indexes.rows.some((row: any) => row.name === "idx_restore_commands_user_device_status_created"), true);
  } finally {
    await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
});
