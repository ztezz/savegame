import React, { useState } from 'react';
import api from '../utils/api';
import { Mail, Lock, User, Database, ArrowRight, ShieldCheck, Zap, Download, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '../context/ToastContext';

export default function Auth({ onLogin }: { onLogin: (token: string, user: any) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [showDownload, setShowDownload] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [apps, setApps] = useState<any[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { showToast } = useToast();

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
        showToast('✅ Đăng nhập thành công!', 'success', 2000);
      } else {
        showToast('✅ Đăng ký thành công! Vui lòng đăng nhập.', 'success', 3000);
        setIsLogin(true);
      }
    } catch (err: any) {
      showToast(`❌ ${err.response?.data?.error || 'Xác thực thất bại'}`, 'error', 3000);
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
      showToast('✅ Tải xuống thành công!', 'success', 3000);
    } catch (err) {
      showToast('❌ Tải xuống thất bại', 'error', 3000);
      console.error(err);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50 font-sans overflow-hidden">
      {/* Left side - Animated Background */}
      <div className="hidden lg:flex bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 items-center justify-center relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0">
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.6, 0.3]
            }}
            transition={{ duration: 8, repeat: Infinity }}
            className="absolute top-20 right-20 w-96 h-96 bg-indigo-600 rounded-full blur-3xl"
          />
          <motion.div 
            animate={{ 
              scale: [1, 1.1, 1],
              opacity: [0.2, 0.4, 0.2]
            }}
            transition={{ duration: 10, repeat: Infinity, delay: 2 }}
            className="absolute bottom-20 left-20 w-80 h-80 bg-emerald-600 rounded-full blur-3xl"
          />
        </div>

        <div className="absolute top-0 right-0 p-12">
          <motion.div 
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="flex items-center gap-2"
          >
            <motion.div 
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]"
            />
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">System Online</span>
          </motion.div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 p-12 max-w-xl"
        >
          <motion.div 
            className="flex items-center gap-4 mb-8"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div 
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-2xl shadow-indigo-500/50"
            >
              <Database className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">CloudSave<span className="text-indigo-400">Hub</span></h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-black">Hạ tầng Vsync</p>
            </div>
          </motion.div>

          <motion.h2 
            className="text-5xl font-black text-white mb-8 leading-tight tracking-tighter"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            Ổn định <br/>
            <span className="text-indigo-500 bg-gradient-to-r from-indigo-500 to-indigo-400 bg-clip-text text-transparent">Tuyệt đối</span> cho <br/>
            Dữ liệu Game.
          </motion.h2>

          <motion.div 
            className="grid grid-cols-2 gap-4 mt-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, staggerChildren: 0.1 }}
          >
            {[
              { icon: Zap, title: 'Đẩy/Kéo Siêu Tốc', desc: 'Truyền tải dạng luồng tối ưu cho VPS độ trễ cao.', color: 'indigo' },
              { icon: ShieldCheck, title: 'Bảo mật SHA-256', desc: 'Tự động giải quyết xung đột và xác thực tệp tin.', color: 'emerald' }
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + idx * 0.1 }}
                whileHover={{ y: -5 }}
                className={`bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 backdrop-blur-md transition-all hover:border-${item.color}-500/50`}
              >
                <item.icon className={`w-5 h-5 text-${item.color}-400 mb-3`} />
                <div className="text-white text-sm font-bold">{item.title}</div>
                <div className="text-slate-400 text-xs mt-1 leading-relaxed">{item.desc}</div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Right side - Form Panel */}
      <div className="flex items-center justify-center p-8 lg:p-24 bg-gradient-to-br from-white via-slate-50 to-white relative">
        {/* Decorative elements */}
        <motion.div 
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 5, repeat: Infinity }}
          className="absolute top-10 left-10 w-20 h-20 bg-indigo-100 rounded-full blur-2xl"
        />
        <motion.div 
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 7, repeat: Infinity, delay: 1 }}
          className="absolute bottom-10 right-10 w-32 h-32 bg-emerald-100 rounded-full blur-3xl"
        />

        <div className="absolute top-0 right-0 p-8 flex gap-4 hidden sm:flex">
          <motion.div 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-right"
          >
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Phiên bản Hệ thống</p>
            <p className="text-xs font-mono text-slate-700">v2.4.0-tổn định</p>
          </motion.div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-sm relative z-10"
        >
          {/* Tab Navigation */}
          <motion.div 
            className="flex gap-2 mb-8 bg-slate-100 p-1 rounded-xl"
            layout
          >
            {[
              { label: 'Đăng nhập', id: 'login' },
              { label: 'Tải App', id: 'download', icon: Download }
            ].map((tab) => (
              <motion.button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'login') {
                    setShowDownload(false);
                    setIsLogin(true);
                  } else {
                    setShowDownload(true);
                    if (apps.length === 0) {
                      fetchAvailableApps();
                    }
                  }
                }}
                className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                  (tab.id === 'login' && !showDownload) || (tab.id === 'download' && showDownload)
                    ? 'bg-slate-900 text-white shadow-lg' 
                    : 'text-slate-600'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {tab.icon && <tab.icon className="w-4 h-4" />}
                {tab.label}
              </motion.button>
            ))}
          </motion.div>

          <AnimatePresence mode="wait">
            {showDownload ? (
              <motion.div
                key="download"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div className="mb-8">
                  <h3 className="text-2xl font-black text-slate-900 mb-2">
                    Tải Desktop App
                  </h3>
                  <p className="text-slate-500 text-sm">
                    Tải CloudSave Client để đồng bộ game saves nhanh chóng
                  </p>
                </motion.div>

                {appsLoading ? (
                  <motion.div 
                    className="flex items-center justify-center py-8"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <p className="text-slate-500">Đang tải danh sách phiên bản...</p>
                  </motion.div>
                ) : apps.length > 0 ? (
                  <motion.div 
                    className="space-y-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ staggerChildren: 0.1 }}
                  >
                    {apps.map((app, idx) => (
                      <motion.div 
                        key={app.name}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        whileHover={{ scale: 1.02, y: -3 }}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          app.type === 'installer' 
                            ? 'border-green-200 bg-green-50 hover:border-green-400 hover:shadow-lg hover:shadow-green-200/50' 
                            : 'border-amber-200 bg-amber-50 hover:border-amber-400 hover:shadow-lg hover:shadow-amber-200/50'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-bold text-slate-900">
                              {app.type === 'installer' ? '📦 Installer' : '🚀 Portable'}
                            </h4>
                            <p className="text-xs text-slate-600 mt-1">{app.description}</p>
                          </div>
                          <motion.span 
                            className="text-xs font-mono bg-slate-200 px-2 py-1 rounded"
                            animate={{ scale: [1, 1.05, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            {formatSize(app.size)}
                          </motion.span>
                        </div>
                        <motion.button
                          onClick={() => handleDownload(app.name)}
                          disabled={downloading === app.name}
                          className={`w-full py-2 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                            app.type === 'installer'
                              ? 'bg-green-600 hover:bg-green-700 text-white disabled:opacity-50'
                              : 'bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50'
                          }`}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Download className="w-4 h-4" />
                          {downloading === app.name ? 'Đang tải...' : 'Tải xuống'}
                        </motion.button>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div 
                    className="p-6 bg-slate-100 rounded-xl text-center"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <p className="text-slate-600">Không có phiên bản nào sẵn sàng</p>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              /* Login/Register Form */
              <motion.div
                key="form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div 
                  className="mb-10"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <h3 className="text-3xl font-black text-slate-900 mb-2">
                    {isLogin ? 'Khởi tạo' : 'Đăng ký'}
                  </h3>
                  <p className="text-slate-500 text-sm">
                    {isLogin ? "Xác thực để bắt đầu đồng bộ trạng thái game." : "Tạo định danh điều khiển duy nhất của bạn."}
                  </p>
                </motion.div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <motion.div 
                    className="space-y-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <label className="text-[11px] uppercase tracking-widest font-black text-slate-400 ml-1">Tên người dùng</label>
                    <motion.div 
                      className="relative"
                      whileFocus="focused"
                    >
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <motion.input 
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="nhap_ten_cua_ban"
                        className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder:text-slate-300 font-medium"
                        whileFocus={{ scale: 1.02 }}
                      />
                    </motion.div>
                  </motion.div>

                  <motion.div 
                    className="space-y-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <label className="text-[11px] uppercase tracking-widest font-black text-slate-400 ml-1">Giao thức truy cập (Mật khẩu)</label>
                    <motion.div 
                      className="relative"
                      whileFocus="focused"
                    >
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <motion.input 
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-12 py-4 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder:text-slate-300 font-medium"
                        whileFocus={{ scale: 1.02 }}
                      />
                      <motion.button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </motion.button>
                    </motion.div>
                  </motion.div>

                  <motion.button 
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-slate-900 hover:bg-black text-white rounded-xl font-bold transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 group disabled:opacity-50"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="tracking-tight">{loading ? 'Đang xử lý...' : isLogin ? 'Truy cập Hệ thống' : 'Cấp tài khoản'}</span>
                    {!loading && <motion.div animate={{ x: [0, 3, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                      <ArrowRight className="w-4 h-4" />
                    </motion.div>}
                  </motion.button>
                </form>

                <motion.div 
                  className="mt-10 pt-8 border-t border-slate-100 flex flex-col gap-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <p className="text-xs text-slate-400 text-center">
                    {isLogin ? "Chưa có tài khoản truy cập?" : "Đã là thành viên của cụm hệ thống?"}
                  </p>
                  <motion.button 
                    onClick={() => setIsLogin(!isLogin)}
                    className="py-3 px-6 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                    whileHover={{ scale: 1.02, backgroundColor: '#f8fafc' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isLogin ? 'Yêu cầu Đăng ký' : 'Quay lại Đăng nhập'}
                  </motion.button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
