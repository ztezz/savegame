
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserAccount } from '../types';

interface UserModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  editingUser: UserAccount | null;
  userUsername: string;
  setUserUsername: (username: string) => void;
  userDisplayName: string;
  setUserDisplayName: (name: string) => void;
  userEmail: string;
  setUserEmail: (email: string) => void;
  userPassword: string;
  setUserPassword: (password: string) => void;
  userRole: 'Admin' | 'User';
  setUserRole: (role: 'Admin' | 'User') => void;
  userStatus: 'Active' | 'Locked';
  setUserStatus: (status: 'Active' | 'Locked') => void;
  userDriveQuotaMb: string;
  setUserDriveQuotaMb: (quota: string) => void;
}

const UserModal: React.FC<UserModalProps> = ({
  show, onClose, onSubmit, editingUser,
  userUsername, setUserUsername,
  userDisplayName, setUserDisplayName,
  userEmail, setUserEmail,
  userPassword, setUserPassword,
  userRole, setUserRole,
  userStatus, setUserStatus,
  userDriveQuotaMb, setUserDriveQuotaMb
}) => {
  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="admin-dark-surface flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="px-6 py-5 border-b border-slate-100 shrink-0">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                  {editingUser ? 'Cập nhật tài khoản' : 'Thêm tài khoản mới'}
                </h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-900 font-bold text-xs uppercase">Đóng</button>
              </div>
            </div>

            <div className="overflow-y-auto px-6 py-5">
              
              <form id="user-account-form" onSubmit={onSubmit} autoComplete="off" className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Tên đăng nhập {editingUser && '(không thể thay đổi)'}</label>
                  <input 
                    type="text"
                    required
                    value={userUsername}
                    onChange={(e) => !editingUser && setUserUsername(e.target.value)}
                    disabled={!!editingUser}
                    autoComplete="off"
                    name="cloudsave-user-username"
                    placeholder="username"
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight disabled:bg-slate-50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Tên hiển thị</label>
                  <input 
                    type="text"
                    required
                    value={userDisplayName}
                    onChange={(e) => setUserDisplayName(e.target.value)}
                    autoComplete="off"
                    name="cloudsave-user-display-name"
                    placeholder="Jane Doe"
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight"
                  />
                </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Email liên lạc</label>
                  <input 
                    type="email"
                    required
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    autoComplete="off"
                    name="cloudsave-user-contact-email"
                    placeholder="jane@example.com"
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Mật khẩu {editingUser && '(để trống nếu không đổi)'}</label>
                  <input 
                    type="password"
                    required={!editingUser}
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    autoComplete="new-password"
                    name="cloudsave-user-new-password"
                    placeholder="••••••••"
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Vai trò</label>
                    <select 
                      value={userRole}
                      onChange={(e) => setUserRole(e.target.value as any)}
                      className="w-full px-4 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight bg-white"
                    >
                      <option value="User">Người dùng</option>
                      <option value="Admin">Quản trị viên</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Trạng thái</label>
                    <select 
                      value={userStatus}
                      onChange={(e) => setUserStatus(e.target.value as any)}
                      className="w-full px-4 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight bg-white"
                    >
                      <option value="Active">Hoạt động</option>
                      <option value="Locked">Khoá lại</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Quota Drive riêng (MB)</label>
                  <input
                    type="number"
                    min="0"
                    value={userDriveQuotaMb}
                    onChange={(e) => setUserDriveQuotaMb(e.target.value)}
                    autoComplete="off"
                    name="cloudsave-user-drive-quota"
                    placeholder="Để trống dùng mặc định hệ thống"
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight"
                  />
                  <p className="text-xs font-semibold text-slate-400 ml-1">Ví dụ: 20480 = 20GB, 102400 = 100GB.</p>
                </div>
              </form>
            </div>

            <div className="flex shrink-0 gap-3 border-t border-slate-100 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
              <button 
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs transition-all uppercase tracking-widest"
              >
                Huỷ
              </button>
              <button 
                type="submit"
                form="user-account-form"
                className="flex-1 px-4 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs transition-all shadow-xl shadow-indigo-100 dark:shadow-none uppercase tracking-widest"
              >
                Xác nhận
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default UserModal;
