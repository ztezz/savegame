import { isUsingDatabase, pool } from "../config/database.js";

const MAX_LOG_STRING_LENGTH = 300;
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const SENSITIVE_KEY_RE = /(password|token|secret|authorization|api[-_]?key|cookie)/i;

type AuditDetail = Record<string, any>;

function truncateString(value: string): string {
  if (value.length <= MAX_LOG_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_LOG_STRING_LENGTH)}...`;
}

function sanitizeForAudit(value: any, depth = 0): any {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return "[truncated]";

  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeForAudit(item, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, innerValue] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = sanitizeForAudit(innerValue, depth + 1);
      }
    }
    return out;
  }

  return String(value);
}

function getClientIp(req: any): string | null {
  const xForwardedFor = req.headers?.["x-forwarded-for"];
  if (typeof xForwardedFor === "string" && xForwardedFor.length > 0) {
    return xForwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

function shouldSkipPath(path: string): boolean {
  return path === "/api/health" || path === "/api/system/audit-logs";
}

export async function writeAudit(
  userId: number | null,
  action: string,
  resource: string,
  detail: AuditDetail
) {
  if (!isUsingDatabase()) return;
  await pool.query(
    "INSERT INTO audit_logs (user_id, action, resource, detail_json) VALUES ($1, $2, $3, $4::jsonb)",
    [userId, action, resource, JSON.stringify(sanitizeForAudit(detail || {}))]
  );
}

export function auditApiRequestMiddleware(req: any, res: any, next: any) {
  if (!req.path?.startsWith("/api/") || req.method === "OPTIONS" || shouldSkipPath(req.path)) {
    return next();
  }

  const startedAt = Date.now();
  const method = req.method;
  const resource = req.path;

  res.on("finish", () => {
    if (res.statusCode < 100) return;

    const detail: AuditDetail = {
      method,
      statusCode: res.statusCode,
      success: res.statusCode < 400,
      durationMs: Date.now() - startedAt,
      ip: getClientIp(req),
      userAgent: req.headers?.["user-agent"] || null,
      query: sanitizeForAudit(req.query || {}),
    };

    if (method !== "GET" && method !== "HEAD") {
      detail.body = sanitizeForAudit(req.body || {});
    }

    const userId = req.user?.id ?? null;

    void writeAudit(userId, method, resource, detail).catch((err: any) => {
      console.error("Failed to write audit log:", err?.message || err);
    });
  });

  next();
}
