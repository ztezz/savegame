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

// Database configuration
const dbConfig = process.env.DATABASE_URL 
  ? { connectionString: normalizeConnectionString(process.env.DATABASE_URL), ssl: { rejectUnauthorized: false } }
  : process.env.DB_HOST 
    ? {
        host: cleanStr(process.env.DB_HOST),
        port: parseInt(cleanStr(process.env.DB_PORT) || '5432'),
        user: process.env.DB_USER ? process.env.DB_USER.trim() : '',
        password: process.env.DB_PASSWORD ? process.env.DB_PASSWORD.trim() : '',
        database: process.env.DB_NAME ? process.env.DB_NAME.trim() : 'postgres',
        ssl: { rejectUnauthorized: false }
      }
    : { connectionString: normalizeConnectionString(TEST_DB_URL), ssl: { rejectUnauthorized: false } };

logDatabaseTarget(dbConfig);

export const pool = new Pool(dbConfig);

pool.on('error', (err: any) => {
  console.error('⚠️ PostgreSQL pool idle client error:', err?.message || err);
});

export const isUsingDatabase = () => {
  return process.env.DATABASE_URL || process.env.DB_HOST || TEST_DB_URL;
};

export default pool;
