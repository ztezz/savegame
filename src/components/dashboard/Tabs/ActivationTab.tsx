import React, { useState } from 'react';
import { Upload, Download, Trash2, KeyRound, Plus, X, FileCheck, Pencil, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import api, { uploadWithChunks, downloadWithProgress } from '../../../utils/api';
import EditActivationModal from '../Modals/EditActivationModal';

export interface ActivationFile {
  id: number;
  gameName: string;
  originalName: string;
  fileSize: number;
  note: string;
  createdAt: string;
}

interface ActivationTabProps {
  currentUser: any;
  activationFiles: ActivationFile[];
  onRefresh: () => void;
  formatSize: (bytes: number) => string;
}

const ActivationTab: React.FC<ActivationTabProps> = ({ currentUser, activationFiles, onRefresh, formatSize }) => {
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin' || currentUser?.username === 'admin';
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [gameName, setGameName] = useState('');
  const [note, setNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedActivationForEdit, setSelectedActivationForEdit] = useState<ActivationFile | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  const handleUpload = async () => {
    if (!gameName.trim() || !selectedFile) return;
    setUploading(true);
    setUploadProgress(0);
    
    try {
      await uploadWithChunks(
        selectedFile,
        { gameName: gameName.trim(), note: note.trim() },
        (progress) => {
          setUploadProgress(progress);
        }
      );
      
      // Set to 100% and show success
      setUploadProgress(100);
      setShowSuccess(true);
      
      // Auto close after 2 seconds
      setTimeout(() => {
        setShowUploadModal(false);
        setGameName('');
        setNote('');
        setSelectedFile(null);
        setUploadProgress(null);
        setShowSuccess(false);
        onRefresh();
      }, 2000);
    } catch (err) {
      alert('Upload thất bại! ' + (err instanceof Error ? err.message : String(err)));
      setUploadProgress(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (file: ActivationFile) => {
    try {
      setDownloadingFileId(file.id);
      setDownloadProgress(0);
      await downloadWithProgress(`/activation/download/${file.id}`, file.originalName, (progress) => {
        setDownloadProgress(progress);
      });
      setDownloadProgress(null);
      setDownloadingFileId(null);
    } catch (err) {
      alert('Tải file thất bại! ' + (err instanceof Error ? err.message : String(err)));
      setDownloadProgress(null);
      setDownloadingFileId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Xác nhận xoá file kích hoạt này?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/activation/${id}`);
      onRefresh();
    } catch {
      alert('Xoá thất bại!');
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenEditModal = (file: ActivationFile) => {
    setSelectedActivationForEdit(file);
    setShowEditModal(true);
  };

  const handleSaveEdit = async (newGameName: string, newNote: string) => {
    if (!selectedActivationForEdit) return;
    try {
      await api.put(`/activation/${selectedActivationForEdit.id}`, {
        gameName: newGameName,
        note: newNote
      });
      onRefresh();
      alert('Cập nhật thành công!');
    } catch {
      alert('Cập nhật thất bại!');
    }
  };

  return (
    <div className="col-span-12 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-500" />
            File kích hoạt game
          </h3>
          <p className="text-sm text-slate-400 mt-1">Lưu trữ các file crack, key, license hoặc file kích hoạt game của bạn</p>
        </div>
        {isAdmin && (
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-lg shadow-amber-100 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          TẢI LÊN FILE MỚI
        </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {activationFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <FileCheck className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-bold">Chưa có file kích hoạt nào</p>
            <p className="text-xs mt-1">Nhấn "Tải lên file mới" để thêm</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Tên game</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Tên file</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Ghi chú</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Dung lượng</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Ngày tải</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activationFiles.map(f => (
                <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800">{f.gameName}</td>
                  <td className="px-6 py-4 text-slate-600 font-mono text-xs">{f.originalName}</td>
                  <td className="px-6 py-4 text-slate-500 max-w-xs truncate">{f.note || '—'}</td>
                  <td className="px-6 py-4 text-slate-600">{formatSize(f.fileSize)}</td>
                  <td className="px-6 py-4 text-slate-500 text-xs">{new Date(f.createdAt).toLocaleDateString('vi-VN')}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                      <button
                        onClick={() => handleOpenEditModal(f)}
                        className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Chỉnh sửa"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      )}
                      <div className="relative">
                        <button
                          onClick={() => handleDownload(f)}
                          disabled={downloadingFileId === f.id}
                          className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Tải xuống"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {downloadingFileId === f.id && downloadProgress !== null && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute inset-0 flex items-center justify-center"
                          >
                            <div className="absolute inset-0 bg-indigo-50 rounded-lg"></div>
                            <div className="relative flex flex-col items-center justify-center">
                              <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 36 36">
                                <circle
                                  cx="18"
                                  cy="18"
                                  r="16"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  opacity="0.2"
                                />
                                <circle
                                  cx="18"
                                  cy="18"
                                  r="16"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeDasharray={`${downloadProgress * 1.005} 100.5`}
                                  strokeLinecap="round"
                                  style={{ transition: 'stroke-dasharray 0.3s ease' }}
                                />
                              </svg>
                              <span className="text-[9px] font-bold text-indigo-600 mt-0.5">
                                {downloadProgress}%
                              </span>
                            </div>
                          </motion.div>
                        )}
                      </div>
                      {isAdmin && (
                      <button
                        onClick={() => handleDelete(f.id)}
                        disabled={deletingId === f.id}
                        className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Xoá"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload Modal */}
      {isAdmin && showUploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-500" />
                Tải lên file kích hoạt
              </h3>
              <button onClick={() => setShowUploadModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Tên game *</label>
                <input
                  type="text"
                  value={gameName}
                  onChange={e => setGameName(e.target.value)}
                  placeholder="Ví dụ: Elden Ring"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Chọn file *</label>
                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-amber-400 transition-colors bg-slate-50">
                  {selectedFile ? (
                    <div className="text-center">
                      <FileCheck className="w-6 h-6 text-amber-500 mx-auto mb-1" />
                      <p className="text-xs font-bold text-slate-700">{selectedFile.name}</p>
                      <p className="text-xs text-slate-400">{formatSize(selectedFile.size)}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Upload className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Click để chọn file</p>
                    </div>
                  )}
                  <input type="file" className="hidden" onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Ghi chú</label>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Ví dụ: crack v1.12, key bản Steam..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Progress Bar */}
              {uploadProgress !== null && (
                <div className="space-y-2 bg-amber-50 p-4 rounded-xl border border-amber-200">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-amber-900 uppercase tracking-widest">
                      {uploadProgress === 100 ? '✓ Hoàn tất' : `Đang tải: ${uploadProgress}%`}
                    </p>
                    <span className="text-xs font-mono font-bold text-amber-700">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-amber-200 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                      transition={{ type: 'spring', stiffness: 100 }}
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full shadow-lg"
                    />
                  </div>
                  <p className="text-[10px] text-amber-700 text-center flex items-center justify-center gap-1">
                    {uploadProgress < 50 ? (
                      <>
                        <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                        Đang chuẩn bị...
                      </>
                    ) : uploadProgress < 100 ? (
                      <>
                        <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                        Đang gửi lên (chờ tối đa 30 phút)...
                      </>
                    ) : (
                      <>
                        <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                        Xử lý server...
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Success Message */}
              <AnimatePresence>
                {showSuccess && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3"
                  >
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-emerald-900">Tải lên thành công!</p>
                      <p className="text-xs text-emerald-700">File kích hoạt đã được lưu.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={handleUpload}
                disabled={!gameName.trim() || !selectedFile || uploading}
                className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl transition-colors text-sm"
              >
                {uploading ? 'Đang tải lên...' : 'TẢI LÊN'}
              </button>
            </div>
          </div>
        </div>
      )}

      <EditActivationModal
        show={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSubmit={handleSaveEdit}
        initialGameName={selectedActivationForEdit?.gameName || ''}
        initialNote={selectedActivationForEdit?.note || ''}
      />
    </div>
  );
};

export default ActivationTab;
