/**
 * Cross-Platform API Base URL Configuration, apiFetch Helper & Fetch Interceptor
 *
 * Reads the production APP_URL injected at build time by `vite.config.ts`
 * (`__APP_PRODUCTION_URL__`, sourced from `process.env.APP_URL || process.env.VITE_APP_URL`).
 *
 * Ensures all API requests resolve accurately across:
 *  - Web (Development & Production HTTPS via same-origin relative /api/*)
 *  - Android WebView (`file:///android_asset/www/index.html` or Capacitor -> Production APP_URL)
 *  - iOS WKWebView / Capacitor / Windows Desktop PWA -> Production APP_URL
 *
 * Strictly forbids hardcoded localhost targets in production bundles.
 */

declare const __APP_PRODUCTION_URL__: string | undefined;

const FALLBACK_PRODUCTION_APP_URL =
  'https://ais-pre-r7tdws3aisr6uosq6lza7m-370699773036.asia-northeast1.run.app';

function sanitizeProductionUrl(raw?: string | null): string {
  const candidate = String(raw || '').trim().replace(/\/+$/, '');
  if (!candidate) return FALLBACK_PRODUCTION_APP_URL;
  try {
    const parsed = new URL(candidate);
    const isLocal =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname.endsWith('.local');
    if (isLocal || parsed.protocol !== 'https:') {
      return FALLBACK_PRODUCTION_APP_URL;
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return FALLBACK_PRODUCTION_APP_URL;
  }
}

/**
 * Injected at build time by vite.config.ts from process.env.APP_URL || process.env.VITE_APP_URL.
 * Guaranteed to be a valid HTTPS production origin (never localhost).
 */
export const PRODUCTION_APP_URL: string = sanitizeProductionUrl(
  typeof __APP_PRODUCTION_URL__ !== 'undefined'
    ? __APP_PRODUCTION_URL__
    : (import.meta as unknown as { env?: Record<string, string | undefined> })?.env?.VITE_APP_URL
);

/**
 * Detects whether the app is executing inside a bundled local WebView container
 * (Android file:///android_asset/www/, Capacitor, Ionic, Electron file://, etc.)
 * where relative `/api/...` paths would fail against the local filesystem.
 */
export function isBundledNativeWebViewOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const protocol = (window.location.protocol || '').toLowerCase();
  if (
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    protocol === 'ionic:' ||
    protocol === 'app:' ||
    protocol === 'about:' ||
    protocol === 'chrome-extension:'
  ) {
    return true;
  }
  const hostname = (window.location.hostname || '').toLowerCase();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isMobileWebView =
    /\bwv\b|SchoolMasterAndroid/i.test(ua) ||
    typeof (window as unknown as Record<string, unknown>).Capacitor !== 'undefined' ||
    typeof (window as unknown as Record<string, unknown>).SchoolMasterAndroid !== 'undefined' ||
    typeof (window as unknown as Record<string, unknown>).SchoolMasterLessonPlanBridge !== 'undefined';

  if (isMobileWebView && (hostname === 'localhost' || hostname === '127.0.0.1' || !hostname)) {
    return true;
  }
  return false;
}

/**
 * Returns the API origin base URL:
 * - '' (same-origin) when running on standard web HTTP(S) hosting (dev preview or deployed web app)
 * - PRODUCTION_APP_URL when running inside an offline/bundled Android/iOS/Desktop WebView container
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return PRODUCTION_APP_URL;
  if (isBundledNativeWebViewOrigin()) {
    return PRODUCTION_APP_URL;
  }
  return '';
}

/**
 * Resolves a relative API or downloadable asset path (e.g. '/api/health', '/SchoolMaster-release.apk')
 * into a fully-qualified HTTPS URL using the injected APP_URL when running in a bundled
 * WebView container, or preserves same-origin relative URLs when hosted on web HTTP(S).
 */
export function resolveApiUrl(pathOrUrl: string): string {
  const trimmed = String(pathOrUrl || '').trim();
  if (!trimmed) return getApiBaseUrl() || '/';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

/**
 * Resolves a static public asset path (e.g. 'version_history.json') relative to the current
 * HTML shell (`./...`) so it works on both web root and Android `file:///android_asset/www/`.
 */
export function resolveStaticAssetUrl(assetPath: string): string {
  const clean = String(assetPath || '').replace(/^\/+/, '');
  return `./${clean}`;
}

/**
 * Canonical cross-platform API fetch wrapper backed by Vite-injected APP_URL.
 */
export function apiFetch(pathOrUrl: string, init?: RequestInit): Promise<Response> {
  return fetch(resolveApiUrl(pathOrUrl), init);
}

let fetchInterceptorInstalled = false;

/**
 * Installs a lightweight, idempotent global fetch wrapper once at app boot as defense-in-depth
 * so any relative `fetch('/api/...')` call automatically targets `PRODUCTION_APP_URL`
 * when executed inside an Android/iOS/Desktop WebView asset bundle (`file://` or Capacitor).
 */
export function installGlobalApiFetchInterceptor(): void {
  if (fetchInterceptorInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }
  fetchInterceptorInstalled = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      if (isBundledNativeWebViewOrigin()) {
        if (typeof input === 'string') {
          if (input.startsWith('/api/') || input === '/api' || /\.apk(\?.*)?$/i.test(input)) {
            return nativeFetch(resolveApiUrl(input), init);
          }
        } else if (input instanceof URL) {
          if (input.protocol === 'file:' && input.pathname.includes('/api/')) {
            const apiIdx = input.pathname.indexOf('/api/');
            const apiPath = input.pathname.slice(apiIdx) + input.search;
            return nativeFetch(resolveApiUrl(apiPath), init);
          }
        } else if (typeof Request !== 'undefined' && input instanceof Request) {
          if (input.url.startsWith('file://') && input.url.includes('/api/')) {
            const apiIdx = input.url.indexOf('/api/');
            const rewrittenUrl = resolveApiUrl(input.url.slice(apiIdx));
            return nativeFetch(new Request(rewrittenUrl, input), init);
          }
        }
      }
    } catch {
      // Fall back safely to native fetch
    }
    return nativeFetch(input, init);
  };
}
