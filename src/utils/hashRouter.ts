/**
 * Hash-Based SPA Router & Deep-Link Resolver for School Master
 *
 * Uses hash URLs (`#/dashboard`, `#/attendance`, `#/ai-smart-edu`, etc.) as the canonical
 * client-side routing scheme so that:
 *  - Android WebView (`file:///android_asset/www/index.html#/attendance` or HTTPS WebView)
 *    NEVER triggers server-side HTTP 404 "Page Not Found" errors on navigation or refresh.
 *  - Offline PWA launches, page reloads, and nested module deep links resolve cleanly.
 *  - Legacy pathname deep links (e.g., `/students`, `/ai-studio/lesson-plan`) and query params
 *    (`?tab=daily-attendance`) are normalized seamlessly into hash routes.
 */

import type { TabType } from '../components/Sidebar';

export const ALL_VALID_TABS: readonly TabType[] = [
  'dashboard',
  'students',
  'classes',
  'subjects',
  'marks-entry',
  'evaluation-register',
  'attendance',
  'digital-staff-attendance',
  'holistic-assessment',
  'progress-cards',
  'teacher-subject-results',
  'banner-editor',
  'reports',
  'staff-management',
  'settings',
  'monthly-attendance',
  'textbooks',
  'teachers',
  'teacher-leave',
  'examinations',
  'student-results',
  'teacher-performance',
  'admin-access',
  'super-admin',
  'excel-import',
  'excel-template-mapping',
  'id-card-maker',
  'principal-management',
  'jkepm-appraisal',
  'notice-board',
  'ai-question-generator',
  'lesson-plan-generator',
  'ai-smart-edu',
  'ai-chatbot',
  'urdu-pdf-maker',
  'student-portal',
  'about-us',
] as const;

const VALID_TAB_SET = new Set<string>(ALL_VALID_TABS);

/**
 * Maps friendly / nested / legacy deep-link segments to canonical TabType IDs.
 */
const ROUTE_SEGMENT_ALIASES: Record<string, TabType> = {
  home: 'dashboard',
  index: 'dashboard',
  'index.html': 'dashboard',
  portal: 'dashboard',
  'daily-attendance': 'attendance',
  'student-attendance': 'attendance',
  'smart-attendance': 'digital-staff-attendance',
  'staff-attendance': 'digital-staff-attendance',
  'teacher-attendance': 'digital-staff-attendance',
  'smart-digital-attendance': 'digital-staff-attendance',
  'student-id-cards': 'id-card-maker',
  'id-cards': 'id-card-maker',
  'smart-id-card': 'id-card-maker',
  examination: 'examinations',
  exams: 'examinations',
  exam: 'examinations',
  marks: 'marks-entry',
  'report-cards': 'progress-cards',
  'report-card': 'progress-cards',
  hpc: 'holistic-assessment',
  holistic: 'holistic-assessment',
  'ai-studio': 'ai-smart-edu',
  'smart-edu': 'ai-smart-edu',
  'teacher-diary': 'ai-smart-edu',
  'daily-diary': 'ai-smart-edu',
  diary: 'ai-smart-edu',
  'short-lesson-plan': 'ai-smart-edu',
  'lesson-plan': 'lesson-plan-generator',
  'question-generator': 'ai-question-generator',
  qa: 'ai-smart-edu',
  chatbot: 'ai-chatbot',
  leave: 'teacher-leave',
  leaves: 'teacher-leave',
  notices: 'notice-board',
  notice: 'notice-board',
  principals: 'principal-management',
  principal: 'principal-management',
  headmaster: 'principal-management',
  jkepm: 'jkepm-appraisal',
  appraisal: 'jkepm-appraisal',
  staff: 'teachers',
  ocr: 'excel-import',
  import: 'excel-import',
  urdu: 'urdu-pdf-maker',
  'urdu-pdf': 'urdu-pdf-maker',
  about: 'about-us',
  admin: 'admin-access',
};

export interface ParsedAppRoute {
  tab: TabType;
  subPath: string;
  matchedExplicitRoute: boolean;
  source: 'hash' | 'query' | 'pathname' | 'default';
}

