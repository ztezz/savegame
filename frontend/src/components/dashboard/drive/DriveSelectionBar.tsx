import React from 'react';
import { RotateCcw, Trash2, X } from 'lucide-react';

type Props = {
  selectedCount: number;
  trashMode: boolean;
  onClearSelection: () => void;
  onOpenMoveModal: () => void;
  onTrashSelected: () => void;
  onRestoreSelected: () => void;
  onPermanentDeleteSelected: () => void;
};

const DriveSelectionBar: React.FC<Props> = ({ selectedCount, trashMode, onClearSelection, onOpenMoveModal, onTrashSelected, onRestoreSelected, onPermanentDeleteSelected }) => {
  if (selectedCount === 0) return null;

  return <div className="sticky top-3 z-20 bg-slate-950 text-white rounded-2xl px-4 py-3 shadow-xl flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
    <div className="flex items-center gap-3"><button type="button" onClick={onClearSelection} className="p-1 rounded-lg bg-white/10"><X className="w-4 h-4" /></button><span className="text-sm font-black">Đã chọn {selectedCount} mục</span></div>
    {trashMode ? <div className="flex flex-wrap gap-2"><button type="button" onClick={onRestoreSelected} className="px-3 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black inline-flex items-center gap-2"><RotateCcw className="w-4 h-4" />Khôi phục</button><button type="button" onClick={onPermanentDeleteSelected} className="px-3 py-2 bg-red-600 text-white rounded-xl text-xs font-black inline-flex items-center gap-2"><Trash2 className="w-4 h-4" />Xóa vĩnh viễn</button></div> : <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={onOpenMoveModal} className="px-3 py-2 bg-indigo-500 text-white rounded-xl text-xs font-black">Di chuyển...</button><button type="button" onClick={onTrashSelected} className="px-3 py-2 bg-red-600 text-white rounded-xl text-xs font-black inline-flex items-center gap-2"><Trash2 className="w-4 h-4" />Xóa</button></div>}
  </div>;
};

export default DriveSelectionBar;
