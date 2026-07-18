
import React, { useState, useEffect, lazy, Suspense } from 'react';
import api, { uploadWithProgress } from '../utils/api';
import { savesApi } from '../utils/apiClient';
import { Search, Plus, User, LogOut, Lock, Menu, Moon, Sun } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useDynamicCategories } from '../hooks/useDynamicCategories';

// Sub-components
import Sidebar, { TabType as DashboardTab } from './dashboard/Sidebar';
const OverviewTab = lazy(() => import('./dashboard/Tabs/OverviewTab'));
const LibraryTab = lazy(() => import('./dashboard/Tabs/LibraryTab'));
const DevicesTab = lazy(() => import('./dashboard/Tabs/DevicesTab'));
const UsersTab = lazy(() => import('./dashboard/Tabs/UsersTab'));
const SettingsTab = lazy(() => import('./dashboard/Tabs/SettingsTab'));
const SystemLogsTab = lazy(() => import('./dashboard/Tabs/SystemLogsTab'));
const AccountTab = lazy(() => import('./dashboard/Tabs/AccountTab'));
const ActivationTab = lazy(() => import('./dashboard/Tabs/ActivationTab'));
const CategoryTab = lazy(() => import('./dashboard/Tabs/CategoryTab'));
const DriveTab = lazy(() => import('./dashboard/Tabs/DriveTab'));
const CommunityChatTab = lazy(() => import('./dashboard/Tabs/CommunityChatTab'));
const SqliteAdminTab = lazy(() => import('./dashboard/Tabs/SqliteAdminTab'));
import { ActivationFile } from './dashboard/Tabs/ActivationTab';

// Modals
const HistoryModal = lazy(() => import('./dashboard/Modals/HistoryModal'));
const DeleteConfirmModal = lazy(() => import('./dashboard/Modals/DeleteConfirmModal'));
const UploadModal = lazy(() => import('./dashboard/Modals/UploadModal'));
const UserModal = lazy(() => import('./dashboard/Modals/UserModal'));
const RenameGameModal = lazy(() => import('./dashboard/Modals/RenameGameModal'));
const ChangePasswordModal = lazy(() => import('./dashboard/Modals/ChangePasswordModal'));

// Types and Constants
import { GameSave, UserAccount, RestoreStatusItem } from './dashboard/types';

const DASHBOARD_TABS: DashboardTab[] = ['dashboard', 'library', 'drive', 'community', 'devices', 'settings', 'logs', 'users', 'activation', 'category', 'account', 'sqlite'];
const ADMIN_TABS: DashboardTab[] = ['logs', 'users', 'sqlite'];

const getInitialDashboardTab = (): DashboardTab => {
  const saved = localStorage.getItem('dashboardActiveTab');
  return DASHBOARD_TABS.includes(saved as DashboardTab) ? saved as DashboardTab : 'dashboard';
};

