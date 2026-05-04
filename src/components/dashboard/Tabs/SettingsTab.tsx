import React, { useEffect, useState } from 'react';
import { Shield, RefreshCw, Monitor, Server } from 'lucide-react';
import api from '../../../utils/api';
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
  technical: { smtpHost: '', smtpPort: 587, smtpSecure: false, backupEnabled: false }
};

const SettingsTab: React.FC<SettingsTabProps> = ({
  autoSyncEnabled, setAutoSyncEnabled, directoryHandle, handleSelectDirectory, syncInterval, setSyncInterval, currentUser
}) => {
  const { showToast } = useToast();
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin' || currentUser?.username === 'admin';
  const [settings, setSettings] = useState<any>(defaultSettings);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/system/settings');
        setSettings({ ...defaultSettings, ...res.data });
      } catch {
        showToast('Không tải được cài đặt hệ thống', 'error');
      }
      if (isAdmin) {
        try {
          const logs = await api.get('/system/audit-logs?limit=20');
          setAuditLogs(logs.data || []);
        } catch {
          showToast('Không tải được audit logs', 'warning');
        }
      }
    };
    load();
  }, [isAdmin, showToast]);

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
        <label className="block text-sm">Chu k? Đồng bộ (ph?t)
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
    </div>

    {isAdmin && <button onClick={saveSettings} disabled={saving} className="w-full sm:w-auto px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold">{saving ? 'Đang lưu...' : 'Lưu cài đặt hệ thống'}</button>}

    {isAdmin && <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-3">Audit logs</h3>
      <div className="space-y-2 max-h-64 overflow-auto">
        {auditLogs.map((log:any)=><div key={log.id} className="text-xs border-b pb-2"><b>{log.action}</b> {log.resource} - {log.username || 'system'} - {new Date(log.created_at).toLocaleString('vi-VN')}</div>)}
      </div>
    </div>}
  </div>;
};

export default SettingsTab;
