import * as bcrypt from "bcryptjs";

export const sqliteSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    email TEXT,
    role TEXT DEFAULT 'User',
    status TEXT DEFAULT 'Active',
    password_hash TEXT NOT NULL,
    drive_quota_mb INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_name TEXT NOT NULL,
    category TEXT DEFAULT 'Uncategorized',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
  );
  CREATE INDEX IF NOT EXISTS idx_categories_user_name ON categories(user_id, name);
  CREATE TABLE IF NOT EXISTS saves (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    custom_file_path TEXT,
    version INTEGER DEFAULT 1,
    file_size INTEGER DEFAULT 0,
    sha256 TEXT,
    original_filename TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name TEXT,
    status TEXT,
    message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS restore_commands (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    save_id INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
    game_name TEXT NOT NULL,
    device_name TEXT,
    save_path TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 2,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claimed_at TEXT,
    lease_token TEXT,
    lease_expires_at TEXT,
    completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_restore_commands_user_status_created ON restore_commands(user_id, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_restore_commands_user_device_status_created ON restore_commands(user_id, device_name, status, created_at);
  CREATE TABLE IF NOT EXISTS activation_files (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS agent_heartbeats (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, device_name)
  );
  CREATE TABLE IF NOT EXISTS device_api_keys (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_device_api_keys_api_key ON device_api_keys(api_key);
  CREATE TABLE IF NOT EXISTS device_link_sessions (
    id INTEGER PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    device_name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    claimed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_device_link_sessions_token ON device_link_sessions(token);
  CREATE INDEX IF NOT EXISTS idx_device_link_sessions_expires_at ON device_link_sessions(expires_at);
  CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value_json TEXT NOT NULL DEFAULT '{}',
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
  CREATE TABLE IF NOT EXISTS drive_folders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES drive_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, parent_id, name)
  );
  CREATE TABLE IF NOT EXISTS drive_files (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id INTEGER REFERENCES drive_folders(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_drive_files_user_created ON drive_files(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_drive_files_user_folder ON drive_files(user_id, folder_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_drive_files_user_deleted ON drive_files(user_id, deleted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_drive_folders_user_parent ON drive_folders(user_id, parent_id, name);
  CREATE INDEX IF NOT EXISTS idx_drive_folders_user_deleted ON drive_folders(user_id, deleted_at DESC);
  CREATE TABLE IF NOT EXISTS drive_shares (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_id INTEGER NOT NULL REFERENCES drive_files(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT,
    disabled_at TEXT,
    UNIQUE(user_id, file_id)
  );
  CREATE INDEX IF NOT EXISTS idx_drive_shares_token ON drive_shares(token);
  CREATE INDEX IF NOT EXISTS idx_drive_shares_file ON drive_shares(file_id);
  CREATE TABLE IF NOT EXISTS community_rooms (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_locked INTEGER NOT NULL DEFAULT 0 CHECK(is_locked IN (0, 1)),
    ai_enabled INTEGER NOT NULL DEFAULT 1 CHECK(ai_enabled IN (0, 1)),
    ai_bot_name TEXT,
    ai_tone TEXT NOT NULL DEFAULT 'default',
    ai_prompt TEXT,
    ai_auto_reply INTEGER NOT NULL DEFAULT 1 CHECK(ai_auto_reply IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  INSERT OR IGNORE INTO community_rooms (id, name, description)
  VALUES (1, 'Cộng đồng', 'Phòng chat chung cho mọi thành viên CloudSave');
  CREATE INDEX IF NOT EXISTS idx_community_rooms_deleted_sort ON community_rooms(deleted_at, sort_order, id);
  CREATE TABLE IF NOT EXISTS community_messages (
    id INTEGER PRIMARY KEY,
    room_id INTEGER NOT NULL DEFAULT 1 REFERENCES community_rooms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    sender_type TEXT NOT NULL DEFAULT 'user',
    display_name TEXT,
    reply_to_id INTEGER REFERENCES community_messages(id) ON DELETE SET NULL,
    reactions_json TEXT NOT NULL DEFAULT '{}',
    edited_at TEXT,
    pinned_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_community_messages_room_id ON community_messages(room_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_community_messages_created ON community_messages(created_at DESC);
  CREATE TABLE IF NOT EXISTS community_ai_memories (
    room_id INTEGER PRIMARY KEY REFERENCES community_rooms(id) ON DELETE CASCADE,
    summary TEXT NOT NULL DEFAULT '',
    last_message_id INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS community_bans (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    banned_until TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_community_bans_until ON community_bans(banned_until);
`;

const leaseIndexesSchema = `
  CREATE INDEX IF NOT EXISTS idx_restore_commands_active_lease
  ON restore_commands(user_id, device_name, status, lease_expires_at);
`;

async function addMissingColumns(table: string, columns: Record<string, string>) {
  const { pool } = await import("../config/database.js");
  const { rows } = await pool.query(`PRAGMA table_info(${table})`);
  const existing = new Set(rows.map((row: any) => row.name));
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

export async function initializeSchema() {
  try {
    const { pool } = await import("../config/database.js");
    pool.exec(sqliteSchema);
    await addMissingColumns("saves", { sha256: "TEXT", original_filename: "TEXT" });
    await addMissingColumns("restore_commands", { lease_token: "TEXT", lease_expires_at: "TEXT" });
    pool.exec(leaseIndexesSchema);
    await pool.query("UPDATE users SET role = 'Admin' WHERE username = 'admin' AND role != 'Admin'");
    await pool.query("UPDATE users SET display_name = username WHERE display_name IS NULL");
    console.log("✅ Đã khởi tạo SQLite schema thành công!");

    const adminRow = await pool.query("SELECT id, password_hash FROM users WHERE username = 'admin'");
    const initialAdminPassword = process.env.ADMIN_INITIAL_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "admin123");
    if (adminRow.rows.length === 0 && initialAdminPassword) {
      const adminHash = await bcrypt.hash(initialAdminPassword, 10);
      await pool.query(
        "INSERT INTO users (username, display_name, email, role, status, password_hash) VALUES ('admin', 'admin', 'admin@cloudsave.local', 'Admin', 'Active', $1)",
        [adminHash]
      );
      console.log("✅ Đã tạo tài khoản admin ban đầu. Hãy đổi mật khẩu sau khi đăng nhập.");
    } else if (adminRow.rows.length === 0) {
      console.log("ℹ️ Chưa có admin. Đặt ADMIN_INITIAL_PASSWORD để tạo tài khoản admin.");
    }
  } catch (err) {
    console.error("❌ SQLite schema initialization error:", err);
    throw err;
  }
}
