import React, { useEffect, useState } from 'react';
import { Download, File, Trash2, UploadCloud } from 'lucide-react';
import api, { API_BASE_URL, uploadWithProgress } from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';

interface DriveFile {
  id: number;
  original_name: string;
  mime_type: string | null;
  file_size: number;
  note: string | null;
  created_at: string;
}

const formatFileSize = (size: number) => {
  if (!size) return '0 B';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const DriveTab: React.FC = () => {
  const { showToast } = useToast();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await api.get('/drive/files');
      setFiles(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không tải được Drive', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const uploadFile = async () => {
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('note', note.trim());

    setUploading(true);
    setProgress(0);
    try {
      await uploadWithProgress('/drive/upload', formData, setProgress);
      showToast('Đã tải file lên Drive', 'success');
      setSelectedFile(null);
      setNote('');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.message || 'Upload Drive thất bại', 'error');
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = async (file: DriveFile) => {
    if (!window.confirm(`Xóa file "${file.original_name}"?`)) return;
    try {
      await api.delete(`/drive/files/${file.id}`);
      showToast('Đã xóa file', 'success');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa file thất bại', 'error');
    }
  };

  return <div className="col-span-12 space-y-6 px-1 sm:px-0">
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><UploadCloud className="w-4 h-4" />Drive cá nhân</h3>
          <p className="text-xs text-slate-500 mt-1">Lưu trữ file cá nhân trên server. Chỉ tài khoản của bạn xem và tải được file của mình.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <label className="block text-sm">Chọn file
          <input className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" type="file" disabled={uploading} onChange={(e)=>setSelectedFile(e.target.files?.[0] || null)} />
        </label>
        <label className="block text-sm">Ghi chú
          <input className="w-full mt-1 border rounded-lg px-3 py-2" value={note} disabled={uploading} onChange={(e)=>setNote(e.target.value)} placeholder="Tuỳ chọn" />
        </label>
        <button type="button" onClick={uploadFile} disabled={!selectedFile || uploading} className="px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">{uploading ? `Đang tải ${progress}%` : 'Tải lên'}</button>
      </div>

      {uploading && <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} /></div>}
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Tệp đã lưu</h3>
        <span className="text-xs text-slate-500">{files.length} file</span>
      </div>
      {loading ? <div className="p-6 text-sm text-slate-500">Đang tải...</div> : files.length === 0 ? <div className="p-6 text-sm text-slate-500">Chưa có file nào trong Drive.</div> : <div className="divide-y divide-slate-100">
        {files.map((file) => (
          <div key={file.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="min-w-0 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><File className="w-5 h-5" /></div>
              <div className="min-w-0">
                <p className="font-bold text-slate-800 truncate">{file.original_name}</p>
                <p className="text-xs text-slate-500">{formatFileSize(Number(file.file_size))} · {new Date(file.created_at).toLocaleString('vi-VN')}</p>
                {file.note && <p className="text-xs text-slate-500 mt-1 truncate">{file.note}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a href={`${API_BASE_URL}/drive/download/${file.id}`} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-2"><Download className="w-4 h-4" />Tải</a>
              <button type="button" onClick={() => deleteFile(file)} className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-bold inline-flex items-center gap-2"><Trash2 className="w-4 h-4" />Xóa</button>
            </div>
          </div>
        ))}
      </div>}
    </div>
  </div>;
};

export default DriveTab;
