/**
 * Automated Diagnostics, Navigation Observer, QR Error Logger,
 * Production Heartbeat Ping & Offline Sync Queue utilities.
 */

export const APP_ERRORS_STORAGE_KEY = 'app_errors.json';
export const QR_ERROR_LOG_STORAGE_KEY = 'qr_error_log.json';
export const NAVIGATION_LOG_STORAGE_KEY = 'school_master_navigation_logs_v1';
export const OFFLINE_SYNC_QUEUE_KEY = 'school_master_offline_sync_queue_v1';
export const DEVICE_ID_STORAGE_KEY = 'school_master_device_id_v1';

export const PRODUCTION_APP_URL =
  'https://ais-pre-r7tdws3aisr6uosq6lza7m-370699773036.asia-northeast1.run.app';

export interface AppErrorLogEntry {
  id: string;
  timestamp: string;
  type: '404_NOT_FOUND' | 'NAVIGATION_ERROR' | 'API_HEARTBEAT_FAILURE' | 'RUNTIME_ERROR';
  requestedUrl: string;
  httpStatus?: number;
  responseHeaders?: Record<string, string>;
  message: string;
  recoveredToRoot?: boolean;
}

export interface QrErrorLogEntry {
  id: string;
  timestamp: string;
  category: 'INVALID_FORMAT' | 'UNRECOGNIZED_STUDENT' | 'DUPLICATE_SCAN' | 'CAMERA_PERMISSION_DENIED' | 'CAMERA_HARDWARE_ERROR';
  rawInput?: string;
  errorMessage: string;
  deviceId: string;
  networkSignalDbm?: number | null;
}

export interface NavigationLogEntry {
  id: string;
  timestamp: string;
  fromPath: string;
  toPath: string;
  activeTab: string;
  status: 'OK' | 'RECOVERED_404' | 'DEEP_LINK';
  userAgent: string;
}

export interface OfflineSyncQueueItem {
  id: string;
  module: 'Attendance' | 'TeacherLeave' | 'AboutUs' | 'FAQ' | 'General';
  summary: string;
  payload?: Record<string, unknown>;
  status: 'pending' | 'failed' | 'completed';
  createdAt: string;
  lastAttemptAt?: string;
  errorMessage?: string;
  retries: number;
}

export interface HeartbeatPingResult {
  ok: boolean;
  url: string;
  status: number;
  statusText: string;
  latencyMs: number;
  timestamp: string;
  headers: Record<string, string>;
  errorMessage?: string;
}

const VALID_SPA_PATHS = new Set<string>([
  '/',
  '/index.html',
  '/dashboard',
  '/students',
  '/attendance',
  '/progress-cards',
  '/about-us',
  '/settings',
  '/teacher-leave',
  '/jkepm-appraisal',
  '/ai-chatbot',
]);

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'SM-WEB-SERVER';
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;
    const isAndroid = /android/i.test(navigator.userAgent || '');
    const prefix = isAndroid ? 'SM-AND' : 'SM-WEB';
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const ts = Date.now().toString(36).slice(-4).toUpperCase();
    const generated = `${prefix}-${ts}${rand}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'SM-DEV-LOCAL';
  }
}

/**
 * Estimates device network signal strength in dBm using the Network Information API
 * (effectiveType + rtt + downlink) so IT admins have realistic connectivity telemetry.
 * Returns null when offline.
 */
export function measureNetworkSignalDbm(forceOffline = false): number | null {
  if (forceOffline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return null;
  }
  try {
    const conn = (navigator as any)?.connection || (navigator as any)?.mozConnection || (navigator as any)?.webkitConnection;
    if (conn) {
      const effectiveType = String(conn.effectiveType || '4g').toLowerCase();
      const rtt = typeof conn.rtt === 'number' ? conn.rtt : 50;
      const downlink = typeof conn.downlink === 'number' ? conn.downlink : 10;
      let baseDbm = -62;
      if (effectiveType === '4g') baseDbm = downlink >= 8 ? -58 : -68;
      else if (effectiveType === '3g') baseDbm = -82;
      else if (effectiveType === '2g') baseDbm = -96;
      else if (effectiveType === 'slow-2g') baseDbm = -105;
      const rttPenalty = Math.min(18, Math.round(rtt / 40));
      return Math.max(-115, Math.min(-45, baseDbm - rttPenalty));
    }
  } catch {
    // Fallback below
  }
  return -64;
}

// -------------------- APP ERRORS (app_errors.json) --------------------

export function loadAppErrorLogs(): AppErrorLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(APP_ERRORS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as AppErrorLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function logAppError(entry: Omit<AppErrorLogEntry, 'id' | 'timestamp'>): AppErrorLogEntry[] {
  const newEntry: AppErrorLogEntry = {
    ...entry,
    id: `apperr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
  const next = [newEntry, ...loadAppErrorLogs()].slice(0, 200);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(APP_ERRORS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota
    }
  }
  return next;
}

