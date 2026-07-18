import { Router } from 'express';
import { pool, isUsingDatabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

export const categoryRouter = Router();

// Get all categories
categoryRouter.get('/api/category/list', authenticateToken, async (req: any, res: any) => {
  try {
    if (isUsingDatabase()) {
      const { rows } = await pool.query(
        `WITH category_names AS (
           SELECT name FROM categories WHERE user_id = $1
           UNION
           SELECT DISTINCT category AS name
           FROM games
           WHERE user_id = $1 AND category IS NOT NULL AND category != 'Uncategorized'
         )
         SELECT category_names.name, COUNT(games.id) AS game_count
         FROM category_names
         LEFT JOIN games
           ON games.user_id = $1 AND games.category = category_names.name
         GROUP BY category_names.name
         ORDER BY category_names.name`,
        [req.user.id]
      );
      const categories = rows.map(r => ({ id: r.name, name: r.name, game_count: Number(r.game_count || 0) }));
      res.json({ categories });
    } else {
      res.json({ categories: [] });
    }
  } catch (err: any) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create/Add category (by tagging a game with new category)
categoryRouter.post('/api/category/create', authenticateToken, async (req: any, res: any) => {
  const { name } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  try {
    if (isUsingDatabase()) {
      const { rows } = await pool.query(
        `SELECT 1 FROM categories WHERE user_id = $1 AND name = $2
         UNION
         SELECT 1 FROM games WHERE user_id = $1 AND category = $2
         LIMIT 1`,
        [req.user.id, name.trim()]
      );
      
      if (rows.length > 0) {
        return res.status(409).json({ error: 'Category already exists' });
      }

      await pool.query(
        `INSERT INTO categories (user_id, name) VALUES ($1, $2)`,
        [req.user.id, name.trim()]
      );

      res.json({ message: 'Category created successfully', category: { id: name.trim(), name: name.trim() } });
    } else {
      res.json({ message: 'Category created successfully' });
    }
  } catch (err: any) {
    console.error('Error creating category:', err);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category name
categoryRouter.post('/api/category/update', authenticateToken, async (req: any, res: any) => {
  const { id, name } = req.body;
  
  if (!id || !name || !name.trim()) {
    return res.status(400).json({ error: 'Category ID and new name are required' });
  }

  try {
    if (isUsingDatabase()) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows } = await client.query(
          `SELECT 1 FROM categories WHERE user_id = $1 AND name = $2 AND name != $3
           UNION
           SELECT 1 FROM games WHERE user_id = $1 AND category = $2 AND category != $3
           LIMIT 1`,
          [req.user.id, name.trim(), id]
        );

        if (rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Category already exists' });
        }

        await client.query(
          `INSERT INTO categories (user_id, name) VALUES ($1, $2)
           ON CONFLICT (user_id, name) DO NOTHING`,
          [req.user.id, id]
        );
        await client.query(
          `UPDATE categories SET name = $1 WHERE user_id = $2 AND name = $3`,
          [name.trim(), req.user.id, id]
        );
        await client.query(
          `UPDATE games SET category = $1 WHERE user_id = $2 AND category = $3`,
          [name.trim(), req.user.id, id]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      res.json({ message: 'Category updated successfully' });
    } else {
      res.json({ message: 'Category updated successfully' });
    }
  } catch (err: any) {
    console.error('Error updating category:', err);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category (set to Uncategorized)
categoryRouter.post('/api/category/delete', authenticateToken, async (req: any, res: any) => {
  const { id } = req.body;
  
  if (!id) {
    return res.status(400).json({ error: 'Category ID is required' });
  }

  try {
    if (isUsingDatabase()) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `DELETE FROM categories WHERE user_id = $1 AND name = $2`,
          [req.user.id, id]
        );
        await client.query(
          `UPDATE games SET category = 'Uncategorized' WHERE user_id = $1 AND category = $2`,
          [req.user.id, id]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      res.json({ message: 'Category deleted successfully' });
    } else {
      res.json({ message: 'Category deleted successfully' });
    }
  } catch (err: any) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});
