
import React from 'react';
import { 
  Upload, Download, Trash2, Gamepad2, Laptop, 
  Clock, Database, Plus, LayoutDashboard, 
  Library, HardDrive, FileCode, User, LogOut,
  ShieldCheck, Zap, Settings
} from 'lucide-react';

export interface GameSave {
  id: number;
  gameId: number;
  gameName: string;
  category: string;
  latestSave?: {
    id: number;
    version: number;
    fileSize: number;
     createdAt: string;
     filePath: string;
     savePath?: string | null;
  };
  versions: number;
}

export interface UserAccount {
  id: number;
  username: string;
  display_name?: string;
  name?: string;
  email: string;
  role: 'Admin' | 'User';
  status: 'Active' | 'Locked';
  drive_quota_mb?: number | null;
  drive_used_bytes?: number | string;
  drive_file_count?: number;
  save_count?: number;
  avatar_url?: string | null;
  theme_mode?: 'light' | 'dark' | 'auto';
  createdAt: string;
}

export interface LoginHistoryItem {
  created_at: string;
  ip_address: string | null;
  status: 'success' | 'failed';
}

export interface AccountStats {
  save_count: number;
  save_bytes: number;
  drive_bytes: number;
  drive_files: number;
  device_count: number;
  login_history: LoginHistoryItem[];
}

export interface UserDetail extends UserAccount {
  stats: {
    save_count: number;
    save_bytes: number;
    drive_bytes: number;
    drive_files: number;
    device_count: number;
  };
  devices: { device_name: string; created_at: string; last_used_at: string | null }[];
  login_history: LoginHistoryItem[];
  recent_games: { game_name: string; category: string; save_count: number; last_save: string | null }[];
}

export interface RestoreStatusItem {
  id: number;
  gameId: number;
  saveId: number;
  gameName: string;
  status: 'Pending' | 'Running' | 'Done' | 'Failed' | 'Cancelled' | 'Timeout';
  deviceName?: string | null;
  errorMessage?: string | null;
  retryCount?: number;
  maxRetries?: number;
  createdAt: string;
  claimedAt?: string | null;
  completedAt?: string | null;
}

export const CATEGORIES = [
  'RPG',
  'Action',
  'Adventure',
  'Simulation',
  'Indie',
  'Strategy',
  'Sports',
  'Racing',
  'Shooter',
  'Fighting',
  'Puzzle',
  'Horror',
  'Survival',
  'Open World',
  'Sandbox',
  'Platformer',
  'MMO',
  'MOBA',
  'Card',
  'Other',
  'Uncategorized'
];
