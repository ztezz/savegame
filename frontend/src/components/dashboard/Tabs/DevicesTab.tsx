
import React, { useEffect, useState } from 'react';
import { Laptop, Plus, Trash2, Copy, Check, RefreshCw, ChevronDown, ChevronUp, Download, Monitor, AlertTriangle } from 'lucide-react';
import api from '../../../utils/api';
import { API_ORIGIN } from '../../../utils/api';
import { deviceKeysApi } from '../../../utils/apiClient';
import { useToast } from '../../../context/ToastContext';

interface AgentInfo {
  version: string;
  available: boolean;
  filename: string;
  size: number;
  sha256: string | null;
  downloadUrl: string | null;
}

const AGENT_INFO_URL = `${API_ORIGIN}/api/agent/info`;

interface DeviceKey {
  id: number;
  device_name: string;
  key_preview: string;
  note: string | null;
  created_at: string;
  last_used_at: string | null;
  last_seen: string | null;
  is_online: boolean;
}

const DevicesTab: React.FC = () => {
  const { showToast } = useToast();
  const [keys, setKeys] = useState<DeviceKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([]);

  // Import form (agent-generated key — primary flow)
  const [importDevice, setImportDevice] = useState('');
  const [importKey, setImportKey] = useState('');
  const [importing, setImporting] = useState(false);

  // Generate form (server-generated key — advanced/secondary)
  const [showGenerate, setShowGenerate] = useState(false);
  const [genDevice, setGenDevice] = useState('');
  const [genNote, setGenNote] = useState('');
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await api.get('/device-keys');
      setKeys(Array.isArray(res.data) ? res.data : []);
      setSelectedIds([]);
    } catch {
      showToast('❌ Không thể tải danh sách device key', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await api.get('/device-keys');
      setKeys(Array.isArray(res.data) ? res.data : []);
      setSelectedIds([]);
      showToast('✅ Đã làm mới danh sách thiết bị', 'success');
    } catch {
      showToast('❌ Không thể làm mới danh sách', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchKeys();
    // Fetch agent download info (no auth required)
    fetch(AGENT_INFO_URL)
      .then(r => r.ok ? r.json() : null)
      .then((data: AgentInfo | null) => { if (data) setAgentInfo(data); })
      .catch(() => {});
  }, []);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importDevice.trim() || !importKey.trim()) return;
    setImporting(true);
    try {
      await api.post('/device-keys/import', { device_name: importDevice.trim(), api_key: importKey.trim() });
      showToast('✅ Đã đăng ký thiết bị thành công', 'success');
      setImportDevice('');
      setImportKey('');
      fetchKeys();
    } catch (err: any) {
      showToast(err.response?.data?.error || '❌ Đăng ký thất bại', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genDevice.trim()) return;
    setGenerating(true);
    try {
      const res = await api.post('/device-keys', { device_name: genDevice.trim(), note: genNote.trim() || undefined });
      setNewKey(res.data.api_key);
      setGenDevice('');
      setGenNote('');
      fetchKeys();
    } catch (err: any) {
      showToast(err.response?.data?.error || '❌ Tạo key thất bại', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id: number, name: string) => {
    setPendingDeleteIds([id]);
    setSelectedIds([id]);
    showToast(`Chuẩn bị thu hồi key của ${name}. Nhấn "Xóa đã chọn" để xác nhận.`, 'info', 3500);
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds((current) => current.length === filteredKeys.length ? [] : filteredKeys.map((key) => key.id));
  };

  const handleBulkRevoke = async () => {
    const ids = pendingDeleteIds.length > 0 ? pendingDeleteIds : selectedIds;
    if (ids.length === 0) return;

    setBulkDeleting(true);
    try {
      const res = await deviceKeysApi.deleteMany(ids);
      const deleted = res.deleted ?? ids.length;
      showToast(`✅ Đã thu hồi ${deleted} thiết bị`, 'success');
      setSelectedIds([]);
      setPendingDeleteIds([]);
      fetchKeys();
    } catch (err: any) {
      showToast(err.response?.data?.error || '❌ Xóa thiết bị đã chọn thất bại', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('✅ Đã copy', 'success');
    } catch {
      showToast('❌ Copy thất bại', 'error');
    }
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('vi-VN') : '—';

  const filteredKeys = keys.filter((key) => {
    if (statusFilter === 'online') return key.is_online;
    if (statusFilter === 'offline') return !key.is_online;
    return true;
  });
  const onlineCount = keys.filter((key) => key.is_online).length;
  const offlineCount = keys.length - onlineCount;
  const allSelected = filteredKeys.length > 0 && selectedIds.length === filteredKeys.length;
  const partiallySelected = selectedIds.length > 0 && !allSelected;

  return (
    <div className="col-span-12 space-y-6">

      {/* Download card */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
              <Monitor className="w-6 h-6 text-sky-300" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Phần mềm Windows</p>
              <h3 className="font-black text-white text-base leading-tight">CloudSave Agent</h3>
              <p className="text-xs text-slate-400 mt-1">
                Chạy ngầm trên Windows — tự động đồng bộ game save lên server.
              </p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded text-slate-300">
                  v{agentInfo?.version ?? '...'}
                </span>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Monitor className="w-3 h-3" /> Windows x64 · .exe
                </span>
                {agentInfo && !agentInfo.available && (
                  <span className="text-[10px] text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Chưa có file trên server
                  </span>
                )}
              </div>
            </div>
          </div>

          <a
            href={agentInfo?.available && agentInfo.downloadUrl ? `${API_ORIGIN}${agentInfo.downloadUrl}` : undefined}
            download="restore_agent.exe"
            className={
              `flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all shrink-0 ` +
              (!agentInfo?.available || !agentInfo.downloadUrl
                ? 'bg-slate-600 text-slate-400 cursor-not-allowed pointer-events-none'
                : 'bg-sky-500 hover:bg-sky-400 text-white shadow-md hover:shadow-sky-500/30')
            }
            onClick={e => { if (!agentInfo?.available || !agentInfo.downloadUrl) e.preventDefault(); }}
          >
            <Download className="w-4 h-4" />
            Tải về
          </a>
        </div>
      </div>

      {/* Hướng dẫn setup */}
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 dark:border-indigo-900 dark:bg-indigo-950/50">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-black tracking-tight text-indigo-800 dark:text-indigo-200">
          <Laptop className="w-4 h-4" /> CÁCH CÀI AGENT TRÊN MÁY WINDOWS
        </h3>
        <ol className="list-inside list-decimal space-y-1 text-xs text-indigo-700 dark:text-indigo-300">
          <li>Tải agent ở trên về máy, giải nén (nếu cần) rồi chạy <code className="rounded bg-indigo-100 px-1 dark:bg-indigo-900">restore_agent.exe</code></li>
          <li>Lần đầu chạy: agent tự mở trình duyệt — đăng nhập và nhấn <strong>Xác nhận</strong> để liên kết thiết bị</li>
          <li>Sau khi liên kết thành công, agent tự kết nối và chạy ngầm, đồng bộ save tự động</li>
          <li>Thiết bị sẽ hiện trong danh sách bên dưới sau khi đăng ký</li>
        </ol>
      </div>

      {/* Form đăng ký key từ agent (primary) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-black tracking-tight text-slate-800 dark:text-white">
          <div className="w-2 h-2 bg-emerald-500 rounded-sm" />
          ĐĂNG KÝ KEY TỪ AGENT
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Sau khi chạy agent lần đầu, copy <em>tên thiết bị</em> và <em>API Key</em> từ cửa sổ console vào đây.
        </p>
        <form onSubmit={handleImport} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tên thiết bị</label>
            <input
              value={importDevice}
              onChange={e => setImportDevice(e.target.value)}
              placeholder="DESKTOP-ABC123"
              required
              className="w-44 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">API Key (từ console)</label>
            <input
              value={importKey}
              onChange={e => setImportKey(e.target.value)}
              placeholder="64 ký tự hex..."
              required
              className="w-72 rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <button
            type="submit"
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {importing ? 'Đang đăng ký...' : 'Đăng ký'}
          </button>
        </form>
      </div>

      {/* Form tạo key từ web (secondary / nâng cao) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={() => setShowGenerate(v => !v)}
          className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
            Tạo key trong web (nâng cao)
          </span>
          {showGenerate ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showGenerate && (
          <div className="border-t border-slate-100 px-6 pb-6 dark:border-slate-800">
            <p className="text-xs text-slate-500 my-3">
              Tạo key ở đây rồi dán vào file <code className="rounded bg-slate-100 px-1 dark:bg-slate-800 dark:text-slate-200">.env</code> của agent.
              Key chỉ hiển thị <strong>một lần</strong>.
            </p>
            <form onSubmit={handleGenerate} className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tên thiết bị</label>
                <input
                  value={genDevice}
                  onChange={e => setGenDevice(e.target.value)}
                  placeholder="MY_PC"
                  required
                  className="w-44 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ghi chú (tuỳ chọn)</label>
                <input
                  value={genNote}
                  onChange={e => setGenNote(e.target.value)}
                  placeholder="Máy văn phòng"
                  className="w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {generating ? 'Đang tạo...' : 'Tạo key'}
              </button>
            </form>

            {newKey && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/60">
                <p className="mb-2 text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                  ⚠ Copy ngay — key chỉ hiển thị một lần!
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 select-all break-all rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-100">
                    {newKey}
                  </code>
                  <button
                    onClick={() => copyText(newKey)}
                    className="rounded-lg border border-amber-300 p-2 text-amber-700 transition-all hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900"
                    title="Copy"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-amber-600 mt-2">
                  Thêm vào <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">.env</code>: <code>API_KEY={newKey}</code>
                </p>
                <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-slate-400 hover:text-slate-600 underline">
                  Đã lưu, đóng lại
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Danh sách keys */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black tracking-tight text-slate-800 dark:text-white">
              <Laptop className="w-4 h-4 text-indigo-500" />
              THIẾT BỊ ĐÃ ĐĂNG KÝ
            </h3>
            <div className="flex items-center gap-2 mt-2 text-[10px] font-black uppercase tracking-widest">
              <span className="rounded bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Tổng: {keys.length}</span>
              <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Online: {onlineCount}</span>
              <span className="rounded bg-slate-100 px-2 py-1 text-slate-500 dark:bg-slate-800 dark:text-slate-400">Offline: {offlineCount}</span>
            </div>
            {selectedIds.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">Đã chọn {selectedIds.length} thiết bị</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'all' | 'online' | 'offline');
                setSelectedIds([]);
                setPendingDeleteIds([]);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="online">Đang online</option>
              <option value="offline">Offline/chưa kết nối</option>
            </select>
            {selectedIds.length > 0 && (
              <button
                onClick={handleBulkRevoke}
                disabled={bulkDeleting}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-black hover:bg-red-700 transition-all disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {bulkDeleting ? 'Đang xóa...' : 'Xóa đã chọn'}
              </button>
            )}
            <button 
              onClick={handleRefresh} 
              disabled={refreshing}
              className={`p-1.5 rounded-lg transition-all ${
                refreshing 
                  ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-300'
              }`}
              title="Làm mới danh sách"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredKeys.length === 0 ? (
          <div className="p-10 text-center text-sm italic text-slate-400 dark:bg-slate-900">Chưa có thiết bị nào được đăng ký.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400 dark:bg-slate-800">
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <th className="px-6 py-3 font-black w-12">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = partiallySelected;
                    }}
                    onChange={toggleSelectAll}
                    aria-label="Chọn tất cả thiết bị"
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-6 py-3 font-black">Thiết bị</th>
                <th className="px-4 py-3 font-black">Trạng thái</th>
                <th className="px-6 py-3 font-black">Key (ẩn)</th>
                <th className="px-6 py-3 font-black">Ghi chú</th>
                <th className="px-6 py-3 font-black">Đăng ký lúc</th>
                <th className="px-6 py-3 font-black">Dùng lần cuối</th>
                <th className="px-6 py-3 font-black text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filteredKeys.map(k => (
                <tr key={k.id} className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/70 ${selectedIds.includes(k.id) ? 'bg-indigo-50/40 dark:bg-indigo-950/40' : ''}`}>
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(k.id)}
                      onChange={() => toggleSelected(k.id)}
                      aria-label={`Chọn thiết bị ${k.device_name}`}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-100">{k.device_name}</td>
                  <td className="px-4 py-4">
                    {k.is_online ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Online
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        {k.last_seen ? 'Offline' : 'Chưa kết nối'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500 dark:text-slate-400">{k.key_preview}</td>
                  <td className="px-6 py-4 text-slate-500 text-xs">{k.note || '—'}</td>
                  <td className="px-6 py-4 text-xs text-slate-400">{fmt(k.created_at)}</td>
                  <td className="px-6 py-4 text-xs text-slate-400">{fmt(k.last_used_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleRevoke(k.id, k.device_name)}
                      className="rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-red-100 hover:bg-red-50 hover:text-red-500 dark:hover:border-red-900 dark:hover:bg-red-950 dark:hover:text-red-400"
                      title="Thu hồi"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DevicesTab;
