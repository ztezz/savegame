
import React from 'react';
import { 
  LayoutDashboard, Library, Laptop, 
  Settings, User, LogOut, KeyRound, Download
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  currentUser: any;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, currentUser, onLogout }) => {
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
        <button 
          onClick={() => setActiveTab('downloads')}
          className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'downloads' ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <Download className="w-4 h-4" />
          Tải Desktop App
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
        <div className="flex items-center justify-between mb-4">
           <div className="flex items-center gap-3">
             <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold ring-2 ring-slate-800">
               {currentUser?.username?.charAt(0) || 'U'}
             </div>
             <div>
               <p className="text-xs font-bold text-white truncate max-w-[100px]">{currentUser?.username || 'Chỉ huy'}</p>
               <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">{currentUser?.role || 'Trực tuyến'}</p>
               </div>
             </div>
           </div>
           <button onClick={onLogout} className="text-slate-500 hover:text-white transition-colors" title="Đăng xuất">
             <LogOut className="w-4 h-4" />
           </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
