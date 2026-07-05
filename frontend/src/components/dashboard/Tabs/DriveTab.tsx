import React, { useEffect, useState } from 'react';
import { Download, Eye, Link, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import api, { API_BASE_URL, uploadWithProgress } from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';
import { copyToClipboard } from '../../../utils/clipboard';
import DrivePreviewModal from '../drive/DrivePreviewModal';
import DriveFolderModal from '../drive/DriveFolderModal';
import DriveUploadModal from '../drive/DriveUploadModal';
import DriveMoveModal from '../drive/DriveMoveModal';
import DriveContent from '../drive/DriveContent';
import DriveHeader from '../drive/DriveHeader';
import DriveToolbar from '../drive/DriveToolbar';
import DriveSelectionBar from '../drive/DriveSelectionBar';
import { DriveFile, DriveFolder, DriveUsage, FileFilter, PreviewState, UploadItem } from '../drive/driveTypes';
import { getFileKind } from '../drive/driveUtils';

type SelectionKey = `file-${number}` | `folder-${number}`;
type FileSystemEntry = {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
};
type FileSystemFileEntry = FileSystemEntry & { file: (success: (file: File) => void, error?: (err: unknown) => void) => void };
type FileSystemDirectoryEntry = FileSystemEntry & { createReader: () => { readEntries: (success: (entries: FileSystemEntry[]) => void, error?: (err: unknown) => void) => void } };

interface FolderTreeItem {
  id: number;
  name: string;
  parent_id: number | null;
  depth: number;
  path: string;
}

const keyOf = (type: 'file' | 'folder', id: number): SelectionKey => `${type}-${id}`;

const readEntryFiles = async (entry: FileSystemEntry, prefix = ''): Promise<UploadItem[]> => {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    return [{ file, relativePath: `${prefix}${file.name}` }];
  }
  if (!entry.isDirectory) return [];

  const dir = entry as FileSystemDirectoryEntry;
  const reader = dir.createReader();
  const entries: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    entries.push(...batch);
  }
  const children = await Promise.all(entries.map((child) => readEntryFiles(child, `${prefix}${entry.name}/`)));
  return children.flat();
};

