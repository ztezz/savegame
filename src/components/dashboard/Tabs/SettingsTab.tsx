
import React from 'react';
import { motion } from 'motion/react';

interface SettingsTabProps {
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (enabled: boolean) => void;
  directoryHandle: any;
  handleSelectDirectory: () => void;
  syncInterval: number;
  setSyncInterval: (interval: number) => void;
}

const SettingsTab: React.FC<SettingsTabProps> = ({
  autoSyncEnabled, setAutoSyncEnabled, directoryHandle, handleSelectDirectory, syncInterval, setSyncInterval
}) => {
  return (
    <div className="col-span-12 space-y-8">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Cấu hình hệ thống</h3>
        </div>
        <div className="p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-800">Tự động nén tệp tin</p>
              <p className="text-xs text-slate-500">Sử dụng Gzip để giảm dung lượng lưu trữ (Khuyên dùng)</p>
            </div>
            <div className="w-12 h-6 bg-indigo-600 rounded-full relative cursor-pointer pt-1 px-1">
              <div className="w-4 h-4 bg-white rounded-full ml-auto shadow-sm"></div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-6 border-t border-slate-50">
            <div>
              <p className="text-sm font-bold text-slate-800">Đồng bộ tự động (Background Sync)</p>
              <p className="text-xs text-slate-500">Tự động đẩy bản lưu từ thư mục định danh</p>
            </div>
            <div className="flex items-center gap-4">
              <div 
                onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                className={`w-12 h-6 rounded-full relative cursor-pointer pt-1 px-1 transition-colors ${autoSyncEnabled ? 'bg-indigo-600' : 'bg-slate-200'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-all ${autoSyncEnabled ? 'ml-auto' : 'ml-0'}`}></div>
              </div>
            </div>
          </div>
          {autoSyncEnabled && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-indigo-50 rounded-xl space-y-4">
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase text-indigo-400">Thư mục nguồn</label>
                <div className="flex gap-2">
                  <div className="flex-1 px-3 py-2 bg-white border border-indigo-100 rounded-lg text-xs font-mono text-indigo-600 truncate">
                    {directoryHandle ? directoryHandle.name : 'Chưa chọn thư mục'}
                  </div>
                  <button 
                    type="button"
                    onClick={handleSelectDirectory}
                    className="px-3 py-2 bg-indigo-600 text-white text-[10px] font-bold rounded-lg uppercase"
                  >
                    Chọn
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase text-indigo-400">Chu kỳ đồng bộ (Phút)</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" min="1" max="60" 
                    value={syncInterval} 
                    onChange={(e) => setSyncInterval(parseInt(e.target.value))}
                    className="flex-1 accent-indigo-600" 
                  />
                  <span className="text-xs font-bold text-indigo-600 w-8">{syncInterval}m</span>
                </div>
              </div>
            </motion.div>
          )}
          <div className="flex items-center justify-between pt-6 border-t border-slate-50">
            <div>
              <p className="text-sm font-bold text-slate-800">Lưu vết hoạt động</p>
              <p className="text-xs text-slate-500">Ghi lại nhật ký các bản lưu và tải xuống</p>
            </div>
            <div className="w-12 h-6 bg-indigo-600 rounded-full relative cursor-pointer pt-1 px-1">
              <div className="w-4 h-4 bg-white rounded-full ml-auto shadow-sm"></div>
            </div>
          </div>
          <button className="mt-8 w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
            Lưu cấu hình
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
