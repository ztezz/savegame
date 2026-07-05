import React, { useEffect, useState } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import api from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';

interface SystemLogsTabProps {
  currentUser: any;
}

const describeAuditResource = (resource: string) => {
  const map: Record<string, string> = {
    '/api/auth/login': 'Đăng nhập',
    '/api/save/list': 'Xem danh sách bản lưu',
    '/api/save/upload': 'Tải lên bản lưu',
    '/api/activation/list': 'Xem file kích hoạt',
    '/api/activation/upload': 'Tải lên file kích hoạt',
    '/api/category/list': 'Xem danh mục game',
    '/api/sync/logs': 'Xem nhật ký đồng bộ',
    '/api/sync/devices': 'Xem thiết bị đồng bộ',
    '/api/sync/restore-status': 'Kiểm tra trạng thái khôi phục',
    '/api/sync/agent-online': 'Kiểm tra agent online',
    '/api/system/settings': 'Cài đặt hệ thống',
    '/api/system/storage': 'Kiểm tra dung lượng lưu trữ',
    '/api/system/agent/windows': 'Cập nhật CloudSave Agent',
    '/api/community/stats': 'Xem thống kê phòng chat',
    '/api/community/bans': 'Quản lý khóa chat',
    '/api/users': 'Quản lý người dùng',
    'system_settings': 'Cập nhật cài đặt hệ thống',
    'windows_agent': 'Cập nhật CloudSave Agent',
    'storage': 'Dọn dẹp lưu trữ',
  };

  if (map[resource]) return map[resource];
  if (resource?.startsWith('/api/drive')) return 'Thao tác Drive';
  if (resource?.startsWith('/api/device')) return 'Quản lý thiết bị';
  if (resource?.startsWith('/api/community')) return 'Thao tác phòng chat';
  return resource || 'Hoạt động hệ thống';
};

const describeAuditAction = (action: string, detail: any) => {
  const method = detail?.method || action;
  const map: Record<string, string> = {
    GET: 'Xem dữ liệu',
    POST: 'Tạo mới / gửi dữ liệu',
    PUT: 'Cập nhật',
    PATCH: 'Cập nhật một phần',
    DELETE: 'Xóa',
    UPDATE: 'Cập nhật',
    CLEANUP: 'Dọn dẹp',
  };
  return map[method] || method || 'Hoạt động';
};

const getAuditStatus = (detail: any) => {
  const statusCode = Number(detail?.statusCode || 0);
  const success = detail?.success ?? (statusCode > 0 ? statusCode < 400 : true);
  if (success) return { label: statusCode ? `Thành công (${statusCode})` : 'Thành công', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  if (statusCode === 401 || statusCode === 403) return { label: `Bị từ chối (${statusCode})`, className: 'bg-amber-50 text-amber-700 border-amber-100' };
  return { label: statusCode ? `Lỗi (${statusCode})` : 'Lỗi', className: 'bg-red-50 text-red-700 border-red-100' };
};

const getAuditDetails = (detail: any) => {
  if (!detail) return [];
  const items: string[] = [];

  if (typeof detail.durationMs === 'number') {
    items.push(`Xử lý trong ${detail.durationMs < 1000 ? `${detail.durationMs}ms` : `${(detail.durationMs / 1000).toFixed(1)}s`}`);
  }
  if (detail.ip) items.push(`IP ${detail.ip}`);
  if (Array.isArray(detail.keys) && detail.keys.length > 0) items.push(`Đã đổi: ${detail.keys.join(', ')}`);
  if (detail.reason) items.push(`Lý do: ${detail.reason}`);
  if (detail.body?.gameName) items.push(`Game: ${detail.body.gameName}`);
  if (detail.body?.deviceName) items.push(`Thiết bị: ${detail.body.deviceName}`);
  if (detail.body?.device_id) items.push(`Thiết bị: ${detail.body.device_id}`);
  if (detail.query && Object.keys(detail.query).length > 0) items.push(`Bộ lọc: ${Object.entries(detail.query).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (detail.userAgent) {
    const agent = String(detail.userAgent);
    const browser = agent.includes('Edg/') ? 'Edge' : agent.includes('Chrome/') ? 'Chrome' : agent.includes('Firefox/') ? 'Firefox' : agent.includes('Windows') ? 'Windows app' : 'Thiết bị khác';
    items.push(`Nguồn: ${browser}`);
  }

  return items;
};

const SystemLogsTab: React.FC<SystemLogsTabProps> = ({ currentUser }) => {
  const { showToast } = useToast();
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin' || currentUser?.username === 'admin';
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const logs = await api.get('/system/audit-logs?limit=100');
      setAuditLogs(logs.data || []);
    } catch {
      showToast('Không tải được nhật ký hệ thống', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [isAdmin]);

  if (!isAdmin) {
    return <div className="col-span-12 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">Chỉ quản trị viên mới xem được nhật ký hệ thống.</div>;
  }

  return <div className="col-span-12 space-y-5">
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-black text-slate-900"><FileText className="h-5 w-5 text-indigo-600" />Nhật ký hệ thống</h3>
          <p className="mt-1 text-sm text-slate-500">Theo dõi các hoạt động quan trọng, lỗi API và thay đổi cấu hình.</p>
        </div>
        <button type="button" onClick={loadLogs} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Làm mới
        </button>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">Tổng log đang xem</p><p className="mt-1 text-2xl font-black text-slate-900">{auditLogs.length}</p></div>
        <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-700">Thành công</p><p className="mt-1 text-2xl font-black text-emerald-800">{auditLogs.filter((log) => getAuditStatus(log.detail_json).label.startsWith('Thành công')).length}</p></div>
        <div className="rounded-2xl bg-red-50 p-4"><p className="text-xs font-bold text-red-700">Lỗi / bị từ chối</p><p className="mt-1 text-2xl font-black text-red-800">{auditLogs.filter((log) => !getAuditStatus(log.detail_json).label.startsWith('Thành công')).length}</p></div>
      </div>
    </div>

    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
        {auditLogs.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Chưa có nhật ký hệ thống.</div> : auditLogs.map((log: any) => {
          const detail = log.detail_json || {};
          const status = getAuditStatus(detail);
          const details = getAuditDetails(detail);
          return (
            <div key={log.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-100 hover:shadow-md">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${status.className}`}>{status.label}</span>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700">{describeAuditAction(log.action, detail)}</span>
                  </div>
                  <p className="text-sm font-black text-slate-900">{describeAuditResource(log.resource)}</p>
                  <p className="mt-1 text-xs text-slate-500">Thực hiện bởi <span className="font-bold text-slate-700">{log.username || 'hệ thống'}</span> lúc {new Date(log.created_at).toLocaleString('vi-VN')}</p>
                </div>
                {detail.method && <div className="rounded-xl bg-slate-50 px-3 py-2 text-right font-mono text-[11px] font-bold text-slate-500">{detail.method}<br />{log.resource}</div>}
              </div>
              {details.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
                {details.map((item, index) => <span key={`${log.id}-${index}`} className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">{item}</span>)}
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  </div>;
};

export default SystemLogsTab;
