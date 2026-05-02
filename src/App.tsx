import { useState, useEffect } from 'react';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import DeviceLinkPage from './components/DeviceLinkPage';
import ToastContainer from './components/ToastContainer';
import { ToastProvider } from './context/ToastContext';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('user') || 'null'));
  const [deviceLinkToken, setDeviceLinkToken] = useState<string | null>(
    new URLSearchParams(window.location.search).get('device_link')
  );

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

  const handleLeaveDeviceLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('device_link');
    window.history.replaceState({}, '', url.toString());
    setDeviceLinkToken(null);
  };

  return (
    <ToastProvider>
      <div className="font-sans text-slate-900 bg-white min-h-screen">
        {deviceLinkToken ? (
          <DeviceLinkPage
            linkToken={deviceLinkToken}
            token={token}
            onLogin={handleLogin}
            onDone={handleLeaveDeviceLink}
          />
        ) : token ? (
          <Dashboard onLogout={handleLogout} currentUser={user} />
        ) : (
          <Auth onLogin={handleLogin} />
        )}
        <ToastContainer />
      </div>
    </ToastProvider>
  );
}
