import React, { useState } from 'react';
import api from '../utils/api';
import { Mail, Lock, User, Database, ArrowRight, ShieldCheck, Zap, Download } from 'lucide-react';
import { motion } from 'motion/react';

export default function Auth({ onLogin }: { onLogin: (token: string, user: any) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [showDownload, setShowDownload] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [apps, setApps] = useState<any[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const res = await api.post(endpoint, { username, password });
      
      if (isLogin) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        onLogin(res.data.token, res.data.user);
      } else {
        alert('Đăng ký thành công! Vui lòng đăng nhập.');
        setIsLogin(true);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Xác thực thất bại');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableApps = async () => {
    try {
      setAppsLoading(true);
      const response = await api.get('/download/apps');
      setApps(response.data);
    } catch (err) {
      console.error('Failed to fetch apps:', err);
      setApps([]);
    } finally {
      setAppsLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    return `${mb} MB`;
  };

  const handleDownload = async (filename: string) => {
    try {
      setDownloading(filename);
      const response = await api.get(`/download/app/${filename}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Tải xuống thất bại');
      console.error(err);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50 font-sans">
      {/* Left side - Geometric Visual */}
      <div className="hidden lg:flex bg-slate-900 items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,#4f46e5,transparent_60%)] opacity-20"></div>
        <div className="absolute top-0 right-0 p-12">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]"></div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">System Online</span>
            </div>
        </div>

        <div className="relative z-10 p-12 max-w-xl">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-2xl shadow-indigo-500/20">
               <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">CloudSave<span className="text-indigo-400">Hub</span></h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black">Hạ tầng Vsync</p>
            </div>
          </div>

          <h2 className="text-5xl font-black text-white mb-8 leading-tight tracking-tighter">
            Ổn định <br/>
            <span className="text-indigo-500">Tuyệt đối</span> cho <br/>
            Dữ liệu Game.
          </h2>

          <div className="grid grid-cols-2 gap-4 mt-12">
            <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 backdrop-blur-md">
               <Zap className="w-5 h-5 text-indigo-400 mb-3" />
               <div className="text-white text-sm font-bold">Đẩy/Kéo Siêu Tốc</div>
               <div className="text-slate-500 text-xs mt-1 leading-relaxed">Truyền tải dạng luồng tối ưu cho VPS độ trễ cao.</div>
            </div>
            <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 backdrop-blur-md">
               <ShieldCheck className="w-5 h-5 text-emerald-400 mb-3" />
               <div className="text-white text-sm font-bold">Bảo mật SHA-256</div>
               <div className="text-slate-500 text-xs mt-1 leading-relaxed">Tự động giải quyết xung đột và xác thực tệp tin.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form Panel */}
      <div className="flex items-center justify-center p-8 lg:p-24 bg-white relative">
        <div className="absolute top-0 right-0 p-8 flex gap-4 hidden sm:flex">
          <div className="text-right">
             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Phiên bản Hệ thống</p>
             <p className="text-xs font-mono text-slate-700">v2.4.0-tổn định</p>
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          {/* Tab Navigation */}
          <div className="flex gap-2 mb-8">
            <button
              onClick={() => {
                setShowDownload(false);
                setIsLogin(true);
              }}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                !showDownload 
                  ? 'bg-slate-900 text-white shadow-lg' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Đăng nhập
            </button>
            <button
              onClick={() => {
                setShowDownload(true);
                if (apps.length === 0) {
                  fetchAvailableApps();
                }
              }}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                showDownload 
                  ? 'bg-emerald-600 text-white shadow-lg' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Download className="w-4 h-4" />
              Tải App
            </button>
          </div>

          {/* Download Section */}
          {showDownload ? (
            <div>
              <div className="mb-8">
                <h3 className="text-2xl font-black text-slate-900 mb-2">
                  Tải Desktop App
                </h3>
                <p className="text-slate-500 text-sm">
                  Tải CloudSave Client để đồng bộ game saves nhanh chóng
                </p>
              </div>

              {appsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-slate-500">Đang tải danh sách phiên bản...</p>
                </div>
              ) : apps.length > 0 ? (
                <div className="space-y-4">
                  {apps.map((app) => (
                    <div key={app.name} className={`p-4 rounded-xl border-2 transition-all ${
                      app.type === 'installer' 
                        ? 'border-green-200 bg-green-50 hover:border-green-400' 
                        : 'border-amber-200 bg-amber-50 hover:border-amber-400'
                    }`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-bold text-slate-900">
                            {app.type === 'installer' ? '📦 Installer' : '🚀 Portable'}
                          </h4>
                          <p className="text-xs text-slate-600 mt-1">{app.description}</p>
                        </div>
                        <span className="text-xs font-mono bg-slate-200 px-2 py-1 rounded">
                          {formatSize(app.size)}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDownload(app.name)}
                        disabled={downloading === app.name}
                        className={`w-full py-2 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                          app.type === 'installer'
                            ? 'bg-green-600 hover:bg-green-700 text-white disabled:opacity-50'
                            : 'bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50'
                        }`}
                      >
                        <Download className="w-4 h-4" />
                        {downloading === app.name ? 'Đang tải...' : 'Tải xuống'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 bg-slate-100 rounded-xl text-center">
                  <p className="text-slate-600">Không có phiên bản nào sẵn sàng</p>
                </div>
              )}
            </div>
          ) : (
            /* Login/Register Form */
            <div>
              <div className="mb-10">
                <h3 className="text-3xl font-black text-slate-900 mb-2">
                  {isLogin ? 'Khởi tạo' : 'Đăng ký'}
                </h3>
                <p className="text-slate-500 text-sm">
                  {isLogin ? "Xác thực để bắt đầu đồng bộ trạng thái game." : "Tạo định danh điều khiển duy nhất của bạn."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-widest font-black text-slate-400 ml-1">Tên người dùng</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="nhap_ten_cua_ban"
                  className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all placeholder:text-slate-300 font-medium"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-widest font-black text-slate-400 ml-1">Giao thức truy cập (Mật khẩu)</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all placeholder:text-slate-300 font-medium"
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-slate-900 hover:bg-black text-white rounded-xl font-bold transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 group disabled:opacity-50"
            >
              <span className="tracking-tight">{loading ? 'Đang xử lý...' : isLogin ? 'Truy cập Hệ thống' : 'Cấp tài khoản'}</span>
              {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-slate-100 flex flex-col gap-4">
            <p className="text-xs text-slate-400 text-center">
              {isLogin ? "Chưa có tài khoản truy cập?" : "Đã là thành viên của cụm hệ thống?"}
            </p>
            <button 
              onClick={() => setIsLogin(!isLogin)}
              className="py-3 px-6 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
            >
              {isLogin ? 'Yêu cầu Đăng ký' : 'Quay lại Đăng nhập'}
            </button>
          </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
