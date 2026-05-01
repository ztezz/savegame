
import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface SyncAgentStatusProps {
  isSyncing: boolean;
  autoSyncEnabled: boolean;
  syncInterval: number;
  lastSyncTime: string | null;
  syncLogs: any[];
}

const SyncAgentStatus: React.FC<SyncAgentStatusProps> = ({
  isSyncing, autoSyncEnabled, syncInterval, lastSyncTime, syncLogs
}) => {
  return (
    <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
       <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${isSyncing ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500/20 text-emerald-500'} flex items-center justify-center transition-colors`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-black tracking-tight">Sync Agent Status</h4>
          </div>
          {autoSyncEnabled && (
            <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-500 text-white rounded">LIVE</span>
          )}
       </div>
       <div className="space-y-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Cấu hình Hiện tại</p>
            <p className="text-xs font-bold text-slate-300">
              {autoSyncEnabled ? `Auto-Sync: BẬT (${syncInterval}m)` : 'Auto-Sync: ĐANG TẮT'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Lần đồng bộ cuối</p>
            <p className="text-xs font-mono text-emerald-400">
              {lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString('vi-VN') : 'N/A'}
            </p>
          </div>
          <div className="pt-2">
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Nhật ký Hệ thống</p>
            <div className="space-y-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
              {syncLogs.length === 0 ? (
                <p className="text-[10px] text-slate-600 italic">Chưa có hoạt động nào</p>
              ) : (
                syncLogs.slice(0, 5).map((log, i) => (
                  <div key={log.id || i} className="flex gap-2 text-[9px] border-l border-slate-700 pl-2 py-0.5">
                    <span className={log.status === 'Error' ? 'text-rose-500' : 'text-indigo-400'}>[{log.status}]</span>
                    <span className="text-slate-500 truncate">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
       </div>
       <div className="mt-6 flex gap-2">
          <div className={`flex-1 h-1.5 rounded-full ${autoSyncEnabled ? 'bg-indigo-500' : 'bg-slate-800'}`}></div>
          <div className={`flex-1 h-1.5 rounded-full ${isSyncing ? 'bg-indigo-400 animate-pulse' : 'bg-slate-800'}`}></div>
       </div>
    </div>
  );
};

export default SyncAgentStatus;
