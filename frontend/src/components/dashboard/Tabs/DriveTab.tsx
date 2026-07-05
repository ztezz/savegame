import React, { useEffect, useState } from 'react';
import { ChevronRight, Download, File, Folder, Grid2X2, List, Plus, Trash2, UploadCloud } from 'lucide-react';
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

interface DriveFolder {
  id: number;
  name: string;
  parent_id: number | null;
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
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<DriveFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const fetchFiles = async (folderId = currentFolderId) => {
    setLoading(true);
    try {
      const res = await api.get('/drive/files', { params: folderId ? { folderId } : {} });
      setFolders(Array.isArray(res.data?.folders) ? res.data.folders : []);
      setFiles(Array.isArray(res.data?.files) ? res.data.files : []);
      if (folderId) {
        const crumb = await api.get(`/drive/folders/${folderId}/breadcrumb`);
        setBreadcrumb(Array.isArray(crumb.data) ? crumb.data : []);
      } else {
        setBreadcrumb([]);
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không tải được Drive', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles(null);
  }, []);

  const openFolder = (folderId: number | null) => {
    setCurrentFolderId(folderId);
    fetchFiles(folderId);
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await api.post('/drive/folders', { name, parentId: currentFolderId });
      setNewFolderName('');
      showToast('Đã tạo thư mục', 'success');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Tạo thư mục thất bại', 'error');
    }
  };

