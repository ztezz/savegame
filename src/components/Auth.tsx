import React, { useState } from 'react';
import api from '../utils/api';
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  Database,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  User,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '../context/ToastContext';

interface CaptchaChallenge {
  token: string;
  question: string;
  expiresInSeconds: number;
}

export default function Auth({ onLogin }: { onLogin: (token: string, user: any) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const { showToast } = useToast();

  const trimmedUsername = username.trim();
  const canSubmit =
    trimmedUsername.length > 0 &&
    password.trim().length > 0 &&
    (!captcha || captchaAnswer.trim().length > 0) &&
    !loading;

  const clearCaptcha = () => {
    setCaptcha(null);
    setCaptchaAnswer('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!trimmedUsername) {
      setError('Vui lòng nhập tên đăng nhập');
      return;
    }
    if (!password.trim()) {
      setError('Vui lòng nhập mật khẩu');
      return;
    }
    if (password.length < 6 && !isLogin) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload: any = { username: trimmedUsername, password };
      if (captcha) {
        payload.captchaToken = captcha.token;
        payload.captchaAnswer = captchaAnswer.trim();
      }
      const res = await api.post(endpoint, payload);

      if (isLogin) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        clearCaptcha();
        onLogin(res.data.token, res.data.user);
        showToast('Đăng nhập thành công!', 'success', 2000);
      } else {
        showToast('Đăng ký thành công. Vui lòng đăng nhập.', 'success', 3000);
        setIsLogin(true);
        setUsername('');
        setPassword('');
        setShowPassword(false);
        clearCaptcha();
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Xác thực thất bại';
      const nextCaptcha = err.response?.data?.captcha;
      if (err.response?.data?.captchaRequired && nextCaptcha) {
        setCaptcha(nextCaptcha);
        setCaptchaAnswer('');
      }
      setError(errorMsg);
      showToast(errorMsg, 'error', 3000);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsLogin((current) => !current);
    setError('');
    setPassword('');
    setShowPassword(false);
    clearCaptcha();
  };

  const refreshCaptcha = () => {
    setError('Nhập sai lại thông tin đăng nhập để nhận mã xác minh mới.');
    setCaptchaAnswer('');
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-[0.95fr_1.05fr] bg-slate-50 font-sans">
      <section className="hidden lg:flex bg-slate-950 text-white items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(79,70,229,0.32),transparent_34%),radial-gradient(circle_at_78%_72%,rgba(16,185,129,0.18),transparent_30%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:48px_48px]" />

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="relative z-10 w-full max-w-xl px-12">
          <div className="flex items-center gap-4 mb-12">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-xl shadow-indigo-950/40">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">CloudSave<span className="text-indigo-300">Hub</span></h1>
              <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold">Đồng bộ dữ liệu game</p>
            </div>
          </div>

          <h2 className="text-5xl font-black leading-tight mb-6">Quản lý bản lưu ổn định cho mọi thiết bị.</h2>
          <p className="text-slate-300 text-base leading-7 max-w-lg">
            Đăng nhập để đồng bộ, khôi phục và quản trị dữ liệu game từ một bảng điều khiển tập trung.
          </p>

          <div className="grid grid-cols-2 gap-4 mt-12">
            <div className="bg-white/6 border border-white/10 rounded-lg p-5">
              <Cloud className="w-5 h-5 text-indigo-300 mb-4" />
              <div className="text-sm font-bold mb-1">Đồng bộ nhanh</div>
              <p className="text-xs text-slate-400 leading-5">Đẩy và kéo dữ liệu giữa máy trạm, agent và server.</p>
            </div>
            <div className="bg-white/6 border border-white/10 rounded-lg p-5">
              <ShieldCheck className="w-5 h-5 text-emerald-300 mb-4" />
              <div className="text-sm font-bold mb-1">Bảo vệ đăng nhập</div>
              <p className="text-xs text-slate-400 leading-5">Captcha tự bật sau nhiều lần nhập sai liên tiếp.</p>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-16 bg-white">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-11 h-11 bg-slate-900 rounded-xl flex items-center justify-center text-white">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-950">CloudSaveHub</h1>
              <p className="text-xs text-slate-500 font-semibold">Đồng bộ dữ liệu game</p>
            </div>
          </div>

          <div className="mb-8">
            <div className="inline-flex rounded-lg bg-slate-100 p-1 mb-8" aria-label="Chọn chế độ xác thực">
              <button type="button" onClick={() => !isLogin && switchMode()} className={`px-4 py-2 rounded-md text-sm font-bold transition ${isLogin ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Đăng nhập</button>
              <button type="button" onClick={() => isLogin && switchMode()} className={`px-4 py-2 rounded-md text-sm font-bold transition ${!isLogin ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Đăng ký</button>
            </div>

            <h2 className="text-3xl font-black text-slate-950 mb-2">{isLogin ? 'Chào mừng trở lại' : 'Tạo tài khoản mới'}</h2>
            <p className="text-sm text-slate-500 leading-6">
              {isLogin ? 'Xác thực để truy cập dashboard CloudSaveHub.' : 'Tạo tài khoản để bắt đầu quản lý dữ liệu đồng bộ.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <AnimatePresence>
              {error && (
                <motion.div role="alert" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-semibold flex items-start gap-2">
                  <span className="text-base leading-5">!</span>
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <label htmlFor="username" className="text-xs uppercase tracking-widest font-black text-slate-500 ml-1">Tên đăng nhập</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input id="username" type="text" required autoComplete="username" value={username} onChange={(e) => { setUsername(e.target.value); setError(''); clearCaptcha(); }} placeholder="Nhập tên đăng nhập" className={`w-full pl-12 pr-4 py-4 rounded-lg border bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition placeholder:text-slate-300 font-medium ${error && !trimmedUsername ? 'border-red-300 bg-red-50' : 'border-slate-200'}`} />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-xs uppercase tracking-widest font-black text-slate-500 ml-1">Mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input id="password" type={showPassword ? 'text' : 'password'} required autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="Nhập mật khẩu" className={`w-full pl-12 pr-12 py-4 rounded-lg border bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition placeholder:text-slate-300 font-medium ${error && !password.trim() ? 'border-red-300 bg-red-50' : 'border-slate-200'}`} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {!isLogin && <p className="text-xs text-slate-500 ml-1">Mật khẩu cần tối thiểu 6 ký tự.</p>}
            </div>

            {captcha && isLogin && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-widest font-black text-amber-700">Xác minh bảo mật</p>
                    <p className="text-sm text-amber-800 mt-1">Nhập kết quả phép tính: <strong>{captcha.question}</strong></p>
                  </div>
                  <button type="button" onClick={refreshCaptcha} className="p-2 text-amber-700 hover:bg-amber-100 rounded-lg" title="Làm mới mã">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <input value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} inputMode="numeric" placeholder="Nhập mã xác minh" className="w-full px-4 py-3 rounded-lg border border-amber-200 bg-white outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-400/10 text-sm font-bold" />
              </div>
            )}

            <button type="submit" disabled={!canSubmit} className="w-full py-4 bg-slate-950 hover:bg-slate-800 text-white rounded-lg font-bold transition shadow-lg shadow-slate-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <span>{isLogin ? 'Đăng nhập' : 'Đăng ký tài khoản'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Thông tin đăng nhập được gửi qua API nội bộ của CloudSaveHub.</span>
          </div>
        </motion.div>
      </section>
    </main>
  );
}
