import React from 'react';
import { Cloud, Grid2X2, List, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

type Props = {
  viewMode: 'grid' | 'list';
  trashMode: boolean;
  onSetViewMode: (mode: 'grid' | 'list') => void;
  onToggleTrash: () => void;
};

const DriveHeader: React.FC<Props> = ({ viewMode, trashMode, onSetViewMode, onToggleTrash }) => {
  const reduceMotion = useReducedMotion();

  return <motion.div initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-300/50 sm:p-8">
    <motion.div animate={reduceMotion ? undefined : { x: [0, -24, 0], y: [0, 18, 0], scale: [1, 1.08, 1] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-indigo-500/30 blur-3xl" />
    <motion.div animate={reduceMotion ? undefined : { x: [0, 30, 0], y: [0, -12, 0], scale: [1, 1.12, 1] }} transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }} className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
    <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
      <div className="max-w-2xl">
        <div className="mb-5 flex items-center gap-3">
          <motion.span animate={reduceMotion ? undefined : { y: [0, -3, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-inner shadow-white/10 backdrop-blur"><Cloud className="h-5 w-5 text-cyan-300" /></motion.span>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-indigo-200">CloudSave Workspace</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-400"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />Không gian lưu trữ riêng tư</p>
          </div>
        </div>
        <h3 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">Drive cá nhân</h3>
        <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-slate-300">Mọi tài liệu quan trọng trong một nơi. Tải lên, sắp xếp và chia sẻ an toàn trên mọi thiết bị.</p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-slate-300">
          <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Kéo và thả file vào bất cứ đâu để tải lên
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-2xl border border-white/10 bg-white/[0.07] p-1 backdrop-blur">
          <button type="button" aria-label="Hiển thị dạng lưới" onClick={() => onSetViewMode('grid')} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition ${viewMode === 'grid' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><Grid2X2 className="h-4 w-4" /><span className="hidden sm:inline">Lưới</span></button>
          <button type="button" aria-label="Hiển thị dạng danh sách" onClick={() => onSetViewMode('list')} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition ${viewMode === 'list' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><List className="h-4 w-4" /><span className="hidden sm:inline">Danh sách</span></button>
        </div>
        <button type="button" onClick={onToggleTrash} className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-black transition ${trashMode ? 'border-rose-200 bg-white text-rose-600 shadow-lg' : 'border-white/10 bg-white/[0.07] text-slate-200 hover:bg-white/15 hover:text-white'}`}><Trash2 className="h-4 w-4" />{trashMode ? 'Trở lại Drive' : 'Thùng rác'}</button>
      </div>
    </div>
  </motion.div>;
};

export default DriveHeader;
