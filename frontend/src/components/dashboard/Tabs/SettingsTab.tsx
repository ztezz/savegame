import React, { useEffect, useState } from 'react';
import { Shield, RefreshCw, Monitor, Server, UploadCloud, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../../../utils/api';
import { API_ORIGIN, uploadWithProgress } from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';

interface SettingsTabProps {
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (enabled: boolean) => void;
  directoryHandle: any;
  handleSelectDirectory: () => void;
  syncInterval: number;
  setSyncInterval: (interval: number) => void;
  currentUser: any;
}

const defaultSettings = {
  security: { enforceStrongPassword: true, sessionTimeoutMinutes: 120, allowSelfRegister: false },
  sync: { autoSyncEnabled: false, syncIntervalMinutes: 5, maxUploadSizeMb: 2048, retentionDays: 30, retryLimit: 2 },
  ui: { compactMode: false, language: 'vi', showAdvancedStats: true },
  technical: { smtpHost: '', smtpPort: 587, smtpSecure: false, backupEnabled: false },
  windowsAgent: { filename: 'Cloudsave.exe', version: '', size: 0, updatedAt: null, available: false }
};

const AGENT_DOWNLOAD_URL = `${API_ORIGIN}/api/agent/download`;

const formatFileSize = (size: number) => {
  if (!size) return '0 MB';
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const SettingsTab: React.FC<SettingsTabProps> = ({
  autoSyncEnabled, setAutoSyncEnabled, directoryHandle, handleSelectDirectory, syncInterval, setSyncInterval, currentUser
}) => {
  const { showToast } = useToast();
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin' || currentUser?.username === 'admin';
  const [settings, setSettings] = useState<any>(defaultSettings);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [agentFile, setAgentFile] = useState<File | null>(null);
  const [agentVersion, setAgentVersion] = useState('');
  const [agentUploading, setAgentUploading] = useState(false);
  const [agentUploadProgress, setAgentUploadProgress] = useState(0);
  const [storageUsage, setStorageUsage] = useState<any>(null);
  const [cleanupPreview, setCleanupPreview] = useState<any>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [chatStats, setChatStats] = useState<any>(null);
  const [chatKeepLatest, setChatKeepLatest] = useState(200);
  const [chatManaging, setChatManaging] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/system/settings');
        setSettings({ ...defaultSettings, ...res.data });
        setAgentVersion(res.data?.windowsAgent?.version || '');
      } catch {
        showToast('Không tải được cài đặt hệ thống', 'error');
      }
      if (isAdmin) {
        try {
          const logs = await api.get('/system/audit-logs?limit=20');
          setAuditLogs(logs.data || []);
          const storage = await api.get('/system/storage');
          setStorageUsage(storage.data);
          const chat = await api.get('/community/stats');
          setChatStats(chat.data);
        } catch {
          showToast('Không tải được dữ liệu quản trị', 'warning');
        }
      }
    };
    load();
  }, [isAdmin, showToast]);

  const formatAuditDetail = (detail: any) => {
    if (!detail) return '';
    const items: string[] = [];
    if (detail.method) items.push(String(detail.method));
    if (typeof detail.statusCode === 'number') items.push(`HTTP ${detail.statusCode}`);
    if (typeof detail.durationMs === 'number') items.push(`${detail.durationMs}ms`);
    if (detail.ip) items.push(`IP ${detail.ip}`);
    if (detail.reason) items.push(`reason=${detail.reason}`);
    if (Array.isArray(detail.keys) && detail.keys.length > 0) items.push(`keys=${detail.keys.join(',')}`);
    return items.join(' | ');
  };

  const saveSettings = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      await api.put('/system/settings', settings);
      showToast('Lưu cài đặt thành công', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Lưu cài đặt thất bại', 'error');
    } finally {
      setSaving(false);
    }
  };

  const uploadWindowsAgent = async () => {
    if (!isAdmin || !agentFile) return;
    if (!agentFile.name.toLowerCase().endsWith('.exe')) {
      showToast('Chỉ hỗ trợ file .exe cho CloudSave Agent', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('agentFile', agentFile);
    formData.append('version', agentVersion.trim());

    setAgentUploading(true);
    setAgentUploadProgress(0);
    try {
      const result = await uploadWithProgress('/system/agent/windows', formData, setAgentUploadProgress);
      setSettings((s: any) => ({ ...s, windowsAgent: result.windowsAgent || s.windowsAgent }));
      setAgentFile(null);
      setAgentUploadProgress(100);
      showToast('Đã cập nhật CloudSave Agent', 'success');
    } catch (err: any) {
      showToast(err.message || 'Cập nhật CloudSave Agent thất bại', 'error');
    } finally {
      setAgentUploading(false);
    }
  };

  const runStorageCleanup = async (dryRun: boolean) => {
    if (!isAdmin) return;
    setCleanupLoading(true);
    try {
      const res = await api.post('/system/storage/cleanup', { keepLatest: 5, dryRun });
      setCleanupPreview(res.data);
      if (dryRun) {
        showToast(`Tìm thấy ${res.data.candidates} bản save cũ có thể dọn`, 'info');
      } else {
        showToast(`Đã dọn ${res.data.deletedFiles} file save cũ`, 'success');
        const storage = await api.get('/system/storage');
        setStorageUsage(storage.data);
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Dọn dẹp storage thất bại', 'error');
    } finally {
      setCleanupLoading(false);
    }
  };

  const refreshChatStats = async () => {
    const chat = await api.get('/community/stats');
    setChatStats(chat.data);
  };

  const cleanupChat = async () => {
    if (!isAdmin) return;
    setChatManaging(true);
    try {
      const res = await api.post('/community/cleanup', { keepLatest: chatKeepLatest });
      showToast(`Đã dọn ${res.data.deleted} tin nhắn cũ`, 'success');
      await refreshChatStats();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Dọn phòng chat thất bại', 'error');
    } finally {
      setChatManaging(false);
    }
  };

  const clearChat = async () => {
    if (!isAdmin || !window.confirm('Xóa toàn bộ tin nhắn trong phòng chat cộng đồng?')) return;
    setChatManaging(true);
    try {
      await api.delete('/community/messages');
      showToast('Đã xóa toàn bộ phòng chat', 'success');
      await refreshChatStats();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa phòng chat thất bại', 'error');
    } finally {
      setChatManaging(false);
    }
  };

  return <div className="col-span-12 space-y-6 px-1 sm:px-0">
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><Shield className="w-4 h-4" />Bảo mật</h3>
        <label className="flex items-center justify-between text-sm"><span>Bắt buộc mật khẩu mạnh</span><input type="checkbox" checked={!!settings.security.enforceStrongPassword} disabled={!isAdmin} onChange={(e)=>setSettings((s:any)=>({...s,security:{...s.security,enforceStrongPassword:e.target.checked}}))} /></label>
        <label className="block text-sm">Session timeout (phút)
          <input className="w-full mt-1 border rounded-lg px-3 py-2" type="number" value={settings.security.sessionTimeoutMinutes} disabled={!isAdmin} onChange={(e)=>setSettings((s:any)=>({...s,security:{...s.security,sessionTimeoutMinutes:parseInt(e.target.value||'0',10)}}))} />
        </label>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><RefreshCw className="w-4 h-4" />Đồng bộ</h3>
        <label className="flex items-center justify-between text-sm"><span>Auto sync backend</span><input type="checkbox" checked={!!settings.sync.autoSyncEnabled} disabled={!isAdmin} onChange={(e)=>setSettings((s:any)=>({...s,sync:{...s.sync,autoSyncEnabled:e.target.checked}}))} /></label>
        <label className="block text-sm">Chu kỳ Đồng bộ (phút)
          <input className="w-full mt-1 border rounded-lg px-3 py-2" type="number" value={settings.sync.syncIntervalMinutes} disabled={!isAdmin} onChange={(e)=>setSettings((s:any)=>({...s,sync:{...s.sync,syncIntervalMinutes:parseInt(e.target.value||'0',10)}}))} />
        </label>
        <div className="pt-2 border-t">
          <p className="text-xs font-bold mb-2">Auto sync trên trình duyệt</p>
          <div className="flex items-center justify-between"><span className="text-sm">Bật auto sync</span><input type="checkbox" checked={autoSyncEnabled} onChange={(e)=>setAutoSyncEnabled(e.target.checked)} /></div>
          {autoSyncEnabled && <div className="mt-2 space-y-2">
            <button type="button" onClick={handleSelectDirectory} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs">Chọn thư mục</button>
            <p className="text-xs text-slate-500">{directoryHandle ? directoryHandle.name : 'Chưa chọn thư mục'}</p>
            <input type="range" min="1" max="60" value={syncInterval} onChange={(e)=>setSyncInterval(parseInt(e.target.value, 10))} className="w-full" />
          </div>}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><Monitor className="w-4 h-4" />Giao diện</h3>
        <label className="flex items-center justify-between text-sm"><span>Chế độ compact</span><input type="checkbox" checked={!!settings.ui.compactMode} disabled={!isAdmin} onChange={(e)=>setSettings((s:any)=>({...s,ui:{...s.ui,compactMode:e.target.checked}}))} /></label>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><Server className="w-4 h-4" />Kỹ thuật</h3>
        <label className="block text-sm">SMTP host
          <input className="w-full mt-1 border rounded-lg px-3 py-2" value={settings.technical.smtpHost || ''} disabled={!isAdmin} onChange={(e)=>setSettings((s:any)=>({...s,technical:{...s.technical,smtpHost:e.target.value}}))} />
        </label>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 xl:col-span-2">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><UploadCloud className="w-4 h-4" />Phần mềm Windows</h3>
            <p className="text-xs text-slate-500 mt-1">Cập nhật file CloudSave Agent để người dùng tải bản mới nhất.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold">
            {settings.windowsAgent?.available ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
            <span className={settings.windowsAgent?.available ? 'text-emerald-700' : 'text-amber-600'}>{settings.windowsAgent?.available ? 'Đã có file' : 'Chưa có file'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Tên file</p>
            <p className="font-bold text-slate-800 truncate">{settings.windowsAgent?.filename || 'Cloudsave.exe'}</p>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Phiên bản</p>
            <p className="font-bold text-slate-800">{settings.windowsAgent?.version || 'Chưa đặt'}</p>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Dung lượng</p>
            <p className="font-bold text-slate-800">{formatFileSize(Number(settings.windowsAgent?.size || 0))}</p>
          </div>
        </div>

        {settings.windowsAgent?.updatedAt && <p className="text-xs text-slate-500">Cập nhật lần cuối: {new Date(settings.windowsAgent.updatedAt).toLocaleString('vi-VN')}</p>}

        {isAdmin && <div className="grid grid-cols-1 lg:grid-cols-[1fr_180px_auto] gap-3 items-end pt-2 border-t border-slate-100">
          <label className="block text-sm">File CloudSave Agent (.exe)
            <input className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" type="file" accept=".exe,application/x-msdownload" disabled={agentUploading} onChange={(e)=>setAgentFile(e.target.files?.[0] || null)} />
          </label>
          <label className="block text-sm">Version
            <input className="w-full mt-1 border rounded-lg px-3 py-2" placeholder="1.0.1" value={agentVersion} disabled={agentUploading} onChange={(e)=>setAgentVersion(e.target.value)} />
          </label>
          <button type="button" onClick={uploadWindowsAgent} disabled={!agentFile || agentUploading} className="px-5 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">{agentUploading ? `Đang tải ${agentUploadProgress}%` : 'Cập nhật file'}</button>
        </div>}

        {agentUploading && <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${agentUploadProgress}%` }} /></div>}

        {settings.windowsAgent?.available && <a href={AGENT_DOWNLOAD_URL} className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800"><Download className="w-4 h-4" />Tải thử CloudSave Agent</a>}
      </div>

      {isAdmin && <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 xl:col-span-2">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><Server className="w-4 h-4" />Dung lượng lưu trữ</h3>
            <p className="text-xs text-slate-500 mt-1">Theo dõi thư mục upload và dọn bản save cũ. Mặc định giữ 5 bản mới nhất mỗi game.</p>
          </div>
          <button type="button" onClick={() => runStorageCleanup(true)} disabled={cleanupLoading} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold disabled:opacity-50">Kiểm tra dọn dẹp</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Tổng dung lượng</p>
            <p className="font-bold text-slate-800">{formatFileSize(Number(storageUsage?.totalBytes || 0))}</p>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Số file</p>
            <p className="font-bold text-slate-800">{storageUsage?.fileCount || 0}</p>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Save trong DB</p>
            <p className="font-bold text-slate-800">{storageUsage?.database?.save_count || 0}</p>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Game/User</p>
            <p className="font-bold text-slate-800">{storageUsage?.database?.game_count || 0}/{storageUsage?.database?.user_count || 0}</p>
          </div>
        </div>

        {storageUsage?.uploadDir && <p className="text-xs text-slate-500 break-all">Upload dir: {storageUsage.uploadDir}</p>}

        {cleanupPreview && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Có {cleanupPreview.candidates} bản save cũ ngoài 5 bản mới nhất mỗi game.
          {!cleanupPreview.dryRun && ` Đã xóa ${cleanupPreview.deletedFiles} file (${formatFileSize(Number(cleanupPreview.deletedBytes || 0))}).`}
        </div>}

        {cleanupPreview?.dryRun && cleanupPreview.candidates > 0 && <button type="button" onClick={() => runStorageCleanup(false)} disabled={cleanupLoading} className="px-5 py-3 bg-red-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">Xóa các bản save cũ</button>}
      </div>}

      {isAdmin && <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 xl:col-span-2">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><Monitor className="w-4 h-4" />Quản lý phòng chat</h3>
            <p className="text-xs text-slate-500 mt-1">Theo dõi và dọn dẹp tin nhắn trong phòng chat cộng đồng.</p>
          </div>
          <button type="button" onClick={refreshChatStats} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold">Làm mới</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Tổng tin nhắn</p>
            <p className="font-bold text-slate-800">{chatStats?.message_count || 0}</p>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Người tham gia</p>
            <p className="font-bold text-slate-800">{chatStats?.user_count || 0}</p>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Tin mới nhất</p>
            <p className="font-bold text-slate-800">{chatStats?.latest_at ? new Date(chatStats.latest_at).toLocaleString('vi-VN') : 'Chưa có'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end pt-2 border-t border-slate-100">
          <label className="block text-sm">Giữ lại số tin mới nhất
            <input className="w-full mt-1 border rounded-lg px-3 py-2" type="number" min="0" max="5000" value={chatKeepLatest} onChange={(e)=>setChatKeepLatest(parseInt(e.target.value || '0', 10))} />
          </label>
          <button type="button" onClick={cleanupChat} disabled={chatManaging} className="px-5 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold disabled:opacity-50">Dọn tin cũ</button>
          <button type="button" onClick={clearChat} disabled={chatManaging} className="px-5 py-3 bg-red-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">Xóa toàn bộ</button>
        </div>
      </div>}
    </div>

    {isAdmin && <button onClick={saveSettings} disabled={saving} className="w-full sm:w-auto px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold">{saving ? 'Đang lưu...' : 'Lưu cài đặt hệ thống'}</button>}

    {isAdmin && <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-3">Audit logs</h3>
      <div className="space-y-2 max-h-64 overflow-auto">
        {auditLogs.map((log: any) => (
          <div key={log.id} className="text-xs border-b pb-2">
            <b>{log.action}</b> {log.resource} - {log.username || 'system'} - {new Date(log.created_at).toLocaleString('vi-VN')}
            {log.detail_json && (
              <div className="text-[11px] text-slate-500 mt-1">{formatAuditDetail(log.detail_json)}</div>
            )}
          </div>
        ))}
      </div>
    </div>}
  </div>;
};

export default SettingsTab;

