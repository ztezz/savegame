import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare, Clock, Copy, Database, Download, Gamepad2, HardDrive,
  History, Laptop, Layers3, Pencil, RefreshCw, RotateCcw, Square,
  Trash2, Upload, Wifi, WifiOff, X,
} from 'lucide-react';
import { GameSave, RestoreStatusItem } from '../types';
import { copyToClipboard } from '../../../utils/clipboard';
import { useToast } from '../../../context/ToastContext';

interface LibraryTabProps {
  loading: boolean;
  games: GameSave[];
  filteredGames: GameSave[];
  restoreStatusMap: Record<number, RestoreStatusItem>;
  agentOnlineMap?: Record<string, boolean>;
  devices: string[];
  targetDevice: string;
  setTargetDevice: (device: string) => void;
  handleOpenUpdate: (game: GameSave) => void;
  handleOpenHistory: (game: GameSave) => void;
  handleDownload: (id: number) => void;
  handleRemoteRestore: (game: GameSave) => void;
  handleRetryRestore: (commandId: number) => void;
  handleCancelRestore: (commandId: number) => void;
  handleDelete: (id: number) => void;
  handleBulkDelete: (ids: number[]) => void;
  handleOpenRenameModal: (game: GameSave) => void;
  formatSize: (bytes: number) => string;
}

const CARD_GRADIENTS = [
  'from-indigo-500 to-violet-600',
  'from-sky-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-rose-500 to-pink-600',
];

const gradientForGame = (name: string) => {
  const hash = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return CARD_GRADIENTS[hash % CARD_GRADIENTS.length];
};

