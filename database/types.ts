// Database Types
export interface User { 
  id: number; 
  username: string; 
  email?: string; 
  role: string; 
  status: string; 
  passwordHash: string; 
  createdAt: string; 
}

export interface Game { 
  id: number; 
  userId: number; 
  gameName: string; 
  category?: string; 
}

export interface Save { 
  id: number; 
  gameId: number; 
  filePath: string; 
  customFilePath?: string;
  version: number; 
  fileSize: number; 
  createdAt: string; 
}

export interface Device { 
  id: number; 
  userId: number; 
  deviceName: string; 
  lastSync: string; 
}
