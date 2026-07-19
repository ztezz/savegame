import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const chunkReloadKey = 'cloudsave:chunk-reload-at';

window.addEventListener('vite:preloadError', (event) => {
  const lastReload = Number(sessionStorage.getItem(chunkReloadKey) || 0);
  if (Date.now() - lastReload < 30_000) return;

  // A deploy replaces hashed lazy chunks while an older dashboard may still be open.
  event.preventDefault();
  sessionStorage.setItem(chunkReloadKey, String(Date.now()));
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <App />,
);
