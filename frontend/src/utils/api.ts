import axios from 'axios';

export const API_ORIGIN = import.meta.env.VITE_API_URL || 'https://api.luugame.fun';
export const API_BASE_URL = `${API_ORIGIN}/api`;

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
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
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(error);
  }
);

// Upload with real progress tracking using XMLHttpRequest
export const uploadWithProgress = async (
  url: string,
  formData: FormData,
  onProgress: (progress: number) => void
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const token = localStorage.getItem('token');
    const baseURL = API_BASE_URL;
    
    const fullUrl = `${baseURL}${url}`;
    let hasRealProgress = false;
    let simulatedProgress = 0;
    let lastProgressTime = Date.now();
    let lastProgressLoaded = 0;
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
        const speedKBps = (speedBytesPerSec / 1024).toFixed(0);
        const remaining = e.total - e.loaded;
        const etaSeconds = speedBytesPerSec > 0 ? Math.round(remaining / speedBytesPerSec) : 0;
        
        console.log(`📤 Upload: ${percentComplete}% (${sizeInMB}/${totalMB} MB) @ ${speedKBps}KB/s ETA: ${etaSeconds}s`);
        onProgress(Math.min(percentComplete, 99));
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
        console.error(`❌ Upload failed: ${xhr.status} - ${xhr.responseText}`);
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
      }
    });

    xhr.addEventListener('error', (err) => {
      clearTimeout(simulateTimer);
      if (simulateProgressTimer) clearTimeout(simulateProgressTimer);
      clearTimeout(stallTimeout);
      console.error('❌ Upload error:', err);
      reject(new Error('Upload failed - Network error'));
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

export const uploadWithChunks = async (
  file: File,
  metadata: { gameName: string; note?: string },
  onProgress: (progress: number) => void
): Promise<any> => {
  const baseURL = API_BASE_URL;
  const token = localStorage.getItem('token');
  
  if (!token) {
    throw new Error('No authentication token');
  }

  const MAX_CHUNK_RETRIES = 3;
  const MAX_CONCURRENT_CHUNKS = 3;
  
  try {
    // Step 1: Initialize upload session
    const initRes = await fetch(`${baseURL}/activation/upload/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        gameName: metadata.gameName,
        note: metadata.note || ''
      })
    });

    if (!initRes.ok) {
      throw new Error(`Failed to initialize upload: ${initRes.statusText}`);
    }

    const { sessionId, chunkSize: serverChunkSize } = await initRes.json();
    const chunkSize = Math.max(1 * 1024 * 1024, Number(serverChunkSize) || 20 * 1024 * 1024);
    const totalChunks = Math.ceil(file.size / chunkSize);
    const uploadedByChunk = new Array<number>(totalChunks).fill(0);
    console.log(`📝 Upload session created: ${sessionId} (${totalChunks} chunks, ${MAX_CONCURRENT_CHUNKS} concurrent)`);

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const uploadChunk = (chunk: Blob, chunkIndex: number, attempt: number) => new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const chunkUrl = `${baseURL}/activation/upload/chunk?sessionId=${encodeURIComponent(sessionId)}&chunkIndex=${chunkIndex}&totalChunks=${totalChunks}`;
      const timeoutMs = Math.max(180000, (chunk.size / (1024 * 1024)) * 30000);

      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) return;
        uploadedByChunk[chunkIndex] = Math.min(event.loaded, chunk.size);
        const uploadedBytes = uploadedByChunk.reduce((total, loaded) => total + loaded, 0);
        const progress = Math.floor((uploadedBytes / file.size) * 95);
        onProgress(Math.max(1, Math.min(progress, 95)));
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          uploadedByChunk[chunkIndex] = chunk.size;
          resolve();
          return;
        }

        let message = xhr.statusText || `HTTP ${xhr.status}`;
        try {
          message = JSON.parse(xhr.responseText)?.error || message;
        } catch {
          if (xhr.responseText) message = xhr.responseText;
        }
        reject(new Error(`Failed to upload chunk ${chunkIndex + 1} (attempt ${attempt}): ${message}`));
      });

      xhr.addEventListener('error', () => reject(new Error(`Network error while uploading chunk ${chunkIndex + 1} (attempt ${attempt})`)));
      xhr.addEventListener('abort', () => reject(new Error(`Upload chunk ${chunkIndex + 1} aborted (attempt ${attempt})`)));
      xhr.addEventListener('timeout', () => reject(new Error(`Upload chunk ${chunkIndex + 1} timed out (attempt ${attempt})`)));

      xhr.open('POST', chunkUrl);
      xhr.timeout = timeoutMs;
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(chunk);
    });

    const uploadChunkWithRetry = async (chunk: Blob, chunkIndex: number) => {
      for (let attempt = 1; attempt <= MAX_CHUNK_RETRIES; attempt++) {
        try {
          await uploadChunk(chunk, chunkIndex, attempt);
          return;
        } catch (err) {
          if (attempt === MAX_CHUNK_RETRIES) throw err;
          uploadedByChunk[chunkIndex] = 0;
          const delayMs = attempt * 1500;
          console.warn(`⚠️ Chunk ${chunkIndex + 1}/${totalChunks} failed, retrying in ${delayMs}ms...`, err);
          await sleep(delayMs);
        }
      }
    };

    // Step 2: Upload a small pool of chunks concurrently to avoid per-request latency.
    let nextChunkIndex = 0;
    const uploadWorker = async () => {
      while (nextChunkIndex < totalChunks) {
        const chunkIndex = nextChunkIndex++;
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        console.log(`📤 Uploading chunk ${chunkIndex + 1}/${totalChunks} (${(chunk.size / (1024 * 1024)).toFixed(1)}MB)...`);
        await uploadChunkWithRetry(chunk, chunkIndex);
        const uploadedBytes = uploadedByChunk.reduce((total, loaded) => total + loaded, 0);
        const progress = Math.floor((uploadedBytes / file.size) * 95);
        onProgress(Math.max(1, Math.min(progress, 95)));
        console.log(`✅ Chunk ${chunkIndex + 1}/${totalChunks} uploaded (${progress}%)`);
      }
    };

    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_CHUNKS, totalChunks) }, () => uploadWorker()));

    // Step 3: Finalize upload
    console.log(`🔗 Finalizing upload...`);
    onProgress(96);
    const finalizeRes = await fetch(`${baseURL}/activation/upload/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ sessionId })
    });

    if (!finalizeRes.ok) {
      throw new Error(`Failed to finalize upload: ${finalizeRes.statusText}`);
    }

    const result = await finalizeRes.json();
    onProgress(100);
    console.log(`✅ Upload completed successfully!`, result);
    return result;
  } catch (err) {
    console.error('❌ Upload failed:', err);
    throw err;
  }
};

export const downloadWithProgress = async (
  url: string,
  fileName: string,
  onProgress: (progress: number) => void
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const token = localStorage.getItem('token');
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
