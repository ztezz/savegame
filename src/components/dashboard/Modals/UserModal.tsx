
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserAccount } from '../types';

interface UserModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  editingUser: UserAccount | null;
  userName: string;
  setUserName: (name: string) => void;
  userEmail: string;
  setUserEmail: (email: string) => void;
  userPassword: string;
  setUserPassword: (password: string) => void;
  userRole: 'Admin' | 'User';
  setUserRole: (role: 'Admin' | 'User') => void;
  userStatus: 'Active' | 'Locked';
  setUserStatus: (status: 'Active' | 'Locked') => void;
}

const UserModal: React.FC<UserModalProps> = ({
  show, onClose, onSubmit, editingUser,
  userName, setUserName,
  userEmail, setUserEmail,
  userPassword, setUserPassword,
  userRole, setUserRole,
  userStatus, setUserStatus
}) => {
  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-white/20"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                  {editingUser ? 'Cập nhật tài khoản' : 'Thêm tài khoản mới'}
                </h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-900 font-bold text-xs uppercase">Đóng</button>
              </div>
              
              <form onSubmit={onSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Tên hiển thị</label>
                  <input 
                    type="text"
                    required
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full px-4 py-4 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Email liên lạc</label>
                  <input 
                    type="email"
                    required
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full px-4 py-4 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Mật khẩu {editingUser && '(để trống nếu không đổi)'}</label>
                  <input 
                    type="password"
                    required={!editingUser}
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-4 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Vai trò</label>
                    <select 
                      value={userRole}
                      onChange={(e) => setUserRole(e.target.value as any)}
                      className="w-full px-4 py-4 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight bg-white"
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
                      className="w-full px-4 py-4 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold text-sm tracking-tight bg-white"
                    >
                      <option value="Active">Hoạt động</option>
                      <option value="Locked">Khoá lại</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs transition-all uppercase tracking-widest"
                  >
                    Huỷ
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs transition-all shadow-xl shadow-indigo-100 uppercase tracking-widest"
                  >
                    Xác nhận
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default UserModal;
