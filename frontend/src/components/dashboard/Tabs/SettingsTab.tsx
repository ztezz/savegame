import React, { useEffect, useRef, useState } from 'react';
import { Shield, RefreshCw, Monitor, Server, UploadCloud, Download, CheckCircle2, AlertCircle, Save, FolderOpen, HardDrive, MessageCircle, SlidersHorizontal, Bot, File, Gauge, Loader2, Timer, X } from 'lucide-react';
import { motion } from 'motion/react';
import api from '../../../utils/api';
import { API_ORIGIN, uploadLargeFile } from '../../../utils/api';
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
  drive: { defaultQuotaMb: 20480 },
  ui: { compactMode: false, language: 'vi', showAdvancedStats: true },
  technical: { smtpHost: '', smtpPort: 587, smtpSecure: false, backupEnabled: false },
  ai: { enabled: false, provider: '9router', apiKey: '', model: 'cx/gpt-5.5', botName: 'Mây Mặn', baseUrl: 'https://api.9router.com/v1', humorLevel: 'funny' },
  windowsAgent: { filename: 'Cloudsave.exe', version: '', size: 0, sha256: '', downloadUrl: '', updatedAt: null, available: false }
};

type SettingsSection = 'core' | 'drive' | 'agent' | 'operations' | 'ai' | 'chat';

