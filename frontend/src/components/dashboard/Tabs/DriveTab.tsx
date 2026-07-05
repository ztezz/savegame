import React, { useEffect, useState } from 'react';
import { ChevronRight, Download, File, Folder, Grid2X2, List, Pencil, Plus, RotateCcw, Trash2, UploadCloud, X } from 'lucide-react';
import api, { API_BASE_URL, uploadWithProgress } from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';

interface DriveFile {
  id: number;
  original_name: string;
  mime_type: string | null;
  file_size: number;
  note: string | null;
  created_at: string;
  deleted_at?: string | null;
}

interface DriveFolder {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
  deleted_at?: string | null;
}

type SelectionKey = `file-${number}` | `folder-${number}`;

const formatFileSize = (size: number) => {
  if (!size) return '0 B';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const keyOf = (type: 'file' | 'folder', id: number): SelectionKey => `${type}-${id}`;

const DriveTab: React.FC = () => {
  const { showToast } = useToast();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<DriveFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [selectedUploadFiles, setSelectedUploadFiles] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<Set<SelectionKey>>(new Set());
  const [trashMode, setTrashMode] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState<string>('root');

  const allItems = [
    ...folders.map((folder) => ({ type: 'folder' as const, id: folder.id, name: folder.name })),
    ...files.map((file) => ({ type: 'file' as const, id: file.id, name: file.original_name })),
  ];
  const selectedItems = allItems.filter((item) => selected.has(keyOf(item.type, item.id)));
  const selectedCount = selectedItems.length;

  const fetchFiles = async (folderId = currentFolderId, nextTrashMode = trashMode) => {
    setLoading(true);
    try {
      const params = nextTrashMode ? { trash: 1 } : folderId ? { folderId } : {};
      const res = await api.get('/drive/files', { params });
      setFolders(Array.isArray(res.data?.folders) ? res.data.folders : []);
      setFiles(Array.isArray(res.data?.files) ? res.data.files : []);
      setSelected(new Set());
      if (folderId && !nextTrashMode) {
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
    fetchFiles(null, false);
  }, []);

  const openFolder = (folderId: number | null) => {
    if (trashMode) return;
    setCurrentFolderId(folderId);
    fetchFiles(folderId, false);
  };

  const toggleTrash = (enabled: boolean) => {
    setTrashMode(enabled);
    if (enabled) setCurrentFolderId(null);
    fetchFiles(enabled ? null : currentFolderId, enabled);
  };

  const toggleSelected = (type: 'file' | 'folder', id: number) => {
    const key = keyOf(type, id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name || trashMode) return;
    try {
      await api.post('/drive/folders', { name, parentId: currentFolderId });
      setNewFolderName('');
      showToast('Đã tạo thư mục', 'success');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Tạo thư mục thất bại', 'error');
    }
  };

  const uploadFiles = async (uploadFilesInput = selectedUploadFiles) => {
    if (uploadFilesInput.length === 0 || trashMode) return;
    const formData = new FormData();
    uploadFilesInput.forEach((file) => formData.append('files', file));
    formData.append('note', note.trim());
    if (currentFolderId) formData.append('folderId', String(currentFolderId));

    setUploading(true);
    setProgress(0);
    try {
      await uploadWithProgress('/drive/upload', formData, setProgress);
      showToast(`Đã tải ${uploadFilesInput.length} file lên Drive`, 'success');
      setSelectedUploadFiles([]);
      setNote('');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.message || 'Upload Drive thất bại', 'error');
    } finally {
      setUploading(false);
      setDragging(false);
    }
  };

  const renameItem = async (type: 'file' | 'folder', id: number, currentName: string) => {
    if (trashMode) return;
    const name = window.prompt('Tên mới', currentName)?.trim();
    if (!name || name === currentName) return;
    try {
      await api.patch(`/drive/${type === 'file' ? 'files' : 'folders'}/${id}`, { name });
      showToast('Đã đổi tên', 'success');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Đổi tên thất bại', 'error');
    }
  };

  const moveSelected = async () => {
    if (selectedCount === 0 || trashMode) return;
    const target = moveTargetId === 'root' ? null : Number(moveTargetId);
    try {
      await Promise.all(selectedItems.map((item) => {
        if (item.type === 'file') return api.patch(`/drive/files/${item.id}/move`, { folderId: target });
        return api.patch(`/drive/folders/${item.id}/move`, { parentId: target });
      }));
      showToast(`Đã di chuyển ${selectedCount} mục`, 'success');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Di chuyển thất bại', 'error');
    }
  };

  const trashSelected = async () => {
    if (selectedCount === 0 || !window.confirm(`Đưa ${selectedCount} mục vào thùng rác?`)) return;
    try {
      await Promise.all(selectedItems.map((item) => api.delete(`/drive/${item.type === 'file' ? 'files' : 'folders'}/${item.id}`)));
      showToast('Đã đưa vào thùng rác', 'success');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa thất bại', 'error');
    }
  };

  const restoreSelected = async () => {
    if (selectedCount === 0) return;
    try {
      await Promise.all(selectedItems.map((item) => api.post(`/drive/${item.type === 'file' ? 'files' : 'folders'}/${item.id}/restore`)));
      showToast('Đã khôi phục', 'success');
      await fetchFiles(null, true);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Khôi phục thất bại', 'error');
    }
  };

  const permanentDeleteSelected = async () => {
    if (selectedCount === 0 || !window.confirm(`Xóa vĩnh viễn ${selectedCount} mục?`)) return;
    try {
      await Promise.all(selectedItems.map((item) => api.delete(`/drive/${item.type === 'file' ? 'files' : 'folders'}/${item.id}/permanent`)));
      showToast('Đã xóa vĩnh viễn', 'success');
      await fetchFiles(null, true);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa vĩnh viễn thất bại', 'error');
    }
  };

  const trashOne = async (type: 'file' | 'folder', id: number) => {
    if (!window.confirm('Đưa mục này vào thùng rác?')) return;
    try {
      await api.delete(`/drive/${type === 'file' ? 'files' : 'folders'}/${id}`);
      showToast('Đã đưa vào thùng rác', 'success');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa thất bại', 'error');
    }
  };

  const restoreOne = async (type: 'file' | 'folder', id: number) => {
    try {
      await api.post(`/drive/${type === 'file' ? 'files' : 'folders'}/${id}/restore`);
      showToast('Đã khôi phục', 'success');
      await fetchFiles(null, true);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Khôi phục thất bại', 'error');
    }
  };

  const permanentDeleteOne = async (type: 'file' | 'folder', id: number) => {
    if (!window.confirm('Xóa vĩnh viễn mục này?')) return;
    try {
      await api.delete(`/drive/${type === 'file' ? 'files' : 'folders'}/${id}/permanent`);
      showToast('Đã xóa vĩnh viễn', 'success');
      await fetchFiles(null, true);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa vĩnh viễn thất bại', 'error');
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const dropped = Array.from(event.dataTransfer.files || []);
    setDragging(false);
    if (dropped.length) uploadFiles(dropped);
  };

  const empty = folders.length === 0 && files.length === 0;
  const visibleFoldersForMove = folders.filter((folder) => !selected.has(keyOf('folder', folder.id)));

  const renderActions = (type: 'file' | 'folder', item: DriveFile | DriveFolder) => {
    const name = type === 'file' ? (item as DriveFile).original_name : (item as DriveFolder).name;
    const id = item.id;
    if (trashMode) return <div className="flex items-center gap-2">
      <button type="button" onClick={() => restoreOne(type, id)} className="text-xs font-bold text-emerald-600 inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" />Khôi phục</button>
      <button type="button" onClick={() => permanentDeleteOne(type, id)} className="text-xs font-bold text-red-600 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" />Xóa hẳn</button>
    </div>;
    return <div className="flex items-center gap-2">
      {type === 'file' && <a href={`${API_BASE_URL}/drive/download/${id}`} className="text-xs font-bold text-indigo-600 inline-flex items-center gap-1"><Download className="w-3 h-3" />Tải</a>}
      <button type="button" onClick={() => renameItem(type, id, name)} className="text-xs font-bold text-slate-600 inline-flex items-center gap-1"><Pencil className="w-3 h-3" />Đổi tên</button>
      <button type="button" onClick={() => trashOne(type, id)} className="text-xs font-bold text-red-500 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" />Xóa</button>
    </div>;
  };

  return <div className="col-span-12 space-y-6 px-1 sm:px-0">
    <div className="rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-indigo-100">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-white/70">CloudSave Drive</p>
          <h3 className="mt-2 text-3xl font-black tracking-tight">Drive cá nhân</h3>
          <p className="mt-2 text-sm text-white/80 max-w-2xl">Quản lý file kiểu Google Drive: kéo thả upload, chọn nhiều mục, đổi tên, di chuyển và thùng rác.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-2xl p-1">
            <button type="button" onClick={() => setViewMode('grid')} className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${viewMode === 'grid' ? 'bg-white text-indigo-700' : 'text-white/80'}`}><Grid2X2 className="w-4 h-4" />Lưới</button>
            <button type="button" onClick={() => setViewMode('list')} className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${viewMode === 'list' ? 'bg-white text-indigo-700' : 'text-white/80'}`}><List className="w-4 h-4" />Danh sách</button>
          </div>
          <button type="button" onClick={() => toggleTrash(!trashMode)} className={`px-4 py-3 rounded-2xl text-sm font-black border ${trashMode ? 'bg-white text-red-600 border-white' : 'bg-white/10 text-white border-white/20'}`}><Trash2 className="w-4 h-4 inline mr-2" />Thùng rác</button>
        </div>
      </div>
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => openFolder(null)} disabled={trashMode} className="font-bold text-indigo-600 hover:text-indigo-800 disabled:text-slate-400">Drive của tôi</button>
        {trashMode && <><ChevronRight className="w-4 h-4 text-slate-300" /><span className="font-bold text-red-600">Thùng rác</span></>}
        {!trashMode && breadcrumb.map((folder) => <React.Fragment key={folder.id}><ChevronRight className="w-4 h-4 text-slate-300" /><button type="button" onClick={() => openFolder(folder.id)} className="font-bold text-slate-700 hover:text-indigo-700">{folder.name}</button></React.Fragment>)}
      </div>

      {!trashMode && <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.4fr] gap-3">
        <div className="flex gap-2">
          <input className="flex-1 border rounded-xl px-3 py-2 text-sm" value={newFolderName} onChange={(e)=>setNewFolderName(e.target.value)} placeholder="Tên thư mục mới" />
          <button type="button" onClick={createFolder} disabled={!newFolderName.trim()} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2"><Plus className="w-4 h-4" />Thư mục</button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-2">
          <input className="border rounded-xl px-3 py-2 text-sm" type="file" multiple disabled={uploading} onChange={(e)=>setSelectedUploadFiles(Array.from(e.target.files || []))} />
          <input className="border rounded-xl px-3 py-2 text-sm" value={note} disabled={uploading} onChange={(e)=>setNote(e.target.value)} placeholder="Ghi chú file" />
          <button type="button" onClick={() => uploadFiles()} disabled={selectedUploadFiles.length === 0 || uploading} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"><UploadCloud className="w-4 h-4" />{uploading ? `${progress}%` : `Tải lên${selectedUploadFiles.length ? ` (${selectedUploadFiles.length})` : ''}`}</button>
        </div>
      </div>}

      {!trashMode && <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${dragging ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
        <UploadCloud className="w-8 h-8 mx-auto mb-2" />
        <p className="text-sm font-bold">Kéo thả file vào đây để upload nhanh vào thư mục hiện tại</p>
        <p className="text-xs mt-1">Hỗ trợ nhiều file cùng lúc.</p>
      </div>}

      {uploading && <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} /></div>}
    </div>

    {selectedCount > 0 && <div className="sticky top-3 z-20 bg-slate-950 text-white rounded-2xl px-4 py-3 shadow-xl flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
      <div className="flex items-center gap-3"><button type="button" onClick={() => setSelected(new Set())} className="p-1 rounded-lg bg-white/10"><X className="w-4 h-4" /></button><span className="text-sm font-black">Đã chọn {selectedCount} mục</span></div>
      {trashMode ? <div className="flex flex-wrap gap-2"><button type="button" onClick={restoreSelected} className="px-3 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black inline-flex items-center gap-2"><RotateCcw className="w-4 h-4" />Khôi phục</button><button type="button" onClick={permanentDeleteSelected} className="px-3 py-2 bg-red-600 text-white rounded-xl text-xs font-black inline-flex items-center gap-2"><Trash2 className="w-4 h-4" />Xóa vĩnh viễn</button></div> : <div className="flex flex-wrap items-center gap-2"><select value={moveTargetId} onChange={(e) => setMoveTargetId(e.target.value)} className="bg-white text-slate-900 rounded-xl px-3 py-2 text-xs font-bold"><option value="root">Drive của tôi</option>{visibleFoldersForMove.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><button type="button" onClick={moveSelected} className="px-3 py-2 bg-indigo-500 text-white rounded-xl text-xs font-black">Di chuyển</button><button type="button" onClick={trashSelected} className="px-3 py-2 bg-red-600 text-white rounded-xl text-xs font-black inline-flex items-center gap-2"><Trash2 className="w-4 h-4" />Xóa</button></div>}
    </div>}

    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{trashMode ? 'Thùng rác' : 'Nội dung'}</h3>
        <span className="text-xs text-slate-500">{folders.length} thư mục · {files.length} file</span>
      </div>

      {loading ? <div className="p-8 text-sm text-slate-500">Đang tải...</div> : empty ? <div className="p-10 text-center text-sm text-slate-500">{trashMode ? 'Thùng rác đang trống.' : 'Thư mục này đang trống.'}</div> : viewMode === 'grid' ? <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {folders.map((folder) => <div key={`folder-${folder.id}`} className={`group rounded-2xl border p-4 transition ${selected.has(keyOf('folder', folder.id)) ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200'}`}>
          <div className="flex items-start justify-between gap-2"><button type="button" onClick={() => openFolder(folder.id)} className="min-w-0 flex-1 text-left"><Folder className="w-10 h-10 text-indigo-500 mb-4" /><p className="font-black text-slate-800 truncate">{folder.name}</p><p className="text-xs text-slate-500 mt-1">Thư mục</p></button><input type="checkbox" checked={selected.has(keyOf('folder', folder.id))} onChange={() => toggleSelected('folder', folder.id)} className="w-4 h-4" /></div>
          <div className="mt-4 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">{renderActions('folder', folder)}</div>
        </div>)}
        {files.map((file) => <div key={`file-${file.id}`} className={`group rounded-2xl border bg-white hover:border-indigo-200 hover:shadow-lg transition p-4 ${selected.has(keyOf('file', file.id)) ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
          <div className="flex items-start justify-between gap-2"><File className="w-10 h-10 text-slate-500 mb-4" /><input type="checkbox" checked={selected.has(keyOf('file', file.id))} onChange={() => toggleSelected('file', file.id)} className="w-4 h-4" /></div>
          <p className="font-black text-slate-800 truncate">{file.original_name}</p>
          <p className="text-xs text-slate-500 mt-1">{formatFileSize(Number(file.file_size))}</p>
          {file.note && <p className="text-xs text-slate-400 mt-2 truncate">{file.note}</p>}
          <div className="mt-4 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">{renderActions('file', file)}</div>
        </div>)}
      </div> : <div className="divide-y divide-slate-100">
        {folders.map((folder) => <div key={`folder-${folder.id}`} className={`p-4 flex items-center justify-between gap-3 hover:bg-slate-50 ${selected.has(keyOf('folder', folder.id)) ? 'bg-indigo-50' : ''}`}>
          <div className="min-w-0 flex items-center gap-3"><input type="checkbox" checked={selected.has(keyOf('folder', folder.id))} onChange={() => toggleSelected('folder', folder.id)} className="w-4 h-4" /><button type="button" onClick={() => openFolder(folder.id)} className="min-w-0 flex items-center gap-3 text-left"><Folder className="w-6 h-6 text-indigo-500 shrink-0" /><span className="font-bold text-slate-800 truncate">{folder.name}</span></button></div>
          {renderActions('folder', folder)}
        </div>)}
        {files.map((file) => <div key={`file-${file.id}`} className={`p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:bg-slate-50 ${selected.has(keyOf('file', file.id)) ? 'bg-indigo-50' : ''}`}>
          <div className="min-w-0 flex items-center gap-3"><input type="checkbox" checked={selected.has(keyOf('file', file.id))} onChange={() => toggleSelected('file', file.id)} className="w-4 h-4" /><File className="w-6 h-6 text-slate-500 shrink-0" /><div className="min-w-0"><p className="font-bold text-slate-800 truncate">{file.original_name}</p><p className="text-xs text-slate-500">{formatFileSize(Number(file.file_size))} · {new Date(file.created_at).toLocaleString('vi-VN')}</p></div></div>
          {renderActions('file', file)}
        </div>)}
      </div>}
    </div>
  </div>;
};

export default DriveTab;