const DriveTab: React.FC = () => {
  const { showToast } = useToast();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<DriveFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [selectedUploadFiles, setSelectedUploadFiles] = useState<UploadItem[]>([]);
  const [note, setNote] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<Set<SelectionKey>>(new Set());
  const [trashMode, setTrashMode] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState<string>('root');
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [folderTree, setFolderTree] = useState<FolderTreeItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [fileFilter, setFileFilter] = useState<FileFilter>('all');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [officePreviewUrl, setOfficePreviewUrl] = useState<string | null>(null);
  const [usage, setUsage] = useState<DriveUsage | null>(null);

  const allItems = [
    ...folders.map((folder) => ({ type: 'folder' as const, id: folder.id, name: folder.name })),
    ...files.map((file) => ({ type: 'file' as const, id: file.id, name: file.original_name })),
  ];
  const selectedItems = allItems.filter((item) => selected.has(keyOf(item.type, item.id)));
  const selectedCount = selectedItems.length;

  const fetchFiles = async (folderId = currentFolderId, nextTrashMode = trashMode) => {
    setLoading(true);
    try {
      const trimmedSearch = searchTerm.trim();
      const params = nextTrashMode
        ? { trash: 1, ...(trimmedSearch ? { search: trimmedSearch } : {}) }
        : { ...(folderId && !trimmedSearch ? { folderId } : {}), ...(trimmedSearch ? { search: trimmedSearch } : {}) };
      const res = await api.get('/drive/files', { params });
      const usageRes = await api.get('/drive/usage');
      setFolders(Array.isArray(res.data?.folders) ? res.data.folders : []);
      setFiles(Array.isArray(res.data?.files) ? res.data.files : []);
      setUsage(usageRes.data || null);
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

  useEffect(() => {
    const timer = window.setTimeout(() => fetchFiles(currentFolderId, trashMode), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    return () => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    };
  }, [previewObjectUrl]);

  const closePreview = () => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    setPreviewObjectUrl(null);
    setOfficePreviewUrl(null);
    setPreview(null);
    setPreviewLoading(false);
  };

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
      setFolderModalOpen(false);
      showToast('Đã tạo thư mục', 'success');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Tạo thư mục thất bại', 'error');
    }
  };

  const uploadFiles = async (uploadFilesInput = selectedUploadFiles) => {
    if (uploadFilesInput.length === 0 || trashMode) return;
    const formData = new FormData();
    uploadFilesInput.forEach((item) => {
      formData.append('files', item.file);
      formData.append('relativePaths', item.relativePath || item.file.webkitRelativePath || item.file.name);
    });
    formData.append('note', note.trim());
    if (currentFolderId) formData.append('folderId', String(currentFolderId));

    setUploading(true);
    setProgress(0);
    try {
      await uploadWithProgress('/drive/upload', formData, setProgress);
      const folderCount = new Set(uploadFilesInput.map((item) => (item.relativePath || item.file.webkitRelativePath || '').split('/').slice(0, -1).join('/')).filter(Boolean)).size;
      showToast(folderCount ? `Đã tải ${uploadFilesInput.length} file trong ${folderCount} thư mục` : `Đã tải ${uploadFilesInput.length} file lên Drive`, 'success');
      setSelectedUploadFiles([]);
      setNote('');
      setUploadModalOpen(false);
      await fetchFiles();
    } catch (err: any) {
      showToast(err.message.includes('413') ? 'Drive đã vượt dung lượng cho phép. Hãy dọn thùng rác hoặc tăng quota.' : err.message || 'Upload Drive thất bại', 'error');
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

  const openMoveModal = async () => {
    if (selectedCount === 0 || trashMode) return;
    try {
      const res = await api.get('/drive/folders/tree');
      setFolderTree(Array.isArray(res.data) ? res.data : []);
      setMoveModalOpen(true);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không tải được cây thư mục', 'error');
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

  const openPreview = async (file: DriveFile) => {
    if (trashMode) return;
    setPreviewLoading(true);
    try {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      setPreviewObjectUrl(null);
      setOfficePreviewUrl(null);
      const res = await api.get(`/drive/files/${file.id}/preview`);
      setPreview(res.data);
      if (['image', 'pdf', 'video', 'audio'].includes(res.data.kind)) {
        const raw = await api.get(`/drive/files/${file.id}/raw`, { responseType: 'blob' });
        setPreviewObjectUrl(URL.createObjectURL(raw.data));
      } else if (res.data.kind === 'office') {
        const token = file.share_token || (await api.post(`/drive/files/${file.id}/share`)).data.token;
        const publicRawUrl = `${API_BASE_URL}/drive/share/${encodeURIComponent(token)}/raw`;
        setOfficePreviewUrl(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicRawUrl)}`);
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không xem trước được file', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const shareFile = async (file: DriveFile) => {
    if (trashMode) return;
    try {
      const token = file.share_token || (await api.post(`/drive/files/${file.id}/share`)).data.token;
      const shareUrl = `${window.location.origin}/share/${encodeURIComponent(token)}`;
      const copied = await copyToClipboard(shareUrl);
      showToast(copied ? 'Đã copy link chia sẻ' : shareUrl, copied ? 'success' : 'info');
      if (!file.share_token) await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Tạo link chia sẻ thất bại', 'error');
    }
  };

  const unshareFile = async (file: DriveFile) => {
    if (!file.share_token || !window.confirm('Tắt link chia sẻ của file này?')) return;
    try {
      await api.delete(`/drive/files/${file.id}/share`);
      showToast('Đã tắt link chia sẻ', 'success');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Tắt chia sẻ thất bại', 'error');
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const items = Array.from(event.dataTransfer.items || []);
    const entryItems = await Promise.all(items.map((item: any) => {
      const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
      return entry ? readEntryFiles(entry) : Promise.resolve([]);
    }));
    const entryFiles = entryItems.flat();
    const dropped = entryFiles.length
      ? entryFiles
      : Array.from<File>(event.dataTransfer.files || []).map((file) => ({ file, relativePath: file.name }));
    setDragging(false);
    if (dropped.length) uploadFiles(dropped);
  };

  const empty = folders.length === 0 && files.length === 0;
  const visibleFolders = fileFilter === 'all' || fileFilter === 'folders' ? folders : [];
  const visibleFiles = fileFilter === 'all' || fileFilter === 'folders' ? files.filter((file) => fileFilter === 'all') : files.filter((file) => getFileKind(file) === fileFilter);
  const filteredEmpty = visibleFolders.length === 0 && visibleFiles.length === 0;
  const filterOptions: Array<{ value: FileFilter; label: string; count: number }> = [
    { value: 'all', label: 'Tất cả', count: folders.length + files.length },
    { value: 'folders', label: 'Thư mục', count: folders.length },
    { value: 'images', label: 'Ảnh', count: files.filter((file) => getFileKind(file) === 'images').length },
    { value: 'documents', label: 'Tài liệu', count: files.filter((file) => getFileKind(file) === 'documents').length },
    { value: 'installers', label: 'Cài đặt', count: files.filter((file) => getFileKind(file) === 'installers').length },
    { value: 'archives', label: 'File nén', count: files.filter((file) => getFileKind(file) === 'archives').length },
    { value: 'other', label: 'Khác', count: files.filter((file) => getFileKind(file) === 'other').length },
  ];
  const selectedFolderIds = selectedItems.filter((item) => item.type === 'folder').map((item) => item.id);
  const visibleFoldersForMove = folderTree.filter((folder) => !selectedFolderIds.includes(folder.id));
  const usagePercent = usage?.quotaBytes ? Math.min(100, Math.round((usage.totalBytes / usage.quotaBytes) * 100)) : 0;
  const activePercent = usage?.quotaBytes ? Math.min(100, (usage.activeBytes / usage.quotaBytes) * 100) : 0;
  const trashPercent = usage?.quotaBytes ? Math.min(100 - activePercent, (usage.trashBytes / usage.quotaBytes) * 100) : 0;

  const renderActions = (type: 'file' | 'folder', item: DriveFile | DriveFolder) => {
    const name = type === 'file' ? (item as DriveFile).original_name : (item as DriveFolder).name;
    const id = item.id;
    if (trashMode) return <div className="flex items-center gap-2">
      <button type="button" onClick={() => restoreOne(type, id)} className="text-xs font-bold text-emerald-600 inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" />Khôi phục</button>
      <button type="button" onClick={() => permanentDeleteOne(type, id)} className="text-xs font-bold text-red-600 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" />Xóa hẳn</button>
    </div>;
    return <div className="flex items-center gap-2">
      {type === 'file' && <a href={`${API_BASE_URL}/drive/download/${id}`} className="text-xs font-bold text-indigo-600 inline-flex items-center gap-1"><Download className="w-3 h-3" />Tải</a>}
      {type === 'file' && <button type="button" onClick={() => openPreview(item as DriveFile)} className="text-xs font-bold text-violet-600 inline-flex items-center gap-1"><Eye className="w-3 h-3" />Xem</button>}
      {type === 'file' && <button type="button" onClick={() => shareFile(item as DriveFile)} className="text-xs font-bold text-emerald-600 inline-flex items-center gap-1"><Link className="w-3 h-3" />{(item as DriveFile).share_token ? 'Copy link' : 'Share'}</button>}
      {type === 'file' && (item as DriveFile).share_token && <button type="button" onClick={() => unshareFile(item as DriveFile)} className="text-xs font-bold text-amber-600 inline-flex items-center gap-1"><X className="w-3 h-3" />Tắt share</button>}
      <button type="button" onClick={() => renameItem(type, id, name)} className="text-xs font-bold text-slate-600 inline-flex items-center gap-1"><Pencil className="w-3 h-3" />Đổi tên</button>
      <button type="button" onClick={() => trashOne(type, id)} className="text-xs font-bold text-red-500 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" />Xóa</button>
    </div>;
  };

  return <div className="col-span-12 space-y-6 px-1 sm:px-0">
    <DriveHeader viewMode={viewMode} trashMode={trashMode} onSetViewMode={setViewMode} onToggleTrash={() => toggleTrash(!trashMode)} />

    <DriveToolbar usage={usage} trashMode={trashMode} breadcrumb={breadcrumb} searchTerm={searchTerm} usagePercent={usagePercent} activePercent={activePercent} trashPercent={trashPercent} onOpenFolder={openFolder} onSetSearchTerm={setSearchTerm} onOpenFolderModal={() => setFolderModalOpen(true)} onOpenUploadModal={() => setUploadModalOpen(true)} />

    <DriveSelectionBar selectedCount={selectedCount} trashMode={trashMode} onClearSelection={() => setSelected(new Set())} onOpenMoveModal={openMoveModal} onTrashSelected={trashSelected} onRestoreSelected={restoreSelected} onPermanentDeleteSelected={permanentDeleteSelected} />

    <DriveContent loading={loading} trashMode={trashMode} empty={empty} filteredEmpty={filteredEmpty} viewMode={viewMode} fileFilter={fileFilter} filterOptions={filterOptions} visibleFolders={visibleFolders} visibleFiles={visibleFiles} selected={selected} onSetFileFilter={setFileFilter} onOpenFolder={openFolder} onToggleSelected={toggleSelected} renderActions={renderActions} />

    <DriveFolderModal open={folderModalOpen} folderName={newFolderName} breadcrumb={breadcrumb} onChangeFolderName={setNewFolderName} onClose={() => { setFolderModalOpen(false); setNewFolderName(''); }} onCreate={createFolder} />

    <DriveUploadModal open={uploadModalOpen} uploading={uploading} dragging={dragging} progress={progress} selectedUploadFiles={selectedUploadFiles} note={note} onSetDragging={setDragging} onSetSelectedUploadFiles={setSelectedUploadFiles} onSetNote={setNote} onDrop={handleDrop} onClose={() => { if (!uploading) { setUploadModalOpen(false); setDragging(false); } }} onUpload={() => uploadFiles()} />

    <DrivePreviewModal preview={preview} previewLoading={previewLoading} previewObjectUrl={previewObjectUrl} officePreviewUrl={officePreviewUrl} onClose={closePreview} onShareFile={shareFile} />

    <DriveMoveModal open={moveModalOpen} selectedCount={selectedCount} moveTargetId={moveTargetId} folders={visibleFoldersForMove} onSetMoveTargetId={setMoveTargetId} onClose={() => setMoveModalOpen(false)} onMove={async () => { await moveSelected(); setMoveModalOpen(false); }} />
  </div>;
};

export default DriveTab;
