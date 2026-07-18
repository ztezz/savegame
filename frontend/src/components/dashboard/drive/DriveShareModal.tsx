import React from 'react';
import { Copy, ExternalLink, Link, ShieldCheck, X } from 'lucide-react';
import { DriveFile } from './driveTypes';
import { formatFileSize } from './driveUtils';

type Props = {
  file: DriveFile | null;
  open: boolean;
  shareUrl: string;
  expiresInHours: string;
  saving: boolean;
  onSetExpiresInHours: (value: string) => void;
  onClose: () => void;
  onCreateOrUpdate: () => void;
  onCopy: () => void;
  onUnshare: () => void;
};

const expiryOptions = [
  { value: 'never', label: 'Không hết hạn' },
  { value: '1', label: '1 giờ' },
  { value: '24', label: '24 giờ' },
  { value: '168', label: '7 ngày' },
  { value: '720', label: '30 ngày' },
];

const DriveShareModal: React.FC<Props> = ({ file, open, shareUrl, expiresInHours, saving, onSetExpiresInHours, onClose, onCreateOrUpdate, onCopy, onUnshare }) => {
  if (!open || !file) return null;

  const expiresAt = file.share_expires_at ? new Date(file.share_expires_at).toLocaleString('vi-VN') : 'Không hết hạn';

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
    <div className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="relative overflow-hidden bg-slate-950 p-6 text-white">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-indigo-100">
              <ShieldCheck className="h-3.5 w-3.5" /> Thiết lập chia sẻ
            </div>
            <h3 className="truncate text-xl font-black">{file.original_name}</h3>
            <p className="mt-1 text-sm text-slate-300">{formatFileSize(Number(file.file_size))}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="space-y-5 p-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Trạng thái link</p>
          <p className="mt-2 text-sm font-bold text-slate-800">{file.share_token ? `Đang bật · Hết hạn: ${expiresAt}` : 'Chưa bật chia sẻ công khai'}</p>
        </div>

        <label className="block text-sm font-bold text-slate-900">Thời hạn link
          <select value={expiresInHours} onChange={(e) => onSetExpiresInHours(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-950">
            {expiryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        {shareUrl && <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Link công khai</p>
          <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <input readOnly value={shareUrl} className="min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold text-slate-700 outline-none" />
            <button type="button" onClick={onCopy} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-800"><Copy className="h-4 w-4" />Copy</button>
          </div>
        </div>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            {file.share_token && <button type="button" onClick={onUnshare} disabled={saving} className="rounded-xl border border-red-100 px-4 py-3 text-sm font-black text-red-600 transition hover:bg-red-50 disabled:opacity-50">Tắt chia sẻ</button>}
            {shareUrl && <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"><ExternalLink className="h-4 w-4" />Mở thử</a>}
          </div>
          <button type="button" onClick={onCreateOrUpdate} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700 disabled:opacity-50 dark:shadow-none"><Link className="h-4 w-4" />{saving ? 'Đang lưu...' : file.share_token ? 'Cập nhật link' : 'Tạo link'}</button>
        </div>
      </div>
    </div>
  </div>;
};

export default DriveShareModal;
