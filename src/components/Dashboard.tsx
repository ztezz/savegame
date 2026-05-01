
import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { Search, Plus } from 'lucide-react';
import JSZip from 'jszip';

// Sub-components
import Sidebar from './dashboard/Sidebar';
import OverviewTab from './dashboard/Tabs/OverviewTab';
import LibraryTab from './dashboard/Tabs/LibraryTab';
import DevicesTab from './dashboard/Tabs/DevicesTab';
import UsersTab from './dashboard/Tabs/UsersTab';
import SettingsTab from './dashboard/Tabs/SettingsTab';
import ActivationTab from './dashboard/Tabs/ActivationTab';
import { DownloadApp } from './DownloadApp';
import { ActivationFile } from './dashboard/Tabs/ActivationTab';


// Modals
import HistoryModal from './dashboard/Modals/HistoryModal';
import DeleteConfirmModal from './dashboard/Modals/DeleteConfirmModal';
import UploadModal from './dashboard/Modals/UploadModal';
import UserModal from './dashboard/Modals/UserModal';
import RenameGameModal from './dashboard/Modals/RenameGameModal';

// Types and Constants
import { GameSave, UserAccount, CATEGORIES } from './dashboard/types';

export default function Dashboard({ onLogout, currentUser }: { onLogout: () => void, currentUser: any }) {
  const [games, setGames] = useState<GameSave[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [newGameCategory, setNewGameCategory] = useState('Other');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isFolderUpload, setIsFolderUpload] = useState(false);
  const [filterCategory, setFilterCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'category'>('name');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'library' | 'devices' | 'settings' | 'users' | 'activation' | 'downloads'>('dashboard');
  
  // Activation Files State
  const [activationFiles, setActivationFiles] = useState<ActivationFile[]>([]);
  
  // Background Sync State
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncInterval, setSyncInterval] = useState(5); // Minutes
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // History State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedGameForHistory, setSelectedGameForHistory] = useState<GameSave | null>(null);
  const [gameHistory, setGameHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Delete Confirmation State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Rename Game State
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [selectedGameForRename, setSelectedGameForRename] = useState<GameSave | null>(null);

  // User Management State
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<'Admin' | 'User'>('User');
  const [userStatus, setUserStatus] = useState<'Active' | 'Locked'>('Active');
  const [userPassword, setUserPassword] = useState('');

  const handleOpenNew = () => {
    setNewGameName('');
    setNewGameCategory('Other');
    setShowUploadModal(true);
  };

  const handleOpenUpdate = (game: GameSave) => {
    setNewGameName(game.gameName);
    setNewGameCategory(game.category);
    setShowUploadModal(true);
  };

  const handleOpenHistory = async (game: GameSave) => {
    setSelectedGameForHistory(game);
    setHistoryLoading(true);
    setShowHistoryModal(true);
    try {
      const res = await api.get(`/save/history/${game.id}`);
      setGameHistory(res.data);
    } catch (err) {
      console.error(err);
      alert('Không thể tải lịch sử');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenRenameModal = (game: GameSave) => {
    setSelectedGameForRename(game);
    setShowRenameModal(true);
  };

  const handleSaveRename = async (gameName: string, category: string) => {
    if (!selectedGameForRename) return;
    try {
      await api.put(`/game/${selectedGameForRename.id}`, { gameName, category });
      fetchGames();
      alert('Cập nhật tên game thành công');
    } catch (err) {
      alert('Cập nhật thất bại');
    }
  };

  const handleOpenUserModal = (user?: UserAccount) => {
    if (user) {
      setEditingUser(user);
      setUserName(user.username || user.name || '');
      setUserEmail(user.email);
      setUserRole(user.role);
      setUserStatus(user.status);
    } else {
      setEditingUser(null);
      setUserName('');
      setUserEmail('');
      setUserRole('User');
      setUserStatus('Active');
    }
    setUserPassword('');
    setShowUserModal(true);
  };

  const fetchUsers = async () => {
    if (currentUser?.role !== 'Admin') return;
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const userData = {
        username: userName,
        email: userEmail,
        role: userRole,
        status: userStatus,
        password: userPassword || undefined
      };

      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, userData);
      } else {
        await api.post('/users', userData);
      }
      fetchUsers();
      setShowUserModal(false);
    } catch (err) {
      alert('Lưu người dùng thất bại');
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (confirm('Xác nhận xoá tài khoản này?')) {
      try {
        await api.delete(`/users/${id}`);
        fetchUsers();
      } catch (err) {
        alert('Xoá thất bại');
      }
    }
  };

  const fetchGames = async () => {
    try {
      const res = await api.get('/save/list');
      setGames(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGames();
    fetchSyncLogs();
    fetchActivationFiles();
  }, []);

  const fetchActivationFiles = async () => {
    try {
      const res = await api.get('/activation/list');
      setActivationFiles(res.data);
    } catch {}
  };

  const fetchSyncLogs = async () => {
    try {
      const res = await api.get('/sync/logs');
      setSyncLogs(res.data);
    } catch (err) {
      console.error('Failed to fetch sync logs', err);
    }
  };

  const logSyncEvent = async (status: string, message: string) => {
    try {
      const log = { deviceName: 'Web Browser', status, message };
      await api.post('/sync/log', log);
      fetchSyncLogs();
    } catch (err) {
      console.error('Failed to log sync event', err);
    }
  };

  const handleSelectDirectory = async () => {
    if (!('showDirectoryPicker' in window)) {
      alert('Trình duyệt của bạn không hỗ trợ API truy cập thư mục. Vui lòng sử dụng Chrome hoặc Edge phiên bản mới nhất.');
      return;
    }
    try {
      const handle = await (window as any).showDirectoryPicker();
      setDirectoryHandle(handle);
      setAutoSyncEnabled(true);
      logSyncEvent('Info', 'Đã kết nối với thư mục địa phương');
    } catch (err) {
      console.error('Directory picker cancelled or failed', err);
    }
  };

  const performSync = async () => {
    if (!directoryHandle || isSyncing) return;
    
    setIsSyncing(true);
    let syncedCount = 0;
    try {
      const processEntry = async (entry: any, currentPath: string = '') => {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          if (file.size < 50 * 1024 * 1024) { 
            const formData = new FormData();
            formData.append('savefile', file);
            formData.append('gameName', currentPath || 'AutoSync_Game');
            formData.append('category', 'AutoSync');
            formData.append('deviceName', 'AutoSync');
            
            try {
              await api.post('/save/upload', formData);
              syncedCount++;
            } catch (err) {
              console.error(`Failed to sync ${file.name}`, err);
            }
          }
        } else if (entry.kind === 'directory') {
          for await (const child of entry.values()) {
            await processEntry(child, currentPath ? `${currentPath}/${entry.name}` : entry.name);
          }
        }
      };

      for await (const entry of directoryHandle.values()) {
        await processEntry(entry);
      }

      setLastSyncTime(new Date().toISOString());
      if (syncedCount > 0) {
        logSyncEvent('Success', `Đồng bộ thành công ${syncedCount} tệp`);
        fetchGames();
      }
    } catch (err) {
      console.error('Sync failed', err);
      logSyncEvent('Error', 'Đồng bộ tự động thất bại');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    let intervalId: any;
    if (autoSyncEnabled && directoryHandle) {
      performSync();
      intervalId = setInterval(() => {
        performSync();
      }, syncInterval * 60 * 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoSyncEnabled, directoryHandle, syncInterval]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isFolderUpload && selectedFiles.length === 0) return;
    if (!isFolderUpload && !selectedFile) return;
    if (!newGameName) return;

    const formData = new FormData();
    if (isFolderUpload) {
      setUploadProgress(1);
      const zip = new JSZip();
      selectedFiles.forEach((file: any) => {
        const path = file.webkitRelativePath || file.name;
        zip.file(path, file);
      });
      const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setUploadProgress(Math.floor(metadata.percent / 2));
      });
      formData.append('savefile', zipBlob, `${newGameName}.zip`);
    } else {
      formData.append('savefile', selectedFile!);
    }
    formData.append('gameName', newGameName);
    formData.append('category', newGameCategory);
    formData.append('deviceName', 'Web Dashboard');

    try {
      if (!isFolderUpload) setUploadProgress(0);
      await api.post('/save/upload', formData, {
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 100));
          if (isFolderUpload) {
            setUploadProgress(50 + Math.floor(percent / 2));
          } else {
            setUploadProgress(percent);
          }
        }
      });
      setShowUploadModal(false);
      setSelectedFile(null);
      setSelectedFiles([]);
      setNewGameName('');
      fetchGames();
    } catch (err) {
      alert('Tải lên thất bại');
    } finally {
      setUploadProgress(null);
    }
  };

  const handleDownload = async (saveId: number) => {
    try {
      const response = await api.get(`/save/download/${saveId}`, { responseType: 'blob' });
      const contentDisposition = response.headers['content-disposition'];
      let fileName = `save_${saveId}.zip`;
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/i);
        if (fileNameMatch && fileNameMatch[1]) {
          fileName = fileNameMatch[1];
        }
      }
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      alert('Tải xuống thất bại');
    }
  };

  const handleDelete = async (saveId: number) => {
    setDeleteId(saveId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/save/${deleteId}`);
      setShowDeleteConfirm(false);
      setDeleteId(null);
      fetchGames();
      if (showHistoryModal && selectedGameForHistory) {
        handleOpenHistory(selectedGameForHistory);
      }
    } catch (err) {
      alert('Xoá thất bại');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredGames = games
    .filter(g => (filterCategory === 'All' || g.category === filterCategory))
    .filter(g => g.gameName.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.gameName.localeCompare(b.gameName);
      return a.category.localeCompare(b.category);
    });

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={onLogout} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-800">Cụm đồng bộ VPS Node.js</h2>
            {activeTab === 'library' && (
              <>
                <div className="hidden md:flex items-center bg-slate-50 rounded-full pl-3 pr-1 py-1 border border-slate-100">
                   <Search className="w-3.5 h-3.5 text-slate-400" />
                   <input 
                     type="text" 
                     placeholder="Tìm bản lưu..." 
                     className="bg-transparent border-none focus:ring-0 text-xs px-2 w-48 text-slate-600 font-medium" 
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                   />
                </div>
                <select 
                  className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="All">Tất cả thể loại</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select 
                  className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                >
                  <option value="name">Xếp theo tên</option>
                  <option value="category">Xếp theo thể loại</option>
                </select>
              </>
            )}
          </div>
          <div className="flex items-center gap-6">
            {(activeTab === 'library' || activeTab === 'dashboard') && (
              <>
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Dung lượng bộ nhớ</p>
                  <p className="text-sm font-mono text-slate-700 font-bold">
                    {formatSize(games.reduce((acc, g) => acc + (g.latestSave?.fileSize || 0), 0))} đã dùng
                  </p>
                </div>
                <div className="w-px h-10 bg-slate-100 hidden sm:block"></div>
              </>
            )}
            {(activeTab === 'library' || activeTab === 'dashboard') && (
              <button 
                onClick={handleOpenNew}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                ĐẨY BẢN LƯU MỚI
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 p-8 grid grid-cols-12 gap-8 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <OverviewTab 
              games={games} 
              setActiveTab={setActiveTab} 
              handleOpenHistory={handleOpenHistory} 
              handleDownload={handleDownload} 
            />
          )}

          {activeTab === 'library' && (
            <LibraryTab 
              loading={loading}
              games={games}
              filteredGames={filteredGames}
              handleOpenUpdate={handleOpenUpdate}
              handleOpenHistory={handleOpenHistory}
              handleDownload={handleDownload}
              handleDelete={handleDelete}
              handleOpenRenameModal={handleOpenRenameModal}
              formatSize={formatSize}
            />
          )}

          {activeTab === 'devices' && <DevicesTab />}

          {activeTab === 'settings' && (
            <SettingsTab 
              autoSyncEnabled={autoSyncEnabled}
              setAutoSyncEnabled={setAutoSyncEnabled}
              directoryHandle={directoryHandle}
              handleSelectDirectory={handleSelectDirectory}
              syncInterval={syncInterval}
              setSyncInterval={setSyncInterval}
            />
          )}

          {activeTab === 'users' && (
            <UsersTab 
              users={users}
              handleOpenUserModal={handleOpenUserModal}
              handleDeleteUser={handleDeleteUser}
            />
          )}

          {activeTab === 'activation' && (
            <ActivationTab
              activationFiles={activationFiles}
              onRefresh={fetchActivationFiles}
              formatSize={formatSize}
            />
          )}

          {activeTab === 'downloads' && (
            <div className="col-span-12">
              <DownloadApp />
            </div>
          )}

        </div>
      </main>

      <DeleteConfirmModal 
        show={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
      />

      <HistoryModal 
        show={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        selectedGame={selectedGameForHistory}
        history={gameHistory}
        loading={historyLoading}
        onDownload={handleDownload}
        onDelete={handleDelete}
        formatSize={formatSize}
      />

      <UploadModal 
        show={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSubmit={handleUpload}
        newGameName={newGameName}
        setNewGameName={setNewGameName}
        newGameCategory={newGameCategory}
        setNewGameCategory={setNewGameCategory}
        isFolderUpload={isFolderUpload}
        setIsFolderUpload={setIsFolderUpload}
        selectedFile={selectedFile}
        setSelectedFile={setSelectedFile}
        selectedFiles={selectedFiles}
        setSelectedFiles={setSelectedFiles}
        uploadProgress={uploadProgress}
      />

      <RenameGameModal
        show={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        onSubmit={handleSaveRename}
        initialGameName={selectedGameForRename?.gameName || ''}
        initialCategory={selectedGameForRename?.category || 'Uncategorized'}
      />

      <UserModal 
        show={showUserModal}
        onClose={() => setShowUserModal(false)}
        onSubmit={handleSaveUser}
        editingUser={editingUser}
        userName={userName}
        setUserName={setUserName}
        userEmail={userEmail}
        setUserEmail={setUserEmail}
        userPassword={userPassword}
        setUserPassword={setUserPassword}
        userRole={userRole}
        setUserRole={setUserRole}
        userStatus={userStatus}
        setUserStatus={setUserStatus}
      />
    </div>
  );
}
