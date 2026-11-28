import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installGlobalApiFetchInterceptor } from './utils/apiConfig';

// Ensure all relative /api/* requests resolve to configured production APP_URL
// when running inside Android/iOS WebView local asset bundles (file:// or Capacitor).
installGlobalApiFetchInterceptor();

createRoot(document.getElementById('root')!).render(<App />);

// Register Service Worker only on HTTP(S) origins (never on file:// inside Android WebView)
if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  (window.location.protocol === 'https:' || window.location.protocol === 'http:')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((registration) => {
        console.log('School Master ServiceWorker registered with scope:', registration.scope);
        // Proactively check for updated Workbox/SW script so stale caches are purged immediately
        registration.update().catch(() => {});
      })
      .catch((err) => {
        console.log('School Master ServiceWorker registration failed:', err);
      });
  });
}


