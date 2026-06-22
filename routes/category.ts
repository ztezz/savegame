import { Router } from 'express';
import { pool, isUsingDatabase } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

export const categoryRouter = Router();

// Get all categories
categoryRouter.get('/api/category/list', authenticateToken, async (req: any, res: any) => {
  try {
    if (isUsingDatabase()) {
      const { rows } = await pool.query(
        `SELECT DISTINCT category FROM games WHERE user_id = $1 AND category IS NOT NULL AND category != 'Uncategorized' ORDER BY category`,
        [req.user.id]
      );
      const categories = rows.map(r => ({ id: r.category, name: r.category }));
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
      // Just validate - category will be created when a game is created/updated with this category
      const { rows } = await pool.query(
        `SELECT COUNT(*) as count FROM games WHERE user_id = $1 AND category = $2`,
        [req.user.id, name.trim()]
      );
      
      if (rows[0].count > 0) {
        return res.status(409).json({ error: 'Category already exists' });
      }

      // Create a placeholder game with this category (optional, or just acknowledge success)
      res.json({ message: 'Category created successfully', category: { id: name, name: name } });
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
      // Update all games with old category to new category
      await pool.query(
        `UPDATE games SET category = $1 WHERE user_id = $2 AND category = $3`,
        [name.trim(), req.user.id, id]
      );
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
      // Set games with this category to Uncategorized
      await pool.query(
        `UPDATE games SET category = 'Uncategorized' WHERE user_id = $1 AND category = $2`,
        [req.user.id, id]
      );
      res.json({ message: 'Category deleted successfully' });
    } else {
      res.json({ message: 'Category deleted successfully' });
    }
  } catch (err: any) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});
