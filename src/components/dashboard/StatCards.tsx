
import React from 'react';
import { Gamepad2, HardDrive, Zap } from 'lucide-react';
import { GameSave } from './types';

interface StatCardsProps {
  games: GameSave[];
}

const StatCards: React.FC<StatCardsProps> = ({ games }) => {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const totalSize = games.reduce((acc, g) => acc + (g.latestSave?.fileSize || 0), 0);
  
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <Gamepad2 className="w-12 h-12" />
        </div>
        <p className="text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">Game đang lưu</p>
        <p className="text-4xl font-black text-indigo-600">{games.length < 10 ? `0${games.length}` : games.length}</p>
      </div>
      <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm relative overflow-hidden group">
         <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <HardDrive className="w-12 h-12" />
        </div>
        <p className="text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">Tổng lượt đồng bộ</p>
        <p className="text-4xl font-black text-slate-800">{games.reduce((acc, g) => acc + g.versions, 0)}</p>
      </div>
      <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <Zap className="w-12 h-12" />
        </div>
        <p className="text-[10px] uppercase font-black text-slate-400 mb-1 tracking-widest">Dung lượng sử dụng</p>
        <p className="text-4xl font-black text-emerald-500 tracking-tighter">{formatSize(totalSize)}</p>
      </div>
    </div>
  );
};

export default StatCards;