export function clearAppErrorLogs(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(APP_ERRORS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

// -------------------- QR ERROR LOGS (qr_error_log.json) --------------------

export function loadQrErrorLogs(): QrErrorLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(QR_ERROR_LOG_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QrErrorLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function logQrScanError(entry: Omit<QrErrorLogEntry, 'id' | 'timestamp' | 'deviceId' | 'networkSignalDbm'>): QrErrorLogEntry[] {
  const newEntry: QrErrorLogEntry = {
    ...entry,
    id: `qrerr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    deviceId: getOrCreateDeviceId(),
    networkSignalDbm: measureNetworkSignalDbm(),
  };
  const next = [newEntry, ...loadQrErrorLogs()].slice(0, 300);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(QR_ERROR_LOG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota
    }
  }
  return next;
}

export function clearQrErrorLogs(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(QR_ERROR_LOG_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

// -------------------- NAVIGATION LOGGER & OBSERVER --------------------

export function loadNavigationLogs(): NavigationLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(NAVIGATION_LOG_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as NavigationLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordNavigationEvent(
  fromPath: string,
  toPath: string,
  activeTab: string,
  status: NavigationLogEntry['status'] = 'OK'
): NavigationLogEntry[] {
  const entry: NavigationLogEntry = {
    id: `nav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    fromPath,
    toPath,
    activeTab,
    status,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 140) : 'unknown',
  };
  const next = [entry, ...loadNavigationLogs()].slice(0, 250);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(NAVIGATION_LOG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  return next;
}

/**
 * NavigationObserver utility: verifies current pathname against valid SPA routes.
 * If a missing route / 404 path is detected, logs it to app_errors.json and
 * navigation logs, and resets location cleanly to '/' so the dashboard loads.
 */
export function observeAndRecoverRoute(activeTab: string): { recovered: boolean; path: string } {
  if (typeof window === 'undefined') return { recovered: false, path: '/' };
  const currentPath = window.location.pathname || '/';
  const normalized = currentPath.length > 1 ? currentPath.replace(/\/+$/, '') : '/';

  if (!VALID_SPA_PATHS.has(normalized) && !normalized.startsWith('/api/')) {
    logAppError({
      type: '404_NOT_FOUND',
      requestedUrl: window.location.href,
      httpStatus: 404,
      message: `Client-side NavigationObserver detected unrecognized route "${currentPath}" and recovered to root dashboard.`,
      recoveredToRoot: true,
    });
    recordNavigationEvent(currentPath, '/', activeTab, 'RECOVERED_404');
    try {
      window.history.replaceState({}, '', '/' + (window.location.hash || ''));
    } catch {
      // ignore history errors in sandboxed iframes
    }
    return { recovered: true, path: currentPath };
  }

  recordNavigationEvent(normalized, normalized, activeTab, window.location.hash ? 'DEEP_LINK' : 'OK');
  return { recovered: false, path: normalized };
}

// -------------------- OFFLINE SYNC QUEUE MANAGER --------------------

export function loadOfflineSyncQueue(): OfflineSyncQueueItem[] {
  if (typeof window === 'undefined') return [];
  const items: OfflineSyncQueueItem[] = [];
  try {
    const raw = window.localStorage.getItem(OFFLINE_SYNC_QUEUE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) items.push(...parsed);
    }
    // Also surface any queued offline attendance records from DailyAttendance
    const attRaw = window.localStorage.getItem('school_master_offline_attendance_queue');
    if (attRaw) {
      const attList = JSON.parse(attRaw);
      if (Array.isArray(attList)) {
        const existingIds = new Set(items.map((i) => i.id));
        attList.forEach((rec: any) => {
          const itemId = `att-q-${rec.id || `${rec.studentId}-${rec.date}`}`;
          if (!existingIds.has(itemId)) {
            items.push({
              id: itemId,
              module: 'Attendance',
              summary: `Offline Attendance: ${rec.studentId} (${rec.date}) — ${rec.status || 'Present'}`,
              payload: rec,
              status: 'pending',
              createdAt: rec.markedAt || new Date().toISOString(),
              retries: 0,
            });
          }
        });
      }
    }
  } catch {
    // ignore
  }
  return items;
}

export function saveOfflineSyncQueue(items: OfflineSyncQueueItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(items.slice(0, 300)));
  } catch {
    // ignore
  }
}

