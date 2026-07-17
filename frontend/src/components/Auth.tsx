import React, { useState } from 'react';
import api from '../utils/api';
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  CloudCog,
  Database,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
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
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(50);
  const pointerY = useMotionValue(50);
  const smoothX = useSpring(pointerX, { stiffness: 90, damping: 24, mass: 0.5 });
  const smoothY = useSpring(pointerY, { stiffness: 90, damping: 24, mass: 0.5 });
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${smoothX}% ${smoothY}%, rgba(99, 102, 241, 0.18), transparent 68%)`;
  const leftParallaxX = useTransform(smoothX, [0, 100], reduceMotion ? [0, 0] : [-14, 14]);
  const leftParallaxY = useTransform(smoothY, [0, 100], reduceMotion ? [0, 0] : [-10, 10]);
  const formRotateX = useTransform(smoothY, [0, 100], reduceMotion ? [0, 0] : [1.2, -1.2]);
  const formRotateY = useTransform(smoothX, [0, 100], reduceMotion ? [0, 0] : [-1.4, 1.4]);
  const gridParallaxX = useTransform(leftParallaxX, (value) => value * -0.4);
  const gridParallaxY = useTransform(leftParallaxY, (value) => value * -0.4);
  const statusParallaxX = useTransform(leftParallaxX, (value) => value * 1.8);
  const statusParallaxY = useTransform(leftParallaxY, (value) => value * 1.8);
  const saveParallaxX = useTransform(leftParallaxX, (value) => value * -1.5);
  const saveParallaxY = useTransform(leftParallaxY, (value) => value * -1.5);

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

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (reduceMotion || event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - bounds.left) / bounds.width) * 100);
    pointerY.set(((event.clientY - bounds.top) / bounds.height) * 100);
  };

  const resetPointer = () => {
    pointerX.set(50);
    pointerY.set(50);
  };

  return (
    <main onPointerMove={handlePointerMove} onPointerLeave={resetPointer} className="relative grid min-h-screen overflow-hidden bg-slate-50 font-sans lg:grid-cols-[1.08fr_0.92fr]">
      <motion.div aria-hidden style={{ background: spotlight }} className="pointer-events-none absolute inset-0 z-20 hidden lg:block" />
      <section className="relative hidden items-center justify-center overflow-hidden bg-slate-950 text-white lg:flex">
        <motion.div aria-hidden style={{ x: leftParallaxX, y: leftParallaxY }} className="absolute -inset-8 bg-[radial-gradient(circle_at_22%_18%,rgba(79,70,229,0.4),transparent_34%),radial-gradient(circle_at_78%_72%,rgba(16,185,129,0.2),transparent_30%)]" />
        <motion.div aria-hidden style={{ x: gridParallaxX, y: gridParallaxY }} className="absolute -inset-8 bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />
        <motion.div aria-hidden animate={reduceMotion ? undefined : { x: [0, 36, 0], y: [0, -24, 0], scale: [1, 1.12, 1] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} className="absolute -bottom-32 -right-28 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />

        <motion.div aria-hidden style={{ x: statusParallaxX, y: statusParallaxY }} className="absolute right-[8%] top-[12%] z-10 rounded-2xl border border-white/10 bg-white/[0.06] p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-200"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />Agent online</div>
        </motion.div>
        <motion.div aria-hidden style={{ x: saveParallaxX, y: saveParallaxY }} className="absolute bottom-[12%] left-[8%] z-10 rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl backdrop-blur-xl">
          <Database className="mb-2 h-5 w-5 text-cyan-300" /><p className="text-xs font-black">Bản lưu an toàn</p><p className="mt-1 text-[10px] text-slate-400">Đã đồng bộ vài giây trước</p>
        </motion.div>

        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }} style={{ x: leftParallaxX, y: leftParallaxY }} className="relative z-10 w-full max-w-2xl px-12 xl:px-16">
          <div className="mb-14 flex items-center gap-4">
            <motion.div whileHover={reduceMotion ? undefined : { rotate: -4, scale: 1.06 }} className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-xl shadow-indigo-950/40">
              <img src="/logo.svg" alt="CloudSave logo" className="w-10 h-10 object-contain" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">CloudSave<span className="text-indigo-300">Hub</span></h1>
              <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold">Đồng bộ dữ liệu game</p>
            </div>
          </div>

          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200"><Sparkles className="h-3.5 w-3.5" />Cloud workspace thế hệ mới</div>
          <h2 className="mb-6 text-5xl font-black leading-[1.08] tracking-[-0.045em] xl:text-6xl">Bản lưu của bạn.<br /><span className="bg-gradient-to-r from-indigo-300 via-cyan-200 to-emerald-300 bg-clip-text text-transparent">Luôn trong tầm tay.</span></h2>
          <p className="max-w-lg text-base leading-7 text-slate-300">
            Đăng nhập để đồng bộ, khôi phục và quản trị dữ liệu game từ một bảng điều khiển tập trung.
          </p>

          <div className="mt-12 grid grid-cols-3 gap-3">
            <motion.div whileHover={reduceMotion ? undefined : { y: -5 }} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm">
              <Cloud className="mb-4 h-5 w-5 text-indigo-300" />
              <div className="text-sm font-bold mb-1">Đồng bộ nhanh</div>
              <p className="text-xs leading-5 text-slate-400">Dữ liệu xuyên thiết bị.</p>
            </motion.div>
            <motion.div whileHover={reduceMotion ? undefined : { y: -5 }} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm">
              <ShieldCheck className="mb-4 h-5 w-5 text-emerald-300" />
              <div className="text-sm font-bold mb-1">Bảo vệ đăng nhập</div>
              <p className="text-xs leading-5 text-slate-400">Xác minh thông minh.</p>
            </motion.div>
            <motion.div whileHover={reduceMotion ? undefined : { y: -5 }} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm">
              <Zap className="mb-4 h-5 w-5 text-amber-300" />
              <div className="mb-1 text-sm font-bold">Khôi phục tức thì</div>
              <p className="text-xs leading-5 text-slate-400">Tiếp tục nơi bạn dừng.</p>
            </motion.div>
          </div>
        </motion.div>
      </section>

      <section className="relative flex items-center justify-center overflow-hidden bg-white px-5 py-10 sm:px-8 lg:px-12 xl:px-16">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(99,102,241,0.08),transparent_30%),radial-gradient(circle_at_0%_100%,rgba(6,182,212,0.06),transparent_32%)]" />
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} style={{ rotateX: formRotateX, rotateY: formRotateY, transformPerspective: 1200 }} className="relative z-30 w-full max-w-md rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-2xl shadow-slate-200/70 backdrop-blur-xl sm:p-8">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-11 h-11 bg-slate-900 rounded-xl flex items-center justify-center overflow-hidden">
              <img src="/logo.svg" alt="CloudSave logo" className="w-9 h-9 object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-950">CloudSaveHub</h1>
              <p className="text-xs text-slate-500 font-semibold">Đồng bộ dữ liệu game</p>
            </div>
          </div>

          <div className="mb-8">
            <div className="relative mb-8 inline-flex rounded-xl bg-slate-100 p-1" aria-label="Chọn chế độ xác thực">
              {isLogin && <motion.span layoutId="auth-mode" className="absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm" />}
              {!isLogin && <motion.span layoutId="auth-mode" className="absolute bottom-1 right-1 top-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm" />}
              <button type="button" onClick={() => !isLogin && switchMode()} className={`relative z-10 rounded-lg px-4 py-2 text-sm font-bold transition ${isLogin ? 'text-slate-950' : 'text-slate-500 hover:text-slate-800'}`}>Đăng nhập</button>
              <button type="button" onClick={() => isLogin && switchMode()} className={`relative z-10 rounded-lg px-4 py-2 text-sm font-bold transition ${!isLogin ? 'text-slate-950' : 'text-slate-500 hover:text-slate-800'}`}>Đăng ký</button>
            </div>

            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-300"><CloudCog className="h-5 w-5" /></div>
            <h2 className="text-3xl font-black tracking-[-0.035em] text-slate-950 mb-2">{isLogin ? 'Chào mừng trở lại' : 'Tạo tài khoản mới'}</h2>
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
                <input id="username" type="text" required autoComplete="username" value={username} onChange={(e) => { setUsername(e.target.value); setError(''); clearCaptcha(); }} placeholder="Nhập tên đăng nhập" className={`w-full rounded-xl border bg-slate-50/70 py-4 pl-12 pr-4 font-medium outline-none transition placeholder:text-slate-300 hover:bg-white focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 ${error && !trimmedUsername ? 'border-red-300 bg-red-50' : 'border-slate-200'}`} />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-xs uppercase tracking-widest font-black text-slate-500 ml-1">Mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input id="password" type={showPassword ? 'text' : 'password'} required autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="Nhập mật khẩu" className={`w-full rounded-xl border bg-slate-50/70 py-4 pl-12 pr-12 font-medium outline-none transition placeholder:text-slate-300 hover:bg-white focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 ${error && !password.trim() ? 'border-red-300 bg-red-50' : 'border-slate-200'}`} />
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

            <motion.button whileHover={canSubmit && !reduceMotion ? { y: -2, scale: 1.01 } : undefined} whileTap={canSubmit && !reduceMotion ? { scale: 0.98 } : undefined} type="submit" disabled={!canSubmit} className="flex w-full items-center justify-center gap-3 rounded-xl bg-slate-950 py-4 font-bold text-white shadow-lg shadow-slate-300 transition hover:bg-indigo-600 hover:shadow-indigo-200 disabled:cursor-not-allowed disabled:opacity-50">
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
            </motion.button>
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
