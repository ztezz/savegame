import React from 'react';
import {
  Database, FileText, HardDrive, KeyRound, Laptop, LayoutDashboard,
  Library, Link2, MessageCircle, Settings, Tags, User, Users, X,
} from 'lucide-react';

export type TabType = 'dashboard' | 'library' | 'drive' | 'shared-links' | 'community' | 'devices' | 'settings' | 'logs' | 'users' | 'activation' | 'category' | 'account' | 'sqlite';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  currentUser: any;
  mobileOpen?: boolean;
  onClose?: () => void;
}

const primaryItems = [
  { tab: 'dashboard', label: 'Bảng điều khiển', icon: LayoutDashboard },
  { tab: 'library', label: 'Thư viện Game', icon: Library },
  { tab: 'category', label: 'Quản lý thể loại', icon: Tags },
  { tab: 'drive', label: 'Drive cá nhân', icon: HardDrive },
  { tab: 'shared-links', label: 'Link chia sẻ', icon: Link2 },
  { tab: 'community', label: 'Chat cộng đồng', icon: MessageCircle },
  { tab: 'devices', label: 'Thiết bị kết nối', icon: Laptop },
  { tab: 'activation', label: 'File kích hoạt', icon: KeyRound },
] as const;

const technicalItems = [
  { tab: 'settings', label: 'Cài đặt hệ thống', icon: Settings },
  { tab: 'account', label: 'Hồ sơ của tôi', icon: User },
] as const;

const adminItems = [
  { tab: 'sqlite', label: 'Quản lý SQLite', icon: Database },
  { tab: 'logs', label: 'Nhật ký hệ thống', icon: FileText },
  { tab: 'users', label: 'Quản lý tài khoản', icon: Users },
] as const;

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, currentUser, mobileOpen = false, onClose }) => {
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';
  const selectTab = (tab: TabType) => {
    setActiveTab(tab);
    onClose?.();
  };
  const renderItems = (items: ReadonlyArray<{ tab: TabType; label: string; icon: React.ComponentType<{ className?: string }> }>) =>
    items.map(({ tab, label, icon: Icon }) => (
      <button
        key={tab}
        onClick={() => selectTab(tab)}
        aria-current={activeTab === tab ? 'page' : undefined}
        className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-semibold transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
      >
        <Icon className="w-4 h-4" />
        {label}
      </button>
    ));

  return (
    <>
      {mobileOpen && <button className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden" onClick={onClose} aria-label="Đóng menu" />}
      <aside className={`${mobileOpen ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-white flex-col border-r border-slate-800 shadow-2xl lg:static lg:z-auto lg:flex lg:w-64 lg:shadow-none shrink-0`}>
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center overflow-hidden">
                <img src="/logo.svg" alt="CloudSave logo" className="w-7 h-7 object-contain" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">CloudSave</h1>
            </div>
            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-black">Trung tâm đồng bộ</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white lg:hidden" aria-label="Đóng menu"><X className="w-5 h-5" /></button>
        </div>
        <nav className="sidebar-scrollbar flex-1 space-y-2 overflow-y-auto p-4 pr-2" aria-label="Điều hướng bảng điều khiển">
          <div className="text-[10px] text-slate-500 uppercase font-bold px-2 py-1">Quản lý</div>
          {renderItems(primaryItems)}
          <div className="text-[10px] text-slate-500 uppercase font-bold px-2 pt-5 pb-1">Tài khoản & kỹ thuật</div>
          {renderItems(technicalItems)}
          {isAdmin && <div className="text-[10px] text-slate-500 uppercase font-bold px-2 pt-5 pb-1">Quản trị</div>}
          {isAdmin && renderItems(adminItems)}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