  const uploadFile = async () => {
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('note', note.trim());
    if (currentFolderId) formData.append('folderId', String(currentFolderId));

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

  const deleteFolder = async (folder: DriveFolder) => {
    if (!window.confirm(`Xóa thư mục "${folder.name}" và toàn bộ file bên trong?`)) return;
    try {
      await api.delete(`/drive/folders/${folder.id}`);
      showToast('Đã xóa thư mục', 'success');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa thư mục thất bại', 'error');
    }
  };

  const empty = folders.length === 0 && files.length === 0;

  return <div className="col-span-12 space-y-6 px-1 sm:px-0">
    <div className="rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-indigo-100">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-white/70">CloudSave Drive</p>
          <h3 className="mt-2 text-3xl font-black tracking-tight">Drive cá nhân</h3>
          <p className="mt-2 text-sm text-white/80 max-w-2xl">Lưu trữ file cá nhân theo thư mục, chuyển đổi lưới/danh sách và tải xuống mọi lúc.</p>
        </div>
        <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-2xl p-1">
          <button type="button" onClick={() => setViewMode('grid')} className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${viewMode === 'grid' ? 'bg-white text-indigo-700' : 'text-white/80'}`}><Grid2X2 className="w-4 h-4" />Lưới</button>
          <button type="button" onClick={() => setViewMode('list')} className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${viewMode === 'list' ? 'bg-white text-indigo-700' : 'text-white/80'}`}><List className="w-4 h-4" />Danh sách</button>
        </div>
      </div>
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => openFolder(null)} className="font-bold text-indigo-600 hover:text-indigo-800">Drive của tôi</button>
        {breadcrumb.map((folder) => <React.Fragment key={folder.id}><ChevronRight className="w-4 h-4 text-slate-300" /><button type="button" onClick={() => openFolder(folder.id)} className="font-bold text-slate-700 hover:text-indigo-700">{folder.name}</button></React.Fragment>)}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.4fr] gap-3">
        <div className="flex gap-2">
          <input className="flex-1 border rounded-xl px-3 py-2 text-sm" value={newFolderName} onChange={(e)=>setNewFolderName(e.target.value)} placeholder="Tên thư mục mới" />
          <button type="button" onClick={createFolder} disabled={!newFolderName.trim()} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2"><Plus className="w-4 h-4" />Thư mục</button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-2">
          <input className="border rounded-xl px-3 py-2 text-sm" type="file" disabled={uploading} onChange={(e)=>setSelectedFile(e.target.files?.[0] || null)} />
          <input className="border rounded-xl px-3 py-2 text-sm" value={note} disabled={uploading} onChange={(e)=>setNote(e.target.value)} placeholder="Ghi chú file" />
          <button type="button" onClick={uploadFile} disabled={!selectedFile || uploading} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"><UploadCloud className="w-4 h-4" />{uploading ? `${progress}%` : 'Tải lên'}</button>
        </div>
      </div>
      {uploading && <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} /></div>}
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Nội dung</h3>
        <span className="text-xs text-slate-500">{folders.length} thư mục · {files.length} file</span>
      </div>

      {loading ? <div className="p-8 text-sm text-slate-500">Đang tải...</div> : empty ? <div className="p-10 text-center text-sm text-slate-500">Thư mục này đang trống.</div> : viewMode === 'grid' ? <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {folders.map((folder) => <div key={`folder-${folder.id}`} className="group rounded-2xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 transition p-4">
          <button type="button" onClick={() => openFolder(folder.id)} className="w-full text-left">
            <Folder className="w-10 h-10 text-indigo-500 mb-4" />
            <p className="font-black text-slate-800 truncate">{folder.name}</p>
            <p className="text-xs text-slate-500 mt-1">Thư mục</p>
          </button>
          <button type="button" onClick={() => deleteFolder(folder)} className="mt-4 text-xs font-bold text-red-500 opacity-0 group-hover:opacity-100 transition inline-flex items-center gap-1"><Trash2 className="w-3 h-3" />Xóa</button>
        </div>)}
        {files.map((file) => <div key={`file-${file.id}`} className="group rounded-2xl border border-slate-200 bg-white hover:border-indigo-200 hover:shadow-lg transition p-4">
          <File className="w-10 h-10 text-slate-500 mb-4" />
          <p className="font-black text-slate-800 truncate">{file.original_name}</p>
          <p className="text-xs text-slate-500 mt-1">{formatFileSize(Number(file.file_size))}</p>
          {file.note && <p className="text-xs text-slate-400 mt-2 truncate">{file.note}</p>}
          <div className="mt-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
            <a href={`${API_BASE_URL}/drive/download/${file.id}`} className="text-xs font-bold text-indigo-600 inline-flex items-center gap-1"><Download className="w-3 h-3" />Tải</a>
            <button type="button" onClick={() => deleteFile(file)} className="text-xs font-bold text-red-500 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" />Xóa</button>
          </div>
        </div>)}
      </div> : <div className="divide-y divide-slate-100">
        {folders.map((folder) => <div key={`folder-${folder.id}`} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50">
          <button type="button" onClick={() => openFolder(folder.id)} className="min-w-0 flex items-center gap-3 text-left"><Folder className="w-6 h-6 text-indigo-500 shrink-0" /><span className="font-bold text-slate-800 truncate">{folder.name}</span></button>
          <button type="button" onClick={() => deleteFolder(folder)} className="text-xs font-bold text-red-500 inline-flex items-center gap-1"><Trash2 className="w-4 h-4" />Xóa</button>
        </div>)}
        {files.map((file) => <div key={`file-${file.id}`} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:bg-slate-50">
          <div className="min-w-0 flex items-center gap-3"><File className="w-6 h-6 text-slate-500 shrink-0" /><div className="min-w-0"><p className="font-bold text-slate-800 truncate">{file.original_name}</p><p className="text-xs text-slate-500">{formatFileSize(Number(file.file_size))} · {new Date(file.created_at).toLocaleString('vi-VN')}</p></div></div>
          <div className="flex items-center gap-2"><a href={`${API_BASE_URL}/drive/download/${file.id}`} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-2"><Download className="w-4 h-4" />Tải</a><button type="button" onClick={() => deleteFile(file)} className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-bold inline-flex items-center gap-2"><Trash2 className="w-4 h-4" />Xóa</button></div>
        </div>)}
      </div>}
    </div>
  </div>;
};

export default DriveTab;
