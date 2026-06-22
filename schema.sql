-- CloudSave Hub PostgreSQL Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100),
  email VARCHAR(255),
  role VARCHAR(20) DEFAULT 'User',
  status VARCHAR(20) DEFAULT 'Active',
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_name VARCHAR(100) NOT NULL,
  category VARCHAR(50) DEFAULT 'Uncategorized',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Saves table (Versioning support)
CREATE TABLE IF NOT EXISTS saves (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  file_path VARCHAR(255) NOT NULL,
  version INTEGER DEFAULT 1,
  file_size BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Devices table (Tracking sync status)
CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name VARCHAR(100) NOT NULL,
  last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
