import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight,
  Clock, Download, FileText, Filter, RefreshCw, Search, Shield,
  TrendingUp, User, X, XCircle, Zap,
} from 'lucide-react';
import api from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';

interface SystemLogsTabProps {
  currentUser: any;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const RESOURCE_MAP: Record<string, string> = {
  auth: 'Xác thực',
  '/api/auth/login': 'Đăng nhập',
  '/api/auth/register': 'Đăng ký',
  '/api/save/list': 'Danh sách bản lưu',
  '/api/save/upload': 'Tải lên bản lưu',
  '/api/activation/list': 'File kích hoạt',
  '/api/activation/upload': 'Tải lên file kích hoạt',
  '/api/category/list': 'Danh mục game',
  '/api/sync/logs': 'Nhật ký đồng bộ',
  '/api/sync/devices': 'Thiết bị đồng bộ',
  '/api/system/settings': 'Cài đặt hệ thống',
  '/api/system/storage': 'Dung lượng lưu trữ',
  '/api/system/agent/windows': 'CloudSave Agent',
  '/api/community/stats': 'Thống kê chat',
  '/api/community/bans': 'Khóa chat',
  '/api/users': 'Quản lý người dùng',
  system_settings: 'Cài đặt hệ thống',
  windows_agent: 'CloudSave Agent',
  storage: 'Dọn dẹp lưu trữ',
  'sqlite:database': 'SQLite – Tạo DB',
  'sqlite:console': 'SQLite – SQL Console',
  sqlite: 'SQLite',
};

const describeResource = (r: string) => {
  if (RESOURCE_MAP[r]) return RESOURCE_MAP[r];
  if (r?.startsWith('sqlite:')) return `SQLite – ${r.replace('sqlite:', '')}`;
  if (r?.startsWith('/api/drive')) return 'Thao tác Drive';
  if (r?.startsWith('/api/device')) return 'Thiết bị';
  if (r?.startsWith('/api/community')) return 'Phòng chat';
  if (r?.startsWith('/api/users/')) return 'Người dùng';
  if (r?.startsWith('/api/save/')) return 'Bản lưu';
  if (r?.startsWith('/api/game/')) return 'Game';
  return r || 'Hệ thống';
};

const ACTION_MAP: Record<string, string> = {
  GET: 'Xem',
  POST: 'Tạo / Gửi',
  PUT: 'Cập nhật',
  PATCH: 'Sửa nhanh',
  DELETE: 'Xóa',
  UPDATE: 'Cập nhật',
  CLEANUP: 'Dọn dẹp',
  SQL: 'Chạy SQL',
  BACKUP: 'Sao lưu',
  MAINTENANCE: 'Bảo trì',
  CREATE: 'Tạo mới',
  INSERT: 'Chèn dữ liệu',
  AUTH_LOGIN_SUCCESS: 'Đăng nhập thành công',
  AUTH_LOGIN_FAILED: 'Đăng nhập thất bại',
  AUTH_REGISTER: 'Đăng ký tài khoản',
  AUTH_REGISTER_FAILED: 'Đăng ký thất bại',
  AUTH_CHANGE_PASSWORD: 'Đổi mật khẩu',
  AUTH_CHANGE_PASSWORD_FAILED: 'Đổi mật khẩu thất bại',
};

const describeAction = (action: string, detail: any) => {
  const method = detail?.method || action;
  return ACTION_MAP[method] || ACTION_MAP[action] || method || 'Hoạt động';
};

const getStatus = (detail: any): { label: string; type: 'success' | 'error' | 'rejected' | 'info' } => {
  const code = Number(detail?.statusCode || 0);
  const success = detail?.success ?? (code > 0 ? code < 400 : true);
  if (code === 401 || code === 403) return { label: `Bị từ chối (${code})`, type: 'rejected' };
  if (!success || (code >= 400)) return { label: code ? `Lỗi (${code})` : 'Lỗi', type: 'error' };
  return { label: code ? `OK (${code})` : 'Thành công', type: 'success' };
};

const STATUS_STYLES = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  error: 'bg-red-50 text-red-700 border-red-100',
  rejected: 'bg-amber-50 text-amber-700 border-amber-100',
  info: 'bg-slate-50 text-slate-600 border-slate-200',
};

