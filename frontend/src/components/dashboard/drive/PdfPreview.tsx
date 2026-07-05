import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Loader2, Minus, Plus } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type Props = {
  src: string;
  title: string;
  downloadUrl: string;
  className?: string;
};

export default function PdfPreview({ src, title, downloadUrl, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const [documentProxy, setDocumentProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.15);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument({ url: src });

    setLoading(true);
    setError('');
    setDocumentProxy(null);
    setPageNumber(1);
    setPageCount(0);

    loadingTask.promise.then((pdf) => {
      if (cancelled) return;
      setDocumentProxy(pdf);
      setPageCount(pdf.numPages);
    }).catch(() => {
      if (!cancelled) setError('Không tải được file PDF để xem trước.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      loadingTask.destroy();
    };
  }, [src]);

  useEffect(() => {
    if (!documentProxy || !canvasRef.current) return;
    let cancelled = false;

    const renderPage = async () => {
      setRendering(true);
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;

      try {
        const page = await documentProxy.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        const pixelRatio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);

        const renderTask = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException' && !cancelled) {
          setError('Không render được trang PDF này.');
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [documentProxy, pageNumber, scale]);

  const previousPage = () => setPageNumber((current) => Math.max(1, current - 1));
  const nextPage = () => setPageNumber((current) => Math.min(pageCount || current, current + 1));
  const zoomOut = () => setScale((current) => Math.max(0.6, Number((current - 0.15).toFixed(2))));
  const zoomIn = () => setScale((current) => Math.min(2.4, Number((current + 0.15).toFixed(2))));

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
        <button type="button" onClick={previousPage} disabled={pageNumber <= 1 || loading} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" /> Trước
        </button>
        <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
          {pageCount ? `${pageNumber}/${pageCount}` : '0/0'}
        </span>
        <button type="button" onClick={nextPage} disabled={!pageCount || pageNumber >= pageCount || loading} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
          Sau <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={zoomOut} disabled={loading} className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Thu nhỏ PDF">
          <Minus className="h-4 w-4" />
        </button>
        <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={zoomIn} disabled={loading} className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Phóng to PDF">
          <Plus className="h-4 w-4" />
        </button>
        <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
          <ExternalLink className="h-4 w-4" /> Mở tab mới
        </a>
        <a href={downloadUrl} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-red-600">
          <Download className="h-4 w-4" /> Tải PDF
        </a>
      </div>
    </div>
    <div className="relative flex h-[72vh] min-h-[460px] flex-1 justify-center overflow-auto bg-slate-100 p-4">
      {(loading || rendering) && <div className="absolute right-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-black text-slate-600 shadow-lg">
        <Loader2 className="h-4 w-4 animate-spin" /> {loading ? 'Đang tải PDF...' : 'Đang render trang...'}
      </div>}
      {error ? <div className="m-auto flex max-w-md flex-col items-center justify-center rounded-3xl bg-white p-6 text-center shadow-sm">
        <FileText className="mb-4 h-14 w-14 text-red-300" />
        <p className="font-black text-slate-900">{error}</p>
        <p className="mt-2 text-sm text-slate-500">Bạn vẫn có thể mở file trong tab mới hoặc tải xuống để xem bằng ứng dụng PDF trên máy.</p>
      </div> : <canvas ref={canvasRef} className="m-auto rounded-xl bg-white shadow-2xl" />}
    </div>
  </div>;
}
