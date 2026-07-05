export const NODE_ENV = process.env.NODE_ENV || "development";
export const JWT_SECRET = process.env.JWT_SECRET || (NODE_ENV === "production" ? "" : "cloudsave-secret-key-2024");
if (NODE_ENV === "production" && !JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production");
}

export const TEST_DB_URL = "postgresql://postgres.kqfixtgeodjmhctguber:543457%40tHAI@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";
export const PORT = NODE_ENV === "production" ? (process.env.PORT || 3000) : (process.env.API_PORT || 3001);

// CORS Configuration - supports multiple origins
const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'https://savegame.datdaihcm.pro',  // Production frontend
  'https://luugame.fun',             // New production domain
  'https://www.luugame.fun',
  'https://luugame.thuonghongthai97.workers.dev',
];

const envOrigin = process.env.FRONTEND_ORIGIN;
export const FRONTEND_ORIGIN = envOrigin 
  ? envOrigin.split(',').map(o => o.trim()).filter(Boolean)
  : defaultOrigins;

export const FRONTEND_APP_URL = process.env.FRONTEND_APP_URL || "https://luugame.fun";

export const UPLOAD_LIMIT = "500MB";
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

// Agent download
export const AGENT_VERSION = process.env.AGENT_VERSION || "1.0.0";
// Absolute path to restore_agent.exe. Leave empty to use default sibling folder.
export const AGENT_EXE_PATH = process.env.AGENT_EXE_PATH || "";
