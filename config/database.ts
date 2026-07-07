import pkg from "pg";
import { TEST_DB_URL } from "./environment.js";

const { Pool } = pkg;

const cleanStr = (val: string | undefined): string => {
  return val ? val.trim().replace(/\s+/g, '') : '';
};

const getSupabaseProjectRef = () => {
  const dbUser = cleanStr(process.env.DB_USER);
  if (dbUser.startsWith('postgres.')) {
    return dbUser.slice('postgres.'.length);
  }

  const supabaseUrl = cleanStr(process.env.VITE_SUPABASE_URL);
  const match = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co$/);
  return match?.[1];
};

const normalizeConnectionString = (connectionString: string) => {
  const normalized = cleanStr(connectionString);

  try {
    const url = new URL(normalized);
    const isSupabasePooler = url.hostname.endsWith('.pooler.supabase.com');

    if (isSupabasePooler && url.username === 'postgres') {
      const projectRef = getSupabaseProjectRef();
      if (projectRef) {
        url.username = `postgres.${projectRef}`;
        return url.toString();
      }
    }
  } catch {
    return normalized;
  }

  return normalized;
};

const logDatabaseTarget = (config: Record<string, any>) => {
  try {
    if (config.connectionString) {
      const url = new URL(config.connectionString);
      console.log(`Database target: ${url.username}@${url.hostname}:${url.port || '5432'}/${url.pathname.slice(1)}`);
      return;
    }

    console.log(`Database target: ${config.user}@${config.host}:${config.port}/${config.database}`);
  } catch {
    console.log('Database target: configured');
  }
};

const basePoolConfig = {
  ssl: { rejectUnauthorized: false },
  keepAlive: true,
  keepAliveInitialDelayMillis: 30000,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
};

// Database configuration
const dbConfig = process.env.DATABASE_URL 
  ? { ...basePoolConfig, connectionString: normalizeConnectionString(process.env.DATABASE_URL) }
  : process.env.DB_HOST 
    ? {
        ...basePoolConfig,
        host: cleanStr(process.env.DB_HOST),
        port: parseInt(cleanStr(process.env.DB_PORT) || '5432'),
        user: process.env.DB_USER ? process.env.DB_USER.trim() : '',
        password: process.env.DB_PASSWORD ? process.env.DB_PASSWORD.trim() : '',
        database: process.env.DB_NAME ? process.env.DB_NAME.trim() : 'postgres',
      }
    : { ...basePoolConfig, connectionString: normalizeConnectionString(TEST_DB_URL) };

logDatabaseTarget(dbConfig);

const RECOVERABLE_DB_ERROR_CODES = new Set([
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000',
  '08003',
  '08006',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

const isRecoverableDbError = (err: any) => {
  const code = err?.code || err?.errno;
  if (RECOVERABLE_DB_ERROR_CODES.has(code)) return true;

  const message = String(err?.message || err || '').toLowerCase();
  return [
    'connection terminated',
    'connection ended unexpectedly',
    'server closed the connection unexpectedly',
    'client has encountered a connection error',
    'timeout expired',
    'read econnreset',
    'socket hang up',
  ].some((text) => message.includes(text));
};

class RecoveringPool {
  private currentPool = this.createPool();
  private recreatingPool: Promise<void> | null = null;

  constructor(private readonly config: Record<string, any>) {}

  private createPool() {
    const nextPool = new Pool(this.config);
    nextPool.on('error', (err: any) => {
      console.error('⚠️ PostgreSQL pool idle client error:', err?.message || err);
    });
    return nextPool;
  }

  private async recreatePool(reason: any) {
    if (!this.recreatingPool) {
      console.warn('Recreating PostgreSQL pool after connection error:', reason?.message || reason);
      const oldPool = this.currentPool;
      this.currentPool = this.createPool();
      this.recreatingPool = oldPool.end()
        .catch((err: any) => console.warn('Failed to close stale PostgreSQL pool:', err?.message || err))
        .then(() => undefined)
        .finally(() => {
          this.recreatingPool = null;
        });
    }

    await this.recreatingPool;
  }

  async query(...args: any[]) {
    try {
      return await (this.currentPool.query as any)(...args);
    } catch (err) {
      if (!isRecoverableDbError(err)) throw err;
      await this.recreatePool(err);
      return (this.currentPool.query as any)(...args);
    }
  }

  async connect() {
    try {
      return await this.currentPool.connect();
    } catch (err) {
      if (!isRecoverableDbError(err)) throw err;
      await this.recreatePool(err);
      return this.currentPool.connect();
    }
  }

  async end() {
    return this.currentPool.end();
  }
}

export const pool = new RecoveringPool(dbConfig);

let databaseKeepAliveInterval: NodeJS.Timeout | null = null;

export const startDatabaseKeepAlive = () => {
  if (databaseKeepAliveInterval) return;

  databaseKeepAliveInterval = setInterval(async () => {
    try {
      await pool.query('SELECT 1');
    } catch (err: any) {
      console.error('Database keep-alive ping failed:', err?.message || err);
    }
  }, 5 * 60 * 1000);

  databaseKeepAliveInterval.unref?.();
};

export const isUsingDatabase = () => {
  return process.env.DATABASE_URL || process.env.DB_HOST || TEST_DB_URL;
};

export default pool;
