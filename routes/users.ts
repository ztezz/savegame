import { Router } from "express";
import * as bcrypt from "bcryptjs";
import { pool, isUsingDatabase } from "../config/database.js";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import { User } from "../database/types.js";

// Mock users (shared with auth router via import)
let users: User[] = [];
let nextId = 2;

export const usersRouter = Router();


usersRouter.get("/api/users/me", authenticateToken, async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query('SELECT id, username, display_name, email, role, status, created_at FROM users WHERE id = $1', [userId]);
      if (rows.length === 0) return res.status(404).json({ error: "User not found" });
      return res.json({ ...rows[0], name: rows[0].display_name, createdAt: rows[0].created_at });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  const user = users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { passwordHash, ...safeUser } = user as any;
  return res.json(safeUser);
});

usersRouter.put("/api/users/me", authenticateToken, async (req: any, res) => {
  const userId = req.user?.id;
  const { display_name, email } = req.body;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (display_name !== undefined && String(display_name).trim().length < 2) {
    return res.status(400).json({ error: "Display name must be at least 2 characters" });
  }
  if (email !== undefined && String(email).trim() && !/^\S+@\S+\.\S+$/.test(String(email).trim())) {
    return res.status(400).json({ error: "Invalid email" });
  }

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        'UPDATE users SET display_name = COALESCE($1, display_name), email = COALESCE($2, email) WHERE id = $3 RETURNING id, username, display_name, email, role, status, created_at',
        [display_name ? String(display_name).trim() : null, email ? String(email).trim() : null, userId]
      );
      if (rows.length === 0) return res.status(404).json({ error: "User not found" });
      return res.json({ user: { ...rows[0], name: rows[0].display_name, createdAt: rows[0].created_at } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return res.status(404).json({ error: "User not found" });
  (users[idx] as any).display_name = display_name ? String(display_name).trim() : (users[idx] as any).display_name;
  users[idx].email = email ? String(email).trim() : users[idx].email;
  const { passwordHash, ...safeUser } = users[idx] as any;
  return res.json({ user: safeUser });
});

usersRouter.get("/api/users", authenticateToken, isAdmin, async (req, res) => {
  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query('SELECT id, username, display_name, email, role, status, created_at FROM users ORDER BY id ASC');
      res.json(rows.map(r => ({ ...r, name: r.display_name, createdAt: r.created_at })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } else {
    res.json(users.map(({ passwordHash, ...u }) => u));
  }
});

usersRouter.post("/api/users", authenticateToken, isAdmin, async (req, res) => {
  const { username, display_name, email, role, status, password } = req.body;
  const passwordHash = password ? await bcrypt.hash(password, 10) : '';

  if (isUsingDatabase()) {
    try {
      const { rows } = await pool.query(
        'INSERT INTO users (username, display_name, email, role, status, password_hash) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, display_name, email, role, status, created_at',
        [username, display_name || username, email, role, status, passwordHash]
      );
      res.status(201).json({ ...rows[0], name: rows[0].display_name });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const newUser = { id: nextId++, username, email, role, status, passwordHash, createdAt: new Date().toISOString() };
    users.push(newUser);
    res.status(201).json(newUser);
  }
});

usersRouter.put("/api/users/:id", authenticateToken, isAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { username, display_name, email, role, status, password } = req.body;

  if (isUsingDatabase()) {
    try {
      let query = 'UPDATE users SET username = $1, display_name = $2, email = $3, role = $4, status = $5';
      let params: any[] = [username, display_name || username, email, role, status, id];
      if (password) {
        const passwordHash = await bcrypt.hash(password, 10);
        query += ', password_hash = $6 WHERE id = $7';
        params = [username, display_name || username, email, role, status, passwordHash, id];
      } else {
        query += ' WHERE id = $6';
      }
      await pool.query(query, params);
      res.json({ message: "User updated" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } else {
    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) return res.status(404).json({ error: "User not found" });
    users[userIndex] = { ...users[userIndex], username, email, role, status };
    if (password) users[userIndex].passwordHash = await bcrypt.hash(password, 10);
    res.json({ message: "User updated" });
  }
});

usersRouter.delete("/api/users/:id", authenticateToken, isAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isUsingDatabase()) {
    try {
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      res.json({ message: "User deleted" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  } else {
    users = users.filter(u => u.id !== id);
    res.json({ message: "User deleted" });
  }
});

export { users, nextId };