export function enqueueOfflineSyncItem(
  item: Omit<OfflineSyncQueueItem, 'id' | 'createdAt' | 'retries'>
): OfflineSyncQueueItem[] {
  const existing = loadOfflineSyncQueue();
  const next: OfflineSyncQueueItem[] = [
    {
      ...item,
      id: `syncq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      retries: 0,
    },
    ...existing,
  ];
  saveOfflineSyncQueue(next);
  return next;
}

// -------------------- PRODUCTION HEARTBEAT PING --------------------

export async function runProductionHeartbeatPing(
  endpoint = '/api/health'
): Promise<HeartbeatPingResult> {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const timestamp = new Date().toISOString();
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const elapsed = Math.max(
      1,
      Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started)
    );
    const headers: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      headers[key] = val;
    });

    if (!response.ok) {
      const errorMessage = `Heartbeat endpoint returned HTTP ${response.status} ${response.statusText}`;
      logAppError({
        type: 'API_HEARTBEAT_FAILURE',
        requestedUrl: response.url || endpoint,
        httpStatus: response.status,
        responseHeaders: headers,
        message: errorMessage,
      });
      return {
        ok: false,
        url: response.url || endpoint,
        status: response.status,
        statusText: response.statusText || 'Error',
        latencyMs: elapsed,
        timestamp,
        headers,
        errorMessage,
      };
    }

    return {
      ok: true,
      url: response.url || endpoint,
      status: response.status,
      statusText: response.statusText || 'OK',
      latencyMs: elapsed,
      timestamp,
      headers,
    };
  } catch (err: any) {
    const elapsed = Math.max(
      1,
      Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started)
    );
    const errorMessage = err instanceof Error ? err.message : 'Network unreachable or CORS blocked';
    logAppError({
      type: 'API_HEARTBEAT_FAILURE',
      requestedUrl: endpoint,
      httpStatus: 0,
      message: `Production heartbeat ping failed: ${errorMessage}`,
    });
    return {
      ok: false,
      url: endpoint,
      status: 0,
      statusText: 'Network Error',
      latencyMs: elapsed,
      timestamp,
      headers: {},
      errorMessage,
    };
  }
}

// -------------------- FILE DOWNLOAD HELPERS --------------------

function triggerFileDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function downloadAppErrorsJson(): number {
  const logs = loadAppErrorLogs();
  triggerFileDownload(
    JSON.stringify(
      {
        file: 'app_errors.json',
        exportedAt: new Date().toISOString(),
        deviceId: getOrCreateDeviceId(),
        productionUrl: PRODUCTION_APP_URL,
        totalErrors: logs.length,
        errors: logs,
      },
      null,
      2
    ),
    'app_errors.json',
    'application/json;charset=utf-8;'
  );
  return logs.length;
}

export function downloadQrErrorLogsJson(): number {
  const logs = loadQrErrorLogs();
  triggerFileDownload(
    JSON.stringify(
      {
        file: 'qr_error_log.json',
        exportedAt: new Date().toISOString(),
        deviceId: getOrCreateDeviceId(),
        totalErrors: logs.length,
        errors: logs,
      },
      null,
      2
    ),
    'qr_error_log.json',
    'application/json;charset=utf-8;'
  );
  return logs.length;
}

export function downloadNavigationLogsTxt(): number {
  const logs = loadNavigationLogs();
  const header = [
    '=== SchoolMaster Navigation & Routing Diagnostics Log ===',
    `Exported At: ${new Date().toISOString()}`,
    `Device ID: ${getOrCreateDeviceId()}`,
    `Production URL: ${PRODUCTION_APP_URL}`,
    `Total Entries: ${logs.length}`,
    '=========================================================',
    '',
  ].join('\n');
  const lines = logs.map(
    (l) => `[${l.timestamp}] [${l.status}] ${l.fromPath} -> ${l.toPath} (tab=${l.activeTab})`
  );
  triggerFileDownload(
    header + (lines.length > 0 ? lines.join('\n') : 'No navigation events recorded yet.'),
    `schoolmaster_navigation_logs_${new Date().toISOString().slice(0, 10)}.txt`,
    'text/plain;charset=utf-8;'
  );
  return logs.length;
}

export function downloadOfflineSyncQueueJson(): number {
  const queue = loadOfflineSyncQueue();
  triggerFileDownload(
    JSON.stringify(
      {
        file: 'offlineSyncQueue.json',
        exportedAt: new Date().toISOString(),
        deviceId: getOrCreateDeviceId(),
        totalItems: queue.length,
        queue,
      },
      null,
      2
    ),
    `offlineSyncQueue_${new Date().toISOString().slice(0, 10)}.json`,
    'application/json;charset=utf-8;'
  );
  return queue.length;
}
