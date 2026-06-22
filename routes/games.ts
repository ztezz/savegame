import { Router } from "express";
import { pool, isUsingDatabase } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { Game } from "../database/types.js";

// Mock data
let games: Game[] = [];

export const gamesRouter = Router();

gamesRouter.put("/api/game/:id", authenticateToken, async (req: any, res) => {
  const gameId = parseInt(req.params.id);
  const { gameName, category } = req.body;

  if (!gameName || gameName.trim() === '') {
    return res.status(400).json({ error: "Game name is required" });
  }

  if (isUsingDatabase()) {
    try {
      const gameCheck = await pool.query(
        'SELECT * FROM games WHERE id = $1 AND user_id = $2',
        [gameId, req.user.id]
      );
      if (gameCheck.rows.length === 0) {
        return res.status(404).json({ error: "Game not found" });
      }

      await pool.query(
        'UPDATE games SET game_name = $1, category = $2 WHERE id = $3 AND user_id = $4',
        [gameName.trim(), category || 'Uncategorized', gameId, req.user.id]
      );
      res.json({ message: "Game updated successfully" });
    } catch (err) {
      console.error('❌ Error updating game:', err);
      res.status(500).json({ error: "Database error" });
    }
  } else {
    const game = games.find(g => g.id === gameId && g.userId === req.user.id);
    if (!game) return res.status(404).json({ error: "Game not found" });

    game.gameName = gameName.trim();
    if (category) game.category = category;
    res.json({ message: "Game updated successfully" });
  }
});

export { games };
