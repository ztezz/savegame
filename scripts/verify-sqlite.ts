import "dotenv/config";
import Database from "better-sqlite3";
import * as path from "node:path";

const databasePath = path.resolve(process.env.DATABASE_PATH || path.join("data", "savegame.sqlite"));
const database = new Database(databasePath, { readonly: true, fileMustExist: true });

try {
  const integrity = database.pragma("integrity_check") as Array<{ integrity_check: string }>;
  const foreignKeyErrors = database.pragma("foreign_key_check") as any[];
  const tables = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as Array<{ name: string }>;

  console.log(`Database: ${databasePath}`);
  console.log(`Integrity: ${integrity[0]?.integrity_check || "unknown"}`);
  console.log(`Foreign keys: ${foreignKeyErrors.length === 0 ? "ok" : `${foreignKeyErrors.length} error(s)`}`);

  let totalRows = 0;
  for (const { name } of tables) {
    const safeName = name.replace(/"/g, '""');
    const row = database.prepare(`SELECT COUNT(*) AS count FROM "${safeName}"`).get() as { count: number };
    const count = Number(row.count);
    totalRows += count;
    console.log(`${name}: ${count}`);
  }
  console.log(`Total rows: ${totalRows}`);

  if (integrity[0]?.integrity_check !== "ok" || foreignKeyErrors.length > 0) process.exitCode = 1;
} finally {
  database.close();
}
