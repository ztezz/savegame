import * as bcrypt from "bcryptjs";
import { pool } from "../config/database.js";
import { isUsingDatabase } from "../config/database.js";

export async function initializeSchema() {
  if (!isUsingDatabase()) {
    console.log('⏭️  Chưa cấu hình cơ sở dữ liệu, đang chạy với Mock Database...');
    return;
  }

  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Đã kết nối thành công tới PostgreSQL!');
    
    // Tạo bảng nếu chưa tồn tại hoặc cập nhật cấu trúc
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(255),
        role VARCHAR(20) DEFAULT 'User',
        status VARCHAR(20) DEFAULT 'Active',
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'User';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);

      UPDATE users SET role = 'Admin' WHERE username = 'admin' AND role != 'Admin';
      UPDATE users SET display_name = username WHERE display_name IS NULL;

      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='category') THEN
          ALTER TABLE games ADD COLUMN category VARCHAR(50) DEFAULT 'Uncategorized';
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS saves (
        id SERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        file_path VARCHAR(255) NOT NULL,
        custom_file_path TEXT,
        version INTEGER DEFAULT 1,
        file_size BIGINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE saves ADD COLUMN IF NOT EXISTS custom_file_path TEXT;

      CREATE TABLE IF NOT EXISTS sync_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_name VARCHAR(100),
        status VARCHAR(50),
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS restore_commands (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        save_id INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
        game_name VARCHAR(100) NOT NULL,
        device_name VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'Pending',
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 2,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        claimed_at TIMESTAMP,
        completed_at TIMESTAMP
      );

      ALTER TABLE restore_commands ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE restore_commands ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 2;
      ALTER TABLE restore_commands ADD COLUMN IF NOT EXISTS save_path TEXT;

      CREATE INDEX IF NOT EXISTS idx_restore_commands_user_status_created
        ON restore_commands(user_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_restore_commands_user_device_status_created
        ON restore_commands(user_id, device_name, status, created_at ASC);
      CREATE TABLE IF NOT EXISTS activation_files (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game_name VARCHAR(100) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        file_size BIGINT DEFAULT 0,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agent_heartbeats (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_name VARCHAR(100) NOT NULL,
        last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, device_name)
      );

      CREATE TABLE IF NOT EXISTS device_api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_name VARCHAR(100) NOT NULL,
        api_key VARCHAR(64) NOT NULL UNIQUE,
        note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_device_api_keys_api_key ON device_api_keys(api_key);

      CREATE TABLE IF NOT EXISTS device_link_sessions (
        id SERIAL PRIMARY KEY,
        token VARCHAR(64) NOT NULL UNIQUE,
        device_name VARCHAR(100) NOT NULL,
        api_key VARCHAR(64) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        claimed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_device_link_sessions_token ON device_link_sessions(token);
      CREATE INDEX IF NOT EXISTS idx_device_link_sessions_expires_at ON device_link_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) NOT NULL UNIQUE,
        value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        resource VARCHAR(100) NOT NULL,
        detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

    `);
    console.log('✅ Schema initialized successfully!');

    // Đảm bảo tài khoản admin tồn tại
    const adminRow = await pool.query("SELECT id, password_hash FROM users WHERE username = 'admin'");
    const defaultHash = await bcrypt.hash('admin123', 10);
    console.log(`📋 Admin account check: ${adminRow.rows.length} admin user(s) found`);
    
    if (adminRow.rows.length === 0) {
      console.log(`📝 Creating default admin account with password 'admin123'...`);
      await pool.query(
        "INSERT INTO users (username, email, role, status, password_hash) VALUES ('admin', 'admin@cloudsave.local', 'Admin', 'Active', $1)",
        [defaultHash]
      );
      console.log("✅ Created default admin account (admin / admin123). Please change password!");
    } else {
      const hasValidHash = adminRow.rows[0].password_hash && adminRow.rows[0].password_hash.startsWith('$2');
      console.log(`🔐 Admin hash status: ${hasValidHash ? 'Valid bcrypt hash' : 'INVALID or missing'}`);
      
      if (!adminRow.rows[0].password_hash || !adminRow.rows[0].password_hash.startsWith('$2')) {
        console.log(`⚠️  Updating admin password hash because current hash is invalid...`);
        await pool.query("UPDATE users SET password_hash = $1, role = 'Admin' WHERE username = 'admin'", [defaultHash]);
        console.log("✅ Updated admin account with default password (admin123). Please change it!");
      } else {
        console.log("✅ Admin account exists with valid password hash");
      }
    }
  } catch (err) {
    console.error('❌ Schema initialization error:', err);
  }
}
