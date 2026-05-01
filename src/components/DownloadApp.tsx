import React, { useState, useEffect } from 'react';
import { Download, Info, AlertCircle } from 'lucide-react';
import api from '../utils/api';
import './DownloadApp.css';

interface AppFile {
  name: string;
  type: 'installer' | 'portable';
  size: number;
  description: string;
}

export const DownloadApp: React.FC = () => {
  const [apps, setApps] = useState<AppFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    fetchAvailableApps();
  }, []);

  const fetchAvailableApps = async () => {
    try {
      setLoading(true);
      const response = await api.get('/download/apps');
      setApps(response.data);
    } catch (err) {
      setError('Không thể tải danh sách app. Backend chưa build desktop app.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    return `${mb} MB`;
  };

  const handleDownload = async (filename: string, type: string) => {
    try {
      setDownloading(filename);
      const response = await api.get(`/download/app/${filename}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Tải xuống thất bại');
      console.error(err);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="download-container">
      <div className="download-header">
        <h2>Tải CloudSave Desktop Client</h2>
        <p>Đồng bộ game saves từ VPS nhanh chóng</p>
      </div>

      {error && (
        <div className="error-banner">
          <AlertCircle size={20} />
          <div>
            <strong>Thông báo:</strong> {error}
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-spinner">
          <p>Đang tải danh sách phiên bản...</p>
        </div>
      ) : apps.length > 0 ? (
        <div className="download-options">
          {apps.map((app) => (
            <div key={app.name} className={`download-card ${app.type}`}>
              <div className="card-icon">
                <Download size={32} />
              </div>
              <h3>{app.type === 'installer' ? 'Installer' : 'Portable'}</h3>
              <p className="version">{app.name}</p>
              <p className="size">Dung lượng: {formatSize(app.size)}</p>
              <p className="description">{app.description}</p>
              
              <ul className="features">
                {app.type === 'installer' ? (
                  <>
                    <li>✓ Cài đặt dễ dàng</li>
                    <li>✓ Tự động khởi động với Windows</li>
                    <li>✓ Tự động cập nhật (sắp tới)</li>
                    <li>✓ Uninstall từ Control Panel</li>
                  </>
                ) : (
                  <>
                    <li>✓ Không cần cài đặt</li>
                    <li>✓ Dễ dàng di chuyển</li>
                    <li>✓ Không ghi vào Registry</li>
                    <li>✓ Chạy từ USB</li>
                  </>
                )}
              </ul>

              <button 
                className={`download-btn ${app.type}-btn`}
                onClick={() => handleDownload(app.name, app.type)}
                disabled={downloading === app.name}
              >
                <Download size={18} />
                {downloading === app.name ? 'Đang tải...' : 'Tải xuống'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-apps">
          <AlertCircle size={48} />
          <h3>Chưa có phiên bản app</h3>
          <p>Hãy build desktop app trước bằng lệnh:</p>
          <code>cd desktop && npm run dist</code>
        </div>
      )}

      <div className="download-info">
        <Info size={20} />
        <div>
          <h4>Yêu cầu hệ thống</h4>
          <p>Windows 7 trở lên • Tối thiểu 256MB RAM • ~300MB dung lượng ổ cứng</p>
        </div>
      </div>

      <div className="download-steps">
        <h3>Hướng dẫn sử dụng nhanh</h3>
        <ol>
          <li><strong>Tải</strong> và chạy CloudSave Client</li>
          <li><strong>Đăng nhập</strong> với tài khoản CloudSave</li>
          <li><strong>Chọn thư mục</strong> lưu trữ game saves</li>
          <li><strong>Bắt đầu đồng bộ</strong> từ VPS tự động hoặc thủ công</li>
        </ol>
      </div>
    </div>
  );
};