const LibraryTab: React.FC<LibraryTabProps> = ({
  loading, games, filteredGames, restoreStatusMap, agentOnlineMap = {}, devices,
  targetDevice, setTargetDevice, handleOpenUpdate, handleOpenHistory,
  handleDownload, handleRemoteRestore, handleRetryRestore, handleCancelRestore,
  handleDelete, handleBulkDelete, handleOpenRenameModal, formatSize,
}) => {
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedSaveIds, setSelectedSaveIds] = useState<number[]>([]);
  const { showToast } = useToast();

  const selectableSaveIds = useMemo(
    () => filteredGames.map((game) => game.latestSave?.id).filter((id): id is number => typeof id === 'number'),
    [filteredGames],
  );
  const selectedVisibleIds = selectedSaveIds.filter((id) => selectableSaveIds.includes(id));
  const allSelected = selectableSaveIds.length > 0 && selectedVisibleIds.length === selectableSaveIds.length;

  useEffect(() => {
    setSelectedSaveIds((current) => {
      const next = current.filter((id) => selectableSaveIds.includes(id));
      return next.length === current.length ? current : next;
    });
  }, [selectableSaveIds]);

  const totalBytes = filteredGames.reduce((sum, game) => sum + Number(game.latestSave?.fileSize || 0), 0);
  const totalVersions = filteredGames.reduce((sum, game) => sum + Number(game.versions || 0), 0);
  const categoryCount = new Set(filteredGames.map((game) => game.category)).size;
  const onlineDevices = devices.filter((device) => agentOnlineMap[device]).length;

  const getStatusClasses = (status: RestoreStatusItem['status']) => {
    if (status === 'Pending') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300';
    if (status === 'Running') return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300';
    if (status === 'Done') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
    if (status === 'Timeout') return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300';
    if (status === 'Cancelled') return 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200';
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300';
  };

  const handleCopyPath = async (filePath: string, gameId: number) => {
    const success = await copyToClipboard(filePath);
    if (!success) {
      showToast('Sao chép đường dẫn thất bại', 'error');
      return;
    }
    setCopiedId(gameId);
    showToast('Đã sao chép đường dẫn bản lưu', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleSelected = (saveId: number) => {
    setSelectedSaveIds((current) => current.includes(saveId) ? current.filter((id) => id !== saveId) : [...current, saveId]);
  };

  const requestBulkDelete = () => {
    handleBulkDelete(selectedSaveIds);
    setSelectedSaveIds([]);
  };

  const actionButton = 'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:-translate-y-0.5 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900';

  return (
    <div className="col-span-12 space-y-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Game đang hiển thị', value: filteredGames.length, detail: `${games.filter((game) => game.latestSave).length} game có save`, icon: Gamepad2, style: 'bg-indigo-50 text-indigo-600' },
          { label: 'Tổng phiên bản', value: totalVersions, detail: 'bản lưu đã lưu trữ', icon: Layers3, style: 'bg-violet-50 text-violet-600' },
          { label: 'Dung lượng', value: formatSize(totalBytes), detail: `${categoryCount} thể loại`, icon: HardDrive, style: 'bg-emerald-50 text-emerald-600' },
          { label: 'Agent trực tuyến', value: `${onlineDevices}/${devices.length}`, detail: targetDevice || 'Chưa chọn thiết bị', icon: Laptop, style: 'bg-sky-50 text-sky-600' },
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
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2"><Database className="h-4 w-4 text-indigo-600" /><h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Kho bản lưu</h3><span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">{filteredGames.length}</span></div>
              <p className="mt-1 text-xs font-semibold text-slate-500">Chọn game để cập nhật save hoặc dùng các thao tác nhanh trên từng thẻ.</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                {targetDevice && agentOnlineMap[targetDevice] ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-slate-400" />}
                <select value={targetDevice} onChange={(event) => setTargetDevice(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs font-bold text-slate-700 outline-none dark:[color-scheme:dark] dark:text-slate-100 sm:min-w-48">
                  <option className="bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-100" value="">Chọn thiết bị khôi phục</option>
                  {devices.map((device) => <option className="bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-100" key={device} value={device}>{device} {agentOnlineMap[device] ? '• Online' : '• Offline'}</option>)}
                </select>
              </div>
              <button onClick={() => setSelectedSaveIds(allSelected ? [] : selectableSaveIds)} disabled={!selectableSaveIds.length} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {allSelected ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4" />} {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </button>
            </div>
          </div>

          {selectedSaveIds.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/50">
              <CheckSquare className="h-4 w-4 text-indigo-600" /><span className="text-xs font-black text-indigo-700 dark:text-indigo-300">Đã chọn {selectedSaveIds.length} bản lưu</span>
              <div className="ml-auto flex items-center gap-2"><button onClick={() => setSelectedSaveIds([])} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black text-indigo-600 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-900"><X className="h-3.5 w-3.5" /> Bỏ chọn</button><button onClick={requestBulkDelete} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-700"><Trash2 className="h-3.5 w-3.5" /> Xóa đã chọn</button></div>
            </div>
          )}
        </div>

        <div className="p-5 sm:p-6">
          {loading ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-slate-400"><RefreshCw className="h-8 w-8 animate-spin text-indigo-600" /><p className="text-sm font-semibold">Đang tải thư viện...</p></div>
          ) : filteredGames.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/40"><div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-500 dark:bg-indigo-950"><Gamepad2 className="h-8 w-8" /></div><p className="mt-4 text-sm font-black text-slate-700 dark:text-slate-200">{games.length === 0 ? 'Chưa có bản lưu nào' : 'Không có bản lưu phù hợp'}</p><p className="mt-1 max-w-md text-xs font-semibold text-slate-400">{games.length === 0 ? 'Tải lên bản lưu đầu tiên để đồng bộ và khôi phục game giữa các thiết bị.' : 'Hãy thay đổi từ khóa, thể loại hoặc cách sắp xếp ở thanh phía trên.'}</p></div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {filteredGames.map((game) => {
                const save = game.latestSave;
                const restoreStatus = restoreStatusMap[game.id];
                const selected = Boolean(save && selectedSaveIds.includes(save.id));
                const targetOnline = Boolean(targetDevice && agentOnlineMap[targetDevice]);

                return (
                  <article key={game.id} className={`group relative overflow-hidden rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-xl dark:bg-slate-800 ${selected ? 'border-indigo-400 ring-4 ring-indigo-50 dark:border-indigo-500 dark:ring-indigo-950' : 'border-slate-200 hover:border-indigo-200 dark:border-slate-700 dark:hover:border-indigo-700'}`}>
                    <div className={`h-1.5 bg-gradient-to-r ${gradientForGame(game.gameName)}`} />
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <button onClick={() => save && toggleSelected(save.id)} disabled={!save} className={`mt-1 shrink-0 transition ${selected ? 'text-indigo-600' : 'text-slate-300 hover:text-indigo-500'}`} aria-label={`Chọn ${game.gameName}`}>{selected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}</button>
                        <button onClick={() => handleOpenUpdate(game)} className="min-w-0 flex-1 text-left">
                          <div className="flex items-start gap-3"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientForGame(game.gameName)} text-white shadow-md`}><Gamepad2 className="h-5 w-5" /></div><div className="min-w-0"><h4 className="truncate text-base font-black text-slate-900 transition group-hover:text-indigo-600 dark:text-white" title={game.gameName}>{game.gameName}</h4><div className="mt-1 flex flex-wrap items-center gap-2"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">{game.category}</span><span className="text-[10px] font-bold text-slate-400">{game.versions} phiên bản</span></div></div></div>
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Phiên bản</p><p className="mt-1 font-mono text-sm font-black text-indigo-600 dark:text-indigo-300">v{save?.version || 1}.0</p></div>
                        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Dung lượng</p><p className="mt-1 truncate font-mono text-xs font-black text-slate-700 dark:text-slate-200">{formatSize(save?.fileSize || 0)}</p></div>
                        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Cập nhật</p><p className="mt-1 truncate text-xs font-black text-slate-700 dark:text-slate-200">{save ? new Date(save.createdAt).toLocaleDateString('vi-VN') : '--'}</p></div>
                      </div>

                      {restoreStatus && <div className="mt-3 flex items-center justify-between gap-2"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${getStatusClasses(restoreStatus.status)}`} title={restoreStatus.errorMessage || ''}>{restoreStatus.status}{typeof restoreStatus.retryCount === 'number' && ` ${restoreStatus.retryCount}/${restoreStatus.maxRetries}`}</span>{restoreStatus.errorMessage && <span className="truncate text-[10px] font-semibold text-rose-500">{restoreStatus.errorMessage}</span>}</div>}

                      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-4 dark:border-slate-700">
                        <button onClick={() => handleOpenHistory(game)} className={`${actionButton} hover:border-indigo-200 hover:text-indigo-600`} title="Lịch sử phiên bản"><History className="h-4 w-4" /></button>
                        <button onClick={() => handleOpenUpdate(game)} className={`${actionButton} hover:border-sky-200 hover:text-sky-600`} title="Tải lên phiên bản mới"><Upload className="h-4 w-4" /></button>
                        <button onClick={() => handleOpenRenameModal(game)} className={`${actionButton} hover:border-amber-200 hover:text-amber-600`} title="Sửa thông tin game"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => save && handleCopyPath(save.filePath, game.id)} disabled={!save} className={`${actionButton} ${copiedId === game.id ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'hover:border-emerald-200 hover:text-emerald-600'} disabled:opacity-40`} title="Sao chép đường dẫn"><Copy className="h-4 w-4" /></button>
                        <button onClick={() => handleRemoteRestore(game)} disabled={!targetDevice || !save} className={`${actionButton} ${targetDevice ? 'hover:border-emerald-200 hover:text-emerald-600' : ''} disabled:cursor-not-allowed disabled:opacity-40`} title={targetDevice ? `Khôi phục về ${targetDevice}${targetOnline ? '' : ' (offline)'}` : 'Chọn thiết bị trước'}><RotateCcw className="h-4 w-4" /></button>
                        {restoreStatus && ['Pending', 'Running'].includes(restoreStatus.status) && <button onClick={() => handleCancelRestore(restoreStatus.id)} className={`${actionButton} hover:border-slate-300 hover:text-slate-800`} title="Hủy khôi phục"><X className="h-4 w-4" /></button>}
                        {restoreStatus && ['Failed', 'Timeout', 'Cancelled'].includes(restoreStatus.status) && <button onClick={() => handleRetryRestore(restoreStatus.id)} className={`${actionButton} hover:border-amber-200 hover:text-amber-600`} title="Thử lại khôi phục"><RefreshCw className="h-4 w-4" /></button>}
                        <div className="ml-auto flex gap-1.5"><button onClick={() => save && handleDownload(save.id)} disabled={!save} className={`${actionButton} border-indigo-100 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 dark:border-indigo-900 dark:hover:bg-indigo-950`} title="Tải xuống"><Download className="h-4 w-4" /></button><button onClick={() => save ? handleDelete(save.id) : showToast('Game này chưa có bản lưu để xóa', 'error')} disabled={!save} className={`${actionButton} hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950`} title="Xóa bản lưu"><Trash2 className="h-4 w-4" /></button></div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default LibraryTab;
