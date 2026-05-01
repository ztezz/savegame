
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2 } from 'lucide-react';

interface DeleteConfirmModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ show, onClose, onConfirm }) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-white/20"
          >
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase mb-2">Xác nhận xoá</h3>
              <p className="text-sm text-slate-500 font-medium mb-8 leading-relaxed">
                Bạn có chắc chắn muốn xoá bản lưu này không? Hành động này không thể hoàn tác.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={onClose}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs transition-all uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Huỷ bỏ
                </button>
                <button 
                  onClick={handleConfirm}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-black text-xs transition-all shadow-lg shadow-rose-100 uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Đang xoá...
                    </>
                  ) : (
                    'Xác nhận xoá'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default DeleteConfirmModal;
