import React from 'react';
import { File, Folder } from 'lucide-react';
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
  return <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
    <div className="p-5 border-b border-slate-100 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{trashMode ? 'Thùng rác' : 'Nội dung'}</h3>
        <span className="text-xs text-slate-500">{visibleFolders.length} thư mục · {visibleFiles.length} file đang hiển thị</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filterOptions.map((option) => <button key={option.value} type="button" onClick={() => onSetFileFilter(option.value)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black transition ${fileFilter === option.value ? 'border-indigo-200 bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{option.label} <span className={fileFilter === option.value ? 'text-white/80' : 'text-slate-400'}>{option.count}</span></button>)}
      </div>
    </div>

    {loading ? <div className="p-8 text-sm text-slate-500">Đang tải...</div> : empty ? <div className="p-10 text-center text-sm text-slate-500">{trashMode ? 'Thùng rác đang trống.' : 'Thư mục này đang trống.'}</div> : filteredEmpty ? <div className="p-10 text-center text-sm text-slate-500">Không có mục nào khớp bộ lọc này.</div> : viewMode === 'grid' ? <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {visibleFolders.map((folder) => <div key={`folder-${folder.id}`} className={`group rounded-3xl border p-4 transition ${selected.has(`folder-${folder.id}`) ? 'border-indigo-400 bg-indigo-50 shadow-lg shadow-indigo-100' : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-xl hover:shadow-slate-100'}`}>
        <div className="flex items-start justify-between gap-2"><button type="button" onClick={() => onOpenFolder(folder.id)} className="min-w-0 flex-1 text-left"><div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500"><Folder className="w-7 h-7" /></div><p className="font-black text-slate-900 truncate">{folder.name}</p><p className="text-xs font-semibold text-slate-500 mt-1">Thư mục</p></button><input type="checkbox" checked={selected.has(`folder-${folder.id}`)} onChange={() => onToggleSelected('folder', folder.id)} className="w-4 h-4 accent-indigo-600" /></div>
        <div className="mt-4 border-t border-slate-100 pt-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">{renderActions('folder', folder)}</div>
      </div>)}
      {visibleFiles.map((file) => {
        const visual = getFileVisual(file);
        return <div key={`file-${file.id}`} className={`group rounded-3xl border bg-white transition p-4 ${selected.has(`file-${file.id}`) ? 'border-indigo-400 ring-2 ring-indigo-100 shadow-lg shadow-indigo-100' : 'border-slate-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-xl hover:shadow-slate-100'}`}>
          <div className="flex items-start justify-between gap-2"><div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${visual.iconClass}`}><File className="w-7 h-7" /></div><input type="checkbox" checked={selected.has(`file-${file.id}`)} onChange={() => onToggleSelected('file', file.id)} className="w-4 h-4 accent-indigo-600" /></div>
          <p className="font-black text-slate-900 line-clamp-2 min-h-12 break-words">{file.original_name}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${visual.className}`}>{visual.label}</span><span className="text-xs font-bold text-slate-500">{formatFileSize(Number(file.file_size))}</span></div>
          {file.note && <p className="text-xs text-slate-400 mt-3 line-clamp-2">{file.note}</p>}
          <div className="mt-4 border-t border-slate-100 pt-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">{renderActions('file', file)}</div>
        </div>;
      })}
    </div> : <div className="divide-y divide-slate-100">
      {visibleFolders.map((folder) => <div key={`folder-${folder.id}`} className={`p-4 flex items-center justify-between gap-3 hover:bg-slate-50 ${selected.has(`folder-${folder.id}`) ? 'bg-indigo-50' : ''}`}>
        <div className="min-w-0 flex items-center gap-3"><input type="checkbox" checked={selected.has(`folder-${folder.id}`)} onChange={() => onToggleSelected('folder', folder.id)} className="w-4 h-4" /><button type="button" onClick={() => onOpenFolder(folder.id)} className="min-w-0 flex items-center gap-3 text-left"><Folder className="w-6 h-6 text-indigo-500 shrink-0" /><span className="font-bold text-slate-800 truncate">{folder.name}</span></button></div>
        {renderActions('folder', folder)}
      </div>)}
      {visibleFiles.map((file) => <div key={`file-${file.id}`} className={`p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:bg-slate-50 ${selected.has(`file-${file.id}`) ? 'bg-indigo-50' : ''}`}>
        <div className="min-w-0 flex items-center gap-3"><input type="checkbox" checked={selected.has(`file-${file.id}`)} onChange={() => onToggleSelected('file', file.id)} className="w-4 h-4" /><File className="w-6 h-6 text-slate-500 shrink-0" /><div className="min-w-0"><p className="font-bold text-slate-800 truncate">{file.original_name}</p><p className="text-xs text-slate-500">{getFileVisual(file).label} · {formatFileSize(Number(file.file_size))} · {new Date(file.created_at).toLocaleString('vi-VN')}</p></div></div>
        {renderActions('file', file)}
      </div>)}
    </div>}
  </div>;
};

export default DriveContent;
