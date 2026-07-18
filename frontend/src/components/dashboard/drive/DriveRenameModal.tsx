import React from 'react';
import { FilePenLine, X } from 'lucide-react';

type Props = {
  open: boolean;
  itemType: 'file' | 'folder';
  value: string;
  loading?: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

const DriveRenameModal: React.FC<Props> = ({ open, itemType, value, loading = false, onChange, onClose, onSubmit }) => {
  if (!open) return null;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
    <form className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="relative overflow-hidden bg-slate-950 p-6 text-white">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-indigo-100"><FilePenLine className="h-5 w-5" /></div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-indigo-100">Đổi tên {itemType === 'file' ? 'file' : 'thư mục'}</p>
              <h3 className="mt-1 text-lg font-black">Nhập tên mới</h3>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="rounded-xl p-2 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="space-y-4 p-6">
        <label className="block text-sm font-bold text-slate-900">Tên mới
          <input autoFocus value={value} onChange={(event) => onChange(event.target.value)} disabled={loading} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 disabled:bg-slate-50 dark:focus:ring-indigo-950" />
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={loading} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Hủy</button>
          <button type="submit" disabled={loading || !value.trim()} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700 disabled:opacity-50 dark:shadow-none">{loading ? 'Đang lưu...' : 'Lưu tên mới'}</button>
        </div>
      </div>
    </form>
  </div>;
};

export default DriveRenameModal;
