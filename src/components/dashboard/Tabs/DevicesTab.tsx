
import React from 'react';
import { Laptop } from 'lucide-react';

const DevicesTab: React.FC = () => {
  return (
    <div className="col-span-12 space-y-8">
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
         <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-200">
            <Laptop className="w-8 h-8" />
         </div>
         <h3 className="text-lg font-bold text-slate-800">Cấu hình thiết bị đồng bộ</h3>
         <p className="text-sm text-slate-500 max-w-sm mx-auto mt-2">
           Vui lòng cài đặt Vsync Client trên thiết bị của bạn để bắt đầu quá trình đồng bộ hóa tự động.
         </p>
         <button className="mt-8 px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all">
           Tải xuống Client v1.0
         </button>
      </div>
    </div>
  );
};

export default DevicesTab;
