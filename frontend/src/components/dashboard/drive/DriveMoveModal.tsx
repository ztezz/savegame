import React from 'react';
import { Folder, X } from 'lucide-react';

type FolderTreeItem = {
  id: number;
  name: string;
  parent_id: number | null;
  depth: number;
  path: string;
};

type Props = {
  open: boolean;
  selectedCount: number;
  moveTargetId: string;
  folders: FolderTreeItem[];
  onSetMoveTargetId: (id: string) => void;
  onClose: () => void;
  onMove: () => void;
};

const DriveMoveModal: React.FC<Props> = ({ open, selectedCount, moveTargetId, folders, onSetMoveTargetId, onClose, onMove }) => {
  if (!open) return null;

  return <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-indigo-500">Di chuyển</p>
          <h3 className="font-black text-slate-900">Chọn thư mục đích cho {selectedCount} mục</h3>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-5 overflow-auto space-y-2">
        <button type="button" onClick={() => onSetMoveTargetId('root')} className={`w-full text-left rounded-2xl border px-4 py-3 text-sm font-bold ${moveTargetId === 'root' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>Drive của tôi</button>
        {folders.map((folder) => <button key={folder.id} type="button" onClick={() => onSetMoveTargetId(String(folder.id))} className={`w-full text-left rounded-2xl border px-4 py-3 text-sm font-bold ${moveTargetId === String(folder.id) ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`} style={{ paddingLeft: `${16 + folder.depth * 20}px` }}><Folder className="w-4 h-4 inline mr-2 text-indigo-500" />{folder.name}<span className="ml-2 text-xs font-normal text-slate-400">{folder.path}</span></button>)}
        {folders.length === 0 && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Chưa có thư mục nào. Có thể di chuyển về Drive của tôi.</div>}
      </div>
      <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600">Hủy</button>
        <button type="button" onClick={onMove} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-black">Di chuyển</button>
      </div>
    </div>
  </div>;
};

export default DriveMoveModal;
