import { useEffect, useState } from 'react';
import { Download, File, ShieldCheck } from 'lucide-react';
import api, { API_BASE_URL } from '../utils/api';
import PdfPreview from './dashboard/drive/PdfPreview';

interface SharedFile {
  id: number;
  original_name: string;
  mime_type: string | null;
  file_size: number;
  note: string | null;
  created_at: string;
}

interface DriveSharePageProps {
  token: string;
}

const formatFileSize = (size: number) => {
  if (!size) return '0 B';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const isPdf = (file: SharedFile) => {
  const name = file.original_name.toLowerCase();
  return file.mime_type === 'application/pdf' || name.endsWith('.pdf');
};

export default function DriveSharePage({ token }: DriveSharePageProps) {
  const [file, setFile] = useState<SharedFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadShare = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get(`/drive/share/${encodeURIComponent(token)}`);
        setFile(res.data.file || null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Link chia sẻ không hợp lệ hoặc đã bị tắt.');
      } finally {
        setLoading(false);
      }
    };
    loadShare();
  }, [token]);

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc,#eef2ff)] flex items-center justify-center p-5">
      <div className="w-full max-w-5xl">
      <div className="mb-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-widest text-indigo-600 shadow-sm">
          <ShieldCheck className="w-4 h-4" /> CloudSave Drive Share
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/70 bg-white/90 shadow-2xl shadow-indigo-100 overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-8 text-white">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-white/70">Public file</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">File được chia sẻ</h1>
          <p className="mt-2 text-sm text-white/80">Bạn có thể xem thông tin file và tải xuống từ CloudSave Drive.</p>
        </div>

        <div className="p-6 sm:p-8">
          {loading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Đang tải link chia sẻ...</div> : error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error}</div> : file ? <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 flex items-start gap-4">
              <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
                <File className="w-10 h-10 text-indigo-500" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-black text-slate-900 break-words">{file.original_name}</h2>
                <p className="mt-2 text-sm text-slate-500">{formatFileSize(Number(file.file_size))} · {file.mime_type || 'Không rõ loại file'}</p>
                <p className="mt-1 text-xs text-slate-400">Đã upload: {new Date(file.created_at).toLocaleString('vi-VN')}</p>
                {file.note && <p className="mt-4 rounded-2xl bg-white border border-slate-200 p-3 text-sm text-slate-600">{file.note}</p>}
              </div>
            </div>

            {isPdf(file) && <PdfPreview
              src={`${API_BASE_URL}/drive/share/${encodeURIComponent(token)}/raw`}
              title={file.original_name}
              downloadUrl={`${API_BASE_URL}/drive/share/${encodeURIComponent(token)}/download`}
            />}

            <a href={`${API_BASE_URL}/drive/share/${encodeURIComponent(token)}/download`} className="w-full inline-flex items-center justify-center gap-3 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-lg shadow-slate-200 hover:bg-indigo-700 transition">
              <Download className="w-5 h-5" /> Tải file xuống
            </a>

            <p className="text-center text-xs text-slate-400">Nếu bạn không mong đợi file này, không nên tải hoặc mở file lạ.</p>
          </div> : null}
        </div>
      </div>
    </div>
  </div>;
}
