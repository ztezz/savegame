import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

const DriveConfirmModal: React.FC<Props> = ({ open, title, message, confirmLabel = 'Xác nhận', danger = false, loading = false, onClose, onConfirm }) => {
  if (!open) return null;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
    <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${danger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
            {danger ? <Trash2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">{message}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} disabled={loading} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex flex-col-reverse gap-2 p-5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={loading} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Hủy</button>
        <button type="button" onClick={onConfirm} disabled={loading} className={`rounded-xl px-5 py-3 text-sm font-black text-white transition disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}>{loading ? 'Đang xử lý...' : confirmLabel}</button>
      </div>
    </div>
  </div>;
};

export default DriveConfirmModal;
