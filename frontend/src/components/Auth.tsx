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
  ShieldCheck,
  RadioTower,
  User,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { useToast } from '../context/ToastContext';
import TurnstileWidget from './TurnstileWidget';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

export default function Auth({ onLogin, darkMode }: { onLogin: (token: string, user: any) => void; darkMode: boolean }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const { showToast } = useToast();
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(50);
  const pointerY = useMotionValue(50);
  const smoothX = useSpring(pointerX, { stiffness: 90, damping: 24, mass: 0.5 });
  const smoothY = useSpring(pointerY, { stiffness: 90, damping: 24, mass: 0.5 });
  const spotlight = useMotionTemplate`radial-gradient(560px circle at ${smoothX}% ${smoothY}%, rgba(34, 211, 238, 0.13), transparent 66%)`;
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
    (!isLogin || Boolean(turnstileToken)) &&
    !loading;

  const clearTurnstile = () => {
    setTurnstileToken('');
    setTurnstileResetKey((current) => current + 1);
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
      if (isLogin) payload.turnstileToken = turnstileToken;
      const res = await api.post(endpoint, payload);

      if (isLogin) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        clearTurnstile();
        onLogin(res.data.token, res.data.user);
        showToast('Đăng nhập thành công!', 'success', 2000);
      } else {
        showToast('Đăng ký thành công. Vui lòng đăng nhập.', 'success', 3000);
        setIsLogin(true);
        setUsername('');
        setPassword('');
        setShowPassword(false);
        clearTurnstile();
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Xác thực thất bại';
      if (isLogin) {
        setTurnstileToken('');
        setTurnstileResetKey((current) => current + 1);
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
    clearTurnstile();
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

  if (!darkMode) {
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
                <img src="/logo.svg" alt="CloudSave logo" className="h-10 w-10 object-contain" />
              </motion.div>
              <div><h1 className="text-2xl font-black tracking-tight">CloudSave<span className="text-indigo-300">Hub</span></h1><p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Đồng bộ dữ liệu game</p></div>
            </div>

            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200"><RadioTower className="h-3.5 w-3.5" />Cloud workspace thế hệ mới</div>
            <h2 className="mb-6 text-5xl font-black leading-[1.08] tracking-[-0.045em] xl:text-6xl">Bản lưu của bạn.<br /><span className="bg-gradient-to-r from-indigo-300 via-cyan-200 to-emerald-300 bg-clip-text text-transparent">Luôn trong tầm tay.</span></h2>
            <p className="max-w-lg text-base leading-7 text-slate-300">Đăng nhập để đồng bộ, khôi phục và quản trị dữ liệu game từ một bảng điều khiển tập trung.</p>

            <div className="mt-12 grid grid-cols-3 gap-3">
              <motion.div whileHover={reduceMotion ? undefined : { y: -5 }} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm"><Cloud className="mb-4 h-5 w-5 text-indigo-300" /><div className="mb-1 text-sm font-bold">Đồng bộ nhanh</div><p className="text-xs leading-5 text-slate-400">Dữ liệu xuyên thiết bị.</p></motion.div>
              <motion.div whileHover={reduceMotion ? undefined : { y: -5 }} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm"><ShieldCheck className="mb-4 h-5 w-5 text-emerald-300" /><div className="mb-1 text-sm font-bold">Bảo vệ đăng nhập</div><p className="text-xs leading-5 text-slate-400">Xác minh thông minh.</p></motion.div>
              <motion.div whileHover={reduceMotion ? undefined : { y: -5 }} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm"><Zap className="mb-4 h-5 w-5 text-amber-300" /><div className="mb-1 text-sm font-bold">Khôi phục tức thì</div><p className="text-xs leading-5 text-slate-400">Tiếp tục nơi bạn dừng.</p></motion.div>
            </div>
          </motion.div>
        </section>

        <section className="relative flex items-center justify-center overflow-hidden bg-white px-5 py-10 sm:px-8 lg:px-12 xl:px-16">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(99,102,241,0.08),transparent_30%),radial-gradient(circle_at_0%_100%,rgba(6,182,212,0.06),transparent_32%)]" />
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} style={{ rotateX: formRotateX, rotateY: formRotateY, transformPerspective: 1200 }} className="relative z-30 w-full max-w-md rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-2xl shadow-slate-200/70 backdrop-blur-xl sm:p-8">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-slate-900"><img src="/logo.svg" alt="CloudSave logo" className="h-9 w-9 object-contain" /></div>
              <div><h1 className="text-xl font-black tracking-tight text-slate-950">CloudSaveHub</h1><p className="text-xs font-semibold text-slate-500">Đồng bộ dữ liệu game</p></div>
            </div>

            <div className="mb-8">
              <div className="relative mb-8 inline-flex rounded-xl bg-slate-100 p-1" aria-label="Chọn chế độ xác thực">
                {isLogin && <motion.span layoutId="auth-mode" className="absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm" />}
                {!isLogin && <motion.span layoutId="auth-mode" className="absolute bottom-1 right-1 top-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm" />}
                <button type="button" onClick={() => !isLogin && switchMode()} className={`relative z-10 rounded-lg px-4 py-2 text-sm font-bold transition ${isLogin ? 'text-slate-950' : 'text-slate-500 hover:text-slate-800'}`}>Đăng nhập</button>
                <button type="button" onClick={() => isLogin && switchMode()} className={`relative z-10 rounded-lg px-4 py-2 text-sm font-bold transition ${!isLogin ? 'text-slate-950' : 'text-slate-500 hover:text-slate-800'}`}>Đăng ký</button>
              </div>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-300"><CloudCog className="h-5 w-5" /></div>
              <h2 className="mb-2 text-3xl font-black tracking-[-0.035em] text-slate-950">{isLogin ? 'Chào mừng trở lại' : 'Tạo tài khoản mới'}</h2>
              <p className="text-sm leading-6 text-slate-500">{isLogin ? 'Xác thực để truy cập dashboard CloudSaveHub.' : 'Tạo tài khoản để bắt đầu quản lý dữ liệu đồng bộ.'}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <AnimatePresence>
                {error && <motion.div role="alert" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"><span className="text-base leading-5">!</span><span>{error}</span></motion.div>}
              </AnimatePresence>
              <div className="space-y-2">
                <label htmlFor="username" className="ml-1 text-xs font-black uppercase tracking-widest text-slate-500">Tên đăng nhập</label>
                <div className="relative"><User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="username" type="text" required autoComplete="username" value={username} onChange={(e) => { setUsername(e.target.value); setError(''); }} placeholder="Nhập tên đăng nhập" className={`w-full rounded-xl border bg-slate-50/70 py-4 pl-12 pr-4 font-medium outline-none transition placeholder:text-slate-300 hover:bg-white focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 ${error && !trimmedUsername ? 'border-red-300 bg-red-50' : 'border-slate-200'}`} /></div>
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="ml-1 text-xs font-black uppercase tracking-widest text-slate-500">Mật khẩu</label>
                <div className="relative"><Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="password" type={showPassword ? 'text' : 'password'} required autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="Nhập mật khẩu" className={`w-full rounded-xl border bg-slate-50/70 py-4 pl-12 pr-12 font-medium outline-none transition placeholder:text-slate-300 hover:bg-white focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 ${error && !password.trim() ? 'border-red-300 bg-red-50' : 'border-slate-200'}`} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                {!isLogin && <p className="ml-1 text-xs text-slate-500">Mật khẩu cần tối thiểu 6 ký tự.</p>}
              </div>
              {isLogin && <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} resetKey={turnstileResetKey} darkMode={false} onToken={setTurnstileToken} />}
              <motion.button whileHover={canSubmit && !reduceMotion ? { y: -2, scale: 1.01 } : undefined} whileTap={canSubmit && !reduceMotion ? { scale: 0.98 } : undefined} type="submit" disabled={!canSubmit} className="flex w-full items-center justify-center gap-3 rounded-xl bg-slate-950 py-4 font-bold text-white shadow-lg shadow-slate-300 transition hover:bg-indigo-600 hover:shadow-indigo-200 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <><Loader2 className="h-4 w-4 animate-spin" />Đang xử lý...</> : <><span>{isLogin ? 'Đăng nhập' : 'Đăng ký tài khoản'}</span><ArrowRight className="h-4 w-4" /></>}</motion.button>
            </form>
            <div className="mt-8 flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" /><span>Thông tin đăng nhập được gửi qua API nội bộ của CloudSaveHub.</span></div>
          </motion.div>
        </section>
      </main>
    );
  }

  return (
    <main onPointerMove={handlePointerMove} onPointerLeave={resetPointer} className="relative grid min-h-screen overflow-hidden bg-[#02050b] font-sans text-slate-100 lg:grid-cols-[1.08fr_0.92fr]">
      <div aria-hidden className="auth-cyber-grid pointer-events-none absolute inset-0 opacity-45" />
      <div aria-hidden className="auth-scanlines pointer-events-none absolute inset-0 z-40 opacity-25" />
      <motion.div aria-hidden style={{ background: spotlight }} className="pointer-events-none absolute inset-0 z-20" />

      <section className="auth-cyber-hero relative hidden items-center justify-center overflow-hidden border-r border-cyan-400/15 text-white lg:flex">
        <motion.div aria-hidden style={{ x: leftParallaxX, y: leftParallaxY }} className="absolute -inset-8 bg-[radial-gradient(circle_at_20%_16%,rgba(217,70,239,0.22),transparent_30%),radial-gradient(circle_at_76%_68%,rgba(6,182,212,0.2),transparent_32%)]" />
        <motion.div aria-hidden style={{ x: gridParallaxX, y: gridParallaxY }} className="absolute -inset-8 bg-[linear-gradient(to_right,rgba(34,211,238,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(34,211,238,0.07)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_94%)]" />
        <motion.div aria-hidden animate={reduceMotion ? undefined : { x: [0, 40, 0], y: [0, -28, 0], scale: [1, 1.12, 1] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} className="absolute -bottom-32 -right-28 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />

        <motion.div aria-hidden style={{ x: statusParallaxX, y: statusParallaxY }} className="auth-cyber-float absolute right-[7%] top-[10%] z-10 border border-cyan-300/30 bg-[#06111b]/80 px-4 py-3 shadow-[0_0_30px_rgba(34,211,238,0.12)] backdrop-blur-xl [clip-path:polygon(0_0,calc(100%-12px)_0,100%_12px,100%_100%,0_100%)]">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-200"><span className="h-2 w-2 animate-pulse bg-emerald-400 shadow-[0_0_10px_#34d399]" />Node status: online</div>
        </motion.div>
        <motion.div aria-hidden style={{ x: saveParallaxX, y: saveParallaxY }} className="auth-cyber-float absolute bottom-[10%] left-[7%] z-10 border-l-2 border-fuchsia-400 bg-[#090813]/85 p-4 shadow-[0_0_32px_rgba(217,70,239,0.12)] backdrop-blur-xl">
          <Database className="mb-2 h-5 w-5 text-fuchsia-300" /><p className="font-mono text-xs font-bold text-fuchsia-100">VAULT // SECURED</p><p className="mt-1 text-[10px] text-slate-500">Bản lưu đã mã hóa và đồng bộ</p>
        </motion.div>

        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }} style={{ x: leftParallaxX, y: leftParallaxY }} className="relative z-10 w-full max-w-2xl px-12 xl:px-16">
          <div className="mb-14 flex items-center gap-4">
            <motion.div whileHover={reduceMotion ? undefined : { rotate: -3, scale: 1.06 }} className="relative flex h-13 w-13 items-center justify-center overflow-hidden border border-cyan-300/50 bg-[#07101b] shadow-[0_0_28px_rgba(34,211,238,0.2)] [clip-path:polygon(0_0,calc(100%-12px)_0,100%_12px,100%_100%,12px_100%,0_calc(100%-12px))]">
              <img src="/logo.svg" alt="CloudSave logo" className="h-10 w-10 object-contain" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">CloudSave<span className="text-cyan-300">Hub</span></h1>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Secure game data network</p>
            </div>
          </div>

          <div className="mb-5 inline-flex items-center gap-2 border-l-2 border-fuchsia-400 bg-fuchsia-400/8 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-fuchsia-200"><RadioTower className="h-3.5 w-3.5" />Neural cloud link active</div>
          <h2 className="mb-6 text-5xl font-black uppercase leading-[0.98] tracking-[-0.055em] xl:text-6xl">Bản lưu không<br />bao giờ <span className="bg-gradient-to-r from-cyan-300 via-white to-fuchsia-400 bg-clip-text text-transparent">biến mất.</span></h2>
          <p className="max-w-lg border-l border-cyan-300/30 pl-5 text-sm leading-7 text-slate-400">
            Kết nối vào kho dữ liệu cá nhân, đồng bộ xuyên thiết bị và khôi phục hành trình của bạn trong vài giây.
          </p>

          <div className="mt-12 grid grid-cols-3 gap-px bg-cyan-300/15">
            <motion.div whileHover={reduceMotion ? undefined : { y: -4 }} className="auth-cyber-feature bg-[#050a12]/95 p-5">
              <Cloud className="mb-4 h-5 w-5 text-cyan-300" /><div className="mb-1 text-sm font-bold">Đồng bộ nhanh</div><p className="font-mono text-[10px] leading-5 text-slate-500">SYNC // MULTI-NODE</p>
            </motion.div>
            <motion.div whileHover={reduceMotion ? undefined : { y: -4 }} className="auth-cyber-feature bg-[#050a12]/95 p-5">
              <ShieldCheck className="mb-4 h-5 w-5 text-emerald-300" /><div className="mb-1 text-sm font-bold">Lớp bảo vệ</div><p className="font-mono text-[10px] leading-5 text-slate-500">AUTH // VERIFIED</p>
            </motion.div>
            <motion.div whileHover={reduceMotion ? undefined : { y: -4 }} className="auth-cyber-feature bg-[#050a12]/95 p-5">
              <Zap className="mb-4 h-5 w-5 text-fuchsia-300" /><div className="mb-1 text-sm font-bold">Khôi phục ngay</div><p className="font-mono text-[10px] leading-5 text-slate-500">RESTORE // READY</p>
            </motion.div>
          </div>
        </motion.div>
      </section>

      <section className="auth-cyber-form relative flex items-center justify-center overflow-hidden px-5 py-10 sm:px-8 lg:px-12 xl:px-16">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(217,70,239,0.13),transparent_32%),radial-gradient(circle_at_0%_100%,rgba(6,182,212,0.12),transparent_34%)]" />
        <div aria-hidden className="absolute right-5 top-5 font-mono text-[9px] uppercase tracking-[0.24em] text-cyan-300/40 sm:right-8 sm:top-8">CSH // AUTH_GATE_01</div>
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} style={{ rotateX: formRotateX, rotateY: formRotateY, transformPerspective: 1200 }} className="auth-cyber-panel relative z-30 w-full max-w-md border border-cyan-300/25 bg-[#07101b]/90 p-6 shadow-[0_0_70px_rgba(6,182,212,0.09),0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:p-8">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden border border-cyan-300/40 bg-[#02050b] shadow-[0_0_20px_rgba(34,211,238,0.18)]">
              <img src="/logo.svg" alt="CloudSave logo" className="h-9 w-9 object-contain" />
            </div>
            <div><h1 className="text-xl font-black tracking-tight text-white">CloudSave<span className="text-cyan-300">Hub</span></h1><p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Secure data network</p></div>
          </div>

          <div className="mb-8">
            <div className="relative mb-8 grid grid-cols-2 border border-slate-700/80 bg-[#02050b]/80 p-1" aria-label="Chọn chế độ xác thực">
              {isLogin && <motion.span layoutId="auth-mode" className="absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] border border-cyan-300/50 bg-cyan-300/10 shadow-[inset_0_0_18px_rgba(34,211,238,0.08)]" />}
              {!isLogin && <motion.span layoutId="auth-mode" className="absolute bottom-1 right-1 top-1 w-[calc(50%-0.25rem)] border border-fuchsia-300/50 bg-fuchsia-300/10 shadow-[inset_0_0_18px_rgba(217,70,239,0.08)]" />}
              <button type="button" onClick={() => !isLogin && switchMode()} className={`relative z-10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition ${isLogin ? 'text-cyan-200' : 'text-slate-500 hover:text-slate-200'}`}>Đăng nhập</button>
              <button type="button" onClick={() => isLogin && switchMode()} className={`relative z-10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider transition ${!isLogin ? 'text-fuchsia-200' : 'text-slate-500 hover:text-slate-200'}`}>Đăng ký</button>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center border border-cyan-300/40 bg-cyan-300/8 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.12)]"><CloudCog className="h-5 w-5" /></div>
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300"><span className="h-1.5 w-1.5 bg-emerald-300 shadow-[0_0_8px_#6ee7b7]" />Kết nối bảo mật</div>
            </div>
            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300/70">{isLogin ? '// Identity verification' : '// New identity protocol'}</p>
            <h2 className="mb-2 text-3xl font-black tracking-[-0.035em] text-white">{isLogin ? 'Truy cập hệ thống' : 'Khởi tạo tài khoản'}</h2>
            <p className="text-sm leading-6 text-slate-400">{isLogin ? 'Nhập thông tin định danh để mở CloudSaveHub.' : 'Tạo danh tính mới để bắt đầu đồng bộ dữ liệu.'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <AnimatePresence>
              {error && (
                <motion.div role="alert" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-start gap-2 border-l-2 border-rose-400 bg-rose-500/10 p-3 text-sm font-semibold text-rose-200">
                  <span className="font-mono text-base leading-5 text-rose-400">!</span>
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <label htmlFor="username" className="ml-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/70">ID người dùng</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300/60" />
                <input id="username" type="text" required autoComplete="username" value={username} onChange={(e) => { setUsername(e.target.value); setError(''); }} placeholder="Nhập tên đăng nhập" className={`w-full border bg-[#02050b]/75 py-4 pl-12 pr-4 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-700 hover:border-slate-600 focus:border-cyan-400 focus:bg-cyan-400/[0.03] focus:ring-1 focus:ring-cyan-400/30 ${error && !trimmedUsername ? 'border-rose-400/70 bg-rose-500/5' : 'border-slate-700'}`} />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="ml-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/70">Mã truy cập</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300/60" />
                <input id="password" type={showPassword ? 'text' : 'password'} required autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="Nhập mật khẩu" className={`w-full border bg-[#02050b]/75 py-4 pl-12 pr-12 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-700 hover:border-slate-600 focus:border-cyan-400 focus:bg-cyan-400/[0.03] focus:ring-1 focus:ring-cyan-400/30 ${error && !password.trim() ? 'border-rose-400/70 bg-rose-500/5' : 'border-slate-700'}`} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 transition hover:text-cyan-300">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {!isLogin && <p className="ml-1 font-mono text-[10px] text-slate-500">Yêu cầu hệ thống: tối thiểu 6 ký tự.</p>}
            </div>

            {isLogin && <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} resetKey={turnstileResetKey} darkMode={darkMode} onToken={setTurnstileToken} />}

            <motion.button whileHover={canSubmit && !reduceMotion ? { y: -2, scale: 1.01 } : undefined} whileTap={canSubmit && !reduceMotion ? { scale: 0.98 } : undefined} type="submit" disabled={!canSubmit} className="group relative flex w-full items-center justify-center gap-3 overflow-hidden border border-cyan-300/70 bg-cyan-300 py-4 font-mono text-sm font-bold uppercase tracking-wider text-[#021016] shadow-[0_0_28px_rgba(34,211,238,0.18)] transition hover:bg-cyan-200 hover:shadow-[0_0_38px_rgba(34,211,238,0.3)] disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none">
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

          <div className="mt-8 flex items-center gap-3 border-t border-slate-800 pt-5 font-mono text-[9px] uppercase leading-5 tracking-[0.12em] text-slate-600">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
            <span>Kênh xác thực nội bộ // phiên truyền được bảo vệ</span>
          </div>
        </motion.div>
      </section>
    </main>
  );
}
