import { useState, useEffect } from 'react';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import DeviceLinkPage from './components/DeviceLinkPage';
import DriveSharePage from './components/DriveSharePage';
import ToastContainer from './components/ToastContainer';
import { ToastProvider } from './context/ToastContext';
import api from './utils/api';
import { clearAuthSession, getTokenExpiresAt, isTokenExpired } from './utils/authSession';

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
  const [deviceLinkToken, setDeviceLinkToken] = useState<string | null>(
    new URLSearchParams(window.location.search).get('device_link')
  );
  const shareMatch = window.location.pathname.match(/^\/share\/([^/]+)$/);
  const shareToken = shareMatch ? decodeURIComponent(shareMatch[1]) : null;

  const handleLogin = (newToken: string, newUser: any) => {
    setToken(newToken);
    setUser(newUser);
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
          <DriveSharePage token={shareToken} />
        ) : deviceLinkToken ? (
          <div className="min-h-screen flex flex-col">
            <div className="flex-1">
              <DeviceLinkPage
                linkToken={deviceLinkToken}
                token={token}
                onLogin={handleLogin}
                onDone={handleLeaveDeviceLink}
              />
            </div>
            <footer className="border-t border-slate-200 bg-slate-50 py-6 text-center text-xs text-slate-500">
              <div className="max-w-7xl mx-auto px-4">
                © 2026 CloudSave Hub. Tất cả quyền được bảo lưu.
              </div>
            </footer>
          </div>
        ) : token ? (
          <Dashboard onLogout={handleLogout} currentUser={user} onUserUpdate={setUser} />
        ) : (
          <div className="min-h-screen flex flex-col">
            <div className="flex-1">
              <Auth onLogin={handleLogin} />
            </div>
            <footer className="border-t border-cyan-400/10 bg-[#02050b] py-6 text-center font-mono text-[10px] uppercase tracking-widest text-slate-600">
              <div className="max-w-7xl mx-auto px-4">
                © 2026 CloudSave Hub. Tất cả quyền được bảo lưu.
              </div>
            </footer>
          </div>
        )}
        <ToastContainer />
      </div>
    </ToastProvider>
  );
}
