import axios from 'axios';
import { getValidToken, logoutExpiredSession } from './authSession';

export const API_ORIGIN = import.meta.env.VITE_API_URL || 'https://api.luugame.fun';
export const API_BASE_URL = `${API_ORIGIN}/api`;
export const UPLOAD_ORIGIN = import.meta.env.VITE_UPLOAD_URL || API_ORIGIN;
export const UPLOAD_BASE_URL = `${UPLOAD_ORIGIN}/api`;

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const storedToken = localStorage.getItem('token');
  const token = getValidToken();
  if (storedToken && !token) return Promise.reject(new axios.CanceledError('Phiên đăng nhập đã hết hạn'));
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Error interceptor for better logging
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('❌ API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      url: error.config?.url,
      method: error.config?.method?.toUpperCase()
    });
    if (error.response?.status === 401) {
      logoutExpiredSession();
    }
    return Promise.reject(error);
  }
);

// Upload with real progress tracking using XMLHttpRequest
export const uploadWithProgress = async (
  url: string,
  formData: FormData,
  onProgress: (progress: number, stats?: { uploadedBytes: number; totalBytes: number; bytesPerSecond: number; etaSeconds: number | null; phase: 'uploading' | 'finalizing' }) => void
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const token = getValidToken();
    if (!token) {
      reject(new Error('Phiên đăng nhập đã hết hạn'));
      return;
    }
    const baseURL = UPLOAD_BASE_URL;
    
    const fullUrl = `${baseURL}${url}`;
    let hasRealProgress = false;
    let simulatedProgress = 0;
    let lastProgressTime = Date.now();
    let lastProgressLoaded = 0;
    const uploadStartedAt = Date.now();
    let smoothedBytesPerSecond = 0;
    let simulateProgressTimer: ReturnType<typeof setTimeout> | null = null;
    
    // Calculate file size from FormData
    let totalFileSize = 0;
    formData.forEach((value) => {
      if (value instanceof File) totalFileSize += value.size;
    });
    
    console.log('🚀 Upload starting:', fullUrl);
    console.log('📦 FormData entries:');
    formData.forEach((value, key) => {
      console.log(`  - ${key}:`, value instanceof File ? `${value.name} (${value.size} bytes)` : value);
    });

    // Fallback simulated progress if no real events
    const simulateProgress = () => {
      if (!hasRealProgress && simulatedProgress < 90) {
        simulatedProgress += Math.random() * 15;
        onProgress(Math.min(Math.floor(simulatedProgress), 90));
        simulateProgressTimer = setTimeout(simulateProgress, 800);
      }
    };
    
    const simulateTimer = setTimeout(simulateProgress, 2000);

    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
      hasRealProgress = true;
      clearTimeout(simulateTimer);
      if (simulateProgressTimer) clearTimeout(simulateProgressTimer);
      const currentTime = Date.now();
      const timeDiff = Math.max(currentTime - lastProgressTime, 1);
      const loadedDiff = e.loaded - lastProgressLoaded;
      lastProgressTime = currentTime;
      lastProgressLoaded = e.loaded;
      
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        const sizeInMB = (e.loaded / (1024 * 1024)).toFixed(1);
        const totalMB = (e.total / (1024 * 1024)).toFixed(1);
        const speedBytesPerSec = loadedDiff > 0 ? loadedDiff / (timeDiff / 1000) : 0;
        smoothedBytesPerSecond = smoothedBytesPerSecond ? smoothedBytesPerSecond * 0.7 + speedBytesPerSec * 0.3 : speedBytesPerSec;
        const speedKBps = (speedBytesPerSec / 1024).toFixed(0);
        const remaining = e.total - e.loaded;
        const etaSeconds = speedBytesPerSec > 0 ? Math.round(remaining / speedBytesPerSec) : 0;
        
        console.log(`📤 Upload: ${percentComplete}% (${sizeInMB}/${totalMB} MB) @ ${speedKBps}KB/s ETA: ${etaSeconds}s`);
        onProgress(Math.min(percentComplete, 99), {
          uploadedBytes: e.loaded,
          totalBytes: e.total,
          bytesPerSecond: smoothedBytesPerSecond || e.loaded / Math.max((Date.now() - uploadStartedAt) / 1000, 0.1),
          etaSeconds: smoothedBytesPerSecond > 0 ? Math.ceil((e.total - e.loaded) / smoothedBytesPerSecond) : null,
          phase: 'uploading',
        });
      } else {
        const sizeInMB = (e.loaded / (1024 * 1024)).toFixed(1);
        console.log(`📤 Upload: ${sizeInMB} MB sent (total unknown)`);
        onProgress(Math.min(Math.floor((e.loaded / (50 * 1024 * 1024)) * 100), 95));
      }
    }, false);

    xhr.addEventListener('loadstart', () => {
      console.log('⏱️ Upload started');
      lastProgressTime = Date.now();
    });

    // Dynamic stall timeout: longer for larger files
    // At least 180 seconds (3 min), plus 1 second per 5MB
    const stallTimeoutMs = Math.max(180000, (totalFileSize / (5 * 1024 * 1024)) * 1000);
    const stallTimeout = setTimeout(() => {
      if (!hasRealProgress) {
        console.error(`❌ Upload stalled - no progress for ${stallTimeoutMs / 1000} seconds, aborting`);
        xhr.abort();
        reject(new Error('Upload stalled - no data received from server'));
      }
    }, stallTimeoutMs);

    xhr.addEventListener('load', () => {
      clearTimeout(simulateTimer);
      if (simulateProgressTimer) clearTimeout(simulateProgressTimer);
      clearTimeout(stallTimeout);
      console.log(`✅ Response received: ${xhr.status}`);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          console.log('✅ Upload success:', response);
          resolve(response);
        } catch {
          console.log('✅ Upload success (no JSON response)');
          resolve({ success: true });
        }
      } else {
        if (xhr.status === 401) logoutExpiredSession();
        console.error(`❌ Upload failed: ${xhr.status} - ${xhr.responseText}`);
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
      }
    });

    xhr.upload.addEventListener('load', () => {
      onProgress(99, {
        uploadedBytes: totalFileSize,
        totalBytes: totalFileSize,
        bytesPerSecond: 0,
        etaSeconds: null,
        phase: 'finalizing',
      });
    });

    xhr.addEventListener('error', (err) => {
      clearTimeout(simulateTimer);
      if (simulateProgressTimer) clearTimeout(simulateProgressTimer);
      clearTimeout(stallTimeout);
      console.error('❌ Upload error:', err);
      const likelyProxyLimit = totalFileSize > 100 * 1024 * 1024 && xhr.status === 0;
      reject(new Error(likelyProxyLimit
        ? 'File lớn bị Cloudflare chặn trước khi tới server. Hãy dùng endpoint upload DNS-only hoặc bật lại upload chia nhỏ.'
        : 'Upload thất bại do lỗi mạng hoặc máy chủ không phản hồi'));
    });

    xhr.addEventListener('abort', () => {
      clearTimeout(simulateTimer);
      if (simulateProgressTimer) clearTimeout(simulateProgressTimer);
      clearTimeout(stallTimeout);
      console.error('❌ Upload aborted');
      reject(new Error('Upload aborted'));
    });

    xhr.addEventListener('timeout', () => {
      clearTimeout(simulateTimer);
      if (simulateProgressTimer) clearTimeout(simulateProgressTimer);
      clearTimeout(stallTimeout);
      console.error('❌ Upload timeout - Request took too long');
      reject(new Error('Upload timeout - Request took too long'));
    });

    // Dynamic timeout: longer for larger files
    // Base 30 minutes + 1 minute per 100MB
    const timeoutMs = 30 * 60 * 1000 + (totalFileSize / (100 * 1024 * 1024)) * 60 * 1000;
    
    xhr.open('POST', fullUrl);
    xhr.timeout = timeoutMs;
    
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      console.log('🔐 Token set');
    }

    console.log(`📮 Sending upload... (timeout: ${timeoutMs / 1000 / 60}min for ${(totalFileSize / (1024 * 1024)).toFixed(1)}MB)`);
    xhr.send(formData);
  });
};

