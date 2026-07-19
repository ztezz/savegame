import React, { useMemo, useState } from 'react';
import { Upload, Download, Trash2, KeyRound, Plus, X, FileCheck, Pencil, CheckCircle, Gauge, Timer, Search, Files, HardDrive, CalendarDays } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import api, { LARGE_UPLOAD_THRESHOLD, uploadLargeFile, uploadWithProgress } from '../../../utils/api';
import EditActivationModal from '../Modals/EditActivationModal';
import DeleteConfirmModal from '../Modals/DeleteConfirmModal';
import { useToast } from '../../../context/ToastContext';

export interface ActivationFile {
  id: number;
  gameName: string;
  originalName: string;
  fileSize: number;
  note: string;
  createdAt: string;
}

interface UploadStats {
  uploadedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  etaSeconds: number | null;
  phase: 'uploading' | 'finalizing';
}

interface ActivationTabProps {
  currentUser: any;
  activationFiles: ActivationFile[];
  onRefresh: () => void;
  formatSize: (bytes: number) => string;
}

const ActivationTab: React.FC<ActivationTabProps> = ({ currentUser, activationFiles, onRefresh, formatSize }) => {
  const { showToast } = useToast();
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin' || currentUser?.username === 'admin';
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [gameName, setGameName] = useState('');
  const [note, setNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStats, setUploadStats] = useState<UploadStats | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedActivationForEdit, setSelectedActivationForEdit] = useState<ActivationFile | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'size'>('newest');

  const filteredFiles = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase('vi');
    return activationFiles
      .filter((file) => !search || [file.gameName, file.originalName, file.note].some((value) => String(value || '').toLocaleLowerCase('vi').includes(search)))
      .sort((a, b) => {
        if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (sortBy === 'name') return a.originalName.localeCompare(b.originalName, 'vi');
        if (sortBy === 'size') return b.fileSize - a.fileSize;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [activationFiles, searchTerm, sortBy]);

  const totalSize = activationFiles.reduce((sum, file) => sum + Number(file.fileSize || 0), 0);
  const uniqueGames = new Set(activationFiles.map((file) => file.gameName.trim().toLocaleLowerCase('vi'))).size;
  const latestFile = [...activationFiles].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const handleUpload = async () => {
    if (!gameName.trim() || !selectedFile) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadStats({ uploadedBytes: 0, totalBytes: selectedFile.size, bytesPerSecond: 0, etaSeconds: null, phase: 'uploading' });

    const formData = new FormData();
    formData.append('activationfile', selectedFile);
    formData.append('gameName', gameName.trim());
    formData.append('note', note.trim());

    try {
      const onProgress = (progress: number, stats?: UploadStats) => {
        setUploadProgress(progress);
        if (stats) setUploadStats(stats);
      };
      if (selectedFile.size > LARGE_UPLOAD_THRESHOLD) {
        await uploadLargeFile('/activation/upload', selectedFile, { gameName: gameName.trim(), note: note.trim() }, onProgress);
      } else {
        await uploadWithProgress('/activation/upload', formData, onProgress);
      }
      
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
        setUploadStats(null);
        setShowSuccess(false);
        onRefresh();
      }, 2000);
    } catch (err) {
      showToast(`Upload thất bại: ${err instanceof Error ? err.message : String(err)}`, 'error', 3500);
      setUploadProgress(null);
      setUploadStats(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (file: ActivationFile) => {
    try {
      const response = await api.post(`/activation/download/${file.id}/link`);
      const link = document.createElement('a');
      link.href = response.data.downloadUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Đã tạo link tải xuống', 'success', 2500);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không thể tải file kích hoạt', 'error', 3500);
    }
  };

  const formatSpeed = (bytesPerSecond: number) => {
    if (!bytesPerSecond) return 'Đang đo...';
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  const formatEta = (seconds: number | null) => {
    if (seconds === null || !Number.isFinite(seconds)) return 'Đang tính...';
    if (seconds < 60) return `Còn khoảng ${seconds} giây`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `Còn khoảng ${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const handleDelete = async (id: number) => {
    setPendingDeleteId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;

    setDeletingId(pendingDeleteId);
    try {
      await api.delete(`/activation/${pendingDeleteId}`);
      onRefresh();
      showToast('Xóa file kích hoạt thành công', 'success', 2500);
      setShowDeleteConfirm(false);
      setPendingDeleteId(null);
    } catch {
      showToast('Xóa file kích hoạt thất bại', 'error', 3000);
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenEditModal = (file: ActivationFile) => {
    setSelectedActivationForEdit(file);
    setShowEditModal(true);
  };

  const handleSaveEdit = async (newGameName: string, newOriginalName: string, newNote: string) => {
    if (!selectedActivationForEdit) return;
    try {
      await api.put(`/activation/${selectedActivationForEdit.id}`, {
        gameName: newGameName,
        originalName: newOriginalName,
        note: newNote
      });
      onRefresh();
      showToast('Cập nhật file kích hoạt thành công', 'success', 2500);
    } catch {
      showToast('Cập nhật file kích hoạt thất bại', 'error', 3000);
    }
  };

  return (
    <div className="col-span-12 space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-amber-100 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">
              <KeyRound className="h-3.5 w-3.5" /> Kho kích hoạt
            </div>
            <h3 className="text-2xl font-black tracking-tight sm:text-3xl">File kích hoạt game</h3>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-300">Lưu trữ key, license, crack và bộ cài kích hoạt. Bạn có thể đổi tên file tải xuống mà không ảnh hưởng dữ liệu đã lưu.</p>
          </div>
          {isAdmin && (
            <button onClick={() => setShowUploadModal(true)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-amber-950/30 transition hover:bg-amber-400">
              <Plus className="h-4 w-4" /> Tải lên file mới
            </button>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Tổng file', value: activationFiles.length, detail: 'file đang lưu', icon: Files, style: 'bg-amber-50 text-amber-600' },
          { label: 'Dung lượng', value: formatSize(totalSize), detail: 'tổng bộ nhớ', icon: HardDrive, style: 'bg-indigo-50 text-indigo-600' },
          { label: 'Số game', value: uniqueGames, detail: 'game có file', icon: KeyRound, style: 'bg-emerald-50 text-emerald-600' },
          { label: 'Gần nhất', value: latestFile ? new Date(latestFile.createdAt).toLocaleDateString('vi-VN') : '--', detail: latestFile?.originalName || 'Chưa có file', icon: CalendarDays, style: 'bg-violet-50 text-violet-600' },
        ].map(({ label, value, detail, icon: Icon, style }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-2 truncate text-xl font-black text-slate-900 dark:text-white sm:text-2xl">{value}</p><p className="mt-1 truncate text-[10px] font-semibold text-slate-400" title={detail}>{detail}</p></div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style}`}><Icon className="h-5 w-5" /></div>
            </div>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><h4 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Danh sách file</h4><p className="mt-1 text-xs font-semibold text-slate-500">Tìm kiếm, đổi tên, tải xuống hoặc xóa file kích hoạt.</p></div>
            <div className="grid gap-2 sm:grid-cols-[minmax(15rem,1fr)_12rem]">
              <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Tìm game, tên file, ghi chú..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></div>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="name">Theo tên file</option><option value="size">Dung lượng lớn</option></select>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {filteredFiles.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/40"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500"><FileCheck className="h-7 w-7" /></div><p className="mt-4 text-sm font-black text-slate-700 dark:text-slate-200">{activationFiles.length ? 'Không tìm thấy file phù hợp' : 'Chưa có file kích hoạt nào'}</p><p className="mt-1 text-xs font-semibold text-slate-400">{activationFiles.length ? 'Thử thay đổi từ khóa hoặc cách sắp xếp.' : 'Tải file đầu tiên để bắt đầu xây dựng kho kích hoạt.'}</p>{searchTerm && <button onClick={() => setSearchTerm('')} className="mt-4 text-xs font-black text-amber-600 hover:underline">Xóa từ khóa</button>}</div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {filteredFiles.map((file) => (
                <article key={file.id} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-amber-200 hover:shadow-lg hover:shadow-amber-100/40 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-amber-700 dark:hover:shadow-none">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md"><KeyRound className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-900 dark:text-white" title={file.gameName}>{file.gameName}</p><p className="mt-1 truncate font-mono text-xs font-bold text-amber-700 dark:text-amber-300" title={file.originalName}>{file.originalName}</p><div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-400"><span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-700">{formatSize(file.fileSize)}</span><span>{new Date(file.createdAt).toLocaleDateString('vi-VN')}</span></div>{file.note && <p className="mt-3 line-clamp-2 text-xs font-medium leading-5 text-slate-500" title={file.note}>{file.note}</p>}</div>
                    <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                      {isAdmin && <button onClick={() => handleOpenEditModal(file)} className="rounded-xl p-2 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950" title="Đổi tên và chỉnh sửa"><Pencil className="h-4 w-4" /></button>}
                      <button onClick={() => handleDownload(file)} className="rounded-xl p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950" title="Tải xuống"><Download className="h-4 w-4" /></button>
                      {isAdmin && <button onClick={() => handleDelete(file.id)} disabled={deletingId === file.id} className="rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950" title="Xóa"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {filteredFiles.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-400 dark:border-slate-800">Hiển thị {filteredFiles.length} / {activationFiles.length} file</div>}
        </div>
      </section>

      {/* Upload Modal */}
      {isAdmin && showUploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:border dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
              <h3 className="flex items-center gap-2 font-black text-slate-800 dark:text-white">
                <Upload className="w-4 h-4 text-amber-500" />
                Tải lên file kích hoạt
              </h3>
              <button onClick={() => setShowUploadModal(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
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
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Chọn file *</label>
                <label className="flex h-28 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 transition-colors hover:border-amber-400 dark:border-slate-700 dark:bg-slate-800">
                  {selectedFile ? (
                    <div className="text-center">
                      <FileCheck className="w-6 h-6 text-amber-500 mx-auto mb-1" />
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{selectedFile.name}</p>
                      <p className="text-xs text-slate-400">{formatSize(selectedFile.size)}</p>
                      {selectedFile.size > LARGE_UPLOAD_THRESHOLD && <p className="mt-1 text-[10px] font-bold text-amber-600">File lớn sẽ được tự động chia nhỏ để upload ổn định.</p>}
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
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Progress Bar */}
              {uploadProgress !== null && (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
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
                   {uploadStats && uploadProgress < 100 && <div className="grid grid-cols-2 gap-2 pt-1">
                     <div className="rounded-lg bg-white/70 px-3 py-2 dark:bg-slate-900/60">
                       <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-600"><Gauge className="h-3 w-3" />Tốc độ</p>
                       <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-100">{uploadStats.phase === 'finalizing' ? 'Đã tải xong' : formatSpeed(uploadStats.bytesPerSecond)}</p>
                     </div>
                     <div className="rounded-lg bg-white/70 px-3 py-2 dark:bg-slate-900/60">
                       <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-600"><Timer className="h-3 w-3" />Thời gian</p>
                       <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-100">{uploadStats.phase === 'finalizing' ? 'Đang lưu file...' : formatEta(uploadStats.etaSeconds)}</p>
                     </div>
                     <p className="col-span-2 text-center text-[10px] font-bold text-amber-700">{formatSize(uploadStats.uploadedBytes)} / {formatSize(uploadStats.totalBytes)}</p>
                   </div>}
                   <p className="text-[10px] text-amber-700 text-center flex items-center justify-center gap-1">
                     {uploadProgress < 100 ? (
                       <>
                         <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                         {uploadStats?.phase === 'finalizing' ? 'Đã gửi xong, đang hoàn tất...' : 'Đang truyền file tốc độ cao lên server...'}
                      </>
                    ) : (
                      <>
                        <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                        Hoàn tất
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
        initialOriginalName={selectedActivationForEdit?.originalName || ''}
        initialNote={selectedActivationForEdit?.note || ''}
      />

      <DeleteConfirmModal
        show={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setPendingDeleteId(null);
        }}
        onConfirm={confirmDelete}
        title="Xác nhận xóa"
        message="Bạn có chắc chắn muốn xóa file kích hoạt này không? Hành động này không thể hoàn tác."
      />
    </div>
  );
};

export default ActivationTab;
