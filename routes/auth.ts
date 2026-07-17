import { Router } from "express";
import jwt from "jsonwebtoken";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { pool, isUsingDatabase } from "../config/database.js";
import { JWT_SECRET } from "../config/environment.js";
import { User } from "../database/types.js";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import { writeAudit } from "../utils/audit.js";

// Mock users for demo mode
let users: User[] = [];
let nextId = 2;

// Initialize mock admin
(async () => {
  if (process.env.NODE_ENV === 'production') return;
  const hash = await bcrypt.hash('admin123', 10);
  users.push({ id: 1, username: 'admin', email: 'admin@cloudsave.local', role: 'Admin', status: 'Active', passwordHash: hash, createdAt: new Date().toISOString() });
})();

export const authRouter = Router();

const MAX_LOGIN_FAILURES_BEFORE_CAPTCHA = 3;
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const DEFAULT_ALLOW_SELF_REGISTER = false;
const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX = 30;
const loginFailures = new Map<string, { count: number; lastFailedAt: number }>();
const captchaChallenges = new Map<string, { answer: string; expiresAt: number; key: string }>();
const authRateLimits = new Map<string, { count: number; resetAt: number }>();

function authRateLimit(req: any, res: any, next: any) {
  const key = req.ip || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const current = authRateLimits.get(key);

  if (!current || current.resetAt <= now) {
    authRateLimits.set(key, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (current.count >= AUTH_RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({ error: "Too many authentication attempts. Please try again later." });
  }

  current.count += 1;
  return next();
}

async function isSelfRegisterAllowed() {
  if (!isUsingDatabase()) return DEFAULT_ALLOW_SELF_REGISTER;

  try {
    const { rows } = await pool.query("SELECT value_json FROM system_settings WHERE key = 'security'");
    return Boolean(rows[0]?.value_json?.allowSelfRegister);
  } catch (err: any) {
    console.error('Failed to load registration setting:', err?.message || err);
    return DEFAULT_ALLOW_SELF_REGISTER;
  }
}

function getLoginKey(req: any, username: string): string {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  return `${ip}:${username.toLowerCase().trim()}`;
}

function recordLoginFailure(key: string): number {
  const current = loginFailures.get(key);
  const next = { count: (current?.count ?? 0) + 1, lastFailedAt: Date.now() };
  loginFailures.set(key, next);
  return next.count;
}

function createCaptcha(key: string) {
  const left = Math.floor(Math.random() * 8) + 2;
  const right = Math.floor(Math.random() * 8) + 2;
  const token = randomBytes(18).toString("hex");
  captchaChallenges.set(token, {
    answer: String(left + right),
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
    key,
  });
  return { token, question: `${left} + ${right} = ?`, expiresInSeconds: CAPTCHA_TTL_MS / 1000 };
}

function verifyCaptcha(key: string, token: unknown, answer: unknown): boolean {
  if (typeof token !== "string" || typeof answer !== "string") return false;
  const challenge = captchaChallenges.get(token);
  captchaChallenges.delete(token);
  if (!challenge || challenge.key !== key || challenge.expiresAt < Date.now()) return false;
  return challenge.answer === answer.trim();
}

function captchaError(res: any, key: string, error = "Vui lòng nhập mã xác minh") {
  return res.status(403).json({
    error,
    captchaRequired: true,
    captcha: createCaptcha(key),
  });
}



function logAuthAudit(userId: number | null, action: string, detail: any) {
  void writeAudit(userId, action, "auth", detail).catch((err: any) => {
    console.error("Failed to write auth audit:", err?.message || err);
  });
}
authRouter.post("/api/auth/register", authRateLimit, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  if (!(await isSelfRegisterAllowed())) {
    logAuthAudit(null, 'AUTH_REGISTER_FAILED', { username, reason: 'self_register_disabled' });
    return res.status(403).json({ error: "Self registration is disabled" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  if (isUsingDatabase()) {
    try {
      const role = 'User';
      await pool.query('INSERT INTO users (username, display_name, password_hash, role) VALUES ($1, $2, $3, $4)', [username, username, passwordHash, role]);
      logAuthAudit(null, 'AUTH_REGISTER', { username, success: true });
      return res.status(201).json({ message: "User registered" });
    } catch (err: any) {
      console.error('❌ Registration error:', err);
      if (err.code === '23505') {
        logAuthAudit(null, 'AUTH_REGISTER_FAILED', { username, reason: 'user_exists' });
        return res.status(400).json({ error: "User already exists" });
      }
      logAuthAudit(null, 'AUTH_REGISTER_FAILED', { username, reason: 'database_error' });
      return res.status(500).json({ error: "Database error: " + err.message });
    }
  } else {
    if (users.find(u => u.username === username)) {
      logAuthAudit(null, 'AUTH_REGISTER_FAILED', { username, reason: 'user_exists' });
      return res.status(400).json({ error: "User already exists" });
    }
    const newUser = { 
      id: nextId++, 
      username, 
      passwordHash, 
      role: 'User', 
      status: 'Active', 
      createdAt: new Date().toISOString() 
    };
    users.push(newUser);
    logAuthAudit(null, 'AUTH_REGISTER', { username, success: true, demoMode: true });
    res.status(201).json({ message: "User registered" });
  }
});

authRouter.post("/api/auth/login", authRateLimit, async (req, res) => {
  const { username, password, captchaToken, captchaAnswer } = req.body;

  if (!username || !password) {
    console.log('Login: Missing username or password');
    logAuthAudit(null, 'AUTH_LOGIN_FAILED', { username, reason: 'missing_credentials' });
    return res.status(400).json({ error: "Username and password are required" });
  }

  const loginKey = getLoginKey(req, username);
  const failureCount = loginFailures.get(loginKey)?.count ?? 0;
  if (failureCount >= MAX_LOGIN_FAILURES_BEFORE_CAPTCHA && !verifyCaptcha(loginKey, captchaToken, captchaAnswer)) {
    logAuthAudit(null, 'AUTH_LOGIN_FAILED', { username, reason: 'captcha_failed' });
    return captchaError(res, loginKey, "Mã xác minh không đúng hoặc đã hết hạn");
  }

  const rejectLogin = () => {
    const failedCount = recordLoginFailure(loginKey);
    logAuthAudit(null, 'AUTH_LOGIN_FAILED', {
      username,
      reason: 'invalid_credentials',
      failedCount,
      captchaRequired: failedCount >= MAX_LOGIN_FAILURES_BEFORE_CAPTCHA,
    });
    if (failedCount >= MAX_LOGIN_FAILURES_BEFORE_CAPTCHA) {
      return captchaError(res, loginKey, "Tên đăng nhập hoặc mật khẩu không đúng");
    }
    return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không đúng" });
  };

  let user: User | null = null;
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

      if (rows.length === 0) {
        return rejectLogin();
      }

      const dbUser = rows[0];

      if (dbUser.status !== 'Active') {
        logAuthAudit(dbUser.id || null, 'AUTH_LOGIN_FAILED', { username, reason: 'account_locked' });
        return res.status(403).json({ error: "Tài khoản đã bị khóa" });
      }

      if (!dbUser.password_hash || !dbUser.password_hash.startsWith('$2')) {
        logAuthAudit(dbUser.id || null, 'AUTH_LOGIN_FAILED', { username, reason: 'invalid_password_hash' });
        return res.status(401).json({ error: "Invalid credentials - password not properly configured" });
      }

      const passwordMatch = await bcrypt.compare(password, dbUser.password_hash);
      if (!passwordMatch) {
        return rejectLogin();
      }

      user = {
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        role: dbUser.role,
        status: dbUser.status,
        passwordHash: dbUser.password_hash,
        createdAt: dbUser.created_at
      };
    } catch (err: any) {
      logAuthAudit(null, 'AUTH_LOGIN_FAILED', { username, reason: 'database_error' });
      return res.status(500).json({ error: "Database error: " + err.message });
    }
  } else {
    user = users.find(u => u.username === username) || null;
    if (!user) {
      return rejectLogin();
    }
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return rejectLogin();
    }
  }

  if (!user) {
    logAuthAudit(null, 'AUTH_LOGIN_FAILED', { username, reason: 'unknown' });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
  loginFailures.delete(loginKey);
  await writeAudit(user.id, 'AUTH_LOGIN_SUCCESS', 'auth', { username, role: user.role });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

authRouter.post("/api/auth/change-password", authenticateToken, async (req: any, res: any) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!oldPassword || !newPassword) {
    logAuthAudit(userId || null, 'AUTH_CHANGE_PASSWORD_FAILED', { reason: 'missing_fields' });
    return res.status(400).json({ error: "Old password and new password are required" });
  }

  if (newPassword.length < 6) {
    logAuthAudit(userId || null, 'AUTH_CHANGE_PASSWORD_FAILED', { reason: 'weak_password' });
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }

  try {
    let user: User | null = null;

    if (isUsingDatabase()) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      if (rows.length === 0) {
        logAuthAudit(userId || null, 'AUTH_CHANGE_PASSWORD_FAILED', { reason: 'user_not_found' });
        return res.status(404).json({ error: "User not found" });
      }
      user = {
        id: rows[0].id,
        username: rows[0].username,
        email: rows[0].email,
        role: rows[0].role,
        status: rows[0].status,
        passwordHash: rows[0].password_hash,
        createdAt: rows[0].created_at
      };
    } else {
      user = users.find(u => u.id === userId) || null;
      if (!user) {
        logAuthAudit(userId || null, 'AUTH_CHANGE_PASSWORD_FAILED', { reason: 'user_not_found' });
        return res.status(404).json({ error: "User not found" });
      }
    }

    const passwordMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!passwordMatch) {
      logAuthAudit(userId || null, 'AUTH_CHANGE_PASSWORD_FAILED', { reason: 'old_password_incorrect' });
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    if (isUsingDatabase()) {
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);
      await writeAudit(userId, 'AUTH_CHANGE_PASSWORD', 'auth', { username: user.username, success: true });
      return res.json({ message: "Password changed successfully" });
    }

    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      users[userIndex].passwordHash = newPasswordHash;
      logAuthAudit(userId, 'AUTH_CHANGE_PASSWORD', { username: user.username, success: true, demoMode: true });
      return res.json({ message: "Password changed successfully" });
    }

    logAuthAudit(userId || null, 'AUTH_CHANGE_PASSWORD_FAILED', { reason: 'user_not_found' });
    return res.status(404).json({ error: "User not found" });
  } catch (err: any) {
    console.error('Change password error:', err);
    logAuthAudit(userId || null, 'AUTH_CHANGE_PASSWORD_FAILED', { reason: 'database_error' });
    return res.status(500).json({ error: "Database error: " + err.message });
  }
});

