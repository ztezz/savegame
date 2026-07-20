export const NODE_ENV = process.env.NODE_ENV || "development";
const configuredJwtSecret = process.env.JWT_SECRET;
const insecureJwtSecret = "cloudsave-secret-key-2024";
if (NODE_ENV === "production" && (!configuredJwtSecret || configuredJwtSecret === insecureJwtSecret || configuredJwtSecret.length < 32)) {
  throw new Error("JWT_SECRET must be a unique secret of at least 32 characters in production");
}
export const JWT_SECRET = configuredJwtSecret || insecureJwtSecret;

const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";
const configuredTurnstileSecret = process.env.TURNSTILE_SECRET_KEY;
if (NODE_ENV === "production" && !configuredTurnstileSecret) {
  throw new Error("TURNSTILE_SECRET_KEY is required in production");
}
export const TURNSTILE_SECRET_KEY = configuredTurnstileSecret || TURNSTILE_TEST_SECRET_KEY;
export const TURNSTILE_ALLOWED_HOSTNAMES = new Set(
  (process.env.TURNSTILE_ALLOWED_HOSTNAMES || "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean)
);

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

function parsePublicApiOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("PUBLIC_API_ORIGIN must use http or https");
  }
  return url.origin;
}

export const PUBLIC_API_ORIGIN = parsePublicApiOrigin(process.env.PUBLIC_API_ORIGIN || "https://api.luugame.fun");
const configuredTaskLeaseSeconds = Number(process.env.TASK_LEASE_SECONDS || 600);
export const TASK_LEASE_SECONDS = Number.isFinite(configuredTaskLeaseSeconds)
  ? Math.max(30, Math.min(86400, Math.floor(configuredTaskLeaseSeconds)))
  : 600;

export const UPLOAD_LIMIT = process.env.UPLOAD_LIMIT || "2GB";
export const MAX_FILE_SIZE = Math.max(1, Number(process.env.MAX_FILE_SIZE_MB || 2048)) * 1024 * 1024;
export const DRIVE_QUOTA_BYTES = Math.max(1, Number(process.env.DRIVE_QUOTA_MB || 20480)) * 1024 * 1024;

// Agent download
export const AGENT_VERSION = process.env.AGENT_VERSION || "1.0.0";
// Absolute path to restore_agent.exe. Leave empty to use default sibling folder.
export const AGENT_EXE_PATH = process.env.AGENT_EXE_PATH || "";
