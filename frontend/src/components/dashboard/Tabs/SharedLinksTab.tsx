import React, { useEffect, useState } from 'react';
import { Copy, ExternalLink, File, Link2, Search, ShieldCheck, Trash2 } from 'lucide-react';
import api from '../../../utils/api';
import { copyToClipboard } from '../../../utils/clipboard';
import { useToast } from '../../../context/ToastContext';
import { DriveShare } from '../drive/driveTypes';
import { formatFileSize, formatFileType } from '../drive/driveUtils';

const SharedLinksTab: React.FC = () => {
  const { showToast } = useToast();
  const [shares, setShares] = useState<DriveShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    api.get('/drive/shares')
      .then((response) => { if (active) setShares(response.data || []); })
      .catch((error) => { if (active) showToast(error.response?.data?.error || 'Không tải được link chia sẻ', 'error'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [showToast]);

  const getShareUrl = (token: string) => `${window.location.origin}/share/${encodeURIComponent(token)}`;
  const visibleShares = shares.filter((share) => share.original_name.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));

  const copyLink = async (share: DriveShare) => {
    const copied = await copyToClipboard(getShareUrl(share.token));
    showToast(copied ? 'Đã copy link chia sẻ' : 'Không thể copy link', copied ? 'success' : 'error');
  };

  const removeShare = async (share: DriveShare) => {
    if (!window.confirm(`Tắt link chia sẻ của “${share.original_name}”?`)) return;
    setRemovingId(share.file_id);
    try {
      await api.delete(`/drive/files/${share.file_id}/share`);
      setShares((items) => items.filter((item) => item.file_id !== share.file_id));
      showToast('Đã tắt link chia sẻ', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Tắt chia sẻ thất bại', 'error');
    } finally {
      setRemovingId(null);
    }
  };

  return <div className="admin-dark-surface col-span-12 space-y-5 px-1 sm:px-0">
    <section className="overflow-hidden rounded-[1.75rem] border border-emerald-200/70 bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 p-6 text-white shadow-xl shadow-emerald-100 dark:shadow-none sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div><span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20"><Link2 className="h-6 w-6" /></span><h3 className="mt-5 text-2xl font-black tracking-tight">Các link đang hoạt động</h3><p className="mt-2 max-w-xl text-sm font-medium text-emerald-50">Mọi người có link đều có thể xem hoặc tải file. Hãy tắt chia sẻ khi không còn cần thiết.</p></div>
        <div className="rounded-2xl bg-white/15 px-5 py-4 text-right ring-1 ring-white/20"><p className="text-3xl font-black">{shares.length}</p><p className="text-xs font-bold uppercase tracking-widest text-emerald-100">Link công khai</p></div>
      </div>
    </section>

    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Drive cá nhân</p><h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">File chia sẻ bên ngoài</h3></div>
        <label className="flex w-full items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:max-w-xs dark:border-slate-700 dark:bg-slate-800"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên file..." className="min-w-0 flex-1 bg-transparent px-2 text-sm font-medium text-slate-700 outline-none dark:text-slate-100" /></label>
      </div>

      {loading ? <div className="grid min-h-64 place-items-center"><div className="text-center"><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" /><p className="mt-3 text-sm font-bold text-slate-500">Đang tải link chia sẻ...</p></div></div>
        : visibleShares.length === 0 ? <div className="grid min-h-64 place-items-center p-8 text-center"><div><span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-500"><ShieldCheck className="h-8 w-8" /></span><p className="mt-4 font-black text-slate-800 dark:text-white">{shares.length ? 'Không tìm thấy file phù hợp' : 'Chưa có link chia sẻ nào'}</p><p className="mt-1 text-sm text-slate-500">{shares.length ? 'Thử tìm bằng một tên khác.' : 'Mở Drive và chọn biểu tượng link trên file để chia sẻ.'}</p></div></div>
        : <div className="divide-y divide-slate-100 dark:divide-slate-800">{visibleShares.map((share) => <article key={share.file_id} className="flex flex-col gap-4 p-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-center gap-3"><span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><File className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate font-black text-slate-900 dark:text-white">{share.original_name}</p><p className="mt-1 text-xs font-medium text-slate-500">{formatFileType({ id: share.file_id, original_name: share.original_name, mime_type: share.mime_type, file_size: share.file_size, note: null, created_at: share.created_at })} · {formatFileSize(Number(share.file_size))} · Tạo {new Date(share.created_at).toLocaleString('vi-VN')}</p><p className="mt-1 truncate font-mono text-[11px] text-emerald-600">{getShareUrl(share.token)}</p>{share.expires_at && <p className="mt-1 text-[11px] font-bold text-amber-600">Hết hạn {new Date(share.expires_at).toLocaleString('vi-VN')}</p>}</div></div>
          <div className="flex shrink-0 items-center gap-2 pl-14 sm:pl-0"><button type="button" onClick={() => copyLink(share)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 transition hover:border-emerald-200 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300"><Copy className="h-4 w-4" /> Copy</button><a href={getShareUrl(share.token)} target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-emerald-200 hover:text-emerald-700 dark:border-slate-700" title="Mở link"><ExternalLink className="h-4 w-4" /></a><button type="button" disabled={removingId === share.file_id} onClick={() => removeShare(share)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 text-red-500 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-950" title="Tắt chia sẻ"><Trash2 className="h-4 w-4" /></button></div>
        </article>)}</div>}
    </section>
  </div>;
};

export default SharedLinksTab;
