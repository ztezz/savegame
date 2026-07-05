import React from 'react';
import { Plus, X } from 'lucide-react';
import { DriveFolder } from './driveTypes';

type Props = {
  open: boolean;
  folderName: string;
  breadcrumb: DriveFolder[];
  onChangeFolderName: (name: string) => void;
  onClose: () => void;
  onCreate: () => void;
};

const DriveFolderModal: React.FC<Props> = ({ open, folderName, breadcrumb, onChangeFolderName, onClose, onCreate }) => {
  if (!open) return null;

  return <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-indigo-500">Thư mục Drive</p>
          <h3 className="font-black text-slate-900">Tạo thư mục mới</h3>
          <p className="mt-1 text-xs text-slate-500">Thư mục sẽ được tạo trong vị trí hiện tại.</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-5 space-y-4">
        <label className="block text-sm font-bold text-slate-900">Tên thư mục
          <input autoFocus className="mt-2 w-full border border-slate-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50" value={folderName} onChange={(e)=>onChangeFolderName(e.target.value)} onKeyDown={(e)=>{ if (e.key === 'Enter' && folderName.trim()) onCreate(); }} placeholder="Ví dụ: Setup game, Tài liệu, Ảnh..." />
        </label>
        <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">
          Vị trí: <span className="font-bold text-slate-700">{breadcrumb.length ? breadcrumb.map((folder) => folder.name).join(' / ') : 'Drive của tôi'}</span>
        </div>
      </div>
      <div className="p-5 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600">Hủy</button>
        <button type="button" onClick={onCreate} disabled={!folderName.trim()} className="px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-black disabled:opacity-50 inline-flex items-center justify-center gap-2"><Plus className="w-4 h-4" />Tạo thư mục</button>
      </div>
    </div>
  </div>;
};

export default DriveFolderModal;
