
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
  };
  versions: number;
}

export interface UserAccount {
  id: number;
  username: string;
  name?: string;
  email: string;
  role: 'Admin' | 'User';
  status: 'Active' | 'Locked';
  createdAt: string;
}

export const CATEGORIES = [
  'RPG', 'Action', 'Adventure', 'Simulation', 'Indie', 'Strategy', 'Sports', 'Other'
];
