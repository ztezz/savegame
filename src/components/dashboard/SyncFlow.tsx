
import React from 'react';
import { Zap } from 'lucide-react';

interface SyncFlowProps {
  uploadProgress: number | null;
}

const SyncFlow: React.FC<SyncFlowProps> = ({ uploadProgress }) => {
  return (
    <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-xl shadow-indigo-100 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform"></div>
      <h4 className="text-xs font-black uppercase tracking-[0.2em] opacity-80 mb-6 flex items-center gap-2">
         <Zap className="w-3.5 h-3.5 fill-current" />
         Luồng Đồng Bộ
      </h4>
      
      <div className="space-y-4">
         <div className="flex items-center justify-between text-xs font-mono font-bold tracking-tighter">
           <p className="flex items-center gap-2 truncate">
              <span className={`w-2 h-2 rounded-full ${
                uploadProgress === -1 
                  ? 'bg-red-500 animate-pulse' 
                  : 'bg-white animate-pulse'
              }`}></span>
              {uploadProgress === -1 
                ? 'TRẠNG THÁI: STALLED' 
                : uploadProgress ? (
                uploadProgress === 100 ? 'TRẠNG THÁI: HOÀN TẤT' : 'ĐANG TẢI LÊN: STATE_DAT'
              ) : 'TRẠNG THÁI: CHỜ'}
           </p>
           <p className={`font-black ${uploadProgress === -1 ? 'text-red-300' : ''}`}>
             {uploadProgress === -1 ? 'ERR' : uploadProgress || 0}%
           </p>
         </div>
         <div className="w-full h-3 bg-indigo-900/40 rounded-full overflow-hidden border border-white/10 p-0.5">
           <div 
             className={`h-full rounded-full transition-all duration-500 ${
               uploadProgress === -1
                 ? 'bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse'
                 : uploadProgress === 100 
                 ? 'bg-emerald-400 shadow-emerald-400/50' 
                 : 'bg-white shadow-white/50'
             }`}
             style={{ width: `${Math.max(uploadProgress === -1 ? 0 : uploadProgress || 0, 0)}%` }}
           ></div>
         </div>
         <p className="text-[10px] leading-relaxed opacity-70 italic font-medium">
           {uploadProgress === -1 
             ? '❌ Upload stalled! Kiểm tra kết nối mạng'
             : uploadProgress && uploadProgress < 100 
             ? '⏳ Đang thực thi... Vui lòng chờ đợi, đừng đóng tab'
             : uploadProgress === 100
             ? '✓ Tải lên thành công, xử lý server...'
             : 'Độ trễ: 24ms'}
         </p>
      </div>
    </div>
  );
};

export default SyncFlow;