export const LARGE_UPLOAD_THRESHOLD = 80 * 1024 * 1024;

export const uploadLargeFile = async (
  basePath: '/activation/upload' | '/drive/upload' | '/system/agent/windows/upload',
  file: File,
  metadata: Record<string, unknown>,
  onProgress: (progress: number, stats?: { uploadedBytes: number; totalBytes: number; bytesPerSecond: number; etaSeconds: number | null; phase: 'uploading' | 'finalizing' }) => void,
  signal?: AbortSignal,
): Promise<any> => {
  const token = getValidToken();
  if (!token) throw new Error('Phiên đăng nhập đã hết hạn');

  const headers = { Authorization: `Bearer ${token}` };
  let initResponse;
  try {
    initResponse = await axios.post(`${UPLOAD_BASE_URL}${basePath}/init`, {
      fileName: file.name,
      fileSize: file.size,
      ...metadata,
    }, { headers, timeout: 30000 });
  } catch (error: any) {
    if (error.response?.status === 401) logoutExpiredSession();
    throw error;
  }
  const sessionId = String(initResponse.data.sessionId);
  const chunkSize = Number(initResponse.data.chunkSize);
  const totalChunks = Math.ceil(file.size / chunkSize);
  const loadedByChunk = new Array<number>(totalChunks).fill(0);
  const startedAt = performance.now();
  let lastBytes = 0;
  let lastTime = startedAt;
  let speed = 0;

  const report = (phase: 'uploading' | 'finalizing') => {
    const uploadedBytes = loadedByChunk.reduce((total, loaded) => total + loaded, 0);
    const now = performance.now();
    const elapsed = (now - lastTime) / 1000;
    if (elapsed >= 0.4) {
      const currentSpeed = Math.max(0, uploadedBytes - lastBytes) / elapsed;
      speed = speed ? speed * 0.7 + currentSpeed * 0.3 : currentSpeed;
      lastBytes = uploadedBytes;
      lastTime = now;
    }
    onProgress(phase === 'finalizing' ? 99 : Math.max(1, Math.min(98, Math.floor((uploadedBytes / file.size) * 100))), {
      uploadedBytes,
      totalBytes: file.size,
      bytesPerSecond: phase === 'uploading' ? speed : 0,
      etaSeconds: phase === 'uploading' && speed > 0 ? Math.ceil((file.size - uploadedBytes) / speed) : null,
      phase,
    });
  };

  const uploadChunk = async (chunkIndex: number) => {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const abort = () => xhr.abort();
          signal?.addEventListener('abort', abort, { once: true });
          xhr.open('POST', `${UPLOAD_BASE_URL}${basePath}/chunk?sessionId=${encodeURIComponent(sessionId)}&chunkIndex=${chunkIndex}&totalChunks=${totalChunks}`);
          xhr.timeout = 5 * 60 * 1000;
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');
          xhr.upload.onprogress = (event) => {
            loadedByChunk[chunkIndex] = Math.min(event.loaded, chunk.size);
            report('uploading');
          };
          const finish = (callback: () => void) => { signal?.removeEventListener('abort', abort); callback(); };
          xhr.onload = () => finish(() => {
            if (xhr.status === 401) logoutExpiredSession();
            xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
          });
          xhr.onerror = () => finish(() => reject(new Error('Lỗi mạng')));
          xhr.ontimeout = () => finish(() => reject(new Error('Quá thời gian')));
          xhr.onabort = () => finish(() => reject(new Error('Upload đã hủy')));
          xhr.send(chunk);
        });
        loadedByChunk[chunkIndex] = chunk.size;
        report('uploading');
        return;
      } catch (error) {
        loadedByChunk[chunkIndex] = 0;
        if (signal?.aborted || attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
      }
    }
  };

  try {
    let nextChunk = 0;
    const worker = async () => {
      while (nextChunk < totalChunks && !signal?.aborted) await uploadChunk(nextChunk++);
    };
    await Promise.all(Array.from({ length: Math.min(3, totalChunks) }, () => worker()));
    if (signal?.aborted) throw new Error('Upload đã hủy');
    report('finalizing');
    const response = await axios.post(`${UPLOAD_BASE_URL}${basePath}/finalize`, { sessionId }, { headers, timeout: 120000 }).catch((error) => {
      if (error.response?.status === 401) logoutExpiredSession();
      throw error;
    });
    onProgress(100, { uploadedBytes: file.size, totalBytes: file.size, bytesPerSecond: 0, etaSeconds: 0, phase: 'finalizing' });
    return response.data;
  } catch (error) {
    void axios.delete(`${UPLOAD_BASE_URL}${basePath}/${encodeURIComponent(sessionId)}`, { headers }).catch(() => undefined);
    throw error;
  }
};

export const downloadWithProgress = async (
  url: string,
  fileName: string,
  onProgress: (progress: number) => void
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const token = getValidToken();
    if (!token) {
      reject(new Error('Phiên đăng nhập đã hết hạn'));
      return;
    }
    const baseURL = API_BASE_URL;
    
    const fullUrl = `${baseURL}${url}`;
    console.log(`📥 Download starting: ${fullUrl}`);

    xhr.addEventListener('loadstart', () => {
      console.log('📥 Download started');
      onProgress(0);
    });

    xhr.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        onProgress(percentComplete);
        console.log(`📥 Downloaded: ${percentComplete}% (${(event.loaded / (1024 * 1024)).toFixed(1)}MB / ${(event.total / (1024 * 1024)).toFixed(1)}MB)`);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        const blob = xhr.response;
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        onProgress(100);
        console.log(`✅ Download completed: ${fileName}`);
        resolve();
      } else {
        if (xhr.status === 401) logoutExpiredSession();
        reject(new Error(`HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Download aborted'));
    });

    xhr.responseType = 'blob';
    xhr.open('GET', fullUrl);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.send();
  });
};

export default api;
