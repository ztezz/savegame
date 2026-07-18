import Database from "better-sqlite3";
import { Router } from "express";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { databasePath } from "../config/database.js";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import { writeAudit } from "../utils/audit.js";

export const sqliteAdminRouter = Router();
sqliteAdminRouter.use("/api/admin/sqlite", authenticateToken, isAdmin);

type ColumnInfo = { cid: number; name: string; type: string; notnull: number; dflt_value: any; pk: number };
const SQLITE_EXTENSIONS = new Set([".sqlite", ".sqlite3", ".db"]);
const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "utf8");
const MAX_SCAN_DEPTH = 5;
const MAX_DATABASES = 250;
const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", "uploads", "dist", "build", ".wrangler", ".cache"]);
const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;
const encodeId = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const decodeId = (value: unknown) => Buffer.from(String(value || ""), "base64url").toString("utf8");
const bindValue = (value: any) => {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value !== null && typeof value === "object" && !Buffer.isBuffer(value)) return JSON.stringify(value);
  return value;
};

function configuredRoots() {
  const configured = String(process.env.SQLITE_SCAN_PATHS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));
  return [...new Set([path.dirname(databasePath), ...configured])];
}

function canonicalRoots() {
  return configuredRoots()
    .filter((root) => fs.existsSync(root) && fs.statSync(root).isDirectory())
    .map((root) => fs.realpathSync(root));
}

function isInsideRoot(target: string, root: string) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isSQLiteFile(filePath: string) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < SQLITE_HEADER.length) return false;
    const descriptor = fs.openSync(filePath, "r");
    try {
      const header = Buffer.alloc(SQLITE_HEADER.length);
      fs.readSync(descriptor, header, 0, header.length, 0);
      return header.equals(SQLITE_HEADER);
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    return false;
  }
}

function resolveDatabase(databaseId: unknown) {
  const requested = databaseId ? decodeId(databaseId) : databasePath;
  if (!requested || !fs.existsSync(requested)) throw Object.assign(new Error("Không tìm thấy file SQLite"), { status: 404 });
  const resolved = fs.realpathSync(requested);
  if (!canonicalRoots().some((root) => isInsideRoot(resolved, root))) throw Object.assign(new Error("Database nằm ngoài thư mục được phép"), { status: 403 });
  if (!isSQLiteFile(resolved)) throw Object.assign(new Error("File không phải SQLite hợp lệ"), { status: 400 });
  return resolved;
}

function requestDatabaseId(req: any) {
  return req.query?.database || req.body?.databaseId;
}

function openDatabase(filePath: string) {
  const database = new Database(filePath);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  return database;
}

async function withDatabase<T>(databaseId: unknown, callback: (database: Database.Database, filePath: string) => T | Promise<T>) {
  const filePath = resolveDatabase(databaseId);
  const database = openDatabase(filePath);
  try {
    return await callback(database, filePath);
  } finally {
    database.close();
  }
}

function getTable(database: Database.Database, name: unknown) {
  const table = database.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name = ? AND name NOT LIKE 'sqlite_%'").get(String(name || "")) as any;
  if (!table) throw Object.assign(new Error("Bảng không tồn tại"), { status: 404 });
  return table as { name: string; sql: string };
}

function getColumns(database: Database.Database, tableName: string) {
  return database.prepare("SELECT * FROM pragma_table_info(?) ORDER BY cid").all(tableName) as ColumnInfo[];
}

function sendError(res: any, error: any) {
  res.status(error?.status || 500).json({ error: error?.message || "SQLite operation failed" });
}

