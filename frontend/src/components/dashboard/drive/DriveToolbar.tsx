import React from 'react';
import { ChevronRight, Plus, Search, UploadCloud, X } from 'lucide-react';
import { DriveFolder, DriveUsage } from './driveTypes';
import { formatFileSize } from './driveUtils';

type Props = {
  usage: DriveUsage | null;
  trashMode: boolean;
  breadcrumb: DriveFolder[];
  searchTerm: string;
  usagePercent: number;
  activePercent: number;
  trashPercent: number;
  onOpenFolder: (folderId: number | null) => void;
  onSetSearchTerm: (term: string) => void;
  onOpenFolderModal: () => void;
  onOpenUploadModal: () => void;
};

const DriveToolbar: React.FC<Props> = ({ usage, trashMode, breadcrumb, searchTerm, usagePercent, activePercent, trashPercent, onOpenFolder, onSetSearchTerm, onOpenFolderModal, onOpenUploadModal }) => {
  return <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
    {usage && <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-indigo-500">Dung lượng Drive</p>
          <p className="mt-1 text-sm font-bold text-slate-800">Đã dùng {formatFileSize(usage.totalBytes)} / {formatFileSize(usage.quotaBytes)} ({usagePercent}%)</p>
          <p className="mt-1 text-[11px] font-semibold text-indigo-500">Giới hạn: {usage.quotaSource === 'user' ? 'quota riêng của tài khoản' : 'cài đặt hệ thống'}</p>
        </div>
        <div className="text-xs text-slate-500 sm:text-right">
          <p>{usage.activeFiles} file active · {formatFileSize(usage.activeBytes)}</p>
          <p>{usage.trashFiles} file trong thùng rác · {formatFileSize(usage.trashBytes)}</p>
        </div>
      </div>
      <div className="mt-3 h-3 rounded-full bg-white overflow-hidden border border-indigo-100 flex">
        <div className="h-full bg-indigo-600" style={{ width: `${activePercent}%` }} />
        <div className="h-full bg-amber-400" style={{ width: `${trashPercent}%` }} />
      </div>
      {usagePercent >= 90 && <p className="mt-2 text-xs font-bold text-amber-700">Drive gần đầy. Hãy xóa vĩnh viễn file trong thùng rác hoặc tăng DRIVE_QUOTA_MB.</p>}
    </div>}

    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button type="button" onClick={() => onOpenFolder(null)} disabled={trashMode} className="font-bold text-indigo-600 hover:text-indigo-800 disabled:text-slate-400">Drive của tôi</button>
      {trashMode && <><ChevronRight className="w-4 h-4 text-slate-300" /><span className="font-bold text-red-600">Thùng rác</span></>}
      {!trashMode && breadcrumb.map((folder) => <React.Fragment key={folder.id}><ChevronRight className="w-4 h-4 text-slate-300" /><button type="button" onClick={() => onOpenFolder(folder.id)} className="font-bold text-slate-700 hover:text-indigo-700">{folder.name}</button></React.Fragment>)}
    </div>

    <div className="relative">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input value={searchTerm} onChange={(e) => onSetSearchTerm(e.target.value)} className="w-full border border-slate-200 rounded-2xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300" placeholder={trashMode ? 'Tìm trong thùng rác...' : 'Tìm file, thư mục hoặc ghi chú trong Drive...'} />
      {searchTerm && <button type="button" onClick={() => onSetSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>}
    </div>

    {!trashMode && <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      <button type="button" onClick={onOpenFolderModal} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-100 transition hover:bg-slate-800"><Plus className="w-4 h-4" />Thư mục mới</button>
      <button type="button" onClick={onOpenUploadModal} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700"><UploadCloud className="w-4 h-4" />Tải lên</button>
    </div>}
  </div>;
};

export default DriveToolbar;
