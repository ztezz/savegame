
import React from 'react';

const DatabaseRelation: React.FC = () => {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
       <h4 className="text-xs font-black uppercase tracking-widest text-slate-800 mb-6 flex items-center gap-2">
         <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
         Quan hệ Cơ sở dữ liệu
       </h4>
       <div className="space-y-4">
         <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 border-l-4 border-indigo-500">
            <p className="text-[11px] font-mono font-bold text-slate-700 underline">users.id (PK)</p>
            <p className="text-[9px] text-slate-400 mt-1 uppercase font-black tracking-tighter">Quan hệ: 1-nhiều Games</p>
         </div>
         <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 border-l-4 border-slate-200">
            <p className="text-[11px] font-mono font-bold text-slate-700">games.id (FK)</p>
            <p className="text-[9px] text-slate-400 mt-1 uppercase font-black tracking-tighter">Đích: Tham chiếu user_id</p>
         </div>
         <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 border-l-4 border-slate-200">
            <p className="text-[11px] font-mono font-bold text-slate-700">saves.game_id (FK)</p>
            <p className="text-[9px] text-slate-400 mt-1 uppercase font-black tracking-tighter">Phiên bản: Kho nhị phân</p>
         </div>
       </div>
    </div>
  );
};

export default DatabaseRelation;
