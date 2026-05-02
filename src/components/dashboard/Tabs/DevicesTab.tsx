
import React, { useEffect, useState } from 'react';
import { Laptop, Plus, Trash2, Copy, Check, RefreshCw, ChevronDown, ChevronUp, Download, Monitor, AlertTriangle } from 'lucide-react';
import api from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';

interface AgentInfo {
  version: string;
  available: boolean;
  filename: string;
}

const AGENT_DOWNLOAD_URL = `${import.meta.env.VITE_API_URL || ''}/api/agent/download`;
const AGENT_INFO_URL = `${import.meta.env.VITE_API_URL || ''}/api/agent/info`;

interface DeviceKey {
  id: number;
  device_name: string;
  key_preview: string;
  note: string | null;
  created_at: string;
  last_used_at: string | null;
}

const DevicesTab: React.FC = () => {
  const { showToast } = useToast();
  const [keys, setKeys] = useState<DeviceKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);

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
    } catch {
      showToast('❌ Không thể tải danh sách device key', 'error');
    } finally {
      setLoading(false);
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
    if (!confirm(`Thu hồi key của "${name}"?`)) return;
    try {
      await api.delete(`/device-keys/${id}`);
      showToast('✅ Đã thu hồi key', 'success');
      fetchKeys();
    } catch {
      showToast('❌ Thu hồi thất bại', 'error');
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
            href={AGENT_DOWNLOAD_URL}
            download="restore_agent.exe"
            className={
              `flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all shrink-0 ` +
              (agentInfo?.available === false
                ? 'bg-slate-600 text-slate-400 cursor-not-allowed pointer-events-none'
                : 'bg-sky-500 hover:bg-sky-400 text-white shadow-md hover:shadow-sky-500/30')
            }
            onClick={e => { if (agentInfo?.available === false) e.preventDefault(); }}
          >
            <Download className="w-4 h-4" />
            Tải về
          </a>
        </div>
      </div>

      {/* Hướng dẫn setup */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
        <h3 className="font-black text-indigo-800 text-sm tracking-tight mb-2 flex items-center gap-2">
          <Laptop className="w-4 h-4" /> CÁCH CÀI AGENT TRÊN MÁY WINDOWS
        </h3>
        <ol className="text-xs text-indigo-700 space-y-1 list-decimal list-inside">
          <li>Tải agent ở trên về máy, giải nén (nếu cần) rồi chạy <code className="bg-indigo-100 px-1 rounded">restore_agent.exe</code></li>
          <li>Lần đầu chạy: agent tự mở trình duyệt — đăng nhập và nhấn <strong>Xác nhận</strong> để liên kết thiết bị</li>
          <li>Sau khi liên kết thành công, agent tự kết nối và chạy ngầm, đồng bộ save tự động</li>
          <li>Thiết bị sẽ hiện trong danh sách bên dưới sau khi đăng ký</li>
        </ol>
      </div>

      {/* Form đăng ký key từ agent (primary) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h3 className="font-black text-slate-800 text-sm tracking-tight flex items-center gap-2 mb-1">
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
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 w-44"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">API Key (từ console)</label>
            <input
              value={importKey}
              onChange={e => setImportKey(e.target.value)}
              placeholder="64 ký tự hex..."
              required
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 w-72 font-mono text-xs"
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
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowGenerate(v => !v)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
        >
          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
            Tạo key trong web (nâng cao)
          </span>
          {showGenerate ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showGenerate && (
          <div className="px-6 pb-6 border-t border-slate-100">
            <p className="text-xs text-slate-500 my-3">
              Tạo key ở đây rồi dán vào file <code className="bg-slate-100 px-1 rounded">.env</code> của agent.
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
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 w-44"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ghi chú (tuỳ chọn)</label>
                <input
                  value={genNote}
                  onChange={e => setGenNote(e.target.value)}
                  placeholder="Máy văn phòng"
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 w-48"
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
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-2">
                  ⚠ Copy ngay — key chỉ hiển thị một lần!
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-white border border-amber-200 rounded-lg px-3 py-2 break-all select-all text-slate-800">
                    {newKey}
                  </code>
                  <button
                    onClick={() => copyText(newKey)}
                    className="p-2 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-100 transition-all"
                    title="Copy"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-amber-600 mt-2">
                  Thêm vào <code className="bg-amber-100 px-1 rounded">.env</code>: <code>API_KEY={newKey}</code>
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
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-black text-slate-800 text-sm tracking-tight flex items-center gap-2">
            <Laptop className="w-4 h-4 text-indigo-500" />
            THIẾT BỊ ĐÃ ĐĂNG KÝ
          </h3>
          <button onClick={fetchKeys} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50 transition-all" title="Làm mới">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm italic">Chưa có thiết bị nào được đăng ký.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase tracking-widest">
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 font-black">Thiết bị</th>
                <th className="px-6 py-3 font-black">Key (ẩn)</th>
                <th className="px-6 py-3 font-black">Ghi chú</th>
                <th className="px-6 py-3 font-black">Đăng ký lúc</th>
                <th className="px-6 py-3 font-black">Dùng lần cuối</th>
                <th className="px-6 py-3 font-black text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {keys.map(k => (
                <tr key={k.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800">{k.device_name}</td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{k.key_preview}</td>
                  <td className="px-6 py-4 text-slate-500 text-xs">{k.note || '—'}</td>
                  <td className="px-6 py-4 text-xs text-slate-400">{fmt(k.created_at)}</td>
                  <td className="px-6 py-4 text-xs text-slate-400">{fmt(k.last_used_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleRevoke(k.id, k.device_name)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-all"
                      title="Thu hồi"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DevicesTab;