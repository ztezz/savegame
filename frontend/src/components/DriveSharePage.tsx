import { useEffect, useState } from 'react';
import {
  CalendarDays, Check, Copy, Download, File, FileAudio, FileImage,
  FileText, FileVideo, HardDrive, RefreshCw, ShieldCheck,
} from 'lucide-react';
import api, { API_BASE_URL } from '../utils/api';
import { copyToClipboard } from '../utils/clipboard';
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

type PreviewKind = 'image' | 'pdf' | 'video' | 'audio' | 'none';

const formatFileSize = (size: number) => {
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`;
};

const getExtension = (name: string) => {
  const extension = name.includes('.') ? name.split('.').pop() : '';
  return extension?.toUpperCase() || 'FILE';
};

const getPreviewKind = (file: SharedFile): PreviewKind => {
  const mime = (file.mime_type || '').toLowerCase();
  const name = file.original_name.toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'none';
};

const getFileVisual = (file: SharedFile) => {
  const kind = getPreviewKind(file);
  if (kind === 'image') return { Icon: FileImage, label: 'Hình ảnh', color: 'bg-emerald-50 text-emerald-600 ring-emerald-100' };
  if (kind === 'pdf') return { Icon: FileText, label: 'Tài liệu PDF', color: 'bg-red-50 text-red-500 ring-red-100' };
  if (kind === 'video') return { Icon: FileVideo, label: 'Video', color: 'bg-violet-50 text-violet-600 ring-violet-100' };
  if (kind === 'audio') return { Icon: FileAudio, label: 'Âm thanh', color: 'bg-amber-50 text-amber-600 ring-amber-100' };
  return { Icon: File, label: file.mime_type || 'Tệp dữ liệu', color: 'bg-blue-50 text-blue-600 ring-blue-100' };
};

export default function DriveSharePage({ token }: DriveSharePageProps) {
  const [file, setFile] = useState<SharedFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const loadShare = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/drive/share/${encodeURIComponent(token)}`);
      setFile(res.data.file || null);
    } catch (err: any) {
      setFile(null);
      setError(err.response?.data?.error || 'Link chia sẻ không hợp lệ, đã hết hạn hoặc đã bị tắt.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShare();
  }, [token]);

  useEffect(() => {
    document.title = file ? `${file.original_name} | CloudSave` : 'CloudSave Drive Share';
    return () => { document.title = 'CloudSave Hub'; };
  }, [file]);

  const sharePath = `/drive/share/${encodeURIComponent(token)}`;
  const rawUrl = `${API_BASE_URL}${sharePath}/raw`;
  const downloadUrl = `${API_BASE_URL}${sharePath}/download`;
  const previewKind = file ? getPreviewKind(file) : 'none';
  const visual = file ? getFileVisual(file) : null;

  const copyLink = async () => {
    if (!await copyToClipboard(window.location.href)) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return <div className="relative min-h-screen overflow-hidden bg-[#f4f7f6] text-slate-900">
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -right-32 -top-48 h-[34rem] w-[34rem] rounded-full bg-emerald-200/50 blur-3xl" />
      <div className="absolute -bottom-52 -left-40 h-[32rem] w-[32rem] rounded-full bg-cyan-200/40 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(#0f172a_1px,transparent_1px),linear-gradient(90deg,#0f172a_1px,transparent_1px)] [background-size:32px_32px]" />
    </div>

    <header className="relative z-10 border-b border-white/70 bg-white/65 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:h-20 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200"><img src="/logo.svg" alt="CloudSave" className="h-8 w-8" /></span>
          <div><p className="text-base font-black tracking-tight text-slate-950">CloudSave</p><p className="text-[9px] font-black uppercase tracking-[0.22em] text-emerald-600">Drive Share</p></div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-[11px] font-black text-emerald-700"><ShieldCheck className="h-4 w-4" /><span className="hidden sm:inline">Kết nối an toàn</span><span className="sm:hidden">An toàn</span></div>
      </div>
    </header>

    <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {loading ? <div className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-white bg-white/80 p-6 shadow-2xl shadow-emerald-950/5 backdrop-blur sm:p-10">
        <div className="animate-pulse"><div className="h-3 w-28 rounded bg-emerald-100" /><div className="mt-5 h-9 max-w-lg rounded-xl bg-slate-200" /><div className="mt-3 h-4 w-64 rounded bg-slate-100" /><div className="mt-10 h-64 rounded-3xl bg-slate-100" /></div>
        <p className="mt-6 flex items-center justify-center gap-2 text-sm font-bold text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> Đang xác minh link chia sẻ...</p>
      </div> : error ? <div className="mx-auto max-w-xl rounded-[2rem] border border-white bg-white/90 p-7 text-center shadow-2xl shadow-red-950/5 backdrop-blur sm:p-10">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-red-50 text-red-500 ring-8 ring-red-50/60"><File className="h-9 w-9" /></span>
        <p className="mt-7 text-[10px] font-black uppercase tracking-[0.24em] text-red-500">Không thể truy cập</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Link không còn khả dụng</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">{error}</p>
        <button type="button" onClick={loadShare} className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700"><RefreshCw className="h-4 w-4" /> Thử tải lại</button>
      </div> : file && visual ? <div className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/90 bg-white/90 shadow-2xl shadow-emerald-950/5 backdrop-blur">
          <div className="relative overflow-hidden bg-slate-950 px-6 py-8 text-white sm:px-10 sm:py-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(52,211,153,0.28),transparent_32%),radial-gradient(circle_at_5%_100%,rgba(6,182,212,0.18),transparent_38%)]" />
            <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-4 sm:gap-6">
                <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-xl sm:h-20 sm:w-20 ${visual.color}`}><visual.Icon className="h-8 w-8 sm:h-10 sm:w-10" /></span>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-400/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300 ring-1 ring-emerald-300/20">Được chia sẻ với bạn</span><span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/70">{getExtension(file.original_name)}</span></div><h1 className="mt-4 break-words text-2xl font-black leading-tight tracking-tight sm:text-4xl">{file.original_name}</h1><p className="mt-3 text-sm leading-6 text-slate-300">Sẵn sàng để xem trước hoặc tải xuống từ CloudSave Drive.</p></div>
              </div>
              <a href={downloadUrl} className="inline-flex w-full shrink-0 items-center justify-center gap-3 rounded-2xl bg-emerald-400 px-6 py-4 text-sm font-black text-emerald-950 shadow-xl shadow-emerald-950/30 transition hover:-translate-y-0.5 hover:bg-emerald-300 lg:w-auto"><Download className="h-5 w-5" /> Tải file xuống</a>
            </div>
          </div>

          <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="flex items-center gap-3 px-6 py-4"><HardDrive className="h-4 w-4 text-emerald-600" /><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dung lượng</p><p className="mt-0.5 text-sm font-black text-slate-800">{formatFileSize(Number(file.file_size))}</p></div></div>
            <div className="flex items-center gap-3 px-6 py-4"><FileText className="h-4 w-4 text-emerald-600" /><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Định dạng</p><p className="mt-0.5 truncate text-sm font-black text-slate-800">{visual.label}</p></div></div>
            <div className="flex items-center gap-3 px-6 py-4"><CalendarDays className="h-4 w-4 text-emerald-600" /><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ngày tải lên</p><p className="mt-0.5 text-sm font-black text-slate-800">{new Date(file.created_at).toLocaleDateString('vi-VN')}</p></div></div>
          </div>
        </section>

        <div className={`grid gap-6 ${previewKind !== 'none' ? 'xl:grid-cols-[minmax(0,1fr)_20rem]' : 'lg:grid-cols-[minmax(0,1fr)_22rem]'}`}>
          <div className="min-w-0 space-y-6">
            {previewKind === 'pdf' && <PdfPreview src={rawUrl} title={file.original_name} downloadUrl={downloadUrl} className="border border-white/90 shadow-2xl shadow-slate-950/10" />}
            {previewKind === 'image' && <section className="overflow-hidden rounded-[2rem] border border-white bg-white/90 shadow-xl shadow-slate-950/5"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Xem trước</p><p className="mt-1 text-sm font-black text-slate-800">Hình ảnh</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-500">{getExtension(file.original_name)}</span></div><div className="grid min-h-72 place-items-center bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%),linear-gradient(-45deg,#f1f5f9_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f1f5f9_75%),linear-gradient(-45deg,transparent_75%,#f1f5f9_75%)] [background-position:0_0,0_8px,8px_-8px,-8px_0] [background-size:16px_16px] p-4 sm:p-8"><img src={rawUrl} alt={file.original_name} className="max-h-[70vh] max-w-full rounded-xl object-contain shadow-2xl" /></div></section>}
            {previewKind === 'video' && <section className="overflow-hidden rounded-[2rem] border border-white bg-slate-950 shadow-xl"><div className="px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Xem trước video</p></div><video src={rawUrl} controls preload="metadata" className="max-h-[72vh] w-full bg-black">Trình duyệt không hỗ trợ xem video này.</video></section>}
            {previewKind === 'audio' && <section className="rounded-[2rem] border border-white bg-slate-950 p-6 text-white shadow-xl sm:p-8"><div className="flex items-center gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400 text-amber-950"><FileAudio className="h-7 w-7" /></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Đang phát</p><p className="mt-1 truncate font-black">{file.original_name}</p></div></div><audio src={rawUrl} controls preload="metadata" className="mt-6 w-full">Trình duyệt không hỗ trợ phát âm thanh này.</audio></section>}
            {previewKind === 'none' && <section className="grid min-h-72 place-items-center rounded-[2rem] border border-white bg-white/85 p-8 text-center shadow-xl shadow-slate-950/5"><div><span className={`mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] ring-8 ${visual.color}`}><visual.Icon className="h-9 w-9" /></span><h2 className="mt-7 text-xl font-black text-slate-900">Không hỗ trợ xem trước định dạng này</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Tải file xuống để mở bằng ứng dụng phù hợp trên thiết bị của bạn.</p><a href={downloadUrl} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700"><Download className="h-4 w-4" /> Tải về thiết bị</a></div></section>}
          </div>

          <aside className="space-y-4">
            {file.note && <section className="rounded-3xl border border-white bg-white/90 p-5 shadow-lg shadow-slate-950/5"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Ghi chú từ người chia sẻ</p><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{file.note}</p></section>}
            <section className="rounded-3xl border border-white bg-white/90 p-5 shadow-lg shadow-slate-950/5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck className="h-5 w-5" /></span><div><h2 className="text-sm font-black text-slate-900">Chia sẻ an toàn</h2><p className="mt-1 text-xs leading-5 text-slate-500">File được truyền trực tiếp từ CloudSave. Chỉ mở file khi bạn tin tưởng người gửi.</p></div></div><button type="button" onClick={copyLink} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700">{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}{copied ? 'Đã sao chép link' : 'Sao chép link chia sẻ'}</button></section>
            {previewKind !== 'none' && <a href={downloadUrl} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-emerald-700"><Download className="h-5 w-5" /> Tải bản gốc</a>}
          </aside>
        </div>
      </div> : null}
    </main>

    <footer className="relative z-10 px-4 pb-8 pt-2 text-center"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">CloudSave Hub · Chia sẻ file nhanh chóng và an toàn</p></footer>
  </div>;
}
