import {
  OfflineStorageEngine,
  SavedLessonPlanRecord,
  ShareChannel,
} from '../types/lessonPlan';
import {
  createLessonPlanPdfPayload,
  LessonPlanPdfParams,
  lessonPlanToPlainText,
} from './lessonPlanPdf';

const LEGACY_LOCALSTORAGE_KEY = 'sm_teacher_lesson_plans_v1';
const IDB_NAME = 'SchoolMasterOfflineLessonPlansDB';
const IDB_VERSION = 1;
const IDB_STORE = 'lesson_plans';

interface AndroidLessonPlanBridge {
  isAvailable?: () => boolean;
  getSavedLessonPlansJson: () => string;
  saveLessonPlanJson: (payloadJson: string) => boolean;
  deleteLessonPlan: (id: string) => boolean;
  shareLessonPlanPdf: (
    base64Pdf: string,
    fileName: string,
    title: string,
    subject: string,
    classLevel: string,
    targetChannel: string
  ) => boolean;
}

declare global {
  interface Window {
    SchoolMasterLessonPlanBridge?: AndroidLessonPlanBridge;
  }
}

function getAndroidBridge(): AndroidLessonPlanBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.SchoolMasterLessonPlanBridge;
  if (bridge && typeof bridge.getSavedLessonPlansJson === 'function') {
    return bridge;
  }
  return null;
}

export function getOfflineStorageEngine(): OfflineStorageEngine {
  if (getAndroidBridge()) return 'room';
  if (typeof indexedDB !== 'undefined') return 'indexeddb';
  return 'localstorage';
}

