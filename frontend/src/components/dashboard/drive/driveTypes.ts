export interface DriveFile {
  id: number;
  original_name: string;
  mime_type: string | null;
  file_size: number;
  note: string | null;
  created_at: string;
  deleted_at?: string | null;
  share_token?: string | null;
}

export interface DriveFolder {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
  deleted_at?: string | null;
}

export interface DriveUsage {
  activeBytes: number;
  trashBytes: number;
  totalBytes: number;
  activeFiles: number;
  trashFiles: number;
  quotaBytes: number;
  quotaSource?: 'user' | 'system';
}

export type FileFilter = 'all' | 'folders' | 'images' | 'documents' | 'installers' | 'archives' | 'other';

export interface PreviewState {
  kind: 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'office' | 'unsupported';
  file: DriveFile;
  content?: string;
  truncated?: boolean;
}

export interface UploadItem {
  file: File;
  relativePath?: string;
}