const STATUS_ICON = {
  success: <CheckCircle2 className="w-3.5 h-3.5" />,
  error: <XCircle className="w-3.5 h-3.5" />,
  rejected: <Shield className="w-3.5 h-3.5" />,
  info: <Activity className="w-3.5 h-3.5" />,
};

const getChips = (detail: any): string[] => {
  if (!detail) return [];
  const items: string[] = [];
  if (typeof detail.durationMs === 'number')
    items.push(detail.durationMs < 1000 ? `${detail.durationMs}ms` : `${(detail.durationMs / 1000).toFixed(1)}s`);
  if (detail.ip) items.push(`IP ${detail.ip}`);
  if (Array.isArray(detail.keys) && detail.keys.length) items.push(`Đổi: ${detail.keys.join(', ')}`);
  if (detail.reason) items.push(`Lý do: ${detail.reason}`);
  if (detail.body?.gameName) items.push(`Game: ${detail.body.gameName}`);
  if (detail.body?.deviceName) items.push(`Thiết bị: ${detail.body.deviceName}`);
  if (detail.body?.device_id) items.push(`Thiết bị: ${detail.body.device_id}`);
  if (detail.userAgent) {
    const ua = String(detail.userAgent);
    const browser = ua.includes('Edg/') ? 'Edge' : ua.includes('Chrome/') ? 'Chrome' : ua.includes('Firefox/') ? 'Firefox' : ua.includes('Windows') ? 'App Windows' : 'Khác';
    items.push(browser);
  }
  if (detail.username) items.push(`@${detail.username}`);
  if (detail.query && Object.keys(detail.query).length) {
    items.push(Object.entries(detail.query).map(([k, v]) => `${k}=${v}`).join(', '));
  }
  return items;
};

const formatBytes = (b: number) => {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
};

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

// ─── Component ───────────────────────────────────────────────────────────────

