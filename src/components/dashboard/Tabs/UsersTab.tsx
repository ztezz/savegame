
import React from 'react';
import { Plus, Settings, Trash2 } from 'lucide-react';
import { UserAccount } from '../types';

interface UsersTabProps {
  users: UserAccount[];
  handleOpenUserModal: (user?: UserAccount) => void;
  handleDeleteUser: (id: number) => void;
}

const UsersTab: React.FC<UsersTabProps> = ({ users, handleOpenUserModal, handleDeleteUser }) => {
  return (
    <div className="col-span-12 space-y-8">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Danh sách tài khoản</h3>
          <button 
            onClick={() => handleOpenUserModal()}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-black transition-all flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm mới
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-black text-slate-400 tracking-widest">
              <tr>
                <th className="px-6 py-4">Tên tài khoản</th>
                <th className="px-6 py-4">Tên đăng nhập</th>
                <th className="px-6 py-4">Vai trò</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${user.role === 'Admin' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                      {(user.username || user.name || 'U').charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{user.name || user.username}</p>
                      <p className="text-[10px] text-slate-400">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-[11px] bg-slate-100 text-slate-700 font-mono font-bold px-2 py-1 rounded border border-slate-200">
                      {user.username}
                    </code>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${user.role === 'Admin' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-[10px] font-black rounded uppercase ${user.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {user.status === 'Active' ? 'Hoạt động' : 'Đã khóa'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                     <div className="flex items-center justify-end gap-1.5 transition-all">
                        <button 
                          onClick={() => handleOpenUserModal(user)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all"
                          title="Chỉnh sửa"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all"
                          title="Xoá"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                     </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UsersTab;