const formatFileSize = (size: number) => {
  if (!size) return '0 MB';
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

interface AgentUploadStats {
  uploadedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  etaSeconds: number | null;
  phase: 'uploading' | 'finalizing';
}

const formatUploadSpeed = (bytesPerSecond: number) => {
  if (!bytesPerSecond) return 'Đang đo...';
  return bytesPerSecond < 1024 * 1024
    ? `${Math.round(bytesPerSecond / 1024)} KB/s`
    : `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
};

const formatUploadEta = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return 'Đang tính...';
  if (seconds < 60) return `Khoảng ${seconds} giây`;
  return `Khoảng ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const SettingsTab: React.FC<SettingsTabProps> = ({
  autoSyncEnabled, setAutoSyncEnabled, directoryHandle, handleSelectDirectory, syncInterval, setSyncInterval, currentUser
}) => {
  const { showToast } = useToast();
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin' || currentUser?.username === 'admin';
  const [settings, setSettings] = useState<any>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [agentFile, setAgentFile] = useState<File | null>(null);
  const [agentVersion, setAgentVersion] = useState('');
  const [agentUploading, setAgentUploading] = useState(false);
  const [agentUploadProgress, setAgentUploadProgress] = useState(0);
  const [agentUploadStats, setAgentUploadStats] = useState<AgentUploadStats | null>(null);
  const [agentDragging, setAgentDragging] = useState(false);
  const agentUploadAbortRef = useRef<AbortController | null>(null);
  const [storageUsage, setStorageUsage] = useState<any>(null);
  const [cleanupPreview, setCleanupPreview] = useState<any>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [chatStats, setChatStats] = useState<any>(null);
  const [chatKeepLatest, setChatKeepLatest] = useState(10000);
  const [chatManaging, setChatManaging] = useState(false);
  const [chatBans, setChatBans] = useState<any[]>([]);
  const [chatUsers, setChatUsers] = useState<any[]>([]);
  const [banUserId, setBanUserId] = useState('');
  const [banDurationMinutes, setBanDurationMinutes] = useState(60);
  const [banReason, setBanReason] = useState('');
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<any>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>('core');

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
          const storage = await api.get('/system/storage');
          setStorageUsage(storage.data);
          const chat = await api.get('/community/stats');
          setChatStats(chat.data);
          const bans = await api.get('/community/bans');
          setChatBans(bans.data || []);
          const users = await api.get('/users');
          setChatUsers(users.data || []);
        } catch {
          showToast('Không tải được dữ liệu quản trị', 'warning');
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

  const testAiModel = async () => {
    if (!isAdmin || aiTesting) return;
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await api.post('/system/ai/test', { ai: settings.ai });
      setAiTestResult(res.data);
      showToast(`Test AI thành công: ${res.data.latencyMs}ms`, 'success');
    } catch (err: any) {
      const message = err.response?.data?.error || 'Test model thất bại';
      setAiTestResult({ success: false, error: message, status: err.response?.data?.status, rawPreview: err.response?.data?.rawPreview });
      showToast(message, 'error', 5000);
    } finally {
      setAiTesting(false);
    }
  };

  const uploadWindowsAgent = async () => {
    if (!isAdmin || !agentFile) return;
    if (!agentFile.name.toLowerCase().endsWith('.exe')) {
      showToast('Chỉ hỗ trợ file .exe cho CloudSave Agent', 'error');
      return;
    }

    setAgentUploading(true);
    setAgentUploadProgress(0);
    setAgentUploadStats({ uploadedBytes: 0, totalBytes: agentFile.size, bytesPerSecond: 0, etaSeconds: null, phase: 'uploading' });
    const controller = new AbortController();
    agentUploadAbortRef.current = controller;
    try {
      const result = await uploadLargeFile(
        '/system/agent/windows/upload',
        agentFile,
        { version: agentVersion.trim() },
        (progress, stats) => {
          setAgentUploadProgress(progress);
          if (stats) setAgentUploadStats(stats);
        },
        controller.signal,
      );
      setSettings((s: any) => ({ ...s, windowsAgent: result.windowsAgent || s.windowsAgent }));
      setAgentFile(null);
      setAgentUploadProgress(100);
      showToast('Đã cập nhật CloudSave Agent', 'success');
    } catch (err: any) {
      const cancelled = controller.signal.aborted;
      showToast(cancelled ? 'Đã hủy upload CloudSave Agent' : err.response?.data?.error || err.message || 'Cập nhật CloudSave Agent thất bại', cancelled ? 'warning' : 'error', 5000);
    } finally {
      setAgentUploading(false);
      setAgentUploadStats(null);
      agentUploadAbortRef.current = null;
    }
  };

  const selectAgentFile = (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.exe')) {
      showToast('Chỉ hỗ trợ file .exe cho CloudSave Agent', 'error');
      return;
    }
    setAgentFile(file);
  };

  const cancelAgentUpload = () => agentUploadAbortRef.current?.abort();

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
    const bans = await api.get('/community/bans');
    setChatBans(bans.data || []);
  };

  const banChatUser = async () => {
    if (!banUserId) return;
    setChatManaging(true);
    try {
      await api.post('/community/bans', {
        userId: Number(banUserId),
        durationMinutes: banDurationMinutes === 0 ? null : banDurationMinutes,
        reason: banReason.trim(),
      });
      showToast('Đã khóa chat người dùng', 'success');
      setBanUserId('');
      setBanReason('');
      await refreshChatStats();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Khóa chat thất bại', 'error');
    } finally {
      setChatManaging(false);
    }
  };

  const unbanChatUser = async (userId: number) => {
    setChatManaging(true);
    try {
      await api.delete(`/community/bans/${userId}`);
      showToast('Đã mở khóa chat', 'success');
      await refreshChatStats();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Mở khóa chat thất bại', 'error');
    } finally {
      setChatManaging(false);
    }
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

  const settingSections: Array<{ key: SettingsSection; label: string; description: string; icon: any; adminOnly?: boolean }> = [
    { key: 'core', label: 'Cốt lõi', description: 'Bảo mật, giao diện, đồng bộ', icon: Shield },
    { key: 'drive', label: 'Drive', description: 'Quota mặc định', icon: HardDrive },
    { key: 'agent', label: 'Windows Agent', description: 'File tải xuống', icon: UploadCloud },
    { key: 'operations', label: 'Vận hành', description: 'Storage và dọn dẹp', icon: Server, adminOnly: true },
    { key: 'ai', label: 'AI Chat', description: '9router bot', icon: Bot, adminOnly: true },
    { key: 'chat', label: 'Quản trị chat', description: 'Khóa và mở khóa', icon: MessageCircle, adminOnly: true },
  ];

  const visibleSections = settingSections.filter((section) => isAdmin || !section.adminOnly);

  return <div className="admin-dark-surface col-span-12 space-y-6 px-1 sm:px-0">
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-xl shadow-slate-200/60 sm:p-7">
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.45),transparent_55%)]" />
      <div className="relative grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-end">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-indigo-100">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Trung tâm điều khiển
          </div>
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Cài đặt hệ thống</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Quản lý bảo mật, đồng bộ, giao diện và các tác vụ vận hành trong một màn hình rõ ràng hơn.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Quyền truy cập</p>
            <p className="mt-2 font-black text-white">{isAdmin ? 'Quản trị viên' : 'Chỉ xem'}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">CloudSave Agent</p>
            <p className={settings.windowsAgent?.available ? 'mt-2 font-black text-emerald-300' : 'mt-2 font-black text-amber-300'}>{settings.windowsAgent?.available ? 'Sẵn sàng' : 'Thiếu file'}</p>
          </div>
        </div>
      </div>
    </div>

    {!isAdmin && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Bạn đang ở chế độ chỉ xem. Chỉ quản trị viên mới có thể thay đổi cài đặt hệ thống.</div>}

    <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        {visibleSections.map((section) => <button key={section.key} type="button" onClick={() => setActiveSection(section.key)} className={`rounded-2xl border p-4 text-left transition ${activeSection === section.key ? 'border-indigo-200 bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'border-slate-100 bg-slate-50 text-slate-700 hover:border-indigo-100 hover:bg-white'}`}>
          <div className="flex items-center gap-2">
            <section.icon className={`h-4 w-4 ${activeSection === section.key ? 'text-white' : 'text-indigo-600'}`} />
            <span className="text-xs font-black uppercase tracking-widest">{section.label}</span>
          </div>
          <p className={`mt-2 text-[11px] font-semibold ${activeSection === section.key ? 'text-white/75' : 'text-slate-500'}`}>{section.description}</p>
        </button>)}
      </div>
    </div>

    {activeSection === 'core' && <div className="space-y-4">
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-2">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-800"><Shield className="h-4 w-4 text-indigo-600" />Bảo mật và phiên đăng nhập</h3>
            <p className="mt-1 text-xs text-slate-500">Các lớp bảo vệ tài khoản và thời gian duy trì phiên làm việc.</p>
          </div>
          <span className={settings.security.enforceStrongPassword ? 'rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700' : 'rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700'}>{settings.security.enforceStrongPassword ? 'An toàn' : 'Cần chú ý'}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <span>
              <span className="block font-bold text-slate-900">Bắt buộc mật khẩu mạnh</span>
              <span className="mt-1 block text-xs text-slate-500">Giảm rủi ro tài khoản dùng mật khẩu yếu.</span>
            </span>
            <input className="h-5 w-5 accent-indigo-600" type="checkbox" checked={!!settings.security.enforceStrongPassword} disabled={!isAdmin} onChange={(e)=>setSettings((s:any)=>({...s,security:{...s.security,enforceStrongPassword:e.target.checked}}))} />
          </label>
          <label className="rounded-2xl border border-slate-200 p-4 text-sm">
            <span className="font-bold text-slate-900">Session timeout</span>
            <span className="mt-1 block text-xs text-slate-500">Tự đăng xuất sau số phút không hoạt động.</span>
            <div className="mt-3 flex items-center gap-2">
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2 font-bold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 disabled:bg-slate-50" type="number" min="5" value={settings.security.sessionTimeoutMinutes} disabled={!isAdmin} onChange={(e)=>setSettings((s:any)=>({...s,security:{...s.security,sessionTimeoutMinutes:parseInt(e.target.value||'0',10)}}))} />
              <span className="text-xs font-bold text-slate-400">phút</span>
            </div>
          </label>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-800"><Monitor className="h-4 w-4 text-indigo-600" />Giao diện</h3>
        <p className="mt-1 text-xs text-slate-500">Tùy chỉnh trải nghiệm hiển thị cho dashboard.</p>
        <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <span>
            <span className="block font-bold text-slate-900">Chế độ compact</span>
            <span className="mt-1 block text-xs text-slate-500">Thu gọn khoảng cách để hiển thị nhiều dữ liệu hơn.</span>
          </span>
          <input className="h-5 w-5 accent-indigo-600" type="checkbox" checked={!!settings.ui.compactMode} disabled={!isAdmin} onChange={(e)=>setSettings((s:any)=>({...s,ui:{...s.ui,compactMode:e.target.checked}}))} />
        </label>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.8fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-800"><RefreshCw className="h-4 w-4 text-indigo-600" />Đồng bộ dữ liệu</h3>
            <p className="mt-1 text-xs text-slate-500">Tách riêng đồng bộ server và đồng bộ trình duyệt để dễ kiểm soát.</p>
          </div>
          <span className={settings.sync.autoSyncEnabled || autoSyncEnabled ? 'rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-black text-indigo-700' : 'rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500'}>{settings.sync.autoSyncEnabled || autoSyncEnabled ? 'Đang bật' : 'Đang tắt'}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4">
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="block font-bold text-slate-900">Auto sync backend</span>
                <span className="mt-1 block text-xs text-slate-500">Cho phép server tự chạy chu kỳ đồng bộ.</span>
              </span>
              <input className="h-5 w-5 accent-indigo-600" type="checkbox" checked={!!settings.sync.autoSyncEnabled} disabled={!isAdmin} onChange={(e)=>setSettings((s:any)=>({...s,sync:{...s.sync,autoSyncEnabled:e.target.checked}}))} />
            </label>
            <label className="mt-4 block text-sm font-bold text-slate-900">Chu kỳ backend
              <div className="mt-2 flex items-center gap-2">
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 font-bold outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 disabled:bg-slate-50" type="number" min="1" value={settings.sync.syncIntervalMinutes} disabled={!isAdmin} onChange={(e)=>setSettings((s:any)=>({...s,sync:{...s.sync,syncIntervalMinutes:parseInt(e.target.value||'0',10)}}))} />
                <span className="text-xs font-bold text-slate-400">phút</span>
              </div>
            </label>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="block font-bold text-slate-900">Auto sync trình duyệt</span>
                <span className="mt-1 block text-xs text-slate-500">Dùng thư mục cục bộ đang chọn trên máy này.</span>
              </span>
              <input className="h-5 w-5 accent-indigo-600" type="checkbox" checked={autoSyncEnabled} onChange={(e)=>setAutoSyncEnabled(e.target.checked)} />
            </label>
            {autoSyncEnabled && <div className="mt-4 space-y-3">
              <button type="button" onClick={handleSelectDirectory} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700"><FolderOpen className="h-4 w-4" />Chọn thư mục</button>
              <p className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-600">{directoryHandle ? directoryHandle.name : 'Chưa chọn thư mục'}</p>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500"><span>Chu kỳ trình duyệt</span><span>{syncInterval} phút</span></div>
                <input type="range" min="1" max="60" value={syncInterval} onChange={(e)=>setSyncInterval(parseInt(e.target.value, 10))} className="w-full accent-indigo-600" />
              </div>
            </div>}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-800"><Server className="h-4 w-4 text-indigo-600" />Kỹ thuật</h3>
        <p className="mt-1 text-xs text-slate-500">Thông số tích hợp hệ thống.</p>
        <label className="mt-5 block text-sm font-bold text-slate-900">SMTP host
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 disabled:bg-slate-50" value={settings.technical.smtpHost || ''} disabled={!isAdmin} onChange={(e)=>setSettings((s:any)=>({...s,technical:{...s.technical,smtpHost:e.target.value}}))} placeholder="smtp.example.com" />
        </label>
      </div>
    </div>
    </div>}

    {activeSection === 'drive' && <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-800"><HardDrive className="h-4 w-4 text-indigo-600" />Drive cá nhân</h3>
          <p className="mt-1 text-xs text-slate-500">Thiết lập dung lượng tối đa mặc định cho mỗi tài khoản. Quota riêng trong Quản lý người dùng sẽ được ưu tiên hơn giá trị này.</p>
        </div>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-black text-indigo-700">{formatFileSize(Number(settings.drive?.defaultQuotaMb || 0) * 1024 * 1024)}</span>
      </div>
      <label className="mt-5 block text-sm font-bold text-slate-900">Dung lượng Drive mặc định
        <div className="mt-2 flex items-center gap-2">
          <input className="w-full rounded-xl border border-slate-200 px-3 py-2 font-bold outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 disabled:bg-slate-50" type="number" min="1" max="1048576" value={settings.drive?.defaultQuotaMb || 20480} disabled={!isAdmin} onChange={(e)=>setSettings((s:any)=>({...s,drive:{...s.drive,defaultQuotaMb:Math.max(1, parseInt(e.target.value || '1', 10))}}))} />
          <span className="text-xs font-bold text-slate-400">MB</span>
        </div>
      </label>
    </div>}

    {activeSection === 'agent' && <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-800"><UploadCloud className="h-4 w-4 text-indigo-600" />Phần mềm Windows</h3>
          <p className="mt-1 text-xs text-slate-500">Cập nhật file CloudSave Agent để người dùng tải bản mới nhất.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-black">
          {settings.windowsAgent?.available ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-500" />}
          <span className={settings.windowsAgent?.available ? 'text-emerald-700' : 'text-amber-600'}>{settings.windowsAgent?.available ? 'Đã có file' : 'Chưa có file'}</span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-500">Tên file</p>
          <p className="mt-1 truncate font-black text-slate-900">{settings.windowsAgent?.filename || 'Cloudsave.exe'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-500">Phiên bản</p>
          <p className="mt-1 font-black text-slate-900">{settings.windowsAgent?.version || 'Chưa đặt'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-500">Dung lượng</p>
          <p className="mt-1 font-black text-slate-900">{formatFileSize(Number(settings.windowsAgent?.size || 0))}</p>
        </div>
      </div>

      {isAdmin && <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
        <div
          onDragOver={(event) => { event.preventDefault(); if (!agentUploading) setAgentDragging(true); }}
          onDragLeave={() => setAgentDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setAgentDragging(false);
            if (!agentUploading) selectAgentFile(event.dataTransfer.files?.[0] || null);
          }}
          className={`relative rounded-2xl border-2 border-dashed p-6 text-center transition sm:p-8 ${agentDragging ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : agentFile ? 'border-emerald-300 bg-emerald-50/60 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
        >
          <input id="agent-file-upload" className="sr-only" type="file" accept=".exe,application/x-msdownload" disabled={agentUploading} onChange={(event) => { selectAgentFile(event.currentTarget.files?.[0] || null); event.currentTarget.value = ''; }} />
          <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${agentFile ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-indigo-600 shadow-sm'}`}>
            {agentFile ? <File className="h-6 w-6" /> : <UploadCloud className="h-6 w-6" />}
          </div>
          <p className="mt-3 text-sm font-black">{agentFile ? agentFile.name : 'Kéo thả file CloudSave Agent vào đây'}</p>
          <p className="mt-1 text-xs">{agentFile ? `${formatFileSize(agentFile.size)} · Sẵn sàng tải lên` : 'Chỉ nhận một file Windows .exe'}</p>
          {!agentUploading && <label htmlFor="agent-file-upload" className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-indigo-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-indigo-50"><FolderOpen className="h-4 w-4" />{agentFile ? 'Chọn file khác' : 'Chọn file'}</label>}
          {agentFile && !agentUploading && <button type="button" onClick={() => setAgentFile(null)} className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-500" aria-label="Bỏ file đã chọn"><X className="h-4 w-4" /></button>}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block text-sm font-bold text-slate-900">Phiên bản phát hành
            <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50" placeholder="Ví dụ: 1.0.1" value={agentVersion} disabled={agentUploading} onChange={(event)=>setAgentVersion(event.target.value)} />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            {agentUploading && <button type="button" onClick={cancelAgentUpload} className="rounded-xl border border-rose-200 px-4 py-3 text-sm font-black text-rose-600 transition hover:bg-rose-50">Hủy upload</button>}
            <button type="button" onClick={uploadWindowsAgent} disabled={!agentFile || agentUploading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><UploadCloud className="h-4 w-4" />{agentUploading ? (agentUploadStats?.phase === 'finalizing' ? 'Đang xử lý' : `${agentUploadProgress}%`) : 'Cập nhật Agent'}</button>
          </div>
        </div>

        {agentUploading && <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="h-2 overflow-hidden rounded-full bg-indigo-100">
            {agentUploadStats?.phase === 'finalizing'
              ? <motion.div className="h-full w-1/3 rounded-full bg-gradient-to-r from-indigo-400 via-indigo-600 to-violet-500" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }} />
              : <motion.div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" initial={false} animate={{ width: `${agentUploadProgress}%` }} />}
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs font-black text-indigo-700">
            {agentUploadStats?.phase === 'finalizing' ? <><Loader2 className="h-4 w-4 animate-spin" />Đã gửi xong, server đang phát hành bản mới</> : <>Đang tải lên {agentUploadProgress}%</>}
          </div>
          {agentUploadStats && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-3"><p className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400"><Gauge className="h-3 w-3" />Tốc độ</p><p className="mt-1 text-sm font-black text-slate-800">{agentUploadStats.phase === 'finalizing' ? 'Đã tải xong' : formatUploadSpeed(agentUploadStats.bytesPerSecond)}</p></div>
            <div className="rounded-xl bg-white p-3"><p className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400"><Timer className="h-3 w-3" />Còn lại</p><p className="mt-1 text-sm font-black text-slate-800">{agentUploadStats.phase === 'finalizing' ? 'Đang lưu...' : formatUploadEta(agentUploadStats.etaSeconds)}</p></div>
            <div className="col-span-2 rounded-xl bg-white p-3 sm:col-span-1"><p className="text-[10px] font-black uppercase text-slate-400">Đã truyền</p><p className="mt-1 text-sm font-black text-slate-800">{formatFileSize(agentUploadStats.uploadedBytes)} / {formatFileSize(agentUploadStats.totalBytes)}</p></div>
          </div>}
        </div>}
      </div>}
      {settings.windowsAgent?.available && settings.windowsAgent?.downloadUrl && <a href={`${API_ORIGIN}${settings.windowsAgent.downloadUrl}`} className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-100 px-4 py-3 text-sm font-black text-indigo-600 transition hover:bg-indigo-50"><Download className="h-4 w-4" />Tải thử bản hiện tại</a>}
      {settings.windowsAgent?.updatedAt && <p className="mt-3 text-xs text-slate-500">Cập nhật lần cuối: {new Date(settings.windowsAgent.updatedAt).toLocaleString('vi-VN')}</p>}
    </div>}

    {isAdmin && activeSection === 'operations' && <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-800"><HardDrive className="h-4 w-4 text-indigo-600" />Dung lượng lưu trữ</h3>
            <p className="mt-1 text-xs text-slate-500">Theo dõi upload và dọn bản save cũ, mặc định giữ 5 bản mới nhất mỗi game.</p>
          </div>
          <button type="button" onClick={() => runStorageCleanup(true)} disabled={cleanupLoading} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black transition hover:bg-slate-50 disabled:opacity-50">Kiểm tra</button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Tổng dung lượng</p><p className="mt-1 font-black text-slate-900">{formatFileSize(Number(storageUsage?.totalBytes || 0))}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Số file</p><p className="mt-1 font-black text-slate-900">{storageUsage?.fileCount || 0}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Save trong DB</p><p className="mt-1 font-black text-slate-900">{storageUsage?.database?.save_count || 0}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Game/User</p><p className="mt-1 font-black text-slate-900">{storageUsage?.database?.game_count || 0}/{storageUsage?.database?.user_count || 0}</p></div>
        </div>
        {storageUsage?.uploadDir && <p className="mt-4 break-all rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Upload dir: {storageUsage.uploadDir}</p>}
        {cleanupPreview && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">Có {cleanupPreview.candidates} bản save cũ ngoài 5 bản mới nhất mỗi game.{!cleanupPreview.dryRun && ` Đã xóa ${cleanupPreview.deletedFiles} file (${formatFileSize(Number(cleanupPreview.deletedBytes || 0))}).`}</div>}
        {cleanupPreview?.dryRun && cleanupPreview.candidates > 0 && <button type="button" onClick={() => runStorageCleanup(false)} disabled={cleanupLoading} className="mt-4 rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:opacity-50">Xóa các bản save cũ</button>}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-800"><MessageCircle className="h-4 w-4 text-indigo-600" />Quản lý phòng chat</h3>
            <p className="mt-1 text-xs text-slate-500">Theo dõi, dọn dẹp tin nhắn và khóa chat khi cần.</p>
          </div>
          <button type="button" onClick={refreshChatStats} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black transition hover:bg-slate-50">Làm mới</button>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Tổng tin nhắn</p><p className="mt-1 font-black text-slate-900">{chatStats?.message_count || 0}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Người tham gia</p><p className="mt-1 font-black text-slate-900">{chatStats?.user_count || 0}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Tin mới nhất</p><p className="mt-1 truncate font-black text-slate-900">{chatStats?.latest_at ? new Date(chatStats.latest_at).toLocaleString('vi-VN') : 'Chưa có'}</p></div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <label className="block text-sm font-bold text-slate-900">Giữ lại số tin mới nhất
            <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50" type="number" min="0" max="10000" value={chatKeepLatest} onChange={(e)=>setChatKeepLatest(Math.max(0, Math.min(parseInt(e.target.value || '0', 10), 10000)))} />
          </label>
          <button type="button" onClick={cleanupChat} disabled={chatManaging} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Dọn tin cũ</button>
          <button type="button" onClick={clearChat} disabled={chatManaging} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Xóa toàn bộ</button>
        </div>
      </div>
    </div>}

    {isAdmin && activeSection === 'ai' && <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-800"><Bot className="h-4 w-4 text-amber-600" />AI tán gẫu 9router</h3>
          <p className="mt-1 text-xs text-slate-500">Thêm bot vui tính vào phòng chat cộng đồng. API key được lưu trong cài đặt hệ thống và không hiển thị lại sau khi lưu. Sau khi test thành công, bấm Lưu cài đặt hệ thống để bot chat dùng cấu hình này.</p>
        </div>
        <span className={settings.ai?.enabled ? 'rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700' : 'rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500'}>{settings.ai?.enabled ? 'Đang bật' : 'Đang tắt'}</span>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-amber-100 bg-white p-4 text-sm">
          <span>
            <span className="block font-bold text-slate-900">Bật AI trong phòng chat</span>
            <span className="mt-1 block text-xs text-slate-500">Bot sẽ tự trả lời sau mỗi tin nhắn mới nếu cấu hình hợp lệ.</span>
          </span>
          <input className="h-5 w-5 accent-amber-500" type="checkbox" checked={!!settings.ai?.enabled} onChange={(e)=>setSettings((s:any)=>({...s,ai:{...s.ai,enabled:e.target.checked}}))} />
        </label>
        <label className="block rounded-2xl border border-amber-100 bg-white p-4 text-sm font-bold text-slate-900">Tên bot
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-50" value={settings.ai?.botName || ''} onChange={(e)=>setSettings((s:any)=>({...s,ai:{...s.ai,botName:e.target.value}}))} placeholder="Mây Mặn" />
        </label>
        <label className="block rounded-2xl border border-amber-100 bg-white p-4 text-sm font-bold text-slate-900">9router API key
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-50" type="password" value={settings.ai?.apiKey || ''} onChange={(e)=>setSettings((s:any)=>({...s,ai:{...s.ai,apiKey:e.target.value}}))} placeholder="sk-..." />
          <span className="mt-2 block text-xs font-semibold text-slate-500">Nếu đang hiện ******** thì key cũ sẽ được giữ nguyên khi lưu.</span>
        </label>
        <label className="block rounded-2xl border border-amber-100 bg-white p-4 text-sm font-bold text-slate-900">Model
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-50" value={settings.ai?.model || ''} onChange={(e)=>setSettings((s:any)=>({...s,ai:{...s.ai,model:e.target.value}}))} placeholder="cx/gpt-5.5" />
        </label>
        <label className="block rounded-2xl border border-amber-100 bg-white p-4 text-sm font-bold text-slate-900">Base URL
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-50" value={settings.ai?.baseUrl || ''} onChange={(e)=>setSettings((s:any)=>({...s,ai:{...s.ai,baseUrl:e.target.value}}))} placeholder="https://api.9router.com/v1" />
        </label>
        <label className="block rounded-2xl border border-amber-100 bg-white p-4 text-sm font-bold text-slate-900">Độ hài hước
          <select className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-50" value={settings.ai?.humorLevel || 'funny'} onChange={(e)=>setSettings((s:any)=>({...s,ai:{...s.ai,humorLevel:e.target.value}}))}>
            <option value="light">Vui nhẹ</option>
            <option value="funny">Hài hước</option>
            <option value="chaos">Lầy hơn chút</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-black text-slate-900">Kiểm tra model</p>
          <p className="text-xs text-slate-500">Nên bấm test sau khi nhập API key/model. Nếu test lỗi thì bot trong chat cũng sẽ không trả lời.</p>
          {aiTestResult && <p className={aiTestResult.success ? 'mt-2 text-xs font-semibold text-emerald-700' : 'mt-2 text-xs font-semibold text-red-600'}>{aiTestResult.success ? `${aiTestResult.reply} (${aiTestResult.latencyMs}ms)` : aiTestResult.error}</p>}
          {aiTestResult?.rawPreview && <pre className="mt-2 max-h-28 overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] font-semibold text-amber-100">{aiTestResult.rawPreview}</pre>}
        </div>
        <button type="button" onClick={testAiModel} disabled={aiTesting || !settings.ai?.apiKey || !settings.ai?.model} className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-5 py-3 text-sm font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50">{aiTesting ? 'Đang test...' : 'Test model'}</button>
      </div>
    </div>}

    {isAdmin && activeSection === 'chat' && <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Khóa chat người dùng</h3>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_160px_1fr_auto] lg:items-end">
        <label className="block text-sm font-bold text-slate-900">Người dùng
          <select className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50" value={banUserId} onChange={(e)=>setBanUserId(e.target.value)}>
            <option value="">Chọn người dùng</option>
            {chatUsers.filter((user:any) => user.role !== 'Admin').map((user:any) => <option key={user.id} value={user.id}>{user.display_name || user.username} ({user.username})</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold text-slate-900">Thời hạn
          <select className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50" value={banDurationMinutes} onChange={(e)=>setBanDurationMinutes(parseInt(e.target.value, 10))}>
            <option value={15}>15 phút</option>
            <option value={60}>1 giờ</option>
            <option value={1440}>1 ngày</option>
            <option value={10080}>7 ngày</option>
            <option value={0}>Vĩnh viễn</option>
          </select>
        </label>
        <label className="block text-sm font-bold text-slate-900">Lý do
          <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50" value={banReason} onChange={(e)=>setBanReason(e.target.value)} placeholder="Spam, vi phạm nội quy..." />
        </label>
        <button type="button" onClick={banChatUser} disabled={!banUserId || chatManaging} className="rounded-xl bg-amber-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Khóa chat</button>
      </div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <div className="bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500">Đang bị khóa chat</div>
        {chatBans.length === 0 ? <div className="p-4 text-sm text-slate-500">Không có người dùng nào đang bị khóa chat.</div> : <div className="divide-y divide-slate-100">
          {chatBans.map((ban:any) => <div key={ban.user_id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-bold text-slate-800">{ban.display_name || ban.username} <span className="text-xs text-slate-400">@{ban.username}</span></p>
              <p className="text-xs text-slate-500">{ban.banned_until ? `Đến ${new Date(ban.banned_until).toLocaleString('vi-VN')}` : 'Vĩnh viễn'}{ban.reason ? ` · ${ban.reason}` : ''}</p>
            </div>
            <button type="button" onClick={() => unbanChatUser(ban.user_id)} disabled={chatManaging} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-50">Mở khóa</button>
          </div>)}
        </div>}
      </div>
    </div>}

    {isAdmin && <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <p className="font-black text-slate-900">Sẵn sàng lưu thay đổi</p>
        <p className="text-xs text-slate-500">Các thay đổi chỉ áp dụng sau khi bấm lưu.</p>
      </div>
      <button onClick={saveSettings} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:opacity-50 sm:w-auto"><Save className="h-4 w-4" />{saving ? 'Đang lưu...' : 'Lưu cài đặt hệ thống'}</button>
    </div>}

  </div>;
};

export default SettingsTab;