export default function Dashboard({ onLogout, currentUser, onUserUpdate }: { onLogout: () => void, currentUser: any, onUserUpdate: (user: any) => void }) {
  const { showToast } = useToast();
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';
  const { categories, fetchCategories: refetchCategories } = useDynamicCategories();
  const [games, setGames] = useState<GameSave[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [newGameCategory, setNewGameCategory] = useState('Other');
  const [newGameFilePath, setNewGameFilePath] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isFolderUpload, setIsFolderUpload] = useState(false);
  const [filterCategory, setFilterCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'category'>('name');
  const [activeTab, setActiveTab] = useState<DashboardTab>(getInitialDashboardTab);
  
  // Activation Files State
  const [activationFiles, setActivationFiles] = useState<ActivationFile[]>([]);
  
  // Background Sync State
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncInterval, setSyncInterval] = useState(5); // Minutes
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [devices, setDevices] = useState<string[]>([]);
  const [targetDevice, setTargetDevice] = useState('');
  const [restoreStatusMap, setRestoreStatusMap] = useState<Record<number, RestoreStatusItem>>({});
  const [agentOnlineMap, setAgentOnlineMap] = useState<Record<string, boolean>>({});
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
  const [bulkDeleteIds, setBulkDeleteIds] = useState<number[]>([]);

  // Rename Game State
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [selectedGameForRename, setSelectedGameForRename] = useState<GameSave | null>(null);

  // User Management State
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [userUsername, setUserUsername] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<'Admin' | 'User'>('User');
  const [userStatus, setUserStatus] = useState<'Active' | 'Locked'>('Active');
  const [userPassword, setUserPassword] = useState('');
  const [userDriveQuotaMb, setUserDriveQuotaMb] = useState('');

  // Change Password State
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('dashboardDarkMode') === '1');

  useEffect(() => {
    localStorage.setItem('dashboardActiveTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (ADMIN_TABS.includes(activeTab) && !isAdmin) setActiveTab('dashboard');
  }, [activeTab, isAdmin]);

  useEffect(() => {
    localStorage.setItem('dashboardDarkMode', darkMode ? '1' : '0');
  }, [darkMode]);

  const pageTitles: Record<typeof activeTab, { title: string; description: string }> = {
    dashboard: {
      title: 'Tổng quan đồng bộ',
      description: 'Theo dõi trạng thái bản lưu và các hoạt động gần đây.',
    },
    library: {
      title: 'Thư viện bản lưu',
      description: 'Tìm kiếm, tải xuống, khôi phục và quản lý dữ liệu game.',
    },
    drive: {
      title: 'Drive cá nhân',
      description: 'Lưu trữ, tải xuống và quản lý file cá nhân của bạn.',
    },
    community: {
      title: 'Chat cộng đồng',
      description: 'Trao đổi nhanh với các thành viên đang dùng CloudSave.',
    },
    devices: {
      title: 'Thiết bị kết nối',
      description: 'Quản lý agent, API key và trạng thái liên kết thiết bị.',
    },
    settings: {
      title: 'Cài đặt hệ thống',
      description: 'Cấu hình đồng bộ tự động và tuỳ chọn vận hành.',
    },
    logs: {
      title: 'Nhật ký hệ thống',
      description: 'Theo dõi hoạt động, lỗi API và thay đổi cấu hình quan trọng.',
    },
    users: {
      title: 'Tài khoản người dùng',
      description: 'Quản lý quyền truy cập và trạng thái tài khoản.',
    },
    activation: {
      title: 'File kích hoạt',
      description: 'Theo dõi và quản lý các file kích hoạt đã tải lên.',
    },
    category: {
      title: 'Quản lý thể loại',
      description: 'Sắp xếp thư viện game theo nhóm dễ tìm kiếm hơn.',
    },
    account: {
      title: 'Hồ sơ của tôi',
      description: 'Cập nhật thông tin cá nhân và bảo mật tài khoản.',
    },
    sqlite: {
      title: 'Quản lý SQLite',
      description: 'Duyệt dữ liệu, chạy SQL, bảo trì và sao lưu cơ sở dữ liệu server.',
    },
  };

  const handleOpenNew = () => {
    setNewGameName('');
    setNewGameCategory('Other');
    setNewGameFilePath('');
    setShowUploadModal(true);
  };

  const handleOpenUpdate = (game: GameSave) => {
    console.log('📤 handleOpenUpdate clicked', game.gameName);
    setNewGameName(game.gameName);
    setNewGameCategory(game.category);
    setNewGameFilePath(game.latestSave?.savePath || '');
    setShowUploadModal(true);
  };

  const handleOpenHistory = async (game: GameSave) => {
    console.log('🕐 handleOpenHistory clicked', game.gameName);
    setSelectedGameForHistory(game);
    setHistoryLoading(true);
    setShowHistoryModal(true);
    try {
      const res = await api.get(`/save/history/${game.id}`);
      setGameHistory(res.data);
    } catch (err) {
      console.error(err);
      showToast('Không thể tải lịch sử', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenRenameModal = (game: GameSave) => {
    console.log('✏️ handleOpenRenameModal clicked', game.gameName);
    setSelectedGameForRename(game);
    setShowRenameModal(true);
  };

  const handleSaveRename = async (gameName: string, category: string, filePath: string) => {
    if (!selectedGameForRename || !selectedGameForRename.latestSave) return;
    try {
      // Update game name and category
      await api.put(`/game/${selectedGameForRename.id}`, { gameName, category });
      
      // Update save file path if provided
      if (filePath) {
        await api.put(`/save/${selectedGameForRename.latestSave.id}`, { filePath });
      }
      
      fetchGames();
      showToast('✅ Cập nhật thành công', 'success', 3000);
    } catch (err) {
      showToast('❌ Cập nhật thất bại', 'error', 3000);
    }
  };

  const handleOpenUserModal = (user?: UserAccount) => {
    if (user) {
      setEditingUser(user);
      setUserUsername(user.username);
      setUserDisplayName(user.display_name || user.name || user.username);
      setUserEmail(user.email);
      setUserRole(user.role);
      setUserStatus(user.status);
      setUserDriveQuotaMb(user.drive_quota_mb ? String(user.drive_quota_mb) : '');
    } else {
      setEditingUser(null);
      setUserUsername('');
      setUserDisplayName('');
      setUserEmail('');
      setUserRole('User');
      setUserStatus('Active');
      setUserDriveQuotaMb('');
    }
    setUserPassword('');
    setShowUserModal(true);
  };


  const handleSaveMyProfile = async (payload: { display_name: string; email: string }) => {
    try {
      const res = await api.put('/users/me', payload);
      const nextUser = { ...(currentUser || {}), ...res.data.user };
      localStorage.setItem('user', JSON.stringify(nextUser));
      onUserUpdate(nextUser);
      showToast('Cập nhật tài khoản thành công', 'success', 2500);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không thể cập nhật tài khoản', 'error', 3000);
      throw err;
    }
  };

  const fetchUsers = async () => {
    if (!isAdmin) return;
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
        username: editingUser ? editingUser.username : userUsername,
        display_name: userDisplayName || userUsername,
        email: userEmail,
        role: userRole,
        status: userStatus,
        drive_quota_mb: userDriveQuotaMb ? Number(userDriveQuotaMb) : null,
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
      showToast('Lưu người dùng thất bại', 'error');
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      await api.delete(`/users/${id}`);
      fetchUsers();
    } catch (err) {
      showToast('Xoá thất bại', 'error');
    }
  };

  const handleChangePassword = async (oldPassword: string, newPassword: string, confirmPassword: string) => {
    if (newPassword !== confirmPassword) {
      showToast('Mật khẩu mới và xác nhận không khớp!', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Mật khẩu phải có ít nhất 6 ký tự!', 'error');
      return;
    }

    setChangePasswordLoading(true);
    try {
      await api.post('/auth/change-password', {
        oldPassword,
        newPassword
      });
      showToast('Đổi mật khẩu thành công!', 'success');
      setShowChangePasswordModal(false);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Đổi mật khẩu thất bại', 'error');
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const fetchGames = async () => {
    try {
      console.log('📋 Fetching games list...');
      const res = await api.get('/save/list');
      console.log('📋 Games fetched:', res.data.length, 'games');
      res.data.forEach((g: any) => {
        console.log(`  - ${g.gameName}: ${g.latestSave ? `save #${g.latestSave.id}` : 'no save'}`);
      });
      setGames(res.data);
      console.log('✅ Games state updated');
    } catch (err) {
      console.error('❌ Error fetching games:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch games immediately for quick dashboard load
    fetchGames();
  }, []);

  useEffect(() => {
    // Lazy load sync logs and activation after main content renders
    const timer = setTimeout(() => {
      fetchSyncLogs();
      fetchDevices();
      fetchActivationFiles();
      fetchRestoreStatuses();
      fetchAgentOnlineStatus();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      fetchRestoreStatuses();
      fetchAgentOnlineStatus();
    }, 15000);

    return () => clearInterval(poll);
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

  const fetchDevices = async () => {
    try {
      const res = await api.get('/sync/devices');
      const list = Array.isArray(res.data) ? res.data : [];
      setDevices(list);
      if (!targetDevice && list.length > 0) {
        setTargetDevice(list[0]);
      }
    } catch (err) {
      console.error('Failed to fetch devices', err);
    }
  };

  const fetchRestoreStatuses = async () => {
    try {
      const res = await api.get('/sync/restore-status');
      const list: RestoreStatusItem[] = Array.isArray(res.data) ? res.data : [];
      const map: Record<number, RestoreStatusItem> = {};
      list.forEach((item) => {
        if (typeof item.gameId === 'number') {
          map[item.gameId] = item;
        }
      });
      setRestoreStatusMap(map);
    } catch (err) {
      console.error('Failed to fetch restore statuses', err);
    }
  };

  const fetchAgentOnlineStatus = async () => {
    try {
      const res = await api.get('/sync/agent-online');
      const list: { deviceName: string; online: boolean }[] = Array.isArray(res.data) ? res.data : [];
      const map: Record<string, boolean> = {};
      list.forEach((item) => { map[item.deviceName] = item.online; });
      setAgentOnlineMap(map);
    } catch (err) {
      console.error('Failed to fetch agent online status', err);
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
      showToast('Trình duyệt của bạn không hỗ trợ API truy cập thư mục. Vui lòng sử dụng Chrome hoặc Edge phiên bản mới nhất.', 'error', 5000);
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
      // Lazy load JSZip only when needed
      const { default: JSZip } = await import('jszip');
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
    if (newGameFilePath) {
      formData.append('customFilePath', newGameFilePath);
    }

    try {
      if (!isFolderUpload) setUploadProgress(0);
      
      await uploadWithProgress('/save/upload', formData, (progress) => {
        setUploadProgress(progress);
      });
      
      // Set to 100% to trigger success notification
      setUploadProgress(100);
      
      setShowUploadModal(false);
      setSelectedFile(null);
      setSelectedFiles([]);
      setNewGameName('');
      fetchGames();
      showToast('✅ Tải lên bản lưu thành công!', 'success', 3000);
    } catch (err) {
      showToast('❌ Tải lên thất bại', 'error', 3000);
      console.error(err);
    } finally {
      setUploadProgress(null);
    }
  };

  const handleDownload = async (saveId: number) => {
    console.log('📥 handleDownload clicked, saveId:', saveId);
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
      showToast('✅ Tải xuống thành công!', 'success');
    } catch (err: any) {
      console.error('❌ Download error:', {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message
      });
      
      let errorMessage = '❌ Tải xuống thất bại';
      if (err.response?.status === 404) {
        errorMessage = '❌ Bản lưu không tồn tại. Có thể nó đã bị xóa hoặc không được tìm thấy.';
        console.log('📋 Save may have been deleted. Refreshing list in 2 seconds...');
        setTimeout(() => fetchGames(), 2000);
      } else if (err.response?.status === 403) {
        errorMessage = '❌ Bạn không có quyền truy cập bản lưu này.';
      } else if (err.response?.status === 401) {
        errorMessage = '❌ Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
      } else if (err.response?.data?.error) {
        errorMessage = `❌ ${err.response.data.error}`;
      }
      
      showToast(errorMessage, 'error');
    }
  };

  const handleRemoteRestore = async (game: GameSave) => {
    if (!game.latestSave) {
      showToast('❌ Game chưa có save để khôi phục', 'error', 2500);
      return;
    }

    if (!targetDevice) {
      showToast('❌ Vui lòng chọn device trước khi khôi phục', 'error', 3000);
      return;
    }

    try {
      await api.post('/restore', {
        save_id: game.latestSave.id,
        device_id: targetDevice,
      });
      fetchRestoreStatuses();
      showToast(`✅ Đã gửi lệnh khôi phục cho ${game.gameName} (${targetDevice})`, 'success', 3000);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Không thể gửi lệnh khôi phục';
      showToast(`❌ ${msg}`, 'error', 3000);
    }
  };

  const handleRetryRestore = async (commandId: number) => {
    try {
      await api.post(`/sync/commands/${commandId}/retry`);
      fetchRestoreStatuses();
      showToast('✅ Đã gửi lệnh retry', 'success', 2500);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Không thể retry';
      showToast(`❌ ${msg}`, 'error', 3000);
    }
  };

  const handleCancelRestore = async (commandId: number) => {
    try {
      await api.post(`/sync/commands/${commandId}/cancel`);
      fetchRestoreStatuses();
      showToast('✅ Đã hủy lệnh khôi phục', 'success', 2500);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Không thể hủy lệnh';
      showToast(`❌ ${msg}`, 'error', 3000);
    }
  };

  const handleDelete = async (saveId: number) => {
    console.log('🗑️ handleDelete clicked, saveId:', saveId);
    setDeleteId(saveId);
    setBulkDeleteIds([]);
    setShowDeleteConfirm(true);
  };

  const handleBulkDelete = async (saveIds: number[]) => {
    if (saveIds.length === 0) return;
    setBulkDeleteIds(saveIds);
    setDeleteId(null);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (bulkDeleteIds.length > 0) {
      try {
        const result = await savesApi.deleteMany(bulkDeleteIds);
        setShowDeleteConfirm(false);
        setBulkDeleteIds([]);
        await fetchGames();
        showToast(`Đã xoá ${result.deleted} bản lưu`, 'success', 3000);
      } catch (err: any) {
        const errorMsg = err.response?.data?.error || err.message || 'Xoá thất bại';
        showToast(errorMsg, 'error', 3000);
      }
      return;
    }

    if (!deleteId) return;
    try {
      console.log(`🗑️ Deleting save ${deleteId}...`);
      const response = await api.delete(`/save/${deleteId}`);
      console.log('✅ Delete response:', response.data);
      console.log('🔄 Calling fetchGames to refresh list...');
      setShowDeleteConfirm(false);
      setDeleteId(null);
      await fetchGames();
      console.log('✅ fetchGames completed');
      if (showHistoryModal && selectedGameForHistory) {
        handleOpenHistory(selectedGameForHistory);
      }
      showToast('✅ Xoá bản lưu thành công!', 'success', 3000);
    } catch (err: any) {
      console.error('❌ Delete error:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Xoá thất bại';
      const statusCode = err.response?.status;
      console.error('Status:', statusCode, 'Message:', errorMsg);
      
      if (statusCode === 401) {
        showToast('❌ Lỗi xác thực: Vui lòng đăng nhập lại', 'error', 3000);
      } else if (statusCode === 403) {
        showToast('❌ Bạn không có quyền xoá bản lưu này', 'error', 3000);
      } else if (statusCode === 404) {
        showToast('❌ Bản lưu không tồn tại', 'error', 3000);
      } else {
        showToast(`❌ ${errorMsg}`, 'error', 3000);
      }
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
    .filter(g => g.latestSave) // ✅ Only show games WITH save files
    .filter(g => (filterCategory === 'All' || g.category === filterCategory))
    .filter(g => g.gameName.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.gameName.localeCompare(b.gameName);
      return a.category.localeCompare(b.category);
    });
  const recentGames = games
    .filter((game) => game.latestSave)
    .sort((a, b) => new Date(b.latestSave!.createdAt).getTime() - new Date(a.latestSave!.createdAt).getTime());

  return (
    <div className={`flex h-screen font-sans overflow-hidden ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50'}`}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="min-h-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-5 lg:px-8 py-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setMobileMenuOpen(true)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 lg:hidden" aria-label="Mở menu"><Menu className="w-5 h-5" /></button>
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 min-w-0">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-900 dark:text-white truncate">{pageTitles[activeTab].title}</h2>
              <p className="text-xs text-slate-500 mt-1 hidden sm:block">{pageTitles[activeTab].description}</p>
            </div>
            {activeTab === 'library' && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-slate-50 rounded-lg pl-3 pr-1 py-1.5 border border-slate-200 min-w-0">
                   <Search className="w-3.5 h-3.5 text-slate-400" />
                   <input 
                     type="text" 
                      placeholder="Tìm bản lưu"
                      aria-label="Tìm bản lưu"
                     className="bg-transparent border-none focus:ring-0 text-xs px-2 w-40 sm:w-56 text-slate-700 font-medium outline-none" 
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                   />
                </div>
                <select 
                  className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none text-slate-700"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="All">Tất cả thể loại</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select 
                  className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none text-slate-700"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                >
                  <option value="name">Xếp theo tên</option>
                  <option value="category">Xếp theo thể loại</option>
                </select>
              </div>
            )}
            </div>
          </div>
          <div className="flex items-center justify-between xl:justify-end gap-4 lg:gap-6">
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
            <button
              onClick={() => setDarkMode((value) => !value)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              title={darkMode ? 'Tắt dark mode' : 'Bật dark mode'}
              aria-label={darkMode ? 'Tắt chế độ tối' : 'Bật chế độ tối'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {(activeTab === 'library' || activeTab === 'dashboard') && (
              <button 
                onClick={handleOpenNew}
                className="px-4 sm:px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black shadow-lg shadow-indigo-100 transition flex items-center gap-2 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Đẩy bản lưu mới</span>
                <span className="sm:hidden">Tải lên</span>
              </button>
            )}
            
            {/* User Profile Button */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-expanded={showUserMenu}
                aria-haspopup="menu"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors group"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                  {currentUser?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-slate-900 leading-tight">{currentUser?.username || 'User'}</p>
                  <p className="text-[10px] text-slate-500 leading-tight">{currentUser?.role || 'User'}</p>
                </div>
              </button>
              
              {/* User Menu Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-50">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-bold text-slate-900">{currentUser?.username || 'User'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{currentUser?.role || 'User'}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setActiveTab('account');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <User className="w-4 h-4" />
                    Hồ sơ của tôi
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowChangePasswordModal(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Lock className="w-4 h-4" />
                    Đổi mật khẩu
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 grid grid-cols-12 gap-4 overflow-y-auto p-4 sm:gap-6 sm:p-6 xl:gap-8 xl:p-8">
          {activeTab === 'dashboard' && (
            <Suspense fallback={<div className="col-span-12 flex items-center justify-center py-8">Đang tải...</div>}>
              <OverviewTab 
                games={recentGames}
                devices={devices}
                agentOnlineMap={agentOnlineMap}
                restoreStatusMap={restoreStatusMap}
                syncLogs={syncLogs}
                autoSyncEnabled={autoSyncEnabled}
                directoryConnected={Boolean(directoryHandle)}
                isSyncing={isSyncing}
                lastSyncTime={lastSyncTime}
                uploadProgress={uploadProgress}
                setActiveTab={(tab) => setActiveTab(tab as any)} 
                handleOpenNew={handleOpenNew}
                handleSelectDirectory={handleSelectDirectory}
                performSync={performSync}
                handleOpenHistory={handleOpenHistory} 
                handleDownload={handleDownload} 
              />
            </Suspense>
          )}

          {activeTab === 'library' && (
            <Suspense fallback={<div className="col-span-12 flex items-center justify-center py-8">Đang tải thư viện...</div>}>
              <LibraryTab 
                {...({
                  loading,
                  games,
                  filteredGames,
                  restoreStatusMap,
                  agentOnlineMap,
                  devices,
                  targetDevice,
                  setTargetDevice,
                  handleOpenUpdate,
                  handleOpenHistory,
                  handleDownload,
                  handleRemoteRestore,
                  handleRetryRestore,
                  handleCancelRestore,
                  handleDelete,
                  handleBulkDelete,
                  handleOpenRenameModal,
                  formatSize,
                } as any)}
              />
            </Suspense>
          )}

          {activeTab === 'category' && (
            <Suspense fallback={<div className="col-span-12 flex items-center justify-center py-8">Đang tải thể loại...</div>}>
              <CategoryTab onCategoryUpdated={refetchCategories} />
            </Suspense>
          )}

          {activeTab === 'drive' && (
            <Suspense fallback={<div className="col-span-12 flex items-center justify-center py-8">Đang tải Drive...</div>}>
              <DriveTab />
            </Suspense>
          )}

          {activeTab === 'community' && (
            <Suspense fallback={<div className="col-span-12 flex items-center justify-center py-8">Đang tải chat...</div>}>
              <CommunityChatTab currentUser={currentUser} />
            </Suspense>
          )}

          {activeTab === 'devices' && (
            <Suspense fallback={<div className="col-span-12 flex items-center justify-center py-8">Đang tải...</div>}>
              <DevicesTab />
            </Suspense>
          )}


          {activeTab === 'account' && (
            <Suspense fallback={<div className="col-span-12 flex items-center justify-center py-8">Dang tai tai khoan...</div>}>
              <AccountTab
                currentUser={currentUser}
                onSaveProfile={handleSaveMyProfile}
                onOpenChangePassword={() => setShowChangePasswordModal(true)}
              />
            </Suspense>
          )}

          {activeTab === 'settings' && (
            <Suspense fallback={<div className="col-span-12 flex items-center justify-center py-8">Đang tải cài đặt...</div>}>
              <SettingsTab 
                currentUser={currentUser}
                autoSyncEnabled={autoSyncEnabled}
                setAutoSyncEnabled={setAutoSyncEnabled}
                directoryHandle={directoryHandle}
                handleSelectDirectory={handleSelectDirectory}
                syncInterval={syncInterval}
                setSyncInterval={setSyncInterval}
              />
            </Suspense>
          )}

          {activeTab === 'logs' && isAdmin && (
            <Suspense fallback={<div className="col-span-12 flex items-center justify-center py-8">Đang tải nhật ký...</div>}>
              <SystemLogsTab currentUser={currentUser} />
            </Suspense>
          )}

          {activeTab === 'sqlite' && isAdmin && (
            <Suspense fallback={<div className="col-span-12 flex items-center justify-center py-8">Đang tải SQLite...</div>}>
              <SqliteAdminTab />
            </Suspense>
          )}

          {activeTab === 'users' && isAdmin && (
            <Suspense fallback={<div className="col-span-12 flex items-center justify-center py-8">Đang tải người dùng...</div>}>
              <UsersTab 
                users={users}
                handleOpenUserModal={handleOpenUserModal}
                handleDeleteUser={handleDeleteUser}
              />
            </Suspense>
          )}

          {activeTab === 'activation' && (
            <Suspense fallback={<div className="col-span-12 flex items-center justify-center py-8">Đang tải activation...</div>}>
              <ActivationTab
                currentUser={currentUser}
                activationFiles={activationFiles}
                onRefresh={fetchActivationFiles}
                formatSize={formatSize}
              />
            </Suspense>
          )}

        </div>

      </main>

      <Suspense fallback={null}>
        <DeleteConfirmModal 
          show={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={confirmDelete}
          title={bulkDeleteIds.length > 0 ? 'Xoá nhiều bản lưu' : undefined}
          message={
            bulkDeleteIds.length > 0
              ? `Bạn có chắc chắn muốn xoá ${bulkDeleteIds.length} bản lưu đã chọn không? Hành động này không thể hoàn tác.`
              : undefined
          }
        />
      </Suspense>

      <Suspense fallback={null}>
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
      </Suspense>

      <Suspense fallback={null}>
        <UploadModal 
          show={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onSubmit={handleUpload}
          newGameName={newGameName}
          setNewGameName={setNewGameName}
          newGameCategory={newGameCategory}
          setNewGameCategory={setNewGameCategory}
          newGameFilePath={newGameFilePath}
          setNewGameFilePath={setNewGameFilePath}
          isFolderUpload={isFolderUpload}
          setIsFolderUpload={setIsFolderUpload}
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          selectedFiles={selectedFiles}
          setSelectedFiles={setSelectedFiles}
          uploadProgress={uploadProgress}
          categories={categories}
        />
      </Suspense>

      <Suspense fallback={null}>
        <RenameGameModal
          show={showRenameModal}
          onClose={() => setShowRenameModal(false)}
          onSubmit={handleSaveRename}
          initialGameName={selectedGameForRename?.gameName || ''}
          initialCategory={selectedGameForRename?.category || 'Uncategorized'}
          initialFilePath={selectedGameForRename?.latestSave?.savePath || ''}
          categories={categories}
        />
      </Suspense>

      <Suspense fallback={null}>
        <UserModal 
          show={showUserModal}
          onClose={() => setShowUserModal(false)}
          onSubmit={handleSaveUser}
          editingUser={editingUser}
          userUsername={userUsername}
          setUserUsername={setUserUsername}
          userDisplayName={userDisplayName}
          setUserDisplayName={setUserDisplayName}
          userEmail={userEmail}
          setUserEmail={setUserEmail}
          userPassword={userPassword}
          setUserPassword={setUserPassword}
          userRole={userRole}
          setUserRole={setUserRole}
          userStatus={userStatus}
          setUserStatus={setUserStatus}
          userDriveQuotaMb={userDriveQuotaMb}
          setUserDriveQuotaMb={setUserDriveQuotaMb}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ChangePasswordModal
          show={showChangePasswordModal}
          onClose={() => setShowChangePasswordModal(false)}
          onSubmit={handleChangePassword}
          loading={changePasswordLoading}
        />
      </Suspense>
    </div>
  );
}