// Diagnostic endpoint for debugging login and save issues
authRouter.get("/api/auth/diagnose", authenticateToken, isAdmin, async (req: any, res) => {
  const results: any = {
    timestamp: new Date().toISOString(),
    adminAccount: null,
    allUsers: null,
    savesWithNoFile: null,
    error: null
  };

  try {
    if (isUsingDatabase()) {
      // Check admin account
      const adminRes = await pool.query("SELECT id, username, password_hash, role FROM users WHERE username = 'admin'");
      if (adminRes.rows.length > 0) {
        const admin = adminRes.rows[0];
        results.adminAccount = {
          exists: true,
          id: admin.id,
          username: admin.username,
          role: admin.role,
          hasValidHash: Boolean(admin.password_hash && admin.password_hash.startsWith('$2'))
        };
      } else {
        results.adminAccount = { exists: false, message: "Admin account not found" };
      }

      const usersRes = await pool.query("SELECT COUNT(*) AS count FROM users");
      results.allUsers = { count: Number(usersRes.rows[0].count) };

      // Find saves with IDs 10 and 11 specifically
      const missingRes = await pool.query("SELECT id, game_id, file_path, version FROM saves WHERE id IN (10, 11)");
      const foundSaves = missingRes.rows;
      results.savesWithIds10_11 = foundSaves.length > 0 ? foundSaves : { message: "Saves 10 and 11 not found" };

      // Get total saves count
      const countRes = await pool.query("SELECT COUNT(*) FROM saves");
      results.totalSaves = parseInt(countRes.rows[0].count);

    } else {
      results.adminAccount = { message: "Using demo mode (no database)" };
      results.allUsers = users;
    }

    res.json(results);
  } catch (err: any) {
    console.error('❌ Diagnostic error:', err);
    results.error = err.message;
    res.status(500).json(results);
  }
});

export { users, nextId as initialNextId };


