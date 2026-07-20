import { useState, useEffect } from 'react';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import DeviceLinkPage from './components/DeviceLinkPage';
import DriveSharePage from './components/DriveSharePage';
import ToastContainer from './components/ToastContainer';
import { ToastProvider } from './context/ToastContext';
import api from './utils/api';
import { clearAuthSession, getTokenExpiresAt, isTokenExpired } from './utils/authSession';
import { cacheThemeMode, getCachedThemeMode, isThemeDark, normalizeThemeMode } from './utils/theme';

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    localStorage.removeItem('user');
    return null;
  }
};

const getStoredToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;
  if (isTokenExpired(token)) {
    clearAuthSession();
    return null;
  }
  return token;
};

export default function App() {
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [user, setUser] = useState<any>(getStoredUser);
  const [loginDarkMode, setLoginDarkMode] = useState(() => isThemeDark(getCachedThemeMode()));
  const [siteName, setSiteName] = useState('CloudSave Hub');
  const [deviceLinkToken, setDeviceLinkToken] = useState<string | null>(
    new URLSearchParams(window.location.search).get('device_link')
  );
  const shareMatch = window.location.pathname.match(/^\/share\/([^/]+)$/);
  const shareToken = shareMatch ? decodeURIComponent(shareMatch[1]) : null;

  const handleLogin = (newToken: string, newUser: any) => {
    cacheThemeMode(newUser?.theme_mode);
    setToken(newToken);
    setUser(newUser);
  };

  const handleUserUpdate = (nextUser: any) => {
    cacheThemeMode(nextUser?.theme_mode);
    setUser(nextUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  useEffect(() => {
    api.get('/public/auth-settings').then(({ data }) => {
      const nextSiteName = String(data?.siteName || '').trim();
      if (nextSiteName) setSiteName(nextSiteName);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!shareToken) document.title = siteName;
  }, [shareToken, siteName]);

  useEffect(() => {
    if (!token) return;
    const expiresAt = getTokenExpiresAt(token);
    if (!expiresAt) {
      handleLogout();
      return;
    }
    const expiryTimer = window.setTimeout(handleLogout, Math.max(0, expiresAt - Date.now()));
    api.get('/users/me').then(({ data }) => {
      localStorage.setItem('user', JSON.stringify(data));
      setUser(data);
    }).catch((error) => {
      if (error.response?.status === 401 || error.response?.status === 403) {
        handleLogout();
      }
    });
    return () => window.clearTimeout(expiryTimer);
  }, [token]);

  useEffect(() => {
    const applyTheme = () => {
      const mode = user?.theme_mode !== undefined ? normalizeThemeMode(user.theme_mode) : getCachedThemeMode();
      cacheThemeMode(mode);
      setLoginDarkMode(isThemeDark(mode));
    };
    applyTheme();
    const timer = window.setInterval(applyTheme, 60_000);
    return () => window.clearInterval(timer);
  }, [user?.theme_mode]);

  const handleLeaveDeviceLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('device_link');
    window.history.replaceState({}, '', url.toString());
    setDeviceLinkToken(null);
  };

  return (
    <ToastProvider>
      <div className="font-sans text-slate-900 bg-white">
        {shareToken ? (
          <DriveSharePage token={shareToken} siteName={siteName} />
        ) : deviceLinkToken ? (
          <div className="min-h-screen flex flex-col">
            <div className="flex-1">
              <DeviceLinkPage
                linkToken={deviceLinkToken}
                token={token}
                siteName={siteName}
                onLogin={handleLogin}
                onDone={handleLeaveDeviceLink}
              />
            </div>
            <footer className="border-t border-slate-200 bg-slate-50 py-6 text-center text-xs text-slate-500">
              <div className="max-w-7xl mx-auto px-4">
                © 2026 {siteName}. Tất cả quyền được bảo lưu.
              </div>
            </footer>
          </div>
        ) : token ? (
          <Dashboard onLogout={handleLogout} currentUser={user} onUserUpdate={handleUserUpdate} siteName={siteName} onSiteNameChange={setSiteName} />
        ) : (
          <div className="min-h-screen flex flex-col">
            <div className="flex-1">
              <Auth onLogin={handleLogin} darkMode={loginDarkMode} siteName={siteName} />
            </div>
            <footer className={`border-t py-6 text-center font-mono text-[10px] uppercase tracking-widest ${loginDarkMode ? 'border-cyan-400/10 bg-[#02050b] text-slate-600' : 'border-cyan-700/15 bg-slate-100 text-slate-500'}`}>
              <div className="max-w-7xl mx-auto px-4">
                © 2026 {siteName}. Tất cả quyền được bảo lưu.
              </div>
            </footer>
          </div>
        )}
        <ToastContainer />
      </div>
    </ToastProvider>
  );
}
