import React from 'react';
import { Grid2X2, List, Trash2 } from 'lucide-react';

type Props = {
  viewMode: 'grid' | 'list';
  trashMode: boolean;
  onSetViewMode: (mode: 'grid' | 'list') => void;
  onToggleTrash: () => void;
};

const DriveHeader: React.FC<Props> = ({ viewMode, trashMode, onSetViewMode, onToggleTrash }) => {
  return <div className="rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-indigo-100">
    <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-white/70">CloudSave Drive</p>
        <h3 className="mt-2 text-3xl font-black tracking-tight">Drive cá nhân</h3>
        <p className="mt-2 text-sm text-white/80 max-w-2xl">Quản lý file kiểu Google Drive: kéo thả upload, chọn nhiều mục, đổi tên, di chuyển và thùng rác.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-2xl p-1">
          <button type="button" onClick={() => onSetViewMode('grid')} className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${viewMode === 'grid' ? 'bg-white text-indigo-700' : 'text-white/80'}`}><Grid2X2 className="w-4 h-4" />Lưới</button>
          <button type="button" onClick={() => onSetViewMode('list')} className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${viewMode === 'list' ? 'bg-white text-indigo-700' : 'text-white/80'}`}><List className="w-4 h-4" />Danh sách</button>
        </div>
        <button type="button" onClick={onToggleTrash} className={`px-4 py-3 rounded-2xl text-sm font-black border ${trashMode ? 'bg-white text-red-600 border-white' : 'bg-white/10 text-white border-white/20'}`}><Trash2 className="w-4 h-4 inline mr-2" />Thùng rác</button>
      </div>
    </div>
  </div>;
};

export default DriveHeader;
