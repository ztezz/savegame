import React from 'react';
import { CircleCheckBig, Gamepad2, HardDrive, Laptop } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { GameSave } from './types';

interface StatCardsProps {
  games: GameSave[];
  onlineDevices: number;
  totalDevices: number;
  successfulRestores: number;
}

const formatSize = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Number((bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0))} ${units[index]}`;
};

const StatCards: React.FC<StatCardsProps> = ({ games, onlineDevices, totalDevices, successfulRestores }) => {
  const reduceMotion = useReducedMotion();
  const versions = games.reduce((total, game) => total + game.versions, 0);
  const totalSize = games.reduce((total, game) => total + (game.latestSave?.fileSize || 0), 0);
  const cards = [
    { label: 'Game được bảo vệ', value: games.length, note: `${versions} phiên bản đã lưu`, icon: Gamepad2, tone: 'indigo' },
    { label: 'Dung lượng bản mới nhất', value: formatSize(totalSize), note: 'Sẵn sàng để khôi phục', icon: HardDrive, tone: 'emerald' },
    { label: 'Thiết bị trực tuyến', value: `${onlineDevices}/${totalDevices}`, note: totalDevices ? 'Agent đã kết nối' : 'Chưa liên kết thiết bị', icon: Laptop, tone: 'sky' },
    { label: 'Khôi phục hoàn tất', value: successfulRestores, note: 'Theo trạng thái gần nhất', icon: CircleCheckBig, tone: 'amber' },
  ] as const;
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20',
    sky: 'bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20',
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, note, icon: Icon, tone }) => (
        <motion.article
          key={label}
          initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, delay: reduceMotion ? 0 : cards.findIndex((card) => card.label === label) * 0.07, ease: [0.22, 1, 0.36, 1] }}
          whileHover={reduceMotion ? undefined : { y: -4, boxShadow: '0 16px 35px -20px rgba(15, 23, 42, 0.35)' }}
          className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/30"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gradient-to-r from-transparent via-indigo-500 to-transparent transition-transform duration-500 group-hover:scale-x-100" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
              <p className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white">{value}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{note}</p>
            </div>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110 ${tones[tone]}`}>
              <Icon className="h-5 w-5 transition-transform duration-300 group-hover:-rotate-3" />
            </div>
          </div>
        </motion.article>
      ))}
    </div>
  );
};

export default StatCards;