function readLocalMirror(): SavedLessonPlanRecord[] {
  try {
    const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedLessonPlanRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLocalMirror(records: SavedLessonPlanRecord[]): void {
  try {
    localStorage.setItem(LEGACY_LOCALSTORAGE_KEY, JSON.stringify(records.slice(0, 50)));
  } catch {
    // Ignore quota errors in restricted webviews
  }
}

function openLessonPlanIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGetAll(): Promise<SavedLessonPlanRecord[]> {
  const db = await openLessonPlanIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result as SavedLessonPlanRecord[]) || [];
      items.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbUpsert(record: SavedLessonPlanRecord): Promise<void> {
  const db = await openLessonPlanIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ ...record, storageEngine: 'indexeddb' });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openLessonPlanIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Loads all saved offline lesson plans from:
 * 1. Android Room Database (when running inside the Android APK WebView)
 * 2. IndexedDB (when running in Web / Offline PWA), migrating any existing localStorage plans
 * 3. localStorage fallback
 */
export async function loadOfflineLessonPlans(): Promise<{
  plans: SavedLessonPlanRecord[];
  engine: OfflineStorageEngine;
}> {
  const bridge = getAndroidBridge();
  if (bridge) {
    try {
      const raw = bridge.getSavedLessonPlansJson();
      const parsed = JSON.parse(raw || '[]');
      const roomPlans: SavedLessonPlanRecord[] = Array.isArray(parsed) ? parsed : [];

      // One-time non-destructive migration of any pre-existing localStorage plans into Room DB
      const mirror = readLocalMirror();
      const roomIds = new Set(roomPlans.map((p) => p.id));
      let migrated = false;
      for (const localItem of mirror) {
        if (localItem?.id && !roomIds.has(localItem.id)) {
          bridge.saveLessonPlanJson(JSON.stringify(localItem));
          roomPlans.push({ ...localItem, storageEngine: 'room' });
          migrated = true;
        }
      }
      if (migrated) {
        roomPlans.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
      }
      writeLocalMirror(roomPlans);
      return { plans: roomPlans, engine: 'room' };
    } catch {
      return { plans: readLocalMirror(), engine: 'localstorage' };
    }
  }

  if (typeof indexedDB !== 'undefined') {
    try {
      const idbPlans = await idbGetAll();
      const mirror = readLocalMirror();
      const existingIds = new Set(idbPlans.map((p) => p.id));
      for (const localItem of mirror) {
        if (localItem?.id && !existingIds.has(localItem.id)) {
          await idbUpsert(localItem);
          idbPlans.push({ ...localItem, storageEngine: 'indexeddb' });
        }
      }
      idbPlans.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
      writeLocalMirror(idbPlans);
      return { plans: idbPlans, engine: 'indexeddb' };
    } catch {
      return { plans: readLocalMirror(), engine: 'localstorage' };
    }
  }

  return { plans: readLocalMirror(), engine: 'localstorage' };
}

export async function saveOfflineLessonPlan(
  record: SavedLessonPlanRecord
): Promise<{ engine: OfflineStorageEngine }> {
  const bridge = getAndroidBridge();
  if (bridge) {
    try {
      const ok = bridge.saveLessonPlanJson(JSON.stringify(record));
      if (ok) {
        const updatedMirror = [record, ...readLocalMirror().filter((p) => p.id !== record.id)];
        writeLocalMirror(updatedMirror);
        return { engine: 'room' };
      }
    } catch {
      // Fall through to IndexedDB/localStorage
    }
  }

  if (typeof indexedDB !== 'undefined') {
    try {
      await idbUpsert(record);
      const updatedMirror = [record, ...readLocalMirror().filter((p) => p.id !== record.id)];
      writeLocalMirror(updatedMirror);
      return { engine: 'indexeddb' };
    } catch {
      // Fall through to localStorage
    }
  }

  const updatedMirror = [record, ...readLocalMirror().filter((p) => p.id !== record.id)];
  writeLocalMirror(updatedMirror);
  return { engine: 'localstorage' };
}

export async function deleteOfflineLessonPlan(id: string): Promise<void> {
  const bridge = getAndroidBridge();
  if (bridge) {
    try {
      bridge.deleteLessonPlan(id);
    } catch {
      // ignore
    }
  }

  if (typeof indexedDB !== 'undefined') {
    try {
      await idbDelete(id);
    } catch {
      // ignore
    }
  }

  writeLocalMirror(readLocalMirror().filter((p) => p.id !== id));
}

export interface ShareLessonPlanResult {
  method: 'android-intent' | 'web-share-file' | 'desktop-download-assisted';
  fileName: string;
  message: string;
  whatsappHref?: string;
  mailtoHref?: string;
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Generates a structured jsPDF Lesson Plan file and launches a share intent:
 * 1. Android APK WebView: Native Android ACTION_SEND Share Intent (WhatsApp / Email / Share Sheet)
 *    with FileProvider PDF attachment.
 * 2. Supported Mobile/Desktop Browsers: Web Share API (`navigator.share({ files: [pdfFile] })`).
 * 3. Desktop Fallback: Downloads the generated PDF immediately and provides ready-to-click
 *    WhatsApp / Email links (zero `window.open` / `window.alert`).
 */
export async function shareLessonPlanPdf(
  params: LessonPlanPdfParams,
  channel: ShareChannel
): Promise<ShareLessonPlanResult> {
  const payload = await createLessonPlanPdfPayload(params);
  const title = params.plan.title || `${params.subject} Lesson Plan`;
  const summaryText = [
    `Lesson Plan: ${title}`,
    `Subject: ${params.subject} | Class: ${params.classLevel} | Duration: ${params.duration} | Language: ${params.language}`,
    `School: ${params.schoolName}`,
    '',
    `General Objectives: ${params.plan.generalObjectives.slice(0, 260)}`,
    `Learning Outcomes: ${params.plan.specificLearningOutcomes.slice(0, 260)}`,
  ].join('\n');

  // 1. Native Android APK Share Intent via FileProvider
  const bridge = getAndroidBridge();
  if (bridge && typeof bridge.shareLessonPlanPdf === 'function') {
    const dispatched = bridge.shareLessonPlanPdf(
      payload.base64,
      payload.fileName,
      title,
      params.subject,
      params.classLevel,
      channel
    );
    if (dispatched) {
      const channelLabel =
        channel === 'whatsapp' ? 'WhatsApp' : channel === 'email' ? 'Email' : 'Share Sheet';
      return {
        method: 'android-intent',
        fileName: payload.fileName,
        message: `Opened Android ${channelLabel} share intent with ${payload.fileName}.`,
      };
    }
  }

  // 2. Web Share API Level 2 (native PDF file sharing on Android Chrome / iOS Safari / modern OS)
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [payload.file] })
  ) {
    try {
      await navigator.share({
        title: `Lesson Plan: ${title}`,
        text: summaryText,
        files: [payload.file],
      });
      return {
        method: 'web-share-file',
        fileName: payload.fileName,
        message: `Shared ${payload.fileName} via device share sheet.`,
      };
    } catch (err) {
      // User dismissed share sheet — do not force download on cancel
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          method: 'web-share-file',
          fileName: payload.fileName,
          message: 'Share cancelled.',
        };
      }
    }
  }

  // 3. Desktop Browser Fallback: download the generated jsPDF file & prepare direct WhatsApp/Email links
  triggerBlobDownload(payload.blob, payload.fileName);

  const plainExcerpt = lessonPlanToPlainText(params.plan).slice(0, 1100);
  const waText = encodeURIComponent(
    `${summaryText}\n\n(Attach downloaded PDF: ${payload.fileName})`
  );
  const mailSubject = encodeURIComponent(
    `Lesson Plan PDF: ${title} (${params.subject} - ${params.classLevel})`
  );
  const mailBody = encodeURIComponent(
    `Hello,\n\nPlease find the lesson plan PDF (${payload.fileName}) ready to attach.\n\n${plainExcerpt}\n\nPrepared by: ${params.teacherName}\n${params.schoolName}`
  );

  const whatsappHref = `https://wa.me/?text=${waText}`;
  const mailtoHref = `mailto:?subject=${mailSubject}&body=${mailBody}`;

  if (channel === 'email') {
    // Use an anchor element instead of window.open to stay iframe-safe
    const mailAnchor = document.createElement('a');
    mailAnchor.href = mailtoHref;
    mailAnchor.style.display = 'none';
    document.body.appendChild(mailAnchor);
    mailAnchor.click();
    document.body.removeChild(mailAnchor);
  }

  return {
    method: 'desktop-download-assisted',
    fileName: payload.fileName,
    whatsappHref,
    mailtoHref,
    message:
      channel === 'whatsapp'
        ? `PDF downloaded (${payload.fileName}). Open WhatsApp below to send the PDF file.`
        : channel === 'email'
          ? `PDF downloaded (${payload.fileName}) and email composer opened—attach the downloaded PDF.`
          : `PDF downloaded (${payload.fileName}). Choose WhatsApp or Email below to share.`,
  };
}
