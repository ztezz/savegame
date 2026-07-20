export type ThemeMode = 'light' | 'dark' | 'auto';

export const THEME_MODE_CACHE_KEY = 'accountThemeMode';

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

export function isThemeDark(mode: ThemeMode, date = new Date()) {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  const hour = date.getHours();
  return hour < 6 || hour >= 18;
}

export function getCachedThemeMode(): ThemeMode {
  return normalizeThemeMode(localStorage.getItem(THEME_MODE_CACHE_KEY));
}

export function cacheThemeMode(mode: unknown) {
  localStorage.setItem(THEME_MODE_CACHE_KEY, normalizeThemeMode(mode));
}