function scanDatabases() {
  const found = new Set<string>();
  if (isSQLiteFile(databasePath)) found.add(fs.realpathSync(databasePath));

  const visit = (directory: string, depth: number) => {
    if (depth > MAX_SCAN_DEPTH || found.size >= MAX_DATABASES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.size >= MAX_DATABASES) break;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink() && !IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) visit(entryPath, depth + 1);
      else if (entry.isFile() && SQLITE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) && isSQLiteFile(entryPath)) {
        found.add(fs.realpathSync(entryPath));
      }
    }
  };
  for (const root of canonicalRoots()) visit(root, 0);
  return [...found].map((filePath) => {
    const stat = fs.statSync(filePath);
    let tableCount = 0;
    try {
      const database = openDatabase(filePath);
      tableCount = Number((database.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get() as any)?.count || 0);
      database.close();
    } catch {}
    return { id: encodeId(filePath), name: path.basename(filePath), path: filePath, bytes: stat.size, modifiedAt: stat.mtime.toISOString(), tableCount, primary: path.resolve(filePath) === path.resolve(databasePath) };
  }).sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

sqliteAdminRouter.get("/api/admin/sqlite/databases", (_req, res) => {
  try {
    const roots = canonicalRoots().map((root) => ({ id: encodeId(root), path: root, name: path.basename(root) || root }));
    const databases = scanDatabases();
    res.json({ databases, roots, truncated: databases.length >= MAX_DATABASES });
  } catch (error) {
    sendError(res, error);
  }
});

sqliteAdminRouter.post("/api/admin/sqlite/databases", async (req: any, res) => {
  try {
    const root = decodeId(req.body?.directoryId);
    const allowedRoot = canonicalRoots().find((item) => item === root);
    if (!allowedRoot) return res.status(400).json({ error: "Thư mục tạo database không hợp lệ" });
    let name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Tên database không được để trống" });
    if (!/^[a-zA-Z0-9._-]+$/.test(name) || name === "." || name === "..") return res.status(400).json({ error: "Tên chỉ được chứa chữ, số, dấu chấm, gạch ngang và gạch dưới" });
    if (!SQLITE_EXTENSIONS.has(path.extname(name).toLowerCase())) name += ".sqlite";
    const target = path.join(allowedRoot, name);
    if (!isInsideRoot(target, allowedRoot)) return res.status(400).json({ error: "Đường dẫn database không hợp lệ" });
    if (fs.existsSync(target)) return res.status(409).json({ error: "Database đã tồn tại" });
    const database = openDatabase(target);
    database.pragma("journal_mode = WAL");
    database.exec("VACUUM");
    database.close();
    await writeAudit(req.user.id, "CREATE", "sqlite:database", { path: target });
    const stat = fs.statSync(target);
    res.status(201).json({ database: { id: encodeId(fs.realpathSync(target)), name: path.basename(target), path: target, bytes: stat.size, modifiedAt: stat.mtime.toISOString(), tableCount: 0, primary: false } });
  } catch (error) {
    sendError(res, error);
  }
});