const SystemLogsTab: React.FC<SystemLogsTabProps> = ({ currentUser }) => {
  const { showToast } = useToast();
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin' || currentUser?.username === 'admin';

  // Logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  // Filters
  const [search, setSearch] = useState(''); // username search
  const [resourceFilter, setResourceFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Stats
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsDays, setStatsDays] = useState(7);

  // Expanded log
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Export loading
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState('');

  const activeFilterCount = [search, resourceFilter, actionFilter, statusFilter, dateFrom, dateTo].filter(Boolean).length;

  // ── Load logs ──────────────────────────────────────────────────────────────
  const loadLogs = useCallback(async (silent = false) => {
    if (!isAdmin) return;
    if (!silent) setLoading(true);
    if (!silent) setLoadError('');
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (search) params.set('username', search);
      if (resourceFilter) params.set('resource', resourceFilter);
      if (actionFilter) params.set('action', actionFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await api.get(`/system/audit-logs?${params.toString()}`, { timeout: 15000 });
      const data = res.data;
      // Handle both old (array) and new (object) response format
      if (Array.isArray(data)) {
        setLogs(data);
        setTotal(data.length);
      } else {
        setLogs(data.rows || []);
        setTotal(data.total || 0);
      }
    } catch (error: any) {
      const message = error.code === 'ECONNABORTED' ? 'SQLite phản hồi quá chậm. Vui lòng thử lại.' : error.response?.data?.error || 'Không tải được nhật ký hệ thống';
      if (!silent) setLoadError(message);
      if (!silent) showToast('Không tải được nhật ký hệ thống', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isAdmin, page, pageSize, search, resourceFilter, actionFilter, statusFilter, dateFrom, dateTo]);

  // ── Load stats ─────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    if (!isAdmin) return;
    setStatsLoading(true);
    try {
      const res = await api.get(`/system/audit-stats?days=${statsDays}`, { timeout: 15000 });
      setStats(res.data);
    } catch {
      // ignore – stats are non-critical
    } finally {
      setStatsLoading(false);
    }
  }, [isAdmin, statsDays]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => {
    const timer = window.setTimeout(loadStats, 500);
    return () => window.clearTimeout(timer);
  }, [loadStats]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => loadLogs(true), 10000);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh, loadLogs]);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [search, resourceFilter, actionFilter, statusFilter, dateFrom, dateTo, pageSize]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const apiBase = import.meta.env.VITE_API_URL || 'https://api.luugame.fun';
      const params = new URLSearchParams({ limit: '2000' });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const resp = await fetch(`${apiBase}/api/system/audit-logs/export-csv?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Xuất CSV thất bại', 'error');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setSearch(''); setResourceFilter(''); setActionFilter('');
    setStatusFilter(''); setDateFrom(''); setDateTo('');
  };

  if (!isAdmin) {
    return (
      <div className="col-span-12 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
        Chỉ quản trị viên mới xem được nhật ký hệ thống.
      </div>
    );
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="admin-dark-surface col-span-12 space-y-5">

      {/* ── Stats Overview ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: `Tổng ${statsDays} ngày`,
            value: statsLoading ? '...' : (stats?.total ?? 0).toLocaleString(),
            icon: Activity,
            color: 'text-indigo-600 bg-indigo-50',
          },
          {
            label: 'Thành công',
            value: statsLoading ? '...' : (stats?.success ?? 0).toLocaleString(),
            icon: CheckCircle2,
            color: 'text-emerald-600 bg-emerald-50',
          },
          {
            label: 'Bị từ chối',
            value: statsLoading ? '...' : (stats?.rejected ?? 0).toLocaleString(),
            icon: Shield,
            color: 'text-amber-600 bg-amber-50',
          },
          {
            label: 'Lỗi',
            value: statsLoading ? '...' : (stats?.error ?? 0).toLocaleString(),
            icon: XCircle,
            color: 'text-red-600 bg-red-50',
          },
        ].map(card => (
          <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{card.label}</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{card.value}</p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${card.color}`}>
                <card.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Top Users & Actions ── */}
      {stats && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Top Users */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-slate-500" />
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">Top người dùng</h4>
              </div>
              <div className="flex gap-1">
                {[7, 14, 30].map(d => (
                  <button key={d} onClick={() => setStatsDays(d)} className={`px-2 py-1 rounded-lg text-[10px] font-black transition ${statsDays === d ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                    {d}N
                  </button>
                ))}
              </div>
            </div>
            {stats.topUsers?.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">Không có dữ liệu</p>
            ) : (
              <div className="space-y-2">
                {stats.topUsers.map((u: any, i: number) => {
                  const maxCnt = stats.topUsers[0]?.cnt || 1;
                  return (
                    <div key={u.username} className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-slate-400 w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-700 truncate">{u.username}</span>
                          <span className="text-xs font-black text-slate-500 ml-2">{Number(u.cnt).toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(Number(u.cnt) / maxCnt) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Actions */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-slate-500" />
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">Top hành động</h4>
            </div>
            {stats.topActions?.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">Không có dữ liệu</p>
            ) : (
              <div className="space-y-2">
                {stats.topActions.map((a: any) => {
                  const maxCnt = stats.topActions[0]?.cnt || 1;
                  const label = ACTION_MAP[a.act] || a.act || 'Khác';
                  return (
                    <div key={a.act} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-700 truncate">{label}</span>
                          <span className="text-xs font-black text-slate-500 ml-2">{Number(a.cnt).toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-violet-500" style={{ width: `${(Number(a.cnt) / maxCnt) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Log Table ── */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">

        {/* Toolbar */}
        <div className="border-b border-slate-100 bg-slate-50/60 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Chi tiết nhật ký API</h3>
                {total > 0 && (
                  <span className="ml-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-black text-indigo-700">
                    {total.toLocaleString()}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">Theo dõi mọi thao tác API — lỗi, thay đổi cấu hình, hoạt động người dùng.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Auto-refresh toggle */}
              <button
                onClick={() => setAutoRefresh(v => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition ${autoRefresh ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                title="Tự động làm mới mỗi 10s"
              >
                <Clock className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse' : ''}`} />
                {autoRefresh ? 'Auto ON' : 'Auto OFF'}
              </button>

              {/* Filter toggle */}
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition ${showFilters || activeFilterCount > 0 ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <Filter className="w-3.5 h-3.5" />
                Bộ lọc{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>

              {/* Export */}
              <button
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                {exporting ? 'Đang xuất...' : 'Xuất CSV'}
              </button>

              {/* Refresh */}
              <button
                onClick={() => loadLogs()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Làm mới
              </button>
            </div>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {/* Username search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Tìm theo username..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                  />
                </div>

                {/* Resource */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={resourceFilter}
                    onChange={e => setResourceFilter(e.target.value)}
                    placeholder="Tìm theo resource (/api/...)..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                  />
                </div>

                {/* Action */}
                <select
                  value={actionFilter}
                  onChange={e => setActionFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                >
                  <option value="">Tất cả hành động</option>
                  <option value="GET">GET – Xem</option>
                  <option value="POST">POST – Tạo/Gửi</option>
                  <option value="PUT">PUT – Cập nhật</option>
                  <option value="PATCH">PATCH – Sửa nhanh</option>
                  <option value="DELETE">DELETE – Xóa</option>
                  <option value="AUTH_LOGIN_SUCCESS">Đăng nhập thành công</option>
                  <option value="AUTH_LOGIN_FAILED">Đăng nhập thất bại</option>
                  <option value="CLEANUP">Dọn dẹp</option>
                  <option value="SQL">Chạy SQL</option>
                  <option value="BACKUP">Sao lưu</option>
                </select>

                {/* Status */}
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="success">Thành công</option>
                  <option value="error">Lỗi</option>
                  <option value="rejected">Bị từ chối (401/403)</option>
                </select>

                {/* Date From */}
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                  placeholder="Từ ngày"
                />

                {/* Date To */}
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                  placeholder="Đến ngày"
                />
              </div>

              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-600 hover:underline">
                  <X className="w-3.5 h-3.5" /> Xóa tất cả bộ lọc
                </button>
              )}
            </div>
          )}

          {/* Page size + count */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold">Hiển thị</span>
              <div className="flex gap-1">
                {PAGE_SIZE_OPTIONS.map(s => (
                  <button key={s} onClick={() => setPageSize(s)} className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition ${pageSize === s ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>
                    {s}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-500 font-semibold">/ trang</span>
            </div>
            {total > 0 && (
              <p className="text-xs text-slate-400 font-semibold">
                Trang {page + 1} / {totalPages} · {total.toLocaleString()} bản ghi
              </p>
            )}
          </div>
        </div>

        {/* Log list */}
        <div className="divide-y divide-slate-50">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-semibold text-slate-500">Đang tải nhật ký...</p>
              </div>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-amber-500" />
              <p className="text-sm font-black text-slate-700">Không kết nối được với dữ liệu nhật ký</p>
              <p className="max-w-xl text-xs font-semibold text-slate-500">{loadError}</p>
              <button onClick={() => loadLogs()} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-700"><RefreshCw className="h-4 w-4" />Thử lại</button>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <FileText className="w-10 h-10 text-slate-200" />
              <p className="text-sm font-semibold text-slate-400">Không tìm thấy nhật ký phù hợp.</p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-xs font-black text-indigo-600 hover:underline">Xóa bộ lọc</button>
              )}
            </div>
          ) : (
            logs.map(log => {
              const detail = log.detail_json || {};
              const status = getStatus(detail);
              const chips = getChips(detail);
              const isExpanded = expandedId === log.id;
              const now = new Date();
              const logDate = new Date(log.created_at);
              const diffMs = now.getTime() - logDate.getTime();
              const diffMin = Math.floor(diffMs / 60000);
              const relativeTime = diffMin < 1 ? 'Vừa xong' : diffMin < 60 ? `${diffMin} phút trước` : diffMin < 1440 ? `${Math.floor(diffMin / 60)} giờ trước` : logDate.toLocaleDateString('vi-VN');

              return (
                <div
                  key={log.id}
                  className={`group cursor-pointer px-5 py-4 transition hover:bg-slate-50/80 ${isExpanded ? 'bg-indigo-50/30' : ''}`}
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Status dot */}
                      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${STATUS_STYLES[status.type]}`}>
                        {STATUS_ICON[status.type]}
                      </div>

                      <div className="min-w-0">
                        {/* Badges row */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${STATUS_STYLES[status.type]}`}>
                            {status.label}
                          </span>
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700">
                            {describeAction(log.action, detail)}
                          </span>
                          {detail.method && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-black text-slate-600">
                              {detail.method}
                            </span>
                          )}
                        </div>

                        {/* Resource */}
                        <p className="text-sm font-black text-slate-900 truncate">{describeResource(log.resource)}</p>

                        {/* Meta */}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="text-xs text-slate-500">
                            <span className="font-bold text-slate-700">{log.username || 'hệ thống'}</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {relativeTime}
                          </span>
                        </div>

                        {/* Chips */}
                        {chips.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {chips.map((chip, i) => (
                              <span key={i} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                {chip}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Expanded: raw detail */}
                        {isExpanded && (
                          <div className="mt-3 rounded-xl bg-slate-900 p-4 overflow-x-auto">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Chi tiết thô</p>
                            <div className="space-y-1">
                              <p className="text-[10px] font-mono text-slate-300"><span className="text-slate-500">ID:</span> {log.id}</p>
                              <p className="text-[10px] font-mono text-slate-300"><span className="text-slate-500">Action:</span> {log.action}</p>
                              <p className="text-[10px] font-mono text-slate-300"><span className="text-slate-500">Resource:</span> {log.resource}</p>
                              <p className="text-[10px] font-mono text-slate-300"><span className="text-slate-500">Time:</span> {new Date(log.created_at).toLocaleString('vi-VN')}</p>
                              <p className="text-[10px] font-mono text-slate-300"><span className="text-slate-500">User:</span> {log.username || 'system'} {log.user_role ? `(${log.user_role})` : ''}</p>
                              {Object.keys(detail).length > 0 && (
                                <>
                                  <p className="text-[10px] font-mono text-slate-500 mt-2">— detail —</p>
                                  {Object.entries(detail).map(([k, v]) => (
                                    <p key={k} className="text-[10px] font-mono text-slate-300">
                                      <span className="text-indigo-400">{k}:</span>{' '}
                                      <span className="text-emerald-300">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                                    </p>
                                  ))}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="shrink-0 text-right hidden sm:block">
                      <p className="text-[10px] font-semibold text-slate-500">
                        {logDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {logDate.toLocaleDateString('vi-VN')}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                Trước
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) {
                    p = i;
                  } else if (page < 4) {
                    p = i < 5 ? i : i === 5 ? -1 : totalPages - 1;
                  } else if (page > totalPages - 5) {
                    p = i === 0 ? 0 : i === 1 ? -1 : totalPages - 7 + i;
                  } else {
                    p = i === 0 ? 0 : i === 1 ? -1 : i === 5 ? -2 : i === 6 ? totalPages - 1 : page - 2 + (i - 2);
                  }
                  if (p < 0) return <span key={i} className="px-1 text-slate-400 text-xs">…</span>;
                  return (
                    <button
                      key={i}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-black transition ${page === p ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      {p + 1}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Sau
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemLogsTab;
