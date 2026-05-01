import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
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
    const baseURL = import.meta.env.VITE_API_URL 
      ? `${import.meta.env.VITE_API_URL}/api` 
      : '/api';
    
    const fullUrl = `${baseURL}${url}`;
    let hasRealProgress = false;
    let simulatedProgress = 0;
    let lastProgressTime = Date.now();
    let lastProgressLoaded = 0;
    
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
        setTimeout(simulateProgress, 800);
      }
    };
    
    const simulateTimer = setTimeout(simulateProgress, 2000);

    // Track upload progress
    let zeroProgressCount = 0;
    xhr.upload.addEventListener('progress', (e) => {
      hasRealProgress = true;
      clearTimeout(simulateTimer);
      const currentTime = Date.now();
      const timeDiff = Math.max(currentTime - lastProgressTime, 1);
      const loadedDiff = e.loaded - lastProgressLoaded;
      lastProgressTime = currentTime;
      lastProgressLoaded = e.loaded;
      
      // Detect stalled within progress (no new data)
      if (loadedDiff === 0) {
        zeroProgressCount++;
        if (zeroProgressCount > 10) {
          console.error('❌ Upload stalled - no new data for 10+ progress events, aborting');
          xhr.abort();
          reject(new Error('Upload stalled - no new data received'));
          return;
        }
      } else {
        zeroProgressCount = 0;
      }
      
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
      clearTimeout(stallTimeout);
      console.error('❌ Upload error:', err);
      reject(new Error('Upload failed - Network error'));
    });

    xhr.addEventListener('abort', () => {
      clearTimeout(simulateTimer);
      clearTimeout(stallTimeout);
      console.error('❌ Upload aborted');
      reject(new Error('Upload aborted'));
    });

    xhr.addEventListener('timeout', () => {
      clearTimeout(simulateTimer);
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
  const baseURL = import.meta.env.VITE_API_URL 
    ? `${import.meta.env.VITE_API_URL}/api` 
    : '/api';
  const token = localStorage.getItem('token');
  
  if (!token) {
    throw new Error('No authentication token');
  }

  const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB chunks
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  console.log(`🚀 Chunked upload starting: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB, ${totalChunks} chunks)`);

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

    const { sessionId } = await initRes.json();
    console.log(`📝 Upload session created: ${sessionId}`);

    // Step 2: Upload chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      console.log(`📤 Uploading chunk ${i + 1}/${totalChunks} (${(chunk.size / (1024 * 1024)).toFixed(1)}MB)...`);

      const chunkRes = await fetch(
        `${baseURL}/activation/upload/chunk?sessionId=${sessionId}&chunkIndex=${i}&totalChunks=${totalChunks}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/octet-stream'
          },
          body: chunk // Send raw binary data
        }
      );

      if (!chunkRes.ok) {
        throw new Error(`Failed to upload chunk ${i + 1}: ${chunkRes.statusText}`);
      }

      const progress = Math.round(((i + 1) / totalChunks) * 100);
      onProgress(Math.min(progress, 99));
      console.log(`✅ Chunk ${i + 1}/${totalChunks} uploaded (${progress}%)`);
    }

    // Step 3: Finalize upload
    console.log(`🔗 Finalizing upload...`);
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
    const baseURL = import.meta.env.VITE_API_URL 
      ? `${import.meta.env.VITE_API_URL}/api` 
      : '/api';
    
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
