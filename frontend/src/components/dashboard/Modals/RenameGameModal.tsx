import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface RenameGameModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (gameName: string, category: string, filePath: string) => Promise<void>;
  initialGameName: string;
  initialCategory: string;
  initialFilePath: string;
  categories: string[];
}

const RenameGameModal: React.FC<RenameGameModalProps> = ({
  show, onClose, onSubmit, initialGameName, initialCategory, initialFilePath, categories
}) => {
  const [gameName, setGameName] = useState(initialGameName);
  const [category, setCategory] = useState(initialCategory);
  const [filePath, setFilePath] = useState(initialFilePath);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameName.trim()) return;

    setLoading(true);
    try {
      await onSubmit(gameName.trim(), category, filePath.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (show) {
      setGameName(initialGameName);
      setCategory(initialCategory);
      setFilePath(initialFilePath);
    }
  }, [show, initialGameName, initialCategory, initialFilePath]);

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Chỉnh sửa Tên Game</h3>
                <button onClick={onClose} className="text-xs font-bold uppercase text-slate-400 hover:text-slate-900 dark:hover:text-white">Đóng</button>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Tên Game</label>
                  <input 
                    type="text"
                    required
                    value={gameName}
                    onChange={(e) => setGameName(e.target.value)}
                    placeholder="Nhập tên game..."
                    className="w-full rounded-xl border border-slate-200 px-4 py-4 text-sm font-bold tracking-tight text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Thể loại</label>
                  <select 
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold tracking-tight text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Thư mục Save trên máy Windows</label>
                  <input 
                    type="text"
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    placeholder="vd: C:\\Users\\TaiKhoan\\Documents\\SaveGames\\TenGame"
                    className="w-full rounded-xl border border-slate-200 px-4 py-4 text-sm font-bold tracking-tight text-slate-800 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <p className="px-1 text-[10px] text-slate-400">Bắt buộc nếu muốn khôi phục từ xa. Nhập thư mục chứa save, không nhập tên tệp.</p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-bold uppercase tracking-tight text-slate-700 transition-all hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    disabled={loading || !gameName.trim()}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all uppercase tracking-tight disabled:opacity-50 disabled:cursor-not-allowed"
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

export default RenameGameModal;
