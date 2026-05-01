
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Download, Trash2 } from 'lucide-react';
import { GameSave } from '../types';

interface HistoryModalProps {
  show: boolean;
  onClose: () => void;
  selectedGame: GameSave | null;
  history: any[];
  loading: boolean;
  onDownload: (id: number) => void;
  onDelete: (id: number) => void;
  formatSize: (bytes: number) => string;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ 
  show, onClose, selectedGame, history, loading, onDownload, onDelete, formatSize 
}) => {
  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-white/20"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">LỊCH SỬ PHIÊN BẢN</h3>
                  <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-widest">{selectedGame?.gameName}</p>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-900 font-bold text-xs uppercase">Đóng</button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {loading ? (
                  <div className="p-12 flex justify-center"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
                ) : history.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 italic">Không có dữ liệu lịch sử</div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 font-black tracking-widest">
                      <tr>
                        <th className="px-6 py-3">Phiên bản</th>
                        <th className="px-6 py-3">Thời gian</th>
                        <th className="px-6 py-3">Dung lượng</th>
                        <th className="px-6 py-3 text-right">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {history.map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <span className="font-mono text-sm font-bold text-indigo-600">v{v.version}.0</span>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500">
                            {new Date(v.createdAt).toLocaleString('vi-VN')}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-slate-600">
                            {formatSize(v.fileSize)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => onDownload(v.id)}
                                className="p-2 text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all shadow-sm"
                                title="Tải xuống"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => onDelete(v.id)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all"
                                title="Xoá"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default HistoryModal;
