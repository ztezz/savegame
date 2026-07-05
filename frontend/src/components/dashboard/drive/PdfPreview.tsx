import { Download, ExternalLink, FileText } from 'lucide-react';

type Props = {
  src: string;
  title: string;
  downloadUrl: string;
  className?: string;
};

export default function PdfPreview({ src, title, downloadUrl, className = '' }: Props) {
  return <div className={`flex min-h-[520px] flex-col overflow-hidden rounded-3xl bg-white shadow-xl ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-red-500">PDF preview</p>
          <p className="truncate text-sm font-bold text-slate-900">{title}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
          <ExternalLink className="h-4 w-4" /> Mở tab mới
        </a>
        <a href={downloadUrl} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-red-600">
          <Download className="h-4 w-4" /> Tải PDF
        </a>
      </div>
    </div>
    <object data={src} type="application/pdf" className="h-[72vh] min-h-[460px] w-full flex-1 bg-slate-100" aria-label={title}>
      <div className="flex h-full min-h-[460px] flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <FileText className="mb-4 h-14 w-14 text-red-300" />
        <p className="font-black text-slate-900">Trình duyệt không hiển thị được PDF này</p>
        <p className="mt-2 max-w-md text-sm text-slate-500">Bạn có thể mở PDF trong tab mới hoặc tải file xuống để xem bằng ứng dụng PDF trên máy.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <a href={src} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-white">Mở tab mới</a>
          <a href={downloadUrl} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-red-600">Tải xuống</a>
        </div>
      </div>
    </object>
  </div>;
}
