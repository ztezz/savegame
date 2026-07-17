import React, { useEffect, useRef, useState } from 'react';
import { Download, Eye, Link, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import api, { API_BASE_URL, UPLOAD_BASE_URL } from '../../../utils/api';
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
import DriveShareModal from '../drive/DriveShareModal';
import DriveConfirmModal from '../drive/DriveConfirmModal';
import DriveRenameModal from '../drive/DriveRenameModal';
import { DriveFile, DriveFolder, DriveUsage, FileFilter, PreviewState, UploadItem } from '../drive/driveTypes';
import { getFileKind } from '../drive/driveUtils';

type SelectionKey = `file-${number}` | `folder-${number}`;
type DriveItemType = 'file' | 'folder';
type ConfirmState = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  action: () => Promise<void> | void;
} | null;
type RenameState = {
  type: DriveItemType;
  id: number;
  currentName: string;
  value: string;
} | null;
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
  const [uploadPhase, setUploadPhase] = useState<'uploading' | 'finalizing'>('uploading');
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
  const [uploadStatus, setUploadStatus] = useState('');
  const [shareFileTarget, setShareFileTarget] = useState<DriveFile | null>(null);
  const [shareExpiresInHours, setShareExpiresInHours] = useState('never');
  const [shareSaving, setShareSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [renameState, setRenameState] = useState<RenameState>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const cancelUploadRef = useRef(false);
  const activeUploadXhrsRef = useRef<Set<XMLHttpRequest>>(new Set());

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
    setUploading(true);
    setUploadPhase('uploading');
    cancelUploadRef.current = false;
    setUploadStatus('Đang chuẩn bị upload...');
    setProgress(0);
    try {
      const totalUploadBytes = uploadFilesInput.reduce((total, item) => total + item.file.size, 0);
      let completedBytes = 0;
      const finalizeUpload = async (sessionId: string) => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await api.post(`${UPLOAD_BASE_URL}/drive/upload/finalize`, { sessionId }, { timeout: 120000 });
            return;
          } catch (error: any) {
            lastError = error;
            const status = error.response?.status;
            if (status && status < 500 && status !== 404) throw error;
            if (attempt < 3) {
              setUploadStatus(`Kết nối phản hồi bị gián đoạn, đang xác nhận lại (${attempt}/3)...`);
              await new Promise((resolve) => window.setTimeout(resolve, attempt * 2000));
            }
          }
        }
        throw lastError;
      };
      const uploadFileInChunks = async (item: UploadItem, fileNumber: number) => {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Phiên đăng nhập đã hết hạn');
        const relativePath = item.relativePath || item.file.webkitRelativePath || item.file.name;
        const directUploadLimit = 24 * 1024 * 1024;

        if (item.file.size <= directUploadLimit) {
          setProgress(Math.max(1, Math.floor((completedBytes / totalUploadBytes) * 100)));
          setUploadStatus(`Đang upload nhanh ${item.file.name} (${fileNumber}/${uploadFilesInput.length})`);
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const formData = new FormData();
            formData.append('files', item.file);
            formData.append('relativePaths', relativePath);
            if (note.trim()) formData.append('note', note.trim());
            if (currentFolderId) formData.append('folderId', String(currentFolderId));
            activeUploadXhrsRef.current.add(xhr);
            xhr.open('POST', `${UPLOAD_BASE_URL}/drive/upload`);
            xhr.timeout = 10 * 60 * 1000;
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.upload.onprogress = (event) => {
              if (!event.lengthComputable) return;
              const uploadedBytes = completedBytes + Math.min(event.loaded, item.file.size);
              setProgress(Math.max(1, Math.min(98, Math.floor((uploadedBytes / totalUploadBytes) * 100))));
            };
            xhr.upload.onload = () => {
              setUploadPhase('finalizing');
              setProgress(Math.min(99, Math.max(1, Math.floor(((completedBytes + item.file.size) / totalUploadBytes) * 100))));
              setUploadStatus(`Đã gửi xong ${item.file.name}, server đang ghi dữ liệu...`);
            };
            xhr.onload = () => {
              activeUploadXhrsRef.current.delete(xhr);
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else {
                let error = `HTTP ${xhr.status}`;
                try { error = JSON.parse(xhr.responseText)?.error || error; } catch { /* Use HTTP status. */ }
                reject(new Error(error));
              }
            };
            xhr.onerror = () => { activeUploadXhrsRef.current.delete(xhr); reject(new Error('Lỗi mạng khi upload file')); };
            xhr.ontimeout = () => { activeUploadXhrsRef.current.delete(xhr); reject(new Error('Server xử lý file quá thời gian')); };
            xhr.onabort = () => { activeUploadXhrsRef.current.delete(xhr); reject(new Error('Upload đã hủy')); };
            xhr.send(formData);
          });
          completedBytes += item.file.size;
          return;
        }

        setUploadStatus(`Đang chuẩn bị ${item.file.name} (${fileNumber}/${uploadFilesInput.length})...`);
        const initRes = await api.post(`${UPLOAD_BASE_URL}/drive/upload/init`, {
          fileName: item.file.name,
          fileSize: item.file.size,
          folderId: currentFolderId,
          relativePath,
          mimeType: item.file.type,
          note: note.trim(),
        });
        const sessionId = String(initRes.data.sessionId);
        setUploadPhase('uploading');
        const chunkSize = Number(initRes.data.chunkSize) || 32 * 1024 * 1024;
        const totalChunks = Math.ceil(item.file.size / chunkSize);
        const loadedByChunk = new Array<number>(totalChunks).fill(0);
        const connection = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
        const concurrency = connection?.saveData || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g'
          ? 1
          : connection?.effectiveType === '3g'
            ? 2
            : 4;
        setProgress(Math.max(1, Math.floor((completedBytes / totalUploadBytes) * 95)));
        setUploadStatus(`Đang upload ${item.file.name} (${fileNumber}/${uploadFilesInput.length})`);

        const uploadChunk = (chunkIndex: number, attempt: number) => new Promise<void>((resolve, reject) => {
          const start = chunkIndex * chunkSize;
          const end = Math.min(start + chunkSize, item.file.size);
          const chunk = item.file.slice(start, end);
          const xhr = new XMLHttpRequest();
          activeUploadXhrsRef.current.add(xhr);
          xhr.open('POST', `${UPLOAD_BASE_URL}/drive/upload/chunk?sessionId=${encodeURIComponent(sessionId)}&chunkIndex=${chunkIndex}&totalChunks=${totalChunks}`);
          xhr.timeout = Math.max(180000, (chunk.size / (1024 * 1024)) * 30000);
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');
          xhr.upload.onprogress = (event) => {
            loadedByChunk[chunkIndex] = Math.min(event.loaded, chunk.size);
            const currentFileBytes = loadedByChunk.reduce((total, loaded) => total + loaded, 0);
            setProgress(Math.max(1, Math.min(95, Math.floor(((completedBytes + currentFileBytes) / totalUploadBytes) * 95))));
          };
          xhr.onload = () => {
            activeUploadXhrsRef.current.delete(xhr);
            if (xhr.status >= 200 && xhr.status < 300) {
              loadedByChunk[chunkIndex] = chunk.size;
              resolve();
            } else {
              let error = `HTTP ${xhr.status}`;
              try { error = JSON.parse(xhr.responseText)?.error || error; } catch { /* Use HTTP status. */ }
              reject(new Error(`Chunk ${chunkIndex + 1}, lần ${attempt}: ${error}`));
            }
          };
          xhr.onerror = () => { activeUploadXhrsRef.current.delete(xhr); reject(new Error(`Lỗi mạng khi upload chunk ${chunkIndex + 1}`)); };
          xhr.ontimeout = () => { activeUploadXhrsRef.current.delete(xhr); reject(new Error(`Chunk ${chunkIndex + 1} quá thời gian`)); };
          xhr.onabort = () => { activeUploadXhrsRef.current.delete(xhr); reject(new Error('Upload đã hủy')); };
          xhr.send(chunk);
        });

        const uploadChunkWithRetry = async (chunkIndex: number) => {
          for (let attempt = 1; attempt <= 3; attempt++) {
            try { await uploadChunk(chunkIndex, attempt); return; } catch (error) {
              loadedByChunk[chunkIndex] = 0;
              if (cancelUploadRef.current || attempt === 3) throw error;
              await new Promise((resolve) => window.setTimeout(resolve, attempt * 1200));
            }
          }
        };

        let nextChunk = 0;
        const worker = async () => {
          while (nextChunk < totalChunks && !cancelUploadRef.current) {
            const chunkIndex = nextChunk++;
            await uploadChunkWithRetry(chunkIndex);
          }
        };

        try {
          await Promise.all(Array.from({ length: Math.min(concurrency, totalChunks) }, () => worker()));
          if (cancelUploadRef.current) throw new Error('Upload đã hủy');
          setProgress(Math.min(99, Math.max(1, Math.floor(((completedBytes + item.file.size) / totalUploadBytes) * 100))));
          setUploadPhase('finalizing');
          setUploadStatus(`Đã gửi xong ${item.file.name}, server đang xác nhận file...`);
          await finalizeUpload(sessionId);
          completedBytes += item.file.size;
          setUploadPhase('uploading');
        } catch (error) {
          void api.delete(`${UPLOAD_BASE_URL}/drive/upload/${encodeURIComponent(sessionId)}`).catch(() => undefined);
          throw error;
        }
      };

      for (let index = 0; index < uploadFilesInput.length; index++) {
        await uploadFileInChunks(uploadFilesInput[index], index + 1);
      }
      setProgress(100);
      setUploadPhase('uploading');
      setUploadStatus('Hoàn tất, đang làm mới danh sách...');
      const folderCount = new Set(uploadFilesInput.map((item) => (item.relativePath || item.file.webkitRelativePath || '').split('/').slice(0, -1).join('/')).filter(Boolean)).size;
      showToast(folderCount ? `Đã tải ${uploadFilesInput.length} file trong ${folderCount} thư mục` : `Đã tải ${uploadFilesInput.length} file lên Drive`, 'success');
      setSelectedUploadFiles([]);
      setNote('');
      setUploadModalOpen(false);
      setUploading(false);
      setUploadStatus('');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || 'Upload Drive thất bại', 'error');
    } finally {
      setUploading(false);
      setUploadStatus('');
      setDragging(false);
      setUploadPhase('uploading');
    }
  };

  const cancelUpload = () => {
    cancelUploadRef.current = true;
    for (const xhr of activeUploadXhrsRef.current) xhr.abort();
    activeUploadXhrsRef.current.clear();
    setUploadStatus('Đang hủy upload...');
  };

  const openConfirm = (state: ConfirmState) => setConfirmState(state);

  const runConfirmAction = async () => {
    if (!confirmState) return;
    setConfirmLoading(true);
    try {
      await confirmState.action();
      setConfirmState(null);
    } finally {
      setConfirmLoading(false);
    }
  };

  const renameItem = (type: DriveItemType, id: number, currentName: string) => {
    if (trashMode) return;
    setRenameState({ type, id, currentName, value: currentName });
  };

  const submitRename = async () => {
    if (!renameState) return;
    const name = renameState.value.trim();
    if (!name || name === renameState.currentName) {
      setRenameState(null);
      return;
    }
    setRenameSaving(true);
    try {
      await api.patch(`/drive/${renameState.type === 'file' ? 'files' : 'folders'}/${renameState.id}`, { name });
      showToast('Đã đổi tên', 'success');
      setRenameState(null);
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Đổi tên thất bại', 'error');
    } finally {
      setRenameSaving(false);
    }
  };

  const downloadFile = async (file: DriveFile) => {
    try {
      const response = await api.get(`/drive/download/${file.id}`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = file.original_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Tải file thất bại', 'error');
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

  const trashSelected = () => {
    if (selectedCount === 0) return;
    openConfirm({
      title: 'Đưa vào thùng rác?',
      message: `${selectedCount} mục đã chọn sẽ được chuyển vào thùng rác. Bạn có thể khôi phục lại sau.`,
      confirmLabel: 'Đưa vào thùng rác',
      action: async () => {
    try {
      await Promise.all(selectedItems.map((item) => api.delete(`/drive/${item.type === 'file' ? 'files' : 'folders'}/${item.id}`)));
      showToast('Đã đưa vào thùng rác', 'success');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa thất bại', 'error');
    }
      },
    });
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

  const permanentDeleteSelected = () => {
    if (selectedCount === 0) return;
    openConfirm({
      title: 'Xóa vĩnh viễn?',
      message: `${selectedCount} mục đã chọn sẽ bị xóa vĩnh viễn và không thể khôi phục.`,
      confirmLabel: 'Xóa vĩnh viễn',
      danger: true,
      action: async () => {
    try {
      await Promise.all(selectedItems.map((item) => api.delete(`/drive/${item.type === 'file' ? 'files' : 'folders'}/${item.id}/permanent`)));
      showToast('Đã xóa vĩnh viễn', 'success');
      await fetchFiles(null, true);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa vĩnh viễn thất bại', 'error');
    }
      },
    });
  };

  const trashOne = (type: DriveItemType, id: number) => {
    openConfirm({
      title: 'Đưa vào thùng rác?',
      message: 'Mục này sẽ được chuyển vào thùng rác. Bạn có thể khôi phục lại sau.',
      confirmLabel: 'Đưa vào thùng rác',
      action: async () => {
    try {
      await api.delete(`/drive/${type === 'file' ? 'files' : 'folders'}/${id}`);
      showToast('Đã đưa vào thùng rác', 'success');
      await fetchFiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa thất bại', 'error');
    }
      },
    });
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

  const permanentDeleteOne = (type: DriveItemType, id: number) => {
    openConfirm({
      title: 'Xóa vĩnh viễn?',
      message: 'Mục này sẽ bị xóa vĩnh viễn và không thể khôi phục.',
      confirmLabel: 'Xóa vĩnh viễn',
      danger: true,
      action: async () => {
    try {
      await api.delete(`/drive/${type === 'file' ? 'files' : 'folders'}/${id}/permanent`);
      showToast('Đã xóa vĩnh viễn', 'success');
      await fetchFiles(null, true);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa vĩnh viễn thất bại', 'error');
    }
      },
    });
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
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không xem trước được file', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const getShareUrl = (token?: string | null) => token ? `${window.location.origin}/share/${encodeURIComponent(token)}` : '';

  const openShareModal = (file: DriveFile) => {
    if (trashMode) return;
    setShareFileTarget(file);
    setShareExpiresInHours(file.share_expires_at ? '24' : 'never');
  };

  const createOrUpdateShare = async () => {
    if (!shareFileTarget) return;
    setShareSaving(true);
    try {
      const res = await api.post(`/drive/files/${shareFileTarget.id}/share`, { expiresInHours: shareExpiresInHours });
      const updatedFile = { ...shareFileTarget, share_token: res.data.token, share_expires_at: res.data.expiresAt || null };
      setShareFileTarget(updatedFile);
      setFiles((items) => items.map((item) => item.id === updatedFile.id ? updatedFile : item));
      const shareUrl = getShareUrl(res.data.token);
      const copied = await copyToClipboard(shareUrl);
      showToast(copied ? 'Đã tạo và copy link chia sẻ' : 'Đã tạo link chia sẻ', copied ? 'success' : 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Tạo link chia sẻ thất bại', 'error');
    } finally {
      setShareSaving(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareFileTarget?.share_token) return;
    const shareUrl = getShareUrl(shareFileTarget.share_token);
    const copied = await copyToClipboard(shareUrl);
    showToast(copied ? 'Đã copy link chia sẻ' : shareUrl, copied ? 'success' : 'info');
  };

  const unshareFileNow = async (file = shareFileTarget) => {
    if (!file?.share_token) return;
    setShareSaving(true);
    try {
      await api.delete(`/drive/files/${file.id}/share`);
      const updatedFile = { ...file, share_token: null, share_expires_at: null };
      setFiles((items) => items.map((item) => item.id === updatedFile.id ? updatedFile : item));
      setShareFileTarget(updatedFile);
      showToast('Đã tắt link chia sẻ', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Tắt chia sẻ thất bại', 'error');
    } finally {
      setShareSaving(false);
    }
  };

  const unshareFile = (file = shareFileTarget) => {
    if (!file?.share_token) return;
    openConfirm({
      title: 'Tắt chia sẻ?',
      message: 'Link công khai hiện tại sẽ ngừng hoạt động. Bạn có thể tạo lại link mới bất cứ lúc nào.',
      confirmLabel: 'Tắt chia sẻ',
      action: () => unshareFileNow(file),
    });
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
    const iconButton = 'inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-600 hover:shadow-md';
    if (trashMode) return <div className="flex items-center justify-end gap-1.5">
      <button type="button" title="Khôi phục" onClick={() => restoreOne(type, id)} className={`${iconButton} hover:text-emerald-600`}><RotateCcw className="w-4 h-4" /></button>
      <button type="button" title="Xóa vĩnh viễn" onClick={() => permanentDeleteOne(type, id)} className={`${iconButton} hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
    </div>;
    return <div className="flex flex-wrap items-center justify-end gap-1.5">
      {type === 'file' && <button type="button" title="Tải xuống" onClick={() => downloadFile(item as DriveFile)} className={iconButton}><Download className="w-4 h-4" /></button>}
      {type === 'file' && <button type="button" title="Xem trước" onClick={() => openPreview(item as DriveFile)} className={iconButton}><Eye className="w-4 h-4" /></button>}
      {type === 'file' && <button type="button" title={(item as DriveFile).share_token ? 'Quản lý chia sẻ' : 'Chia sẻ'} onClick={() => openShareModal(item as DriveFile)} className={`${iconButton} ${(item as DriveFile).share_token ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : ''}`}><Link className="w-4 h-4" /></button>}
      <button type="button" title="Đổi tên" onClick={() => renameItem(type, id, name)} className={iconButton}><Pencil className="w-4 h-4" /></button>
      <button type="button" title="Đưa vào thùng rác" onClick={() => trashOne(type, id)} className={`${iconButton} hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
    </div>;
  };

  return <div className="col-span-12 space-y-6 px-1 sm:px-0">
    <DriveHeader viewMode={viewMode} trashMode={trashMode} onSetViewMode={setViewMode} onToggleTrash={() => toggleTrash(!trashMode)} />

    <DriveToolbar usage={usage} trashMode={trashMode} breadcrumb={breadcrumb} searchTerm={searchTerm} usagePercent={usagePercent} activePercent={activePercent} trashPercent={trashPercent} onOpenFolder={openFolder} onSetSearchTerm={setSearchTerm} onOpenFolderModal={() => setFolderModalOpen(true)} onOpenUploadModal={() => setUploadModalOpen(true)} />

    <DriveSelectionBar selectedCount={selectedCount} trashMode={trashMode} onClearSelection={() => setSelected(new Set())} onOpenMoveModal={openMoveModal} onTrashSelected={trashSelected} onRestoreSelected={restoreSelected} onPermanentDeleteSelected={permanentDeleteSelected} />

    <DriveContent loading={loading} trashMode={trashMode} empty={empty} filteredEmpty={filteredEmpty} viewMode={viewMode} fileFilter={fileFilter} filterOptions={filterOptions} visibleFolders={visibleFolders} visibleFiles={visibleFiles} selected={selected} onSetFileFilter={setFileFilter} onOpenFolder={openFolder} onToggleSelected={toggleSelected} renderActions={renderActions} />

    <DriveFolderModal open={folderModalOpen} folderName={newFolderName} breadcrumb={breadcrumb} onChangeFolderName={setNewFolderName} onClose={() => { setFolderModalOpen(false); setNewFolderName(''); }} onCreate={createFolder} />

    <DriveUploadModal open={uploadModalOpen} uploading={uploading} dragging={dragging} progress={progress} uploadPhase={uploadPhase} uploadStatus={uploadStatus} selectedUploadFiles={selectedUploadFiles} note={note} onSetDragging={setDragging} onSetSelectedUploadFiles={setSelectedUploadFiles} onSetNote={setNote} onDrop={handleDrop} onClose={() => { if (!uploading) { setUploadModalOpen(false); setDragging(false); } }} onCancelUpload={cancelUpload} onUpload={() => uploadFiles()} />

    <DrivePreviewModal preview={preview} previewLoading={previewLoading} previewObjectUrl={previewObjectUrl} officePreviewUrl={officePreviewUrl} onClose={closePreview} onShareFile={openShareModal} onDownloadFile={downloadFile} />

    <DriveShareModal file={shareFileTarget} open={!!shareFileTarget} shareUrl={getShareUrl(shareFileTarget?.share_token)} expiresInHours={shareExpiresInHours} saving={shareSaving} onSetExpiresInHours={setShareExpiresInHours} onClose={() => setShareFileTarget(null)} onCreateOrUpdate={createOrUpdateShare} onCopy={copyShareLink} onUnshare={() => unshareFile()} />

    <DriveMoveModal open={moveModalOpen} selectedCount={selectedCount} moveTargetId={moveTargetId} folders={visibleFoldersForMove} onSetMoveTargetId={setMoveTargetId} onClose={() => setMoveModalOpen(false)} onMove={async () => { await moveSelected(); setMoveModalOpen(false); }} />

    <DriveRenameModal open={!!renameState} itemType={renameState?.type || 'file'} value={renameState?.value || ''} loading={renameSaving} onChange={(value) => setRenameState((state) => state ? { ...state, value } : state)} onClose={() => setRenameState(null)} onSubmit={submitRename} />

    <DriveConfirmModal open={!!confirmState} title={confirmState?.title || ''} message={confirmState?.message || ''} confirmLabel={confirmState?.confirmLabel} danger={confirmState?.danger} loading={confirmLoading} onClose={() => setConfirmState(null)} onConfirm={runConfirmAction} />
  </div>;
};

export default DriveTab;
