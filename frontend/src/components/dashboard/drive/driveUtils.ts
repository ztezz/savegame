import { DriveFile, FileFilter } from './driveTypes';

export const formatFileSize = (size: number) => {
  if (!size) return '0 B';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatFileType = (file: DriveFile) => {
  const name = file.original_name.toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop()?.toUpperCase() : '';
  const mime = (file.mime_type || '').toLowerCase();

  if (mime === 'application/pdf' || ext === 'PDF') return 'PDF';
  if (mime.startsWith('image/')) return ext ? `Ảnh ${ext}` : 'Ảnh';
  if (mime.startsWith('video/')) return ext ? `Video ${ext}` : 'Video';
  if (mime.startsWith('audio/')) return ext ? `Audio ${ext}` : 'Audio';
  if (mime.includes('zip') || ['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(ext || '')) return ext || 'File nén';
  if (['DOC', 'DOCX'].includes(ext || '')) return 'Word';
  if (['XLS', 'XLSX'].includes(ext || '')) return 'Excel';
  if (['PPT', 'PPTX'].includes(ext || '')) return 'PowerPoint';
  if (['TXT', 'MD', 'CSV', 'JSON', 'XML', 'LOG'].includes(ext || '')) return ext || 'Văn bản';
  if (['EXE', 'MSI', 'APK', 'DMG'].includes(ext || '')) return ext || 'Cài đặt';
  return ext || 'File';
};

export const getFileKind = (file: DriveFile): Exclude<FileFilter, 'all' | 'folders'> => {
  const name = file.original_name.toLowerCase();
  const mime = (file.mime_type || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name)) return 'images';
  if (/\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|json)$/i.test(name) || mime.includes('pdf') || mime.includes('text')) return 'documents';
  if (/\.(exe|msi|apk|dmg|pkg|deb|rpm)$/i.test(name)) return 'installers';
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return 'archives';
  return 'other';
};

export const getFileVisual = (file: DriveFile) => {
  const kind = getFileKind(file);
  const map = {
    images: { label: 'Ảnh', className: 'bg-emerald-50 text-emerald-700 border-emerald-100', iconClass: 'text-emerald-500 bg-emerald-50' },
    documents: { label: 'Tài liệu', className: 'bg-blue-50 text-blue-700 border-blue-100', iconClass: 'text-blue-500 bg-blue-50' },
    installers: { label: 'Cài đặt', className: 'bg-violet-50 text-violet-700 border-violet-100', iconClass: 'text-violet-500 bg-violet-50' },
    archives: { label: 'Nén', className: 'bg-amber-50 text-amber-700 border-amber-100', iconClass: 'text-amber-500 bg-amber-50' },
    other: { label: 'File', className: 'bg-slate-50 text-slate-600 border-slate-100', iconClass: 'text-slate-500 bg-slate-50' },
  };
  return map[kind];
};

export const formatDuration = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '00:00';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  const base = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${base}` : base;
};
