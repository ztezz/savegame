import "dotenv/config";
import Database from "better-sqlite3";
import { Client } from "pg";
import * as fs from "node:fs";
import * as path from "node:path";
import { sqliteSchema } from "../database/schema.js";

const TABLES = [
  "users",
  "games",
  "categories",
  "saves",
  "sync_logs",
  "restore_commands",
  "activation_files",
  "agent_heartbeats",
  "device_api_keys",
  "device_link_sessions",
  "system_settings",
  "audit_logs",
  "drive_folders",
  "drive_files",
  "drive_shares",
  "community_rooms",
  "community_messages",
  "community_bans",
] as const;

const JSON_COLUMNS = new Set(["value_json", "detail_json", "reactions_json"]);
const BOOLEAN_COLUMNS = new Set(["is_locked", "ai_enabled", "ai_auto_reply"]);

function getSourceConfig() {
  const connectionString = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
  if (connectionString) {
    return {
      connectionString: connectionString.trim(),
      ssl: process.env.SOURCE_DB_SSL === "false" ? false : { rejectUnauthorized: false },
    };
  }

  const host = process.env.SOURCE_DB_HOST || process.env.DB_HOST;
  if (!host) {
    throw new Error("Missing SOURCE_DATABASE_URL. Add it to .env or pass it in the environment.");
  }

  return {
    host: host.trim(),
    port: Number(process.env.SOURCE_DB_PORT || process.env.DB_PORT || 5432),
    user: (process.env.SOURCE_DB_USER || process.env.DB_USER || "").trim(),
    password: (process.env.SOURCE_DB_PASSWORD || process.env.DB_PASSWORD || "").trim(),
    database: (process.env.SOURCE_DB_NAME || process.env.DB_NAME || "postgres").trim(),
    ssl: process.env.SOURCE_DB_SSL === "false" ? false : { rejectUnauthorized: false },
  };
}

function normalizeValue(column: string, value: any) {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  if (BOOLEAN_COLUMNS.has(column) && value !== null) return value ? 1 : 0;
  if (JSON_COLUMNS.has(column) && value !== null) {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  if (value !== null && typeof value === "object" && !Buffer.isBuffer(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function moveFile(source: string, destination: string) {
  try {
    fs.renameSync(source, destination);
  } catch (error: any) {
    if (error?.code !== "EXDEV") throw error;
    fs.copyFileSync(source, destination);
    fs.unlinkSync(source);
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const targetPath = path.resolve(process.env.DATABASE_PATH || path.join("data", "savegame.sqlite"));
  const targetDirectory = path.dirname(targetPath);
  const tempPath = `${targetPath}.import-${process.pid}`;
  const backupPath = `${targetPath}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  if (fs.existsSync(targetPath) && !force) {
    throw new Error(`Target already exists: ${targetPath}. Re-run with --force to back it up and replace it.`);
  }

  fs.mkdirSync(targetDirectory, { recursive: true });
  for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${tempPath}${suffix}`, { force: true });

  const source = new Client(getSourceConfig());
  let target: Database.Database | null = null;

  try {
    console.log("Connecting to source PostgreSQL database...");
    await source.connect();
    const sourceVersion = await source.query("SELECT current_database() AS database, version() AS version");
    console.log(`Source: ${sourceVersion.rows[0].database}`);

    target = new Database(tempPath);
    target.pragma("journal_mode = WAL");
    target.pragma("foreign_keys = OFF");
    target.exec(sqliteSchema);

    const existingTables = await source.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const sourceTables = new Set(existingTables.rows.map((row) => row.table_name));
    const importedCounts = new Map<string, number>();

    target.exec("BEGIN IMMEDIATE");
    try {
      // Remove schema seed rows only when their source table will be imported.
      for (const table of [...TABLES].reverse()) {
        if (sourceTables.has(table)) target.exec(`DELETE FROM ${quoteIdentifier(table)}`);
      }

      for (const table of TABLES) {
        if (!sourceTables.has(table)) {
          console.log(`SKIP ${table}: source table does not exist`);
          importedCounts.set(table, 0);
          continue;
        }

        const sourceColumnsResult = await source.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1
           ORDER BY ordinal_position`,
          [table]
        );
        const targetColumns = new Set(
          (target.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>).map((column) => column.name)
        );
        const columns = sourceColumnsResult.rows
          .map((row) => row.column_name)
          .filter((column) => targetColumns.has(column));

        if (columns.length === 0) {
          console.log(`SKIP ${table}: no compatible columns`);
          importedCounts.set(table, 0);
          continue;
        }

        const columnList = columns.map(quoteIdentifier).join(", ");
        const rows = (await source.query(`SELECT ${columnList} FROM ${quoteIdentifier(table)} ORDER BY 1`)).rows;
        const placeholders = columns.map(() => "?").join(", ");
        const insert = target.prepare(
          `INSERT INTO ${quoteIdentifier(table)} (${columnList}) VALUES (${placeholders})`
        );

        for (const row of rows) {
          insert.run(...columns.map((column) => normalizeValue(column, row[column])));
        }

        const targetCount = Number(
          (target.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get() as { count: number }).count
        );
        if (targetCount !== rows.length) {
          throw new Error(`Count mismatch for ${table}: source=${rows.length}, target=${targetCount}`);
        }
        importedCounts.set(table, rows.length);
        console.log(`OK   ${table}: ${rows.length} row(s)`);
      }
      target.exec("COMMIT");
    } catch (error) {
      if (target.inTransaction) target.exec("ROLLBACK");
      throw error;
    }

    const foreignKeyErrors = target.pragma("foreign_key_check") as any[];
    if (foreignKeyErrors.length > 0) {
      const preview = foreignKeyErrors.slice(0, 10).map((row) => JSON.stringify(row)).join("\n");
      throw new Error(`Foreign key validation failed (${foreignKeyErrors.length} error(s)):\n${preview}`);
    }

    target.pragma("foreign_keys = ON");
    target.pragma("wal_checkpoint(TRUNCATE)");
    const integrity = target.pragma("integrity_check") as Array<{ integrity_check: string }>;
    if (integrity[0]?.integrity_check !== "ok") {
      throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrity)}`);
    }
    target.close();
    target = null;

    if (fs.existsSync(targetPath)) {
      moveFile(targetPath, backupPath);
      for (const suffix of ["-shm", "-wal"]) fs.rmSync(`${targetPath}${suffix}`, { force: true });
      console.log(`Existing SQLite database backed up to: ${backupPath}`);
    }
    moveFile(tempPath, targetPath);

    const total = Array.from(importedCounts.values()).reduce((sum, count) => sum + count, 0);
    console.log(`Migration complete: ${total} row(s) imported into ${targetPath}`);
  } catch (error) {
    target?.close();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${tempPath}${suffix}`, { force: true });
    throw error;
  } finally {
    await source.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("Migration failed:", error?.message || error);
  process.exitCode = 1;
});
