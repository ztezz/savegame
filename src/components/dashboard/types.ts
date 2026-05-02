
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
  createdAt: string;
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
  'RPG', 'Action', 'Adventure', 'Simulation', 'Indie', 'Strategy', 'Sports', 'Other'
];