sqliteAdminRouter.get("/api/admin/sqlite/overview", async (req, res) => {
  try {
    const result = await withDatabase(requestDatabaseId(req), (database, filePath) => {
      const tables = database.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as any[];
      const tableItems = tables.map((table) => ({ ...table, rowCount: Number((database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table.name)}`).get() as any)?.count || 0) }));
      const pageCount = Number(database.pragma("page_count", { simple: true }) || 0);
      const pageSize = Number(database.pragma("page_size", { simple: true }) || 0);
      return { id: encodeId(filePath), path: filePath, sqliteBytes: pageCount * pageSize, files: [filePath, `${filePath}-wal`, `${filePath}-shm`].filter(fs.existsSync).map((file) => ({ name: path.basename(file), bytes: fs.statSync(file).size })), journalMode: database.pragma("journal_mode", { simple: true }) || "unknown", tables: tableItems };
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

sqliteAdminRouter.get("/api/admin/sqlite/tables/:table", async (req, res) => {
  try {
    const result = await withDatabase(requestDatabaseId(req), (database) => {
      const table = getTable(database, req.params.table);
      const columns = getColumns(database, table.name);
      const limit = Math.max(1, Math.min(Number(req.query.limit || 50), 200));
      const page = Math.max(1, Number(req.query.page || 1));
      const name = quoteIdentifier(table.name);
      const primaryKey = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk);
      const orderBy = primaryKey.length ? ` ORDER BY ${primaryKey.map((column) => quoteIdentifier(column.name)).join(", ")}` : "";
      const total = Number((database.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get() as any)?.count || 0);
      const rows = database.prepare(`SELECT * FROM ${name}${orderBy} LIMIT ? OFFSET ?`).all(limit, (page - 1) * limit);
      return { table, columns, primaryKey: primaryKey.map((column) => column.name), rows, total, page, limit };
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

sqliteAdminRouter.post("/api/admin/sqlite/tables/:table/rows", async (req: any, res) => {
  try {
    const result = await withDatabase(requestDatabaseId(req), (database, filePath) => {
      const table = getTable(database, req.params.table);
      const allowed = new Set(getColumns(database, table.name).map((column) => column.name));
      const entries = Object.entries(req.body?.values || {}).filter(([key, value]) => allowed.has(key) && value !== undefined);
      if (!entries.length) throw Object.assign(new Error("Không có dữ liệu hợp lệ để thêm"), { status: 400 });
      const row = database.prepare(`INSERT INTO ${quoteIdentifier(table.name)} (${entries.map(([key]) => quoteIdentifier(key)).join(", ")}) VALUES (${entries.map(() => "?").join(", ")}) RETURNING *`).get(...entries.map(([, value]) => bindValue(value)));
      return { row, filePath, columns: entries.map(([key]) => key) };
    });
    await writeAudit(req.user.id, "INSERT", `sqlite:${req.params.table}`, { database: result.filePath, columns: result.columns });
    res.status(201).json({ row: result.row });
  } catch (error) {
    sendError(res, error);
  }
});

sqliteAdminRouter.put("/api/admin/sqlite/tables/:table/rows", async (req: any, res) => {
  try {
    const result = await withDatabase(requestDatabaseId(req), (database, filePath) => {
      const table = getTable(database, req.params.table);
      const columns = getColumns(database, table.name);
      const primaryKey = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk);
      if (!primaryKey.length) throw Object.assign(new Error("Bảng không có khóa chính nên không thể sửa an toàn"), { status: 400 });
      const key = req.body?.key || {};
      if (primaryKey.some((column) => key[column.name] === undefined)) throw Object.assign(new Error("Thiếu giá trị khóa chính"), { status: 400 });
      const allowed = new Set(columns.map((column) => column.name));
      const entries = Object.entries(req.body?.values || {}).filter(([name, value]) => allowed.has(name) && !primaryKey.some((column) => column.name === name) && value !== undefined);
      if (!entries.length) throw Object.assign(new Error("Không có dữ liệu hợp lệ để cập nhật"), { status: 400 });
      const params = [...entries.map(([, value]) => bindValue(value)), ...primaryKey.map((column) => bindValue(key[column.name]))];
      const row = database.prepare(`UPDATE ${quoteIdentifier(table.name)} SET ${entries.map(([name]) => `${quoteIdentifier(name)} = ?`).join(", ")} WHERE ${primaryKey.map((column) => `${quoteIdentifier(column.name)} = ?`).join(" AND ")} RETURNING *`).get(...params);
      if (!row) throw Object.assign(new Error("Không tìm thấy hàng cần sửa"), { status: 404 });
      return { row, filePath, key, columns: entries.map(([name]) => name) };
    });
    await writeAudit(req.user.id, "UPDATE", `sqlite:${req.params.table}`, { database: result.filePath, key: result.key, columns: result.columns });
    res.json({ row: result.row });
  } catch (error) {
    sendError(res, error);
  }
});

sqliteAdminRouter.delete("/api/admin/sqlite/tables/:table/rows", async (req: any, res) => {
  try {
    const result = await withDatabase(requestDatabaseId(req), (database, filePath) => {
      const table = getTable(database, req.params.table);
      const primaryKey = getColumns(database, table.name).filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk);
      if (!primaryKey.length) throw Object.assign(new Error("Bảng không có khóa chính nên không thể xóa an toàn"), { status: 400 });
      const key = req.body?.key || {};
      if (primaryKey.some((column) => key[column.name] === undefined)) throw Object.assign(new Error("Thiếu giá trị khóa chính"), { status: 400 });
      const changes = database.prepare(`DELETE FROM ${quoteIdentifier(table.name)} WHERE ${primaryKey.map((column) => `${quoteIdentifier(column.name)} = ?`).join(" AND ")}`).run(...primaryKey.map((column) => bindValue(key[column.name]))).changes;
      if (!changes) throw Object.assign(new Error("Không tìm thấy hàng cần xóa"), { status: 404 });
      return { filePath, key };
    });
    await writeAudit(req.user.id, "DELETE", `sqlite:${req.params.table}`, { database: result.filePath, key: result.key });
    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

sqliteAdminRouter.post("/api/admin/sqlite/query", async (req: any, res) => {
  const sql = String(req.body?.sql || "").trim();
  if (!sql) return res.status(400).json({ error: "SQL không được để trống" });
  const normalized = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ").trim();
  if (/\b(ATTACH|DETACH)\b|load_extension\s*\(|writable_schema|VACUUM\s+INTO|PRAGMA\s+(?:temp_)?store_directory/i.test(normalized)) return res.status(400).json({ error: "Câu lệnh truy cập file hoặc cấu hình SQLite nguy hiểm đã bị chặn" });
  if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(normalized)) return res.status(400).json({ error: "Không hỗ trợ transaction thủ công trong SQL console" });
  try {
    const startedAt = Date.now();
    const result = await withDatabase(requestDatabaseId(req), (database, filePath) => {
      const statement = database.prepare(sql);
      const params = Array.isArray(req.body?.params) ? req.body.params.map(bindValue) : [];
      if (statement.reader) {
        const rows = statement.all(...params);
        return { rows: rows.slice(0, 500), rowCount: rows.length, truncated: rows.length > 500, filePath };
      }
      const execution = statement.run(...params);
      return { rows: [], rowCount: execution.changes, truncated: false, filePath };
    });
    const readonly = /^\s*(SELECT|WITH|EXPLAIN|PRAGMA)\b/i.test(normalized);
    if (!readonly) await writeAudit(req.user.id, "SQL", "sqlite:console", { database: result.filePath, sql: normalized.slice(0, 1000), rowCount: result.rowCount });
    res.json({ rows: result.rows, rowCount: result.rowCount, truncated: result.truncated, durationMs: Date.now() - startedAt });
  } catch (error) {
    sendError(res, error);
  }
});

sqliteAdminRouter.post("/api/admin/sqlite/maintenance/:operation", async (req: any, res) => {
  try {
    const operation = req.params.operation;
    const output = await withDatabase(requestDatabaseId(req), (database, filePath) => {
      let result: any;
      if (operation === "integrity") result = database.pragma("integrity_check");
      else if (operation === "optimize") result = database.pragma("optimize");
      else if (operation === "checkpoint") result = database.pragma("wal_checkpoint(TRUNCATE)");
      else throw Object.assign(new Error("Tác vụ không tồn tại"), { status: 404 });
      return { result, filePath };
    });
    await writeAudit(req.user.id, "MAINTENANCE", "sqlite", { database: output.filePath, operation });
    res.json({ success: true, result: output.result });
  } catch (error) {
    sendError(res, error);
  }
});

sqliteAdminRouter.get("/api/admin/sqlite/backup", async (req: any, res) => {
  let backupPath = "";
  try {
    const source = resolveDatabase(requestDatabaseId(req));
    backupPath = path.join(os.tmpdir(), `${path.basename(source, path.extname(source))}-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
    const database = openDatabase(source);
    try {
      await database.backup(backupPath);
    } finally {
      database.close();
    }
    await writeAudit(req.user.id, "BACKUP", "sqlite", { database: source, filename: path.basename(backupPath) });
    res.download(backupPath, path.basename(backupPath), () => fs.rm(backupPath, { force: true }, () => {}));
  } catch (error) {
    if (backupPath) fs.rm(backupPath, { force: true }, () => {});
    sendError(res, error);
  }
});
