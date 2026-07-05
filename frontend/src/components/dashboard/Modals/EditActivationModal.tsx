import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface EditActivationModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (gameName: string, note: string) => Promise<void>;
  initialGameName: string;
  initialNote: string;
}

const EditActivationModal: React.FC<EditActivationModalProps> = ({
  show, onClose, onSubmit, initialGameName, initialNote
}) => {
  const [gameName, setGameName] = useState(initialGameName);
  const [note, setNote] = useState(initialNote);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameName.trim()) return;

    setLoading(true);
    try {
      await onSubmit(gameName.trim(), note.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show) {
      setGameName(initialGameName);
      setNote(initialNote);
    }
  }, [show, initialGameName, initialNote]);

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-white/20"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">Chỉnh sửa File Kích hoạt</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-900 font-bold text-xs uppercase">Đóng</button>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Tên game</label>
                  <input 
                    type="text"
                    required
                    value={gameName}
                    onChange={(e) => setGameName(e.target.value)}
                    placeholder="Nhập tên game..."
                    className="w-full px-4 py-4 rounded-xl border border-slate-200 focus:ring-4 focus:ring-amber-500/5 focus:border-amber-500 outline-none transition-all font-bold text-sm tracking-tight"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Ghi chú</label>
                  <textarea 
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Thêm ghi chú..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-amber-500/5 focus:border-amber-500 outline-none transition-all font-normal text-sm"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all uppercase tracking-tight"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    disabled={loading || !gameName.trim()}
                    className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-all uppercase tracking-tight disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default EditActivationModal;
