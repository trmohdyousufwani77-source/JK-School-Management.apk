export interface StudioUploadedImage {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  originalDataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  source: 'camera' | 'gallery';
  uploadedAt: string;
  updatedAt: string;
  selectedForAi: boolean;
}

const DB_NAME = 'SchoolMasterTeachingStudioMediaV1';
const DB_VERSION = 1;
const STORE_NAME = 'uploaded_images';
const LS_FALLBACK_KEY = 'sm_studio_uploaded_images_fallback_v1';

function openMediaDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadStudioImages(): Promise<StudioUploadedImage[]> {
  const db = await openMediaDb();
  if (db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const rows = Array.isArray(req.result) ? (req.result as StudioUploadedImage[]) : [];
          rows.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
          resolve(rows);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    return raw ? (JSON.parse(raw) as StudioUploadedImage[]) : [];
  } catch {
    return [];
  }
}

export async function saveStudioImage(image: StudioUploadedImage): Promise<void> {
  const db = await openMediaDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(image);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    return;
  }
  try {
    const existing = await loadStudioImages();
    const next = [image, ...existing.filter((item) => item.id !== image.id)].slice(0, 12);
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

export async function deleteStudioImageById(id: string): Promise<void> {
  const db = await openMediaDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    return;
  }
  try {
    const existing = await loadStudioImages();
    localStorage.setItem(
      LS_FALLBACK_KEY,
      JSON.stringify(existing.filter((item) => item.id !== id))
    );
  } catch {
    // Ignore
  }
}

/**
 * Normalizes a File/Blob into a crisp, AI-readable JPEG data URL (max 1600px on longest side)
 * so textbook pages, diagrams, and handwritten notes stay sharp while staying fast over API.
 */
export async function normalizeImageFileToStudioImage(
  file: File | Blob,
  name: string,
  source: 'camera' | 'gallery'
): Promise<StudioUploadedImage> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Invalid image file.'));
    el.src = rawDataUrl;
  });

  const maxDim = 1600;
  let targetW = img.naturalWidth || img.width || 1200;
  let targetH = img.naturalHeight || img.height || 900;
  if (targetW > maxDim || targetH > maxDim) {
    const scale = maxDim / Math.max(targetW, targetH);
    targetW = Math.round(targetW * scale);
    targetH = Math.round(targetH * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);
  }

  const outMime = 'image/jpeg';
  const finalDataUrl = ctx ? canvas.toDataURL(outMime, 0.88) : rawDataUrl;
  const now = new Date().toISOString();

  return {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name || `Educational_Material_${new Date().toISOString().slice(0, 10)}.jpg`,
    mimeType: outMime,
    dataUrl: finalDataUrl,
    originalDataUrl: finalDataUrl,
    width: targetW,
    height: targetH,
    sizeBytes: Math.round((finalDataUrl.length * 3) / 4),
    source,
    uploadedAt: now,
    updatedAt: now,
    selectedForAi: true,
  };
}

/**
 * Applies rotation, crop percentages (0-45% from each edge), brightness, and contrast
 * onto an image via HTML5 Canvas, preserving the originalDataUrl separately.
 */
export async function applyStudioImageEdits(
  sourceDataUrl: string,
  edits: {
    rotateDeg: number;
    cropTopPct: number;
    cropBottomPct: number;
    cropLeftPct: number;
    cropRightPct: number;
    brightnessPct: number;
    contrastPct: number;
  }
): Promise<{ dataUrl: string; width: number; height: number; sizeBytes: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not load image for editing.'));
    el.src = sourceDataUrl;
  });

  const normalizedRot = ((edits.rotateDeg % 360) + 360) % 360;
  const isRotatedOdd = normalizedRot === 90 || normalizedRot === 270;

  // Step 1: Rotate full image onto temp canvas
  const rotCanvas = document.createElement('canvas');
  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  rotCanvas.width = isRotatedOdd ? natH : natW;
  rotCanvas.height = isRotatedOdd ? natW : natH;
  const rCtx = rotCanvas.getContext('2d');
  if (!rCtx) {
    return {
      dataUrl: sourceDataUrl,
      width: natW,
      height: natH,
      sizeBytes: Math.round((sourceDataUrl.length * 3) / 4),
    };
  }
  rCtx.save();
  rCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rCtx.rotate((normalizedRot * Math.PI) / 180);
  rCtx.filter = `brightness(${edits.brightnessPct}%) contrast(${edits.contrastPct}%)`;
  rCtx.drawImage(img, -natW / 2, -natH / 2, natW, natH);
  rCtx.restore();

  // Step 2: Apply crop window
  const leftPx = Math.round((rotCanvas.width * Math.max(0, Math.min(45, edits.cropLeftPct))) / 100);
  const rightPx = Math.round((rotCanvas.width * Math.max(0, Math.min(45, edits.cropRightPct))) / 100);
  const topPx = Math.round((rotCanvas.height * Math.max(0, Math.min(45, edits.cropTopPct))) / 100);
  const bottomPx = Math.round((rotCanvas.height * Math.max(0, Math.min(45, edits.cropBottomPct))) / 100);

  const cropW = Math.max(80, rotCanvas.width - leftPx - rightPx);
  const cropH = Math.max(80, rotCanvas.height - topPx - bottomPx);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = cropW;
  outCanvas.height = cropH;
  const oCtx = outCanvas.getContext('2d');
  if (!oCtx) {
    const fallback = rotCanvas.toDataURL('image/jpeg', 0.9);
    return {
      dataUrl: fallback,
      width: rotCanvas.width,
      height: rotCanvas.height,
      sizeBytes: Math.round((fallback.length * 3) / 4),
    };
  }

  oCtx.fillStyle = '#FFFFFF';
  oCtx.fillRect(0, 0, cropW, cropH);
  oCtx.drawImage(rotCanvas, leftPx, topPx, cropW, cropH, 0, 0, cropW, cropH);

  const outUrl = outCanvas.toDataURL('image/jpeg', 0.9);
  return {
    dataUrl: outUrl,
    width: cropW,
    height: cropH,
    sizeBytes: Math.round((outUrl.length * 3) / 4),
  };
}

export function extractBase64Payload(dataUrl: string): { base64: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return { mimeType: 'image/jpeg', base64: dataUrl };
}

/**
 * Print helper using a hidden iframe so we never call window.open() inside an iframe environment.
 */
export function printHtmlDocumentSafely(htmlContent: string): void {
  if (typeof document === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    iframe.remove();
    window.print();
    return;
  }

  doc.open();
  doc.write(htmlContent);
  doc.close();

  window.setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    } finally {
      window.setTimeout(() => {
        iframe.remove();
      }, 1500);
    }
  }, 250);
}
