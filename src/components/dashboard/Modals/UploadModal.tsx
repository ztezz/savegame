
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, FolderClosed } from 'lucide-react';
import { CATEGORIES } from '../types';

interface UploadModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  newGameName: string;
  setNewGameName: (name: string) => void;
  newGameCategory: string;
  setNewGameCategory: (category: string) => void;
  isFolderUpload: boolean;
  setIsFolderUpload: (isFolder: boolean) => void;
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  selectedFiles: File[];
  setSelectedFiles: (files: File[]) => void;
  uploadProgress: number | null;
}

const UploadModal: React.FC<UploadModalProps> = ({
  show, onClose, onSubmit, 
  newGameName, setNewGameName, 
  newGameCategory, setNewGameCategory,
  isFolderUpload, setIsFolderUpload,
  selectedFile, setSelectedFile,
  selectedFiles, setSelectedFiles,
  uploadProgress
}) => {
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
                <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">Tải lên Trạng thái</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-900 font-bold text-xs uppercase">Đóng</button>
              </div>
              
              <form onSubmit={onSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Định danh Game mục tiêu</label>
                  <input 
                    type="text"
                    required
                    value={newGameName}
                    onChange={(e) => setNewGameName(e.target.value)}
                    placeholder="vd: ELDEN_RING_DLC"
                    className="w-full px-4 py-4 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Thể loại</label>
                  <select 
                    value={newGameCategory}
                    onChange={(e) => setNewGameCategory(e.target.value)}
                    className="w-full px-4 py-4 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-4">
                  <div className="flex gap-2">
                     <button 
                       type="button"
                       onClick={() => { setIsFolderUpload(false); setSelectedFile(null); setSelectedFiles([]); }}
                       className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${!isFolderUpload ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
                     >
                       Tải tệp tin
                     </button>
                     <button 
                       type="button"
                       onClick={() => { setIsFolderUpload(true); setSelectedFile(null); setSelectedFiles([]); }}
                       className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${isFolderUpload ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
                     >
                       Tải thư mục
                     </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">
                      {isFolderUpload ? 'Chọn thư mục chứa bản lưu' : 'Dữ liệu nhị phân'}
                    </label>
                    <div className="relative group">
                      <input 
                        type="file"
                        required
                        key={isFolderUpload ? 'folder' : 'file'}
                        {...(isFolderUpload ? { webkitdirectory: "", directory: "" } as any : {})}
                        onChange={(e) => {
                          if (isFolderUpload) {
                            setSelectedFiles(Array.from(e.target.files || []));
                          } else {
                            setSelectedFile(e.target.files?.[0] || null);
                          }
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      />
                      <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center group-hover:border-indigo-400 group-hover:bg-indigo-50/30 transition-all">
                        {isFolderUpload ? <FolderClosed className="w-8 h-8 text-slate-300 mx-auto mb-3 group-hover:text-indigo-500 transition-colors" /> : <Upload className="w-8 h-8 text-slate-300 mx-auto mb-3 group-hover:text-indigo-500 transition-colors" />}
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-tighter">
                          {isFolderUpload 
                            ? (selectedFiles.length > 0 ? `Đã chọn ${selectedFiles.length} tệp trong thư mục` : 'Chọn thư mục đồng bộ')
                            : (selectedFile ? selectedFile.name : 'Chọn hoặc thả tệp .zip / .dat')
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs transition-all uppercase tracking-widest"
                  >
                    Huỷ bỏ
                  </button>
                  <button 
                    type="submit"
                    disabled={uploadProgress !== null}
                    className="flex-1 px-4 py-4 bg-slate-900 hover:bg-black text-white rounded-xl font-black text-xs transition-all shadow-xl shadow-slate-200 disabled:opacity-50 uppercase tracking-widest"
                  >
                    Khởi tạo Tải lên
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

export default UploadModal;
