import React, { useMemo, useState } from 'react';
import {
  Download, HardDrive, Info, Lock, Plus, Search, Settings, ShieldCheck, Trash2,
  Unlock, UserCheck, Users, X, CheckSquare, Square
} from 'lucide-react';
import DeleteConfirmModal from '../Modals/DeleteConfirmModal';
import { UserAccount } from '../types';
import api from '../../../utils/api';
import { API_ORIGIN } from '../../../utils/api';

interface UsersTabProps {
  users: UserAccount[];
  handleOpenUserModal: (user?: UserAccount) => void;
  handleDeleteUser: (id: number) => Promise<void> | void;
  handleToggleStatus?: (userId: number, status: 'Active' | 'Locked') => Promise<void> | void;
  handleViewDetail?: (userId: number) => void;
  onRefresh?: () => void;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
};

const formatQuota = (quota?: number | null) => quota ? `${(quota / 1024).toFixed(quota >= 1024 ? 1 : 2)} GB` : 'Mặc định';

const UsersTab: React.FC<UsersTabProps> = ({ users, handleOpenUserModal, handleDeleteUser, handleToggleStatus, handleViewDetail, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'Admin' | 'User'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Locked'>('all');
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const filteredUsers = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch = !search || [user.username, user.name, user.display_name, user.email].some((v) => String(v || '').toLowerCase().includes(search));
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const totalDriveBytes = users.reduce((sum, u) => sum + Number(u.drive_used_bytes || 0), 0);
  const activeUsers = users.filter((u) => u.status === 'Active').length;
  const adminUsers = users.filter((u) => u.role === 'Admin').length;

  const statCards = [
    { label: 'Tổng tài khoản', value: users.length, icon: Users, className: 'text-indigo-600 bg-indigo-50' },
    { label: 'Đang hoạt động', value: activeUsers, icon: UserCheck, className: 'text-emerald-600 bg-emerald-50' },
    { label: 'Quản trị viên', value: adminUsers, icon: ShieldCheck, className: 'text-violet-600 bg-violet-50' },
    { label: 'Drive đã dùng', value: formatBytes(totalDriveBytes), icon: HardDrive, className: 'text-slate-700 bg-slate-100' },
  ];

  // Selection helpers
  const allFilteredIds = filteredUsers.map(u => u.id);
  const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));
  const isSomeSelected = allFilteredIds.some(id => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(prev => { const s = new Set(prev); allFilteredIds.forEach(id => s.delete(id)); return s; });
    } else {
      setSelectedIds(prev => new Set([...prev, ...allFilteredIds]));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleBulkAction = async (action: 'lock' | 'unlock' | 'delete') => {
    if (selectedIds.size === 0) return;
    const label = action === 'lock' ? 'khóa' : action === 'unlock' ? 'mở khóa' : 'xóa';
    if (!confirm(`Bạn có chắc muốn ${label} ${selectedIds.size} tài khoản đã chọn?`)) return;
    setBulkLoading(true);
    try {
      await api.post('/users/bulk-action', { action, ids: Array.from(selectedIds) });
      setSelectedIds(new Set());
      onRefresh?.();
    } catch (err: any) {
      alert(err.response?.data?.error || `${label} thất bại`);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleExportCsv = async () => {
    setExportLoading(true);
    try {
      const token = localStorage.getItem('token');
      const apiBase = import.meta.env.VITE_API_URL || 'https://api.luugame.fun';
      const link = document.createElement('a');
      link.href = `${apiBase}/api/users/export-csv`;
      // Fetch with auth
      const res = await fetch(`${apiBase}/api/users/export-csv`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `users_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (_) {
      alert('Xuất CSV thất bại');
    } finally {
      setExportLoading(false);
    }
  };

  const handleQuickToggle = async (user: UserAccount) => {
    setTogglingId(user.id);
    try {
      const newStatus = user.status === 'Active' ? 'Locked' : 'Active';
      await api.patch(`/users/${user.id}/status`, { status: newStatus });
      onRefresh?.();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Cập nhật trạng thái thất bại');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="admin-dark-surface col-span-12 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{card.label}</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{card.value}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${card.className}`}>
                <card.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {/* Toolbar */}
        <div className="border-b border-slate-100 bg-slate-50/60 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Quản lý tài khoản</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Theo dõi quyền truy cập, trạng thái và dung lượng Drive của từng người dùng.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleExportCsv}
                disabled={exportLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {exportLoading ? 'Đang xuất...' : 'Xuất CSV'}
              </button>
              <button
                onClick={() => handleOpenUserModal()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-slate-100 transition hover:bg-black"
              >
                <Plus className="h-4 w-4" />
                Thêm tài khoản
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                placeholder="Tìm theo tên, username hoặc email..."
              />
            </div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as any)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50">
              <option value="all">Tất cả vai trò</option>
              <option value="Admin">Admin</option>
              <option value="User">User</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50">
              <option value="all">Tất cả trạng thái</option>
              <option value="Active">Hoạt động</option>
              <option value="Locked">Đã khóa</option>
            </select>
          </div>

          {/* Bulk Action Bar */}
          {selectedIds.size > 0 && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-indigo-50 border border-indigo-100 px-4 py-3">
              <span className="text-xs font-black text-indigo-700">Đã chọn {selectedIds.size} tài khoản</span>
              <div className="flex gap-2 ml-auto flex-wrap">
                <button
                  onClick={() => handleBulkAction('unlock')}
                  disabled={bulkLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-black text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  Mở khóa
                </button>
                <button
                  onClick={() => handleBulkAction('lock')}
                  disabled={bulkLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-xs font-black text-amber-600 hover:bg-amber-50 disabled:opacity-50 transition"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Khóa
                </button>
                <button
                  onClick={() => handleBulkAction('delete')}
                  disabled={bulkLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-black text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa tất cả
                </button>
                <button onClick={() => setSelectedIds(new Set())} className="p-1.5 rounded-xl hover:bg-indigo-100 text-indigo-400 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left">
            <thead className="border-b border-slate-100 bg-white text-[10px] font-black uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-4 py-4 w-12">
                  <button onClick={toggleSelectAll} className="text-slate-400 hover:text-indigo-600">
                    {isAllSelected ? <CheckSquare className="w-4 h-4" /> : isSomeSelected ? <CheckSquare className="w-4 h-4 opacity-50" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="px-4 py-4">Tài khoản</th>
                <th className="px-4 py-4">Vai trò</th>
                <th className="px-4 py-4">Trạng thái</th>
                <th className="px-4 py-4">Drive</th>
                <th className="px-4 py-4">Save</th>
                <th className="px-4 py-4">Ngày tạo</th>
                <th className="px-4 py-4 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700">
              {filteredUsers.map((user) => {
                const driveUsedBytes = Number(user.drive_used_bytes || 0);
                const quotaBytes = user.drive_quota_mb ? Number(user.drive_quota_mb) * 1024 * 1024 : null;
                const quotaPercent = quotaBytes ? Math.min(100, Math.round((driveUsedBytes / quotaBytes) * 100)) : null;
                const isSelected = selectedIds.has(user.id);
                const isToggling = togglingId === user.id;

                return (
                  <tr key={user.id} className={`transition hover:bg-slate-50/70 ${isSelected ? 'bg-indigo-50/50' : ''}`}>
                    <td className="px-4 py-4">
                      <button onClick={() => toggleSelect(user.id)} className="text-slate-400 hover:text-indigo-600">
                        {isSelected ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {user.avatar_url ? (
                          <img src={`${API_ORIGIN}${user.avatar_url}`} alt="avatar" className="w-10 h-10 rounded-2xl object-cover border border-slate-200" />
                        ) : (
                          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black ${user.role === 'Admin' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                            {(user.name || user.username || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">{user.name || user.display_name || user.username}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{user.username}</code>
                            <span>{user.email || 'Chưa có email'}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${user.role === 'Admin' ? 'border-indigo-100 bg-indigo-50 text-indigo-600' : 'border-slate-100 bg-slate-50 text-slate-500'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {/* Quick toggle button */}
                      <button
                        onClick={() => handleQuickToggle(user)}
                        disabled={isToggling}
                        title={user.status === 'Active' ? 'Click để khóa' : 'Click để mở khóa'}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase transition hover:opacity-80 disabled:opacity-50 ${user.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}
                      >
                        {isToggling ? (
                          <span className="w-2 h-2 rounded-full border border-current border-t-transparent animate-spin" />
                        ) : user.status === 'Active' ? (
                          <Unlock className="w-3 h-3" />
                        ) : (
                          <Lock className="w-3 h-3" />
                        )}
                        {user.status === 'Active' ? 'Hoạt động' : 'Đã khóa'}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="min-w-44">
                        <div className="flex items-center justify-between gap-2 text-xs font-black text-slate-700">
                          <span>{formatBytes(driveUsedBytes)}</span>
                          <span className="text-slate-400">{formatQuota(user.drive_quota_mb)}</span>
                        </div>
                        {quotaPercent !== null && (
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all ${quotaPercent > 90 ? 'bg-red-500' : quotaPercent > 70 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                              style={{ width: `${quotaPercent}%` }}
                            />
                          </div>
                        )}
                        <p className="mt-1 text-[10px] font-semibold text-slate-400">{Number(user.drive_file_count || 0)} file</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm font-black text-slate-700">{Number(user.save_count || 0)}</td>
                    <td className="px-4 py-4 text-xs font-semibold text-slate-500">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN') : '--'}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {handleViewDetail && (
                          <button
                            onClick={() => handleViewDetail(user.id)}
                            className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                            title="Xem chi tiết"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenUserModal(user)}
                          className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                          title="Chỉnh sửa"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(user)}
                          className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-red-100 hover:bg-red-50 hover:text-red-600"
                          title="Xóa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-sm font-semibold text-slate-500">Không tìm thấy tài khoản phù hợp.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        {filteredUsers.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60">
            <p className="text-xs text-slate-400 font-semibold">Hiển thị {filteredUsers.length} / {users.length} tài khoản</p>
          </div>
        )}
      </div>

      <DeleteConfirmModal
        show={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await handleDeleteUser(deleteTarget.id);
          setDeleteTarget(null);
        }}
        title="Xóa tài khoản"
        message={`Xóa tài khoản ${deleteTarget?.username || ''}? Dữ liệu liên quan có thể bị xóa theo.`}
      />
    </div>
  );
};

export default UsersTab;
