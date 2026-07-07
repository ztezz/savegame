import React, { useMemo, useState } from 'react';
import { HardDrive, Plus, Search, Settings, ShieldCheck, Trash2, UserCheck, Users } from 'lucide-react';
import DeleteConfirmModal from '../Modals/DeleteConfirmModal';
import { UserAccount } from '../types';

interface UsersTabProps {
  users: UserAccount[];
  handleOpenUserModal: (user?: UserAccount) => void;
  handleDeleteUser: (id: number) => Promise<void> | void;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
};

const formatQuota = (quota?: number | null) => quota ? `${(quota / 1024).toFixed(quota >= 1024 ? 1 : 2)} GB` : 'Mặc định hệ thống';

const UsersTab: React.FC<UsersTabProps> = ({ users, handleOpenUserModal, handleDeleteUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'Admin' | 'User'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Locked'>('all');
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);

  const filteredUsers = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch = !search || [user.username, user.name, user.display_name, user.email].some((value) => String(value || '').toLowerCase().includes(search));
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const totalDriveBytes = users.reduce((sum, user) => sum + Number(user.drive_used_bytes || 0), 0);
  const activeUsers = users.filter((user) => user.status === 'Active').length;
  const adminUsers = users.filter((user) => user.role === 'Admin').length;

  const statCards = [
    { label: 'Tổng tài khoản', value: users.length, icon: Users, className: 'text-indigo-600 bg-indigo-50' },
    { label: 'Đang hoạt động', value: activeUsers, icon: UserCheck, className: 'text-emerald-600 bg-emerald-50' },
    { label: 'Quản trị viên', value: adminUsers, icon: ShieldCheck, className: 'text-violet-600 bg-violet-50' },
    { label: 'Drive đã dùng', value: formatBytes(totalDriveBytes), icon: HardDrive, className: 'text-slate-700 bg-slate-100' },
  ];

  return <div className="col-span-12 space-y-6">
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {statCards.map((card) => <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{card.label}</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{card.value}</p>
          </div>
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${card.className}`}><card.icon className="h-5 w-5" /></div>
        </div>
      </div>)}
    </div>

    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/60 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Quản lý tài khoản</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Theo dõi quyền truy cập, trạng thái và dung lượng Drive của từng người dùng.</p>
          </div>
          <button onClick={() => handleOpenUserModal()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-black text-white shadow-lg shadow-slate-100 transition hover:bg-black">
            <Plus className="h-4 w-4" />Thêm tài khoản
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50" placeholder="Tìm theo tên, username hoặc email..." />
          </div>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as any)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50">
            <option value="all">Tất cả vai trò</option>
            <option value="Admin">Admin</option>
            <option value="User">User</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as any)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50">
            <option value="all">Tất cả trạng thái</option>
            <option value="Active">Hoạt động</option>
            <option value="Locked">Đã khóa</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left">
          <thead className="border-b border-slate-100 bg-white text-[10px] font-black uppercase tracking-widest text-slate-400">
            <tr>
              <th className="px-6 py-4">Tài khoản</th>
              <th className="px-6 py-4">Vai trò</th>
              <th className="px-6 py-4">Trạng thái</th>
              <th className="px-6 py-4">Drive</th>
              <th className="px-6 py-4">Save</th>
              <th className="px-6 py-4">Ngày tạo</th>
              <th className="px-6 py-4 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-slate-700">
            {filteredUsers.map((user) => {
              const driveUsedBytes = Number(user.drive_used_bytes || 0);
              const quotaBytes = user.drive_quota_mb ? Number(user.drive_quota_mb) * 1024 * 1024 : null;
              const quotaPercent = quotaBytes ? Math.min(100, Math.round((driveUsedBytes / quotaBytes) * 100)) : null;
              return <tr key={user.id} className="transition hover:bg-slate-50/70">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black ${user.role === 'Admin' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>{(user.name || user.username || 'U').charAt(0).toUpperCase()}</div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{user.name || user.display_name || user.username}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500"><code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{user.username}</code><span>{user.email || 'Chưa có email'}</span></div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4"><span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${user.role === 'Admin' ? 'border-indigo-100 bg-indigo-50 text-indigo-600' : 'border-slate-100 bg-slate-50 text-slate-500'}`}>{user.role}</span></td>
                <td className="px-6 py-4"><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${user.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{user.status === 'Active' ? 'Hoạt động' : 'Đã khóa'}</span></td>
                <td className="px-6 py-4">
                  <div className="min-w-44">
                    <div className="flex items-center justify-between gap-2 text-xs font-black text-slate-700"><span>{formatBytes(driveUsedBytes)}</span><span className="text-slate-400">{formatQuota(user.drive_quota_mb)}</span></div>
                    {quotaPercent !== null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${quotaPercent}%` }} /></div>}
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">{Number(user.drive_file_count || 0)} file Drive</p>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-black text-slate-700">{Number(user.save_count || 0)}</td>
                <td className="px-6 py-4 text-xs font-semibold text-slate-500">{user.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN') : '--'}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => handleOpenUserModal(user)} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600" title="Chỉnh sửa"><Settings className="h-4 w-4" /></button>
                    <button onClick={() => setDeleteTarget(user)} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-red-100 hover:bg-red-50 hover:text-red-600" title="Xóa"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>;
            })}
            {filteredUsers.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-sm font-semibold text-slate-500">Không tìm thấy tài khoản phù hợp.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>

    <DeleteConfirmModal show={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={async () => { if (!deleteTarget) return; await handleDeleteUser(deleteTarget.id); setDeleteTarget(null); }} title="Xóa tài khoản" message={`Xóa tài khoản ${deleteTarget?.username || ''}? Dữ liệu liên quan có thể bị xóa theo.`} />
  </div>;
};

export default UsersTab;
