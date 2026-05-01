import { useState, useEffect } from 'react';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('user') || 'null'));

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

  return (
    <div className="font-sans text-slate-900 bg-white min-h-screen">
      {token ? (
        <Dashboard onLogout={handleLogout} currentUser={user} />
      ) : (
        <Auth onLogin={handleLogin} />
      )}
    </div>
  );
}
