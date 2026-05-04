
import React from 'react';
import { 
  LayoutDashboard, Library, Laptop, 
  Settings, User, LogOut, KeyRound, Lock
} from 'lucide-react';
import { motion } from 'motion/react';

type TabType = 'dashboard' | 'library' | 'devices' | 'settings' | 'users' | 'activation' | 'category' | 'account';
interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  currentUser: any;
  onLogout: () => void;
  onOpenChangePassword?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, currentUser, onLogout, onOpenChangePassword }) => {
  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col border-r border-slate-800 shrink-0">
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl">S</div>
          <h1 className="text-xl font-bold tracking-tight">CloudSave</h1>
        </div>
        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-black">Vsync Pro v2.4</p>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <div className="text-[10px] text-slate-500 uppercase font-bold px-2 py-1 mb-1">Quản lý</div>
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <LayoutDashboard className="w-4 h-4" />
          Bảng điều khiển
        </button>
        <button 
          onClick={() => setActiveTab('library')}
          className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'library' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Library className="w-4 h-4" />
          Thư viện Game
        </button>
        <button 
          onClick={() => setActiveTab('category')}
          className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'category' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Library className="w-4 h-4" />
          Quản lý thể loại
        </button>
        <button 
          onClick={() => setActiveTab('devices')}
          className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'devices' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Laptop className="w-4 h-4" />
          Thiết bị kết nối
        </button>
        <button 
          onClick={() => setActiveTab('activation')}
          className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'activation' ? 'bg-amber-500 text-white shadow-lg shadow-amber-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <KeyRound className="w-4 h-4" />
          File kích hoạt
        </button>

        <div className="text-[10px] text-slate-500 uppercase font-bold px-2 py-1 mt-6 mb-1">Kỹ thuật</div>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Settings className="w-4 h-4" />
          Cài đặt hệ thống
        </button>
        {(currentUser?.role?.toLowerCase() === 'admin' || currentUser?.username === 'admin') && (
          <button 
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <User className="w-4 h-4" />
            Quản lý tài khoản
          </button>
        )}
      </nav>

      <div className="p-6 bg-slate-950 border-t border-slate-800">
        <motion.div 
          className="flex items-center justify-between mb-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <motion.div 
              className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-sm font-bold ring-2 ring-indigo-400/30 flex-shrink-0"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              {currentUser?.username?.charAt(0).toUpperCase() || 'U'}
            </motion.div>
            <div className="min-w-0 flex-1">
              <motion.p 
                className="text-xs font-black text-white truncate"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                {currentUser?.username || 'Chỉ huy'}
              </motion.p>
              <motion.div 
                className="flex items-center gap-1.5 mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <motion.span 
                  className="w-1.5 h-1.5 bg-emerald-500 rounded-full"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <p className="text-[8px] text-emerald-400 font-bold uppercase tracking-wider">{currentUser?.role || 'Online'}</p>
              </motion.div>
            </div>
          </div>
          <motion.button 
            onClick={onLogout}
            className="text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all rounded-lg p-1.5 flex-shrink-0"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </motion.button>
        </motion.div>
        <motion.div 
          className="text-[10px] text-slate-400 text-center mb-4 pb-4 border-b border-slate-800"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <p>👋 Xin chào, {currentUser?.username}!</p>
        </motion.div>
        
        <motion.button
          onClick={onOpenChangePassword}
          className="w-full flex items-center gap-2 px-4 py-3 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all text-xs font-bold uppercase tracking-widest"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          title="Đổi mật khẩu"
        >
          <Lock className="w-4 h-4" />
          Đổi mật khẩu
        </motion.button>
      </div>
    </aside>
  );
};

export default Sidebar;
