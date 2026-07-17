import React from 'react';
import {
  ArrowRight, CheckCircle2, Clock3, Download, FolderSync, Gamepad2,
  History, Laptop, LoaderCircle, RefreshCw, Settings2, Upload, Wifi, WifiOff,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import StatCards from '../StatCards';
import { GameSave, RestoreStatusItem } from '../types';

interface SyncLog {
  id?: number;
  device_name?: string;
  deviceName?: string;
  status?: string;
  message?: string;
  created_at?: string;
  createdAt?: string;
}

interface OverviewTabProps {
  games: GameSave[];
  devices: string[];
  agentOnlineMap: Record<string, boolean>;
  restoreStatusMap: Record<number, RestoreStatusItem>;
  syncLogs: SyncLog[];
  autoSyncEnabled: boolean;
  directoryConnected: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  uploadProgress: number | null;
  setActiveTab: (tab: string) => void;
  handleOpenNew: () => void;
  handleSelectDirectory: () => void;
  performSync: () => void;
  handleOpenHistory: (game: GameSave) => void;
  handleDownload: (id: number) => void;
}

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Chưa có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Không xác định';
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

const OverviewTab: React.FC<OverviewTabProps> = ({
  games, devices, agentOnlineMap, restoreStatusMap, syncLogs, autoSyncEnabled,
  directoryConnected, isSyncing, lastSyncTime, uploadProgress, setActiveTab,
  handleOpenNew, handleSelectDirectory, performSync, handleOpenHistory, handleDownload,
}) => {
  const reduceMotion = useReducedMotion();
  const restoreStatuses: RestoreStatusItem[] = Object.keys(restoreStatusMap).map((key) => restoreStatusMap[Number(key)]);
  const onlineDevices = devices.filter((device) => agentOnlineMap[device]).length;
  const successfulRestores = restoreStatuses.filter((item) => item.status === 'Done').length;
  const activeRestores = restoreStatuses.filter((item) => item.status === 'Pending' || item.status === 'Running');
  const failedRestores = restoreStatuses.filter((item) => ['Failed', 'Timeout'].includes(item.status));
  const latestGame = games[0];
  const latestActivity = syncLogs[0];
  const healthTone = failedRestores.length ? 'amber' : onlineDevices || directoryConnected ? 'emerald' : 'slate';
  const healthLabel = failedRestores.length ? 'Cần kiểm tra' : onlineDevices || directoryConnected ? 'Sẵn sàng đồng bộ' : 'Chưa có agent trực tuyến';
  const healthClasses = {
    amber: 'bg-amber-400/15 text-amber-100 ring-amber-300/20',
    emerald: 'bg-emerald-400/15 text-emerald-100 ring-emerald-300/20',
    slate: 'bg-white/10 text-slate-200 ring-white/10',
  };

  const reveal = (delay = 0) => reduceMotion ? {} : {
    initial: { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  };

  return (
    <motion.div className="col-span-12 space-y-5 sm:space-y-6" initial={reduceMotion ? false : 'hidden'} animate="visible">
      <motion.section {...reveal()} className="group relative overflow-hidden rounded-3xl bg-slate-950 px-5 py-6 text-white shadow-xl sm:px-7 sm:py-7">
        <motion.div
          className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
          animate={reduceMotion ? undefined : { x: [0, -36, 10, 0], y: [0, 24, -8, 0], scale: [1, 1.12, 0.96, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-0 right-1/3 h-28 w-28 rounded-full bg-sky-400/10 blur-2xl"
          animate={reduceMotion ? undefined : { x: [0, 45, 0], opacity: [0.45, 0.8, 0.45] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.035)_45%,transparent_65%)] bg-[length:250%_100%] transition-[background-position] duration-1000 group-hover:bg-[position:100%_0]" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className={`mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 ${healthClasses[healthTone]}`}>
              <span className={`h-2 w-2 rounded-full ${healthTone === 'emerald' ? 'bg-emerald-400' : healthTone === 'amber' ? 'bg-amber-400' : 'bg-slate-400'}`} />
              {healthLabel}
            </div>
            <h3 className="max-w-2xl text-2xl font-black tracking-tight sm:text-3xl">Bản lưu an toàn, thiết bị luôn sẵn sàng.</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Theo dõi toàn bộ luồng upload, đồng bộ trình duyệt và khôi phục từ một màn hình vận hành duy nhất.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <motion.button whileHover={reduceMotion ? undefined : { y: -2, scale: 1.02 }} whileTap={reduceMotion ? undefined : { scale: 0.97 }} onClick={handleOpenNew} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-black/10 transition hover:bg-indigo-50">
              <Upload className="h-4 w-4" /> Tải bản lưu
            </motion.button>
            <motion.button whileHover={reduceMotion ? undefined : { y: -2, scale: 1.02 }} whileTap={reduceMotion ? undefined : { scale: 0.97 }} onClick={() => setActiveTab('devices')} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-black text-white ring-1 ring-white/10 transition hover:bg-white/15">
              <Laptop className="h-4 w-4" /> Thiết bị
            </motion.button>
          </div>
        </div>
      </motion.section>

      <StatCards games={games} onlineDevices={onlineDevices} totalDevices={devices.length} successfulRestores={successfulRestores} />

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <motion.section {...reveal(0.12)} whileHover={reduceMotion ? undefined : { y: -2 }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-black/20">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Bản lưu gần đây</h3>
              <p className="mt-0.5 text-xs text-slate-500">Các phiên bản mới nhất đã được đưa lên hệ thống</p>
            </div>
            <button onClick={() => setActiveTab('library')} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">
              Xem thư viện <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {games.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800"><Gamepad2 className="h-7 w-7" /></div>
              <h4 className="mt-4 font-bold text-slate-800 dark:text-slate-100">Chưa có bản lưu nào</h4>
              <p className="mt-1 text-sm text-slate-500">Tải bản lưu đầu tiên để bắt đầu bảo vệ dữ liệu game.</p>
              <button onClick={handleOpenNew} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700">Tải lên ngay</button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {games.slice(0, 5).map((game, index) => (
                <motion.article key={game.id} initial={reduceMotion ? false : { opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduceMotion ? 0 : 0.18 + index * 0.055 }} className="group/row flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50 sm:px-5 dark:hover:bg-slate-800/60">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-transform duration-300 group-hover/row:scale-110 group-hover/row:rotate-3 dark:bg-indigo-500/10 dark:text-indigo-300"><Gamepad2 className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{game.gameName}</p>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-black text-slate-500 dark:bg-slate-800">v{game.latestSave?.version || game.versions}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{game.category} · {formatDateTime(game.latestSave?.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => handleOpenHistory(game)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800" aria-label={`Xem lịch sử ${game.gameName}`}><History className="h-4 w-4" /></button>
                    {game.latestSave && <button onClick={() => handleDownload(game.latestSave!.id)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10" aria-label={`Tải xuống ${game.gameName}`}><Download className="h-4 w-4" /></button>}
                  </div>
                </motion.article>
              ))}
            </div>
          )}
        </motion.section>

        <motion.section {...reveal(0.18)} whileHover={reduceMotion ? undefined : { y: -2 }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-black/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Đồng bộ thư mục</h3>
              <p className="mt-1 text-xs text-slate-500">Theo dõi thư mục save trên trình duyệt</p>
            </div>
            <div className={`rounded-full px-2.5 py-1 text-[10px] font-black ${autoSyncEnabled && directoryConnected ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
              {autoSyncEnabled && directoryConnected ? 'ĐANG BẬT' : 'CHƯA BẬT'}
            </div>
          </div>
          <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white">
            <div className="flex items-center gap-3">
              <motion.div animate={isSyncing && !reduceMotion ? { boxShadow: ['0 0 0 0 rgba(99,102,241,0)', '0 0 0 8px rgba(99,102,241,0.16)', '0 0 0 0 rgba(99,102,241,0)'] } : undefined} transition={{ duration: 1.8, repeat: Infinity }} className={`flex h-10 w-10 items-center justify-center rounded-xl ${isSyncing ? 'bg-indigo-500' : 'bg-white/10'}`}>
                {isSyncing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <FolderSync className="h-5 w-5" />}
              </motion.div>
              <div className="min-w-0">
                <p className="text-xs font-bold">{isSyncing ? 'Đang quét và tải dữ liệu' : directoryConnected ? 'Thư mục đã được kết nối' : 'Chưa chọn thư mục nguồn'}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">Lần cuối: {formatDateTime(lastSyncTime)}</p>
              </div>
            </div>
            {uploadProgress !== null && (
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-[10px] font-bold text-slate-300"><span>Tiến trình upload</span><span>{uploadProgress}%</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}><motion.div className="relative h-full overflow-hidden rounded-full bg-indigo-400" initial={false} animate={{ width: `${uploadProgress}%` }} transition={{ duration: reduceMotion ? 0 : 0.45, ease: 'easeOut' }}><div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/45 to-transparent motion-safe:animate-pulse" /></motion.div></div>
              </div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={handleSelectDirectory} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><FolderSync className="h-4 w-4" /> {directoryConnected ? 'Đổi thư mục' : 'Chọn thư mục'}</button>
            <button onClick={performSync} disabled={!directoryConnected || isSyncing} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} /> Đồng bộ ngay</button>
          </div>
          <button onClick={() => setActiveTab('settings')} className="mt-3 inline-flex w-full items-center justify-center gap-2 py-1 text-[11px] font-bold text-slate-500 hover:text-indigo-600"><Settings2 className="h-3.5 w-3.5" /> Cấu hình chu kỳ đồng bộ</button>
        </motion.section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <motion.section {...reveal(0.24)} whileHover={reduceMotion ? undefined : { y: -2 }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-black/20">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Thiết bị & khôi phục</h3>
              <p className="mt-0.5 text-xs text-slate-500">Sức khỏe agent và các lệnh gần nhất</p>
            </div>
            {activeRestores.length > 0 && <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-black text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{activeRestores.length} ĐANG CHẠY</span>}
          </div>
          {devices.length === 0 ? (
            <button onClick={() => setActiveTab('devices')} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:hover:bg-slate-800">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800"><Laptop className="h-5 w-5" /></div>
              <div><p className="text-sm font-bold text-slate-800 dark:text-slate-100">Liên kết thiết bị đầu tiên</p><p className="mt-0.5 text-xs text-slate-500">Cài Windows Agent để khôi phục từ xa</p></div>
            </button>
          ) : (
            <div className="space-y-2">
              {devices.slice(0, 4).map((device) => {
                const online = agentOnlineMap[device];
                return <motion.div key={device} whileHover={reduceMotion ? undefined : { x: 4 }} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 dark:bg-slate-800/70">
                  <div className={`relative flex h-9 w-9 items-center justify-center rounded-lg ${online ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'}`}>{online && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white motion-safe:animate-pulse dark:ring-slate-900" />}{online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{device}</p><p className={`mt-0.5 text-[10px] ${online ? 'text-emerald-600' : 'text-slate-500'}`}>{online ? 'Agent trực tuyến' : 'Agent ngoại tuyến'}</p></div>
                </motion.div>;
              })}
            </div>
          )}
          <button onClick={() => setActiveTab('devices')} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-600">Quản lý thiết bị <ArrowRight className="h-3.5 w-3.5" /></button>
        </motion.section>

        <motion.section {...reveal(0.3)} whileHover={reduceMotion ? undefined : { y: -2 }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-black/20">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Hoạt động đồng bộ</h3>
              <p className="mt-0.5 text-xs text-slate-500">Nhật ký mới nhất từ web và agent</p>
            </div>
            <Clock3 className="h-4 w-4 text-slate-400" />
          </div>
          {syncLogs.length === 0 ? (
            <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-xs text-slate-500 dark:bg-slate-800">Chưa có hoạt động đồng bộ.</div>
          ) : (
            <div className="space-y-3">
              {syncLogs.slice(0, 5).map((log, index) => {
                const isError = log.status?.toLowerCase() === 'error';
                return <motion.div key={log.id || index} initial={reduceMotion ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduceMotion ? 0 : 0.34 + index * 0.05 }} className="flex gap-3">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isError ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10'}`}>{isError ? <RefreshCw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{log.message || 'Hoạt động đồng bộ'}</p><p className="mt-0.5 text-[10px] text-slate-400">{log.device_name || log.deviceName || 'Hệ thống'} · {formatDateTime(log.created_at || log.createdAt)}</p></div>
                </motion.div>;
              })}
            </div>
          )}
          {(latestActivity || latestGame) && <p className="mt-4 border-t border-slate-100 pt-3 text-[10px] text-slate-400 dark:border-slate-800">Cập nhật gần nhất: {formatDateTime(latestActivity?.created_at || latestActivity?.createdAt || latestGame?.latestSave?.createdAt)}</p>}
        </motion.section>
      </div>
    </motion.div>
  );
};

export default OverviewTab;
