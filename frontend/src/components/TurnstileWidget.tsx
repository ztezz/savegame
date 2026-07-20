import { useEffect, useRef, useState } from 'react';

interface TurnstileApi {
  ready: (callback: () => void) => void;
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-cloudsave-turnstile]');
    const script = existingScript ?? document.createElement('script');
    const handleLoad = () => resolve();
    const handleError = () => reject(new Error('Không thể tải Cloudflare Turnstile'));

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    if (!existingScript) {
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.cloudsaveTurnstile = 'true';
      document.head.appendChild(script);
    }
  }).catch((error) => {
    turnstileScriptPromise = null;
    throw error;
  });

  return turnstileScriptPromise;
}

export default function TurnstileWidget({
  siteKey,
  resetKey,
  darkMode,
  onToken,
}: {
  siteKey: string;
  resetKey: number;
  darkMode: boolean;
  onToken: (token: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | null = null;
    onToken('');
    setLoadError('');

    if (!siteKey) {
      setLoadError('Turnstile chưa được cấu hình trên máy chủ.');
      return;
    }

    loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      window.turnstile.ready(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: darkMode ? 'dark' : 'light',
          size: 'flexible',
          action: 'login',
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(''),
          'timeout-callback': () => onToken(''),
          'error-callback': () => {
            onToken('');
            setLoadError('Xác minh Cloudflare gặp lỗi. Vui lòng thử lại.');
          },
        });
      });
    }).catch((error: Error) => {
      if (!cancelled) setLoadError(error.message);
    });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, resetKey, darkMode, onToken]);

  return (
    <div className={`space-y-3 border p-3 ${darkMode ? 'border-cyan-300/25 bg-cyan-300/[0.04]' : 'border-cyan-700/20 bg-cyan-50/70'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`font-mono text-[10px] font-bold uppercase tracking-[0.2em] ${darkMode ? 'text-cyan-300' : 'text-cyan-800'}`}>Cloudflare verification</p>
        <span className={`font-mono text-[9px] uppercase tracking-wider ${darkMode ? 'text-slate-600' : 'text-slate-500'}`}>Anti-bot active</span>
      </div>
      <div ref={containerRef} className="min-h-[65px] w-full" />
      {loadError && <p role="alert" className="text-xs font-semibold text-rose-300">{loadError}</p>}
    </div>
  );
}
