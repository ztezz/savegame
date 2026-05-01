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
    xhr.upload.addEventListener('progress', (e) => {
      hasRealProgress = true;
      clearTimeout(simulateTimer);
      lastProgressTime = Date.now();
      lastProgressLoaded = e.loaded;
      
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        const sizeInMB = (e.loaded / (1024 * 1024)).toFixed(1);
        const totalMB = (e.total / (1024 * 1024)).toFixed(1);
        const speedKBps = ((e.loaded - lastProgressLoaded) / 1024 / ((Date.now() - lastProgressTime + 1) / 1000)).toFixed(0);
        
        console.log(`📤 Upload: ${percentComplete}% (${sizeInMB}/${totalMB} MB) @ ${speedKBps}KB/s`);
        onProgress(Math.min(percentComplete, 99));
      } else {
        const sizeInMB = (e.loaded / (1024 * 1024)).toFixed(1);
        console.log(`📤 Upload: ${sizeInMB} MB sent (total unknown)`);
        onProgress(Math.min(Math.floor((e.loaded / (50 * 1024 * 1024)) * 100), 95));
      }
    }, false);

    xhr.addEventListener('loadstart', () => {
      console.log('⏱️ Upload started');
    });

    xhr.addEventListener('load', () => {
      clearTimeout(simulateTimer);
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
      console.error('❌ Upload error:', err);
      reject(new Error('Upload failed - Network error'));
    });

    xhr.addEventListener('abort', () => {
      clearTimeout(simulateTimer);
      console.error('❌ Upload aborted');
      reject(new Error('Upload aborted'));
    });

    xhr.addEventListener('timeout', () => {
      clearTimeout(simulateTimer);
      console.error('❌ Upload timeout - Request took too long');
      reject(new Error('Upload timeout - Request took too long (>30 min)'));
    });

    xhr.open('POST', fullUrl);
    xhr.timeout = 1800000; // 30 minutes timeout
    
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      console.log('🔐 Token set');
    }

    console.log('📮 Sending upload... (timeout: 30 min)');
    xhr.send(formData);
  });
};

export default api;
