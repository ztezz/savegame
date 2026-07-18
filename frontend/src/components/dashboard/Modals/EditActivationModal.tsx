import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FilePenLine, Gamepad2, MessageSquareText, Save, X } from 'lucide-react';

interface EditActivationModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (gameName: string, originalName: string, note: string) => Promise<void>;
  initialGameName: string;
  initialOriginalName: string;
  initialNote: string;
}

const getExtension = (fileName: string) => {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 && lastDot < fileName.length - 1 ? fileName.slice(lastDot).toLowerCase() : '';
};

const EditActivationModal: React.FC<EditActivationModalProps> = ({
  show, onClose, onSubmit, initialGameName, initialOriginalName, initialNote,
}) => {
  const [gameName, setGameName] = useState(initialGameName);
  const [originalName, setOriginalName] = useState(initialOriginalName);
  const [note, setNote] = useState(initialNote);
  const [loading, setLoading] = useState(false);

  const originalExtension = useMemo(() => getExtension(initialOriginalName), [initialOriginalName]);
  const currentExtension = getExtension(originalName.trim());
  const extensionChanged = Boolean(originalExtension && originalExtension !== currentExtension);

  useEffect(() => {
    if (!show) return;
    setGameName(initialGameName);
    setOriginalName(initialOriginalName);
    setNote(initialNote);
  }, [show, initialGameName, initialOriginalName, initialNote]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextGameName = gameName.trim();
    const nextFileName = originalName.trim();
    if (!nextGameName || !nextFileName) return;

    setLoading(true);
    try {
      await onSubmit(nextGameName, nextFileName, note.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-md">
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 20 }}
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-5 dark:border-slate-800 dark:from-amber-950/40 dark:to-orange-950/30">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-200 dark:shadow-none">
                    <FilePenLine className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">Chỉnh sửa file kích hoạt</h3>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">Đổi tên file tải xuống mà không thay đổi dữ liệu gốc.</p>
                  </div>
                </div>
                <button onClick={onClose} disabled={loading} className="rounded-xl p-2 text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Đóng">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tên game *</label>
                <div className="relative">
                  <Gamepad2 className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={gameName}
                    onChange={(event) => setGameName(event.target.value)}
                    placeholder="Nhập tên game..."
                    className="w-full rounded-xl border border-slate-200 py-3.5 pl-11 pr-4 text-sm font-bold text-slate-800 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-amber-950"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tên file tải xuống *</label>
                <div className="relative">
                  <FilePenLine className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    maxLength={255}
                    value={originalName}
                    onChange={(event) => setOriginalName(event.target.value.replace(/[\\/]/g, ''))}
                    placeholder="Ví dụ: activation-v2.zip"
                    className="w-full rounded-xl border border-slate-200 py-3.5 pl-11 pr-4 font-mono text-sm font-bold text-slate-800 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-amber-950"
                  />
                </div>
                <div className="mt-2 flex items-start justify-between gap-3 text-[10px] font-semibold">
                  <span className={extensionChanged ? 'text-amber-600' : 'text-slate-400'}>
                    {extensionChanged
                      ? `Phần mở rộng đã đổi từ ${originalExtension} sang ${currentExtension || 'không có'}.`
                      : 'Nên giữ nguyên phần mở rộng để file mở đúng ứng dụng.'}
                  </span>
                  <span className="shrink-0 text-slate-400">{originalName.length}/255</span>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Ghi chú</label>
                <div className="relative">
                  <MessageSquareText className="absolute left-4 top-4 h-4 w-4 text-slate-400" />
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Phiên bản, nguồn hoặc hướng dẫn sử dụng..."
                    rows={3}
                    maxLength={500}
                    className="w-full resize-none rounded-xl border border-slate-200 py-3.5 pl-11 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-amber-950"
                  />
                </div>
              </div>

              <div className="flex gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
                <button type="button" onClick={onClose} disabled={loading} className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-600 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200">
                  Hủy
                </button>
                <button type="submit" disabled={loading || !gameName.trim() || !originalName.trim()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50">
                  <Save className="h-4 w-4" /> {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default EditActivationModal;
