import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/environment.js";
import { pool, isUsingDatabase } from "../config/database.js";

export const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const isNoisyPollPath = req.path === '/api/sync/restore-status' || req.path === '/api/sync/agent-online' || req.path === '/api/task';
  if (!isNoisyPollPath) {
    console.log(`🔐 Auth check for ${req.method} ${req.path}:`, authHeader ? 'Header present' : 'NO HEADER');
  }

  // --- Device API Key auth ---
  // Accept "Authorization: ApiKey <key>" from the Python restore agent.
  if (authHeader && authHeader.startsWith('ApiKey ')) {
    const apiKey = authHeader.slice(7).trim();
    if (!apiKey) return res.sendStatus(401);

    if (isUsingDatabase()) {
      try {
        const { rows } = await pool.query(
          `UPDATE device_api_keys
           SET last_used_at = NOW()
           WHERE api_key = $1
           RETURNING user_id, device_name`,
          [apiKey]
        );
        if (rows.length === 0) {
          if (!isNoisyPollPath) console.log('❌ ApiKey not found');
          return res.sendStatus(401);
        }
        const { rows: userRows } = await pool.query(
          'SELECT id, username, role FROM users WHERE id = $1',
          [rows[0].user_id]
        );
        if (userRows.length === 0) return res.sendStatus(401);
        req.user = { id: userRows[0].id, username: userRows[0].username, role: userRows[0].role };
        if (!isNoisyPollPath) console.log('✅ ApiKey auth - User:', req.user.username, 'Device:', rows[0].device_name);
        return next();
      } catch (err: any) {
        console.error('⚠️  ApiKey DB error:', err.message);
        return res.sendStatus(500);
      }
    }
    // Demo mode: ApiKey not supported
    return res.sendStatus(401);
  }

  // --- JWT Bearer auth (web UI) ---
  const queryDownloadToken = req.method === 'GET' && req.path.startsWith('/api/drive/download/') ? String(req.query?.token || '') : '';
  const token = (authHeader && authHeader.split(' ')[1]) || queryDownloadToken;

  if (!token) {
    console.log('❌ No token found');
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, async (err: any, user: any) => {
    if (err) {
      if (!isNoisyPollPath) console.log('❌ Token verification failed:', err.message);
      return res.sendStatus(403);
    }
    if (!isNoisyPollPath) console.log('✅ Token verified - User:', user);
    
    if (isUsingDatabase()) {
      try {
        const { rows } = await pool.query('SELECT id, username, role FROM users WHERE username = $1', [user.username]);
        if (rows.length > 0) {
          req.user = { ...user, id: rows[0].id };
          if (!isNoisyPollPath) console.log('✅ User loaded from DB:', req.user);
        } else {
          console.log('⚠️  User not found in database');
          return res.status(401).json({ error: 'User no longer exists. Please sign in again.' });
        }
      } catch (dbErr: any) {
        console.error('⚠️  DB error fetching user:', dbErr.message);
        return res.status(500).json({ error: 'Authentication database error' });
      }
    } else {
      req.user = user;
      console.log('✅ Using JWT user data (demo mode):', req.user);
    }
    
    next();
  });
};

export const isAdmin = (req: any, res: any, next: any) => {
  if (req.user && (req.user.role === 'Admin' || req.user.username === 'admin')) {
    next();
  } else {
    res.status(403).json({ error: "Admin access required" });
  }
};
