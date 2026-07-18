import React from 'react';
import { File, Folder, Loader2, UploadCloud, X } from 'lucide-react';
import { motion } from 'motion/react';
import { UploadItem } from './driveTypes';

type WebkitFile = File & { webkitRelativePath?: string };

type Props = {
  open: boolean;
  uploading: boolean;
  dragging: boolean;
  progress: number;
  uploadPhase: 'uploading' | 'finalizing';
  selectedUploadFiles: UploadItem[];
  note: string;
  onSetDragging: (dragging: boolean) => void;
  onSetSelectedUploadFiles: (files: UploadItem[]) => void;
  onSetNote: (note: string) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onClose: () => void;
  onUpload: () => void;
  onCancelUpload?: () => void;
  uploadStatus?: string;
};

const DriveUploadModal: React.FC<Props> = ({ open, uploading, dragging, progress, uploadPhase, selectedUploadFiles, note, onSetDragging, onSetSelectedUploadFiles, onSetNote, onDrop, onClose, onUpload, onCancelUpload, uploadStatus }) => {
  if (!open) return null;

  return <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-indigo-500">Upload Drive</p>
          <h3 className="font-black text-slate-900">Tải file hoặc thư mục lên Drive</h3>
          <p className="mt-1 text-xs text-slate-500">Bạn có thể chọn file, chọn cả thư mục hoặc kéo thả trực tiếp vào khung bên dưới.</p>
        </div>
        <button type="button" onClick={onClose} disabled={uploading} className="p-2 rounded-xl hover:bg-slate-100 disabled:opacity-50"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border px-4 py-4 text-sm font-black transition ${uploading ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400' : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100'}`}>
            <File className="w-5 h-5" />
            Chọn file
            <input className="hidden" type="file" multiple disabled={uploading} onChange={(e)=>{ onSetSelectedUploadFiles(Array.from<File>(e.currentTarget.files || []).map((file) => ({ file, relativePath: file.name }))); e.currentTarget.value = ''; }} />
          </label>
          <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border px-4 py-4 text-sm font-black transition ${uploading ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400' : 'border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100'}`}>
            <Folder className="w-5 h-5" />
            Chọn thư mục
            <input className="hidden" type="file" multiple disabled={uploading} {...({ webkitdirectory: '', directory: '' } as any)} onChange={(e)=>{ onSetSelectedUploadFiles(Array.from<File>(e.currentTarget.files || []).map((file) => ({ file, relativePath: (file as WebkitFile).webkitRelativePath || file.name }))); e.currentTarget.value = ''; }} />
          </label>
        </div>

        <div onDragOver={(e) => { e.preventDefault(); if (!uploading) onSetDragging(true); }} onDragLeave={() => onSetDragging(false)} onDrop={onDrop} className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${dragging ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
          <UploadCloud className="w-10 h-10 mx-auto mb-3" />
          <p className="text-sm font-black">Kéo thả file hoặc cả thư mục vào đây</p>
          <p className="text-xs mt-1">Giữ nguyên cấu trúc thư mục con khi trình duyệt hỗ trợ.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Đã chọn</p>
          <p className="mt-1 truncate text-sm font-bold text-slate-800">{selectedUploadFiles.length > 0 ? `${selectedUploadFiles.length} file${selectedUploadFiles[0]?.relativePath ? ` · ${selectedUploadFiles[0].relativePath}` : ''}` : 'Chưa chọn file nào'}</p>
        </div>

        <input className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-950" value={note} disabled={uploading} onChange={(e)=>onSetNote(e.target.value)} placeholder="Ghi chú file (không bắt buộc)" />

        {uploading && <div className="space-y-2">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            {uploadPhase === 'finalizing'
              ? <motion.div className="h-full w-1/3 rounded-full bg-gradient-to-r from-indigo-400 via-indigo-600 to-violet-500" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }} />
              : <div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />}
          </div>
          <p className="flex items-center justify-center gap-2 text-center text-xs font-bold text-indigo-600">
            {uploadPhase === 'finalizing' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Đang xử lý trên server</> : `Đang tải lên ${progress}%`}
          </p>
          {uploadStatus && <p className="text-center text-xs font-semibold text-slate-500">{uploadStatus}</p>}
        </div>}
      </div>
      <div className="p-5 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
        <button type="button" onClick={uploading ? onCancelUpload : onClose} className="px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 disabled:opacity-50">{uploading ? 'Hủy upload' : 'Hủy'}</button>
        <button type="button" onClick={onUpload} disabled={selectedUploadFiles.length === 0 || uploading} className="px-5 py-3 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50 inline-flex items-center justify-center gap-2"><UploadCloud className="w-4 h-4" />{uploading ? (uploadPhase === 'finalizing' ? 'Đang xử lý' : `${progress}%`) : `Tải lên${selectedUploadFiles.length ? ` (${selectedUploadFiles.length})` : ''}`}</button>
      </div>
    </div>
  </div>;
};

export default DriveUploadModal;
