import pkg from "pg";
import { TEST_DB_URL } from "./environment.js";

const { Pool } = pkg;

// Database configuration
const dbConfig = process.env.DATABASE_URL 
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : process.env.DB_HOST 
    ? {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: { rejectUnauthorized: false }
      }
    : { connectionString: TEST_DB_URL, ssl: { rejectUnauthorized: false } };

export const pool = new Pool(dbConfig);

export const isUsingDatabase = () => {
  return process.env.DATABASE_URL || process.env.DB_HOST || TEST_DB_URL;
};

export default pool;
