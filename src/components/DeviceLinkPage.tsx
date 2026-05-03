import { useEffect, useState } from 'react';
import Auth from './Auth';
import api from '../utils/api';

type LinkStatus = 'pending' | 'approved' | 'expired';

interface DeviceLinkPageProps {
  linkToken: string;
  token: string | null;
  onLogin: (token: string, user: any) => void;
  onDone: () => void;
}

export default function DeviceLinkPage({ linkToken, token, onLogin, onDone }: DeviceLinkPageProps) {
  const [deviceName, setDeviceName] = useState('');
  const [status, setStatus] = useState<LinkStatus | 'loading'>('loading');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');

  const loadSession = async () => {
    try {
      const res = await api.get(`/device-links/${encodeURIComponent(linkToken)}`);
      setDeviceName(res.data.device_name || 'Unknown device');
      setStatus((res.data.status as LinkStatus) || 'pending');
      setExpiresAt(res.data.expires_at || null);
      setMessage('');
    } catch (err: any) {
      setStatus('expired');
      setMessage(err.response?.data?.error || 'Cannot load device link session');
    }
  };

  useEffect(() => {
    loadSession();
  }, [linkToken]);

  if (!token) {
    return <Auth onLogin={onLogin} />;
  }

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await api.post(`/device-links/${encodeURIComponent(linkToken)}/confirm`);
      setStatus('approved');
      setMessage('Device linked successfully. Agent can connect now.');
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Link confirmation failed');
      if (err.response?.status === 410) {
        setStatus('expired');
      }
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-lg p-6">
        <h1 className="text-xl font-black text-slate-900">Liên kết thiết bị</h1>
        <p className="text-sm text-slate-500 mt-1">Xác nhận thiết bị này để gắn nó vào tài khoản hiện tại của bạn.</p>

        <div className="mt-5 p-4 rounded-xl border border-slate-200 bg-slate-50">
          <div className="text-xs uppercase tracking-widest text-slate-400 font-black">Tên thiết bị</div>
          <div className="text-base font-bold text-slate-800 mt-1">{deviceName || 'Đang tải...'}</div>
          {expiresAt && (
            <div className="text-xs text-slate-500 mt-2">Hết hạn: {new Date(expiresAt).toLocaleString('vi-VN')}</div>
          )}
        </div>

        {status === 'loading' && (
          <div className="mt-4 text-sm text-slate-500">Đang tải phiên liên kết...</div>
        )}

        {status === 'pending' && (
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="mt-5 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 disabled:opacity-50"
          >
            {confirming ? 'Đang xác nhận...' : 'Xác nhận liên kết với tài khoản này'}
          </button>
        )}

        {status === 'approved' && (
          <div className="mt-5 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold">
            Liên kết thành công. Bạn có thể đóng trang này.
          </div>
        )}

        {status === 'expired' && (
          <div className="mt-5 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm font-semibold">
            Phiên liên kết đã hết hạn. Mở agent lại để tạo liên kết mới.
          </div>
        )}

        {message && (
          <div className="mt-4 text-sm text-slate-600">{message}</div>
        )}

        <button
          onClick={onDone}
          className="mt-5 w-full rounded-xl border border-slate-300 text-slate-700 font-semibold py-2 hover:bg-slate-50"
        >
          Quay lại ứng dụng
        </button>

        <div className="mt-6 pt-4 border-t border-slate-200 text-center text-xs text-slate-400">
          © 2026 CloudSave. Tất cả quyền được bảo lưu.
        </div>
      </div>
    </div>
  );
}
