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
  if (Buffer.isBuffer(value)) return { type: "Buffer", bytes: value.length };

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
  const cleanPath = path.toLowerCase();
  return cleanPath === "/api/health"
    || cleanPath === "/api/system/audit-logs"
    || cleanPath === "/api/system/audit-stats"
    || cleanPath === "/api/sync/restore-status"
    || cleanPath === "/api/sync/agent-online"
    || cleanPath === "/api/sync/heartbeat"
    || cleanPath === "/api/task"
    || cleanPath.startsWith("/api/task/")
    || cleanPath === "/api/community/events"
    || cleanPath === "/api/community/active-users"
    || cleanPath.startsWith("/api/community/events/");
}

function isUploadPath(path: string): boolean {
  const cleanPath = path.toLowerCase();
  return cleanPath === "/api/activation/upload"
    || cleanPath.startsWith("/api/activation/upload/")
    || cleanPath === "/api/drive/upload"
    || cleanPath.startsWith("/api/drive/upload/")
    || cleanPath === "/api/save/upload"
    || cleanPath.startsWith("/api/save/upload/")
    || cleanPath === "/api/system/agent/windows";
}

function isDataSyncPath(path: string): boolean {
  const cleanPath = path.toLowerCase();
  return cleanPath.startsWith("/api/sync/")
    || cleanPath.startsWith("/api/saves/")
    || cleanPath.startsWith("/api/games/")
    || cleanPath.startsWith("/api/device-links/")
    || cleanPath.startsWith("/api/community/");
}

function isImportantSettingPath(path: string): boolean {
  const cleanPath = path.toLowerCase();
  return cleanPath.startsWith("/api/auth/")
    || cleanPath.startsWith("/api/users/")
    || cleanPath.startsWith("/api/system/")
    || cleanPath.startsWith("/api/activation/")
    || cleanPath.startsWith("/api/admin/sqlite/");
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
  
  // Tự động dọn dẹp giữ tối đa 1000 dòng audit logs gần nhất
  await pool.query(
    "DELETE FROM audit_logs WHERE id NOT IN (SELECT id FROM audit_logs ORDER BY id DESC LIMIT 1000)"
  ).catch((err: any) => {
    console.error("Failed to clean up old audit logs:", err?.message || err);
  });
}

function getActionDescription(method: string, path: string, statusCode: number): string {
  const cleanPath = path.toLowerCase();
  const isSuccess = statusCode >= 200 && statusCode < 300;

  if (cleanPath.startsWith("/api/auth/")) {
    if (cleanPath.includes("/login")) return isSuccess ? "Đăng nhập hệ thống thành công" : "Đăng nhập hệ thống thất bại";
    if (cleanPath.includes("/change-password")) return isSuccess ? "Đổi mật khẩu tài khoản thành công" : "Đổi mật khẩu tài khoản thất bại";
    return isSuccess ? "Xác thực tài khoản thành công" : "Xác thực tài khoản thất bại";
  }
  if (cleanPath.startsWith("/api/users/")) {
    if (method === "POST") return isSuccess ? "Tạo tài khoản người dùng mới thành công" : "Tạo tài khoản người dùng thất bại";
    if (method === "PUT" || method === "PATCH") return isSuccess ? "Cập nhật thông tin tài khoản thành công" : "Cập nhật thông tin tài khoản thất bại";
    if (method === "DELETE") return isSuccess ? "Xóa tài khoản người dùng thành công" : "Xóa tài khoản người dùng thất bại";
    return isSuccess ? "Thao tác trên tài khoản người dùng" : "Thao tác trên tài khoản thất bại";
  }
  if (cleanPath.startsWith("/api/system/")) {
    if (cleanPath.includes("/settings")) return isSuccess ? "Cập nhật cài đặt cấu hình hệ thống thành công" : "Cập nhật cài đặt cấu hình thất bại";
    if (cleanPath.includes("/agent/windows")) return isSuccess ? "Cập nhật ứng dụng Agent Windows" : "Cập nhật Agent Windows thất bại";
    return isSuccess ? "Cấu hình hệ thống" : "Cấu hình hệ thống thất bại";
  }
  if (cleanPath.startsWith("/api/activation/")) {
    return isSuccess ? "Cập nhật thông tin kích hoạt bản quyền thành công" : "Cập nhật thông tin kích hoạt thất bại";
  }
  if (cleanPath.startsWith("/api/admin/sqlite/")) {
    if (cleanPath.includes("/query")) return isSuccess ? "Thực thi câu lệnh SQL trực tiếp thành công" : "Thực thi câu lệnh SQL thất bại";
    return isSuccess ? "Tác vụ quản trị cơ sở dữ liệu SQLite thành công" : "Tác vụ quản trị cơ sở dữ liệu thất bại";
  }
  return `${method} ${path}`;
}

function getActionKey(method: string, path: string, statusCode: number): string {
  const cleanPath = path.toLowerCase();
  const isSuccess = statusCode >= 200 && statusCode < 300;

  if (cleanPath.startsWith("/api/auth/")) {
    if (cleanPath.includes("/login")) return "Đăng nhập";
    if (cleanPath.includes("/change-password")) return "Đổi mật khẩu";
  }
  if (cleanPath.startsWith("/api/admin/sqlite/")) return "SQLite";

  if (method === "POST") return "Tạo mới";
  if (method === "PUT" || method === "PATCH") return "Cập nhật";
  if (method === "DELETE") return "Xóa";

  return method;
}

export function auditApiRequestMiddleware(req: any, res: any, next: any) {
  if (
    !req.path?.startsWith("/api/") ||
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS" ||
    shouldSkipPath(req.path) ||
    !isImportantSettingPath(req.path)
  ) {
    return next();
  }

  const method = req.method;
  const resource = req.path;

  res.on("finish", () => {
    if (res.statusCode < 100) return;

    // Lưu {} trống hoàn toàn để giảm tải tối đa cho cơ sở dữ liệu
    const detail = {};

    const actionKey = getActionKey(method, resource, res.statusCode);
    const description = getActionDescription(method, resource, res.statusCode);
    const userId = req.user?.id ?? null;

    void writeAudit(userId, actionKey, description, detail).catch((err: any) => {
      console.error("Failed to write audit log:", err?.message || err);
    });
  });

  next();
}