function cleanRouteSegments(rawPath: string): string[] {
  const cleaned = String(rawPath || '')
    .split('?')[0]
    .replace(/^#+/, '')
    .replace(/^\/+|\/+$/g, '')
    .trim();

  if (!cleaned) return [];

  // Strip local Android WebView asset path prefix (`android_asset/www/index.html`)
  const withoutAndroidAsset = cleaned
    .replace(/^android_asset\/www\/index\.html$/i, '')
    .replace(/^android_asset\/www\/?/i, '')
    .replace(/^www\/index\.html$/i, '')
    .replace(/^index\.html$/i, '')
    .replace(/^\/+|\/+$/g, '');

  if (!withoutAndroidAsset) return [];
  return withoutAndroidAsset
    .split('/')
    .map((s) => decodeURIComponent(s).trim().toLowerCase())
    .filter(Boolean);
}

export function resolveSegmentToTab(segment: string): TabType | null {
  const norm = segment.trim().toLowerCase();
  if (!norm) return null;
  if (VALID_TAB_SET.has(norm)) return norm as TabType;
  if (norm in ROUTE_SEGMENT_ALIASES) return ROUTE_SEGMENT_ALIASES[norm];
  return null;
}

/**
 * Checks whether a pathname (without hash) is a valid SPA route or local WebView asset file.
 */
export function isValidSpaRoutePath(pathname: string): boolean {
  const raw = String(pathname || '/').trim();
  if (
    raw === '/' ||
    raw === '' ||
    raw === '/index.html' ||
    raw.endsWith('/android_asset/www/index.html') ||
    raw.endsWith('/www/index.html')
  ) {
    return true;
  }
  const segments = cleanRouteSegments(raw);
  if (segments.length === 0) return true;
  return resolveSegmentToTab(segments[0]) !== null;
}

/**
 * Parses the active School Master tab & optional nested sub-path from:
 * 1) `window.location.hash` (primary hash-router format: `#/attendance` or `#/ai-smart-edu/lesson-plan`)
 * 2) `window.location.search` (`?tab=attendance`)
 * 3) `window.location.pathname` (deep link fallback: `/attendance` or `/ai-studio/lesson-plan`)
 */
export function parseRouteFromLocation(): ParsedAppRoute {
  if (typeof window === 'undefined') {
    return { tab: 'dashboard', subPath: '', matchedExplicitRoute: false, source: 'default' };
  }

  // 1. Check hash first (canonical HashRouter path)
  const rawHash = window.location.hash || '';
  if (rawHash && rawHash !== '#' && rawHash !== '#/') {
    const hashSegments = cleanRouteSegments(rawHash);
    if (hashSegments.length > 0) {
      const resolved = resolveSegmentToTab(hashSegments[0]);
      if (resolved) {
        return {
          tab: resolved,
          subPath: hashSegments.slice(1).join('/'),
          matchedExplicitRoute: true,
          source: 'hash',
        };
      }
    }
  }

  // 2. Check query parameter `?tab=...` (used by PWA shortcuts & notification deep links)
  try {
    const params = new URLSearchParams(window.location.search || '');
    const queryTab = params.get('tab') || params.get('module') || params.get('route');
    if (queryTab) {
      const resolved = resolveSegmentToTab(queryTab);
      if (resolved) {
        return {
          tab: resolved,
          subPath: params.get('sub') || '',
          matchedExplicitRoute: true,
          source: 'query',
        };
      }
    }
  } catch {
    // ignore malformed query strings
  }

  // 3. Check pathname deep links (only on HTTP(S), skipping local Android asset paths)
  const pathSegments = cleanRouteSegments(window.location.pathname || '/');
  if (pathSegments.length > 0) {
    const resolved = resolveSegmentToTab(pathSegments[0]);
    if (resolved) {
      return {
        tab: resolved,
        subPath: pathSegments.slice(1).join('/'),
        matchedExplicitRoute: true,
        source: 'pathname',
      };
    }
  }

  return { tab: 'dashboard', subPath: '', matchedExplicitRoute: false, source: 'default' };
}

/**
 * Synchronizes `window.location.hash` to `#/${tab}` (preserving any subPath if provided)
 * without mutating `window.location.pathname` (safe on `file://` Android WebView and offline PWAs).
 */
export function syncHashForTab(tab: TabType, subPath?: string): void {
  if (typeof window === 'undefined') return;
  const cleanSub = (subPath || '').replace(/^\/+|\/+$/g, '');
  const targetHash = cleanSub ? `#/${tab}/${cleanSub}` : `#/${tab}`;

  if (window.location.hash === targetHash) return;

  try {
    // When running on HTTP(S) with a non-root pathname (e.g., user opened /attendance directly),
    // normalize cleanly to `/#/attendance` so subsequent refreshes always hit root index.html.
    const isHttpOrigin =
      window.location.protocol === 'http:' || window.location.protocol === 'https:';
    const currentPath = window.location.pathname || '/';
    if (isHttpOrigin && currentPath !== '/' && currentPath !== '/index.html') {
      window.history.replaceState(null, '', `/${targetHash}`);
      return;
    }
    window.location.hash = targetHash;
  } catch {
    // Fallback for restricted WebView history environments
    try {
      window.location.hash = targetHash;
    } catch {
      // ignore
    }
  }
}
