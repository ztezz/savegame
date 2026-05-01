import React, { useState } from 'react';
import { Upload, Download, Trash2, KeyRound, Plus, X, FileCheck, Pencil } from 'lucide-react';
import api from '../../../utils/api';
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
  activationFiles: ActivationFile[];
  onRefresh: () => void;
  formatSize: (bytes: number) => string;
}

const ActivationTab: React.FC<ActivationTabProps> = ({ activationFiles, onRefresh, formatSize }) => {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [gameName, setGameName] = useState('');
  const [note, setNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedActivationForEdit, setSelectedActivationForEdit] = useState<ActivationFile | null>(null);

  const handleUpload = async () => {
    if (!gameName.trim() || !selectedFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('activationfile', selectedFile);
      formData.append('gameName', gameName.trim());
      formData.append('note', note.trim());
      await api.post('/activation/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setShowUploadModal(false);
      setGameName('');
      setNote('');
      setSelectedFile(null);
      onRefresh();
    } catch (err) {
      alert('Upload thất bại!');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (file: ActivationFile) => {
    try {
      const res = await api.get(`/activation/download/${file.id}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = file.originalName;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Tải file thất bại!');
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
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-lg shadow-amber-100 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          TẢI LÊN FILE MỚI
        </button>
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
                      <button
                        onClick={() => handleOpenEditModal(f)}
                        className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Chỉnh sửa"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownload(f)}
                        className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Tải xuống"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(f.id)}
                        disabled={deletingId === f.id}
                        className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
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

      {/* Upload Modal */}
      {showUploadModal && (
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
