import React from 'react';
import { File, Folder, FolderOpen, Inbox, Share2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DriveFile, DriveFolder, FileFilter } from './driveTypes';
import { formatFileSize, getFileVisual } from './driveUtils';

type SelectionKey = `file-${number}` | `folder-${number}`;

type Props = {
  loading: boolean;
  trashMode: boolean;
  empty: boolean;
  filteredEmpty: boolean;
  viewMode: 'grid' | 'list';
  fileFilter: FileFilter;
  filterOptions: Array<{ value: FileFilter; label: string; count: number }>;
  visibleFolders: DriveFolder[];
  visibleFiles: DriveFile[];
  selected: Set<SelectionKey>;
  onSetFileFilter: (filter: FileFilter) => void;
  onOpenFolder: (folderId: number) => void;
  onToggleSelected: (type: 'file' | 'folder', id: number) => void;
  renderActions: (type: 'file' | 'folder', item: DriveFile | DriveFolder) => React.ReactNode;
};

const DriveContent: React.FC<Props> = ({ loading, trashMode, empty, filteredEmpty, viewMode, fileFilter, filterOptions, visibleFolders, visibleFiles, selected, onSetFileFilter, onOpenFolder, onToggleSelected, renderActions }) => {
  const reduceMotion = useReducedMotion();
  const itemInitial = reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 };
  const itemTransition = { duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] as const };

  return <motion.div initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.14, duration: 0.45 }} className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50">
    <div className="space-y-4 border-b border-slate-100 px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Thư viện của bạn</p><h3 className="mt-1 text-lg font-black tracking-tight text-slate-900">{trashMode ? 'Thùng rác' : 'Tệp và thư mục'}</h3></div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-500">{visibleFolders.length} thư mục · {visibleFiles.length} file</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filterOptions.map((option) => <motion.button whileTap={reduceMotion ? undefined : { scale: 0.96 }} key={option.value} type="button" onClick={() => onSetFileFilter(option.value)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-black transition ${fileFilter === option.value ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-200 dark:shadow-none' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>{option.label} <span className={`ml-1 ${fileFilter === option.value ? 'text-white/60' : 'text-slate-400'}`}>{option.count}</span></motion.button>)}
      </div>
    </div>

    <AnimatePresence mode="wait" initial={!reduceMotion}>{loading ? <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid min-h-56 place-items-center p-10"><div className="text-center"><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" /><p className="mt-3 text-xs font-bold text-slate-500">Đang đồng bộ Drive...</p></div></motion.div> : empty ? <motion.div key="empty" initial={itemInitial} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} className="grid min-h-64 place-items-center p-10 text-center"><div><motion.span animate={reduceMotion ? undefined : { y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-500"><FolderOpen className="h-8 w-8" /></motion.span><p className="mt-4 font-black text-slate-800">{trashMode ? 'Thùng rác đang trống' : 'Thư mục này đang trống'}</p><p className="mt-1 text-sm text-slate-500">{trashMode ? 'Không có mục nào cần dọn dẹp.' : 'Tải file lên hoặc tạo thư mục mới để bắt đầu.'}</p></div></motion.div> : filteredEmpty ? <motion.div key="filtered-empty" initial={itemInitial} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} className="grid min-h-56 place-items-center p-10 text-center"><div><Inbox className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-bold text-slate-700">Không có mục phù hợp</p><p className="mt-1 text-sm text-slate-400">Thử chọn một loại file khác.</p></div></motion.div> : viewMode === 'grid' ? <motion.div key="grid" layout className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3 2xl:grid-cols-4">
      {visibleFolders.map((folder, index) => <motion.div layout initial={itemInitial} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ ...itemTransition, delay: reduceMotion ? 0 : Math.min(index * 0.035, 0.25) }} key={`folder-${folder.id}`} className={`group rounded-2xl border p-4 transition-colors duration-200 ${selected.has(`folder-${folder.id}`) ? 'border-indigo-400 bg-indigo-50/70 shadow-lg shadow-indigo-100 dark:shadow-none' : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow-xl hover:shadow-slate-200/60 dark:hover:shadow-black/20'}`}>
        <div className="flex items-start justify-between gap-2"><button type="button" onClick={() => onOpenFolder(folder.id)} className="min-w-0 flex-1 text-left"><div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 text-indigo-500"><Folder className="h-6 w-6 fill-indigo-200" /></div><p className="truncate font-black text-slate-900">{folder.name}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Thư mục</p></button><input aria-label={`Chọn thư mục ${folder.name}`} type="checkbox" checked={selected.has(`folder-${folder.id}`)} onChange={() => onToggleSelected('folder', folder.id)} className="h-4 w-4 rounded accent-indigo-600" /></div>
        <div className="mt-4 border-t border-slate-100 pt-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">{renderActions('folder', folder)}</div>
      </motion.div>)}
      {visibleFiles.map((file, index) => {
        const visual = getFileVisual(file);
        return <motion.div layout initial={itemInitial} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ ...itemTransition, delay: reduceMotion ? 0 : Math.min((visibleFolders.length + index) * 0.035, 0.25) }} key={`file-${file.id}`} className={`group rounded-2xl border bg-white p-4 transition-colors duration-200 ${selected.has(`file-${file.id}`) ? 'border-indigo-400 bg-indigo-50/40 ring-2 ring-indigo-100 shadow-lg shadow-indigo-100 dark:ring-indigo-950 dark:shadow-none' : 'border-slate-200 hover:border-indigo-200 hover:shadow-xl hover:shadow-slate-200/60 dark:hover:shadow-black/20'}`}>
          <div className="flex items-start justify-between gap-2"><div className="flex items-start gap-2"><div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${visual.iconClass}`}><File className="h-6 w-6" /></div>{file.share_token && <span title="Đang chia sẻ bằng link công khai" aria-label="Đang chia sẻ bằng link công khai" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-4 ring-emerald-50"><Share2 className="h-3.5 w-3.5" /></span>}</div><input aria-label={`Chọn file ${file.original_name}`} type="checkbox" checked={selected.has(`file-${file.id}`)} onChange={() => onToggleSelected('file', file.id)} className="h-4 w-4 rounded accent-indigo-600" /></div>
          <p className="min-h-12 break-words font-black leading-5 text-slate-900 line-clamp-2">{file.original_name}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${visual.className}`}>{visual.label}</span><span className="text-xs font-bold text-slate-500">{formatFileSize(Number(file.file_size))}</span></div>
          {file.note && <p className="text-xs text-slate-400 mt-3 line-clamp-2">{file.note}</p>}
          <div className="mt-4 border-t border-slate-100 pt-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">{renderActions('file', file)}</div>
        </motion.div>;
      })}
    </motion.div> : <motion.div key="list" layout className="divide-y divide-slate-100">
      {visibleFolders.map((folder, index) => <motion.div layout initial={itemInitial} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...itemTransition, delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.2) }} key={`folder-${folder.id}`} className={`p-4 flex items-center justify-between gap-3 hover:bg-slate-50 ${selected.has(`folder-${folder.id}`) ? 'bg-indigo-50' : ''}`}>
        <div className="min-w-0 flex items-center gap-3"><input type="checkbox" checked={selected.has(`folder-${folder.id}`)} onChange={() => onToggleSelected('folder', folder.id)} className="w-4 h-4" /><button type="button" onClick={() => onOpenFolder(folder.id)} className="min-w-0 flex items-center gap-3 text-left"><Folder className="w-6 h-6 text-indigo-500 shrink-0" /><span className="font-bold text-slate-800 truncate">{folder.name}</span></button></div>
        {renderActions('folder', folder)}
      </motion.div>)}
      {visibleFiles.map((file, index) => <motion.div layout initial={itemInitial} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...itemTransition, delay: reduceMotion ? 0 : Math.min((visibleFolders.length + index) * 0.025, 0.2) }} key={`file-${file.id}`} className={`p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:bg-slate-50 ${selected.has(`file-${file.id}`) ? 'bg-indigo-50' : ''}`}>
        <div className="min-w-0 flex items-center gap-3"><input type="checkbox" checked={selected.has(`file-${file.id}`)} onChange={() => onToggleSelected('file', file.id)} className="w-4 h-4" /><File className="w-6 h-6 text-slate-500 shrink-0" /><div className="min-w-0"><p className="flex items-center gap-2 font-bold text-slate-800"><span className="truncate">{file.original_name}</span>{file.share_token && <Share2 title="Đang chia sẻ bằng link công khai" aria-label="Đang chia sẻ bằng link công khai" className="h-4 w-4 shrink-0 text-emerald-500" />}</p><p className="text-xs text-slate-500">{getFileVisual(file).label} · {formatFileSize(Number(file.file_size))} · {new Date(file.created_at).toLocaleString('vi-VN')}</p></div></div>
        {renderActions('file', file)}
      </motion.div>)}
    </motion.div>}</AnimatePresence>
  </motion.div>;
};

export default DriveContent;
