import React from 'react';
import { ChevronRight, CloudUpload, Database, FolderPlus, HardDrive, Search, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
  const reduceMotion = useReducedMotion();

  return <motion.div initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.08, duration: 0.45 }} className="space-y-4 rounded-[1.75rem] border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60 sm:p-5">
    {usage && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none"><Database className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-black text-slate-900">Dung lượng lưu trữ</p>
              <p className="text-xs font-bold text-slate-500"><span className="text-slate-900">{formatFileSize(usage.totalBytes)}</span> / {formatFileSize(usage.quotaBytes)}</p>
            </div>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-200">
              <motion.div initial={reduceMotion ? false : { width: 0 }} animate={{ width: `${activePercent}%` }} transition={{ duration: reduceMotion ? 0 : 0.75, ease: 'easeOut' }} className="h-full bg-indigo-600" />
              <motion.div initial={reduceMotion ? false : { width: 0 }} animate={{ width: `${trashPercent}%` }} transition={{ duration: reduceMotion ? 0 : 0.75, delay: reduceMotion ? 0 : 0.12, ease: 'easeOut' }} className="h-full bg-amber-400" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-600" />{usage.activeFiles} file · {formatFileSize(usage.activeBytes)}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Thùng rác · {formatFileSize(usage.trashBytes)}</span>
              <span className="ml-auto text-slate-400">{usagePercent}% đã dùng</span>
            </div>
          </div>
        </div>
      </div>
      {!trashMode && <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onOpenFolderModal} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"><FolderPlus className="h-4 w-4" />Thư mục mới</button>
        <button type="button" onClick={onOpenUploadModal} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-700 dark:shadow-none"><CloudUpload className="h-4 w-4" />Tải lên</button>
      </div>}
      {usagePercent >= 90 && <p className="text-xs font-bold text-amber-700 lg:col-span-2">Drive gần đầy. Hãy xóa vĩnh viễn file trong thùng rác hoặc tăng hạn mức lưu trữ.</p>}
    </div>}

    <div className="flex min-h-7 items-center gap-1 overflow-x-auto text-xs scrollbar-none">
      <button type="button" onClick={() => onOpenFolder(null)} disabled={trashMode} className="inline-flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 font-black text-indigo-600 hover:bg-indigo-50 disabled:text-slate-400"><HardDrive className="h-3.5 w-3.5" />Drive của tôi</button>
      {trashMode && <><ChevronRight className="w-4 h-4 text-slate-300" /><span className="font-bold text-red-600">Thùng rác</span></>}
      {!trashMode && breadcrumb.map((folder) => <React.Fragment key={folder.id}><ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" /><button type="button" onClick={() => onOpenFolder(folder.id)} className="shrink-0 rounded-lg px-2 py-1.5 font-bold text-slate-600 hover:bg-slate-100 hover:text-indigo-700">{folder.name}</button></React.Fragment>)}
    </div>

    <div className="relative">
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input value={searchTerm} onChange={(e) => onSetSearchTerm(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 py-3.5 pl-11 pr-11 text-sm font-medium transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100/70 dark:focus:ring-indigo-950" placeholder={trashMode ? 'Tìm trong thùng rác...' : 'Tìm kiếm trong Drive của bạn...'} />
      <AnimatePresence>{searchTerm && <motion.button initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} type="button" aria-label="Xóa từ khóa tìm kiếm" onClick={() => onSetSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><X className="h-4 w-4" /></motion.button>}</AnimatePresence>
    </div>

    {trashMode && <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"><Trash2 className="h-4 w-4" />Các mục trong thùng rác vẫn tính vào dung lượng đã dùng.</div>}
  </motion.div>;
};

export default DriveToolbar;
