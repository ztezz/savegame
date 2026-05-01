import { useState, useEffect } from 'react';
import api from '../utils/api';

const DEFAULT_CATEGORIES = ['RPG', 'Action', 'Adventure', 'Simulation', 'Indie', 'Strategy', 'Sports', 'Other', 'Uncategorized'];

export const useDynamicCategories = () => {
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(false);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await api.get('/category/list');
      const fetchedCats = res.data.categories?.map((c: any) => c.name) || [];
      // Combine with defaults
      const allCats = Array.from(new Set([...DEFAULT_CATEGORIES, ...fetchedCats]));
      setCategories(allCats);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setCategories(DEFAULT_CATEGORIES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const addCategory = (categoryName: string) => {
    if (!categories.includes(categoryName)) {
      setCategories([...categories, categoryName]);
    }
  };

  return { categories, loading, fetchCategories, addCategory };
};
