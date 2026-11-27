import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const DEFAULT_PRODUCTION_APP_URL =
  'https://ais-pre-r7tdws3aisr6uosq6lza7m-370699773036.asia-northeast1.run.app';

/**
 * Build-time APP_URL validation plugin.
 * Fails production APK compilation with a clear error message if APP_URL is
 * explicitly misconfigured (invalid URL or localhost/127.0.0.1 target).
 */
function appUrlBuildValidationPlugin(resolvedAppUrl: string): Plugin {
  return {
    name: 'schoolmaster-app-url-validation',
    buildStart() {
      const isApkBuild = process.env.BUILD_TARGET === 'apk' || process.env.VALIDATE_APP_URL === 'true';
      const rawConfigured = (process.env.APP_URL || process.env.VITE_APP_URL || '').trim();
      const targetUrl = rawConfigured || resolvedAppUrl;

      let parsed: URL;
      try {
        parsed = new URL(targetUrl);
      } catch {
        throw new Error(
          `[APP_URL Validation Error] Invalid APP_URL "${targetUrl}". Set a valid https:// production URL before building.`
        );
      }

      const isLocalHost =
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '0.0.0.0' ||
        parsed.hostname.endsWith('.local');

      if (isApkBuild && (isLocalHost || parsed.protocol !== 'https:')) {
        throw new Error(
          `[APP_URL Validation Error] Production APK build blocked: APP_URL ("${targetUrl}") must use HTTPS and cannot point to localhost or a local development address.`
        );
      }

      if (rawConfigured && isLocalHost && process.env.NODE_ENV === 'production') {
        throw new Error(
          `[APP_URL Validation Error] Production build blocked: APP_URL ("${targetUrl}") points to a local development host.`
        );
      }
    },
  };
}

export default defineConfig(() => {
  const configuredAppUrl =
    (process.env.APP_URL || process.env.VITE_APP_URL || '').trim() || DEFAULT_PRODUCTION_APP_URL;

  return {
    define: {
      __APP_PRODUCTION_URL__: JSON.stringify(configuredAppUrl),
    },
    plugins: [
      appUrlBuildValidationPlugin(configuredAppUrl),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'pwa-192x192.svg', 'pwa-512x512.svg', 'version_history.json'],
        manifest: false,
        workbox: {
          maximumFileSizeToCacheInBytes: 16 * 1024 * 1024, // 16 MiB limit for offline cache
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /\.apk$/i],
          runtimeCaching: [
            {
              // Network-First strategy for HTML document / navigation requests so offline boots never 404
              urlPattern: ({ request }) => request.mode === 'navigate' || request.destination === 'document',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'schoolmaster-documents-v1',
                networkTimeoutSeconds: 4,
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 14,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/health') || url.pathname.endsWith('version_history.json'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'schoolmaster-meta-v1',
                networkTimeoutSeconds: 3,
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'qrcode', 'html5-qrcode', 'jspdf'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
