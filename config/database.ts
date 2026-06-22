import pkg from "pg";
import { TEST_DB_URL } from "./environment.js";

const { Pool } = pkg;

const cleanStr = (val: string | undefined): string => {
  return val ? val.trim().replace(/\s+/g, '') : '';
};

// Database configuration
const dbConfig = process.env.DATABASE_URL 
  ? { connectionString: cleanStr(process.env.DATABASE_URL), ssl: { rejectUnauthorized: false } }
  : process.env.DB_HOST 
    ? {
        host: cleanStr(process.env.DB_HOST),
        port: parseInt(cleanStr(process.env.DB_PORT) || '5432'),
        user: process.env.DB_USER ? process.env.DB_USER.trim() : '',
        password: process.env.DB_PASSWORD ? process.env.DB_PASSWORD.trim() : '',
        database: process.env.DB_NAME ? process.env.DB_NAME.trim() : 'postgres',
        ssl: { rejectUnauthorized: false }
      }
    : { connectionString: cleanStr(TEST_DB_URL), ssl: { rejectUnauthorized: false } };

export const pool = new Pool(dbConfig);

export const isUsingDatabase = () => {
  return process.env.DATABASE_URL || process.env.DB_HOST || TEST_DB_URL;
};

export default pool;
