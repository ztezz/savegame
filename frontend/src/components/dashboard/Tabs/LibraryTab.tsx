import React, { useState } from 'react';
import { Gamepad2, Clock, Upload, Download, Trash2, Pencil, Copy, RotateCcw } from 'lucide-react';
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

const LibraryTab: React.FC<LibraryTabProps> = ({
  loading,
  games,
  filteredGames,
  restoreStatusMap,
  agentOnlineMap = {},
  devices,
  targetDevice,
  setTargetDevice,
  handleOpenUpdate,
  handleOpenHistory,
  handleDownload,
  handleRemoteRestore,
  handleRetryRestore,
  handleCancelRestore,
  handleDelete,
  handleBulkDelete,
  handleOpenRenameModal,
  formatSize,
}) => {
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedSaveIds, setSelectedSaveIds] = useState<number[]>([]);
  const { showToast } = useToast();

  const selectableSaveIds = filteredGames
    .map((game) => game.latestSave?.id)
    .filter((id): id is number => typeof id === 'number');
  const allSelected = selectableSaveIds.length > 0 && selectedSaveIds.length === selectableSaveIds.length;
  const partiallySelected = selectedSaveIds.length > 0 && !allSelected;

  const getStatusClasses = (status: RestoreStatusItem['status']) => {
    if (status === 'Pending') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (status === 'Running') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (status === 'Done') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'Cancelled') return 'bg-slate-100 text-slate-700 border-slate-300';
    if (status === 'Timeout') return 'bg-orange-50 text-orange-700 border-orange-200';
    return 'bg-rose-50 text-rose-700 border-rose-200';
  };

  const handleCopyPath = async (filePath: string, gameId: number) => {
    const success = await copyToClipboard(filePath);
    if (success) {
      setCopiedId(gameId);
      showToast(`Đã copy: ${filePath}`, 'success');
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      showToast('Sao chép thất bại', 'error');
    }
  };

  const toggleSelected = (saveId: number) => {
    setSelectedSaveIds((current) =>
      current.includes(saveId) ? current.filter((id) => id !== saveId) : [...current, saveId]
    );
  };

  const toggleSelectAll = () => {
    setSelectedSaveIds((current) => (current.length === selectableSaveIds.length ? [] : selectableSaveIds));
  };

  const requestBulkDelete = () => {
    handleBulkDelete(selectedSaveIds);
    setSelectedSaveIds([]);
  };

  return (
    <div className="col-span-12 space-y-8">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-2xl gap-3 flex-wrap">
          <div>
            <h3 className="font-black text-slate-800 text-sm tracking-tight flex items-center gap-2">
              <div className="w-2 h-2 bg-indigo-600 rounded-sm" />
              THƯ VIỆN BẢN LƯU
            </h3>
            {selectedSaveIds.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">Đã chọn {selectedSaveIds.length} bản lưu</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {selectedSaveIds.length > 0 && (
              <button
                onClick={requestBulkDelete}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-black hover:bg-red-700 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Xóa đã chọn
              </button>
            )}
            {targetDevice && (
              <span
                title={agentOnlineMap[targetDevice] ? 'Agent đang chạy' : 'Agent offline'}
                className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                  agentOnlineMap[targetDevice] ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]' : 'bg-slate-300'
                }`}
              />
            )}
            <select
              className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none"
              value={targetDevice}
              onChange={(e) => setTargetDevice(e.target.value)}
            >
              <option value="">Mọi thiết bị</option>
              {devices.map((d) => (
                <option key={d} value={d}>{d}{agentOnlineMap[d] ? ' ●' : ' ○'}</option>
              ))}
            </select>
            <span className="hidden sm:block text-[10px] text-slate-400 font-mono font-bold bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 uppercase">
              Truy vấn: SELECT * FROM saves
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 flex justify-center text-slate-300">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : games.length === 0 ? (
            <div className="p-20 text-center text-slate-400 font-medium italic">Không tìm thấy bản lưu nào.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest">
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-4 font-black w-12">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(input) => {
                        if (input) input.indeterminate = partiallySelected;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Chọn tất cả bản lưu"
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="px-6 py-4 font-black">Tên Game</th>
                  <th className="px-6 py-4 font-black">Phiên bản</th>
                  <th className="px-6 py-4 font-black">Thời gian</th>
                  <th className="px-6 py-4 font-black">Dung lượng</th>
                  <th className="px-6 py-4 font-black text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-600">
                {filteredGames.map((game) => {
                  const restoreStatus = restoreStatusMap[game.id];
                  const saveId = game.latestSave?.id;
                  return (
                    <tr
                      key={game.id}
                      className={`hover:bg-slate-50/70 transition-colors group ${
                        saveId && selectedSaveIds.includes(saveId) ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          disabled={!saveId}
                          checked={!!saveId && selectedSaveIds.includes(saveId)}
                          onChange={() => saveId && toggleSelected(saveId)}
                          aria-label={`Chọn bản lưu ${game.gameName}`}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                        />
                      </td>
                      <td className="px-6 py-4 cursor-pointer" onClick={() => handleOpenUpdate(game)}>
                        <div className="flex items-center gap-3 group/game">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 group-hover/game:bg-indigo-600 group-hover/game:text-white transition-all shadow-sm">
                            <Gamepad2 className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800 tracking-tight group-hover/game:text-indigo-600 transition-colors">{game.gameName}</span>
                            <span className="text-[9px] text-indigo-500 uppercase font-black tracking-widest">{game.category}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs font-bold text-indigo-500 bg-indigo-50/50 px-2 py-0.5 rounded border border-indigo-100">v{game.latestSave?.version || 1}.0</span>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-400">
                        {game.latestSave ? new Date(game.latestSave.createdAt).toLocaleDateString('vi-VN') : '--'}
                        <span className="block opacity-60 text-[10px] uppercase tracking-tighter mt-1">
                          {game.latestSave ? new Date(game.latestSave.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-700">
                        {game.latestSave ? formatSize(game.latestSave.fileSize) : '0 B'}
                        {restoreStatus && (
                          <span
                            title={restoreStatus.errorMessage || ''}
                            className={`ml-2 inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${getStatusClasses(restoreStatus.status)}`}
                          >
                            {restoreStatus.status}
                            {typeof restoreStatus.retryCount === 'number' && typeof restoreStatus.maxRetries === 'number' && (
                              <span className="ml-1 normal-case">{restoreStatus.retryCount}/{restoreStatus.maxRetries}</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 transition-all">
                          <button onClick={() => handleOpenHistory(game)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all font-bold" title="Lịch sử phiên bản">
                            <Clock className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleOpenUpdate(game)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all" title="Cập nhật bản lưu">
                            <Upload className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleOpenRenameModal(game)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all" title="Chỉnh sửa tên game">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => game.latestSave && handleCopyPath(game.latestSave.filePath, game.id)} disabled={!game.latestSave} className={`p-2 rounded-lg border transition-all ${copiedId === game.id ? 'text-green-600 bg-green-50 border-green-200' : game.latestSave ? 'text-slate-400 hover:text-green-600 hover:bg-white border-transparent hover:border-slate-200' : 'text-slate-200 opacity-50 cursor-not-allowed'}`} title={game.latestSave ? 'Copy file path' : 'Không có file'}>
                            <Copy className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleRemoteRestore(game)} disabled={!targetDevice} className={`p-2 rounded-lg border transition-all ${targetDevice ? 'text-emerald-600 hover:bg-white border-transparent hover:border-slate-200' : 'text-slate-300 cursor-not-allowed border-transparent'}`} title={targetDevice ? 'Khôi phục về app đã cài trên máy' : 'Chọn thiết bị trước khi khôi phục'}>
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          {restoreStatus && (restoreStatus.status === 'Pending' || restoreStatus.status === 'Running') && (
                            <button onClick={() => handleCancelRestore(restoreStatus.id)} className="p-2 text-slate-500 hover:text-slate-800 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all" title="Hủy lệnh khôi phục">
                              C
                            </button>
                          )}
                          {restoreStatus && ['Failed', 'Timeout', 'Cancelled'].includes(restoreStatus.status) && (
                            <button onClick={() => handleRetryRestore(restoreStatus.id)} className="p-2 text-amber-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all font-bold" title="Retry khôi phục">
                              R
                            </button>
                          )}
                          <button onClick={() => game.latestSave && handleDownload(game.latestSave.id)} className="p-2 text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all font-bold" title="Download">
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (!game.latestSave) {
                                showToast('Game này chưa có bản lưu để xoá', 'error');
                                return;
                              }
                              handleDelete(game.latestSave.id);
                            }}
                            disabled={!game.latestSave}
                            className={`p-2 rounded-lg border border-transparent transition-all ${game.latestSave ? 'text-slate-400 hover:text-red-500 hover:bg-white hover:border-slate-200 cursor-pointer' : 'text-slate-200 cursor-not-allowed opacity-50'}`}
                            title={game.latestSave ? 'Xóa bản lưu' : 'Không có bản lưu để xoá'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default LibraryTab;
