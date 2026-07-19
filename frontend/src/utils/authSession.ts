const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

export const getTokenExpiresAt = (token: string): number | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(base64));
    return Number.isFinite(decoded.exp) ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
};

export const isTokenExpired = (token: string, now = Date.now()) => {
  const expiresAt = getTokenExpiresAt(token);
  return expiresAt === null || expiresAt <= now;
};

export const logoutExpiredSession = () => {
  clearSession();
  window.dispatchEvent(new Event('auth:logout'));
};

export const getValidToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;
  if (isTokenExpired(token)) {
    logoutExpiredSession();
    return null;
  }
  return token;
};

export const clearAuthSession = clearSession;
