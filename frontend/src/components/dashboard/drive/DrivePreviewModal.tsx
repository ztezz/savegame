import React from 'react';
import { Download, File, Link, X } from 'lucide-react';
import { API_BASE_URL } from '../../../utils/api';
import { DriveFile, PreviewState } from './driveTypes';
import { formatFileSize, getFileVisual } from './driveUtils';
import MediaPlayer from './MediaPlayer';

type Props = {
  preview: PreviewState | null;
  previewLoading: boolean;
  previewObjectUrl: string | null;
  officePreviewUrl: string | null;
  onClose: () => void;
  onShareFile: (file: DriveFile) => void;
};

const DrivePreviewModal: React.FC<Props> = ({ preview, previewLoading, previewObjectUrl, officePreviewUrl, onClose, onShareFile }) => {
  if (!preview && !previewLoading) return null;

  const renderPreviewContent = () => {
    if (previewLoading) return <div className="flex h-full min-h-[360px] items-center justify-center rounded-3xl bg-white text-sm font-bold text-slate-500">Đang tải preview...</div>;
    if (!preview) return null;

    if (preview.kind === 'image' && previewObjectUrl) {
      return <div className="flex min-h-[65vh] items-center justify-center"><img src={previewObjectUrl} alt={preview.file.original_name} className="max-h-[72vh] max-w-full rounded-3xl bg-white object-contain shadow-2xl" /></div>;
    }
    if (preview.kind === 'pdf' && previewObjectUrl) {
      return <iframe src={previewObjectUrl} title={preview.file.original_name} className="h-[72vh] w-full rounded-3xl bg-white shadow-xl" />;
    }
    if (preview.kind === 'video' && previewObjectUrl) {
      return <MediaPlayer src={previewObjectUrl} title={preview.file.original_name} type="video" />;
    }
    if (preview.kind === 'audio' && previewObjectUrl) {
      return <MediaPlayer src={previewObjectUrl} title={preview.file.original_name} type="audio" />;
    }
    if (preview.kind === 'office') {
      return officePreviewUrl ? <iframe src={officePreviewUrl} title={preview.file.original_name} className="h-[72vh] w-full rounded-3xl bg-white shadow-xl" /> : <div className="flex min-h-[420px] items-center justify-center rounded-3xl bg-white text-sm font-bold text-slate-500">Đang chuẩn bị trình xem Office...</div>;
    }
    if (preview.kind === 'text') {
      return <div className="space-y-3"><pre className="max-h-[72vh] whitespace-pre-wrap break-words rounded-3xl bg-slate-950 p-5 text-xs leading-relaxed text-slate-100 shadow-xl overflow-auto">{preview.content}</pre>{preview.truncated && <p className="text-xs font-bold text-amber-600">Preview đã được cắt ngắn để tải nhanh.</p>}</div>;
    }

    return <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl bg-white text-center shadow-sm"><File className="w-16 h-16 text-slate-300 mb-4" /><p className="font-black text-slate-900">Chưa hỗ trợ xem trước loại file này</p><p className="mt-1 max-w-sm text-sm text-slate-500">Bạn vẫn có thể tải file về máy hoặc tạo link chia sẻ.</p></div>;
  };

  return <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-4">
        <div className="min-w-0 flex items-center gap-3">
          <div className={`hidden sm:flex h-12 w-12 items-center justify-center rounded-2xl ${preview?.file ? getFileVisual(preview.file).iconClass : 'bg-slate-50 text-slate-400'}`}><File className="w-7 h-7" /></div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-indigo-500">Xem trước file</p>
            <h3 className="font-black text-slate-900 truncate">{preview?.file.original_name || 'Đang tải...'}</h3>
            {preview?.file && <p className="text-xs text-slate-500 mt-1">{getFileVisual(preview.file).label} · {formatFileSize(Number(preview.file.file_size))} · {preview.file.mime_type || 'Không rõ loại file'}</p>}
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
      </div>
      <div className="grid min-h-[420px] flex-1 overflow-hidden lg:grid-cols-[1fr_280px]">
        <div className="overflow-auto bg-slate-100 p-5">{renderPreviewContent()}</div>
        <div className="border-t border-slate-100 bg-white p-5 lg:border-l lg:border-t-0">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Thông tin file</p>
          {preview?.file && <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Tên file</p><p className="mt-1 break-words font-bold text-slate-900">{preview.file.original_name}</p></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Dung lượng</p><p className="mt-1 font-bold text-slate-900">{formatFileSize(Number(preview.file.file_size))}</p></div>
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Loại</p><p className="mt-1 font-bold text-slate-900">{getFileVisual(preview.file).label}</p></div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Ngày tải</p><p className="mt-1 font-bold text-slate-900">{new Date(preview.file.created_at).toLocaleString('vi-VN')}</p></div>
            {preview.file.note && <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Ghi chú</p><p className="mt-1 break-words font-bold text-slate-900">{preview.file.note}</p></div>}
            <div className="space-y-2 pt-2">
              <a href={`${API_BASE_URL}/drive/download/${preview.file.id}`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white"><Download className="w-4 h-4" />Tải xuống</a>
              <button type="button" onClick={() => onShareFile(preview.file)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"><Link className="w-4 h-4" />{preview.file.share_token ? 'Copy link chia sẻ' : 'Tạo link chia sẻ'}</button>
            </div>
          </div>}
        </div>
      </div>
    </div>
  </div>;
};

export default DrivePreviewModal;
