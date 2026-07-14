import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

export interface DatabaseResult<T = any> {
  rows: T[];
  rowCount: number;
}

const databasePath = path.resolve(process.env.DATABASE_PATH || path.join("data", "savegame.sqlite"));
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");
database.pragma("busy_timeout = 5000");
database.pragma("synchronous = NORMAL");

console.log(`Database target: SQLite ${databasePath}`);

const JSON_COLUMNS = new Set(["value_json", "detail_json", "reactions_json"]);
const BOOLEAN_COLUMNS = new Set(["is_locked", "ai_enabled", "ai_auto_reply", "is_online", "online", "known"]);
let transactionOwner: SQLiteClient | null = null;
let transactionFinished: Promise<void> | null = null;
let finishTransaction: (() => void) | null = null;

async function waitForTransaction(client?: SQLiteClient) {
  while (transactionOwner && transactionOwner !== client && transactionFinished) {
    await transactionFinished;
  }
}

async function beginTransaction(client: SQLiteClient) {
  await waitForTransaction(client);
  transactionOwner = client;
  transactionFinished = new Promise<void>((resolve) => {
    finishTransaction = resolve;
  });
  database.exec("BEGIN IMMEDIATE");
}

function endTransaction(client: SQLiteClient, command: "COMMIT" | "ROLLBACK") {
  if (transactionOwner !== client) return;
  try {
    if (database.inTransaction) database.exec(command);
  } finally {
    transactionOwner = null;
    finishTransaction?.();
    finishTransaction = null;
    transactionFinished = null;
  }
}

function normalizeValue(value: any) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === "object" && !Buffer.isBuffer(value)) return JSON.stringify(value);
  return value;
}

function normalizeRow(row: any) {
  if (!row || typeof row !== "object") return row;
  for (const [key, value] of Object.entries(row)) {
    if (JSON_COLUMNS.has(key) && typeof value === "string") {
      try {
        row[key] = JSON.parse(value);
      } catch {
        row[key] = {};
      }
    } else if (BOOLEAN_COLUMNS.has(key) && value !== null) {
      row[key] = Boolean(value);
    } else if (typeof value === "bigint") {
      row[key] = Number(value);
    }
  }
  return row;
}

function prepareQuery(sql: string, params: any[] = []) {
  const orderedParams: any[] = [];
  let normalizedSql = sql
    .replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP")
    .replace(/::(?:jsonb|text|bigint|int)\b/gi, "");

  normalizedSql = normalizedSql.replace(/\$(\d+)/g, (_match, index) => {
    orderedParams.push(normalizeValue(params[Number(index) - 1]));
    return "?";
  });

  return { sql: normalizedSql.trim(), params: orderedParams };
}

function normalizeError(error: any) {
  if (String(error?.code || "").startsWith("SQLITE_CONSTRAINT_UNIQUE")) error.code = "23505";
  return error;
}

class SQLiteClient {
  async query<T = any>(sql: string, params: any[] = []): Promise<DatabaseResult<T>> {
    const command = sql.trim().replace(/;$/, "").toUpperCase();
    if (command === "BEGIN") {
      await beginTransaction(this);
      return { rows: [], rowCount: 0 };
    }
    if (command === "COMMIT" || command === "ROLLBACK") {
      endTransaction(this, command);
      return { rows: [], rowCount: 0 };
    }

    await waitForTransaction(this);

    const prepared = prepareQuery(sql, params);
    try {
      const statement = database.prepare(prepared.sql);
      const returnsRows = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(prepared.sql) || /\bRETURNING\b/i.test(prepared.sql);
      if (returnsRows) {
        const rows = statement.all(...prepared.params).map(normalizeRow) as T[];
        return { rows, rowCount: rows.length };
      }

      const result = statement.run(...prepared.params);
      return { rows: [], rowCount: result.changes };
    } catch (error) {
      throw normalizeError(error);
    }
  }

  release() {}
}

class SQLitePool extends SQLiteClient {
  async query<T = any>(sql: string, params: any[] = []) {
    await waitForTransaction();
    return super.query<T>(sql, params);
  }

  async connect() {
    return new SQLiteClient();
  }

  async end() {
    database.close();
  }

  exec(sql: string) {
    database.exec(sql);
  }
}

export const pool = new SQLitePool();

export const startDatabaseKeepAlive = () => {};

export const isUsingDatabase = () => true;

export default pool;
