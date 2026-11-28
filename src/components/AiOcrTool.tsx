import { apiFetch } from "../utils/apiConfig";
import React, { useEffect, useRef, useState } from 'react';
import {
  ScanText,
  Upload,
  Camera,
  FileText,
  Copy,
  Check,
  Download,
  Edit3,
  Trash2,
  ArrowLeft,
  AlertCircle,
  Loader2,
  ShieldCheck,
  X,
  RotateCw,
} from 'lucide-react';
import { exportTextToDocx } from '../utils/docxExport';
import { guardSensitiveExport } from '../utils/biometricProtection';

const ACCEPTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
]);
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12 MB

interface UploadedOcrDocument {
  name: string;
  mimeType: string;
  sizeBytes: number;
  base64Data: string;
  previewDataUrl: string | null;
}

interface AiOcrToolProps {
  schoolName?: string;
  onExit: () => void;
  onNotify?: (msg: string) => void;
  onSaveToLibrary?: (title: string, content: string) => void;
}

export const AiOcrTool: React.FC<AiOcrToolProps> = ({
  schoolName = 'SchoolMaster AI Studio',
  onExit,
  onNotify,
  onSaveToLibrary,
}) => {
  const [uploadedDoc, setUploadedDoc] = useState<UploadedOcrDocument | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [detectedCategories, setDetectedCategories] = useState<string[]>([]);
  const [qualityNote, setQualityNote] = useState<string | null>(null);
  const [preserveStructure, setPreserveStructure] = useState<boolean>(true);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [ocrVerified, setOcrVerified] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Live Camera Modal State (works on desktop webcams + mobile browsers)
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const startLiveCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    stopCameraStream();
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setShowCameraModal(false);
      mobileCameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      streamRef.current = stream;
      setShowCameraModal(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 80);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? err.message
          : 'Unable to open live camera. You can also use Upload Image to pick a photo from your device.'
      );
      setShowCameraModal(true);
    }
  };

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64Data = dataUrl.split(',')[1] || '';
    setUploadedDoc({
      name: `Camera_Capture_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: Math.floor((base64Data.length * 3) / 4),
      base64Data,
      previewDataUrl: dataUrl,
    });
    setErrorMsg(null);
    stopCameraStream();
    setShowCameraModal(false);
    onNotify?.('Captured image from camera. Click Extract Text to run AI OCR.');
  };

  const loadFileIntoOcr = (file: File) => {
    setErrorMsg(null);
    const mime = (file.type || '').toLowerCase();
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const inferredMime =
      mime ||
      (ext === 'pdf'
        ? 'application/pdf'
        : ext === 'png'
        ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : '');

    if (!ACCEPTED_MIME_TYPES.has(inferredMime)) {
      setErrorMsg('Unsupported file type. Please upload a JPG, JPEG, PNG image or a PDF document.');
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setErrorMsg('File size exceeds the 12 MB limit. Please select a smaller image or PDF.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64Data = result.includes(',') ? result.split(',')[1] : result;
      setUploadedDoc({
        name: file.name,
        mimeType: inferredMime === 'image/jpg' ? 'image/jpeg' : inferredMime,
        sizeBytes: file.size,
        base64Data,
        previewDataUrl: inferredMime.startsWith('image/') ? result : null,
      });
      setExtractedText('');
      setDetectedCategories([]);
      setQualityNote(null);
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read the selected file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const handleExtractText = async () => {
    if (!uploadedDoc) {
      setErrorMsg('Please upload an image (JPG/PNG), upload a PDF, or capture a photo first.');
      return;
    }
    setErrorMsg(null);
    setIsExtracting(true);
    try {
      const res = await apiFetch('/api/ai/ocr-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: uploadedDoc.base64Data,
          mimeType: uploadedDoc.mimeType,
          fileName: uploadedDoc.name,
          preserveStructure,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'OCR text extraction failed.');
      }

      setExtractedText(String(data.extractedText || ''));
      setDetectedCategories(Array.isArray(data.detectedCategories) ? data.detectedCategories : []);
      setQualityNote(data.qualityNote || null);
      setIsEditing(true);
      setOcrVerified(false);
      onNotify?.(`Extracted ${data.wordCount ?? 0} words from ${uploadedDoc.name}. Review and verify before saving.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process document via AI OCR.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleCopyText = async () => {
    if (!extractedText.trim()) return;
    try {
      await navigator.clipboard.writeText(extractedText);
      setCopied(true);
      onNotify?.('Extracted text copied to clipboard.');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setErrorMsg('Unable to copy to clipboard automatically. Please select text manually.');
    }
  };

  const handleDownloadTxt = () => {
    if (!extractedText.trim()) return;
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const base = (uploadedDoc?.name || 'OCR_Extracted').replace(/\.[^.]+$/, '');
    const link = document.createElement('a');
    link.href = url;
    link.download = `${base}_OCR.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    onNotify?.(`Downloaded ${base}_OCR.txt`);
  };

  const handleDownloadDocx = async () => {
    if (!extractedText.trim()) return;
    const base = (uploadedDoc?.name || 'OCR_Extracted').replace(/\.[^.]+$/, '');
    const exported = await exportTextToDocx({
      title: `OCR Extracted Document — ${base}`,
      subtitle: `Source: ${uploadedDoc?.name || 'Uploaded Document'} · Extracted on ${new Date().toLocaleDateString('en-IN')}`,
      schoolName,
      bodyText: extractedText,
      filename: `${base}_OCR.docx`,
    });
    if (exported) {
      onNotify?.(`Downloaded ${base}_OCR.docx`);
    }
  };

  const handleDownloadPdf = async () => {
    if (!extractedText.trim()) return;
    const base = (uploadedDoc?.name || 'OCR_Extracted').replace(/\.[^.]+$/, '');
    const allowed = await guardSensitiveExport(`AI OCR Extracted PDF (${base}_OCR.pdf)`);
    if (!allowed) return;

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 16;
    const usableW = pageW - margin * 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(schoolName.slice(0, 70), margin, 18);
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`AI OCR Extracted Text · Source: ${(uploadedDoc?.name || 'Document').slice(0, 60)}`, margin, 25);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, 28, pageW - margin, 28);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);

    const wrapped = doc.splitTextToSize(extractedText, usableW) as string[];
    let y = 36;
    for (const line of wrapped) {
      if (y > pageH - 18) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, margin, y);
      y += 5.8;
    }

    doc.save(`${base}_OCR.pdf`);
    onNotify?.(`Downloaded ${base}_OCR.pdf`);
  };

  const handleClearAll = () => {
    setUploadedDoc(null);
    setExtractedText('');
    setDetectedCategories([]);
    setQualityNote(null);
    setErrorMsg(null);
    setIsEditing(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (pdfInputRef.current) pdfInputRef.current.value = '';
    if (mobileCameraInputRef.current) mobileCameraInputRef.current.value = '';
    onNotify?.('Cleared uploaded document and extracted OCR text from memory.');
  };

  const wordCount = extractedText.trim() ? extractedText.trim().split(/\s+/).length : 0;
  const lineCount = extractedText ? extractedText.split(/\r?\n/).length : 0;

  return (
    <section
      aria-label="AI OCR Tool - Image and PDF to Text Converter"
      data-testid="ai-ocr-tool"
      className="space-y-5"
    >
      {/* Hidden File Inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadFileIntoOcr(f);
        }}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadFileIntoOcr(f);
        }}
      />
      <input
        ref={mobileCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadFileIntoOcr(f);
        }}
      />

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shrink-0">
            <ScanText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              AI OCR Tool — Image &amp; PDF to Text Converter
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Extract editable text, handwritten notes, mathematical equations, and scientific formulas from JPG, PNG, camera photos, or PDF documents.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {(uploadedDoc || extractedText) && (
            <button
              type="button"
              onClick={handleClearAll}
              data-testid="ocr-clear-btn"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
          <button
            type="button"
            onClick={onExit}
            data-testid="ocr-exit-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column OCR Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Upload / Camera / Document Preview */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              data-testid="ocr-upload-image-btn"
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-emerald-500 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/40 text-xs font-bold text-slate-800 dark:text-slate-100 transition-colors"
            >
              <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Image</span>
              <span className="text-[10px] font-medium text-slate-500">JPG / PNG</span>
            </button>

            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              data-testid="ocr-upload-pdf-btn"
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-indigo-500 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/40 text-xs font-bold text-slate-800 dark:text-slate-100 transition-colors"
            >
              <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>PDF Doc</span>
              <span className="text-[10px] font-medium text-slate-500">Up to 12 MB</span>
            </button>

            <button
              type="button"
              onClick={() => void startLiveCamera('environment')}
              data-testid="ocr-capture-camera-btn"
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-sky-500 hover:bg-sky-50/60 dark:hover:bg-sky-950/40 text-xs font-bold text-slate-800 dark:text-slate-100 transition-colors"
            >
              <Camera className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Camera</span>
              <span className="text-[10px] font-medium text-slate-500">Capture Live</span>
            </button>
          </div>

          {/* Drag & Drop + Document Preview Box */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) loadFileIntoOcr(file);
            }}
            className={`rounded-2xl border-2 border-dashed p-4 text-center transition-colors ${
              isDragging
                ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40'
            }`}
          >
            {!uploadedDoc ? (
              <div className="py-8 space-y-2">
                <ScanText className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Drop a handwritten note, textbook photo, or PDF here
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Supports JPG, JPEG, PNG, and PDF files (processed securely in memory)
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-left">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                      {uploadedDoc.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {uploadedDoc.mimeType} · {(uploadedDoc.sizeBytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    aria-label="Remove uploaded file"
                    className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {uploadedDoc.previewDataUrl ? (
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 flex justify-center p-2">
                    <img
                      src={uploadedDoc.previewDataUrl}
                      alt="Uploaded document preview"
                      className="max-h-72 w-auto object-contain rounded"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 p-6 flex flex-col items-center justify-center gap-2 text-center">
                    <FileText className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                    <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                      PDF Document Ready for OCR Extraction
                    </p>
                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                      Click Extract Text below to transcribe all pages &amp; formulas.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={preserveStructure}
              onChange={(e) => setPreserveStructure(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Preserve headings, paragraphs, numbered lists, bullet points &amp; formulas</span>
          </label>

          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="button"
            disabled={!uploadedDoc || isExtracting}
            data-testid="ocr-extract-btn"
            onClick={() => void handleExtractText()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition-colors disabled:opacity-50"
          >
            {isExtracting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Extracting Text &amp; Formulas...</span>
              </>
            ) : (
              <>
                <ScanText className="w-4 h-4" />
                <span>Extract Text</span>
              </>
            )}
          </button>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Privacy Protection: Uploaded images and PDFs are processed strictly in memory and are never stored permanently on the server.
            </span>
          </div>
        </div>

        {/* Right: Editable Extracted Text + Export Controls */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Extracted Editable Text
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {wordCount} word{wordCount === 1 ? '' : 's'} · {lineCount} line{lineCount === 1 ? '' : 's'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={!extractedText}
                data-testid="ocr-edit-btn"
                onClick={() => {
                  setIsEditing(true);
                  textareaRef.current?.focus();
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 ${
                  isEditing
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Text</span>
              </button>

              <button
                type="button"
                disabled={!extractedText}
                data-testid="ocr-copy-btn"
                onClick={() => void handleCopyText()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold transition-colors disabled:opacity-40"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                disabled={!extractedText}
                data-testid="ocr-download-txt-btn"
                onClick={handleDownloadTxt}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition-colors disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>TXT</span>
              </button>

              <button
                type="button"
                disabled={!extractedText}
                data-testid="ocr-download-docx-btn"
                onClick={() => void handleDownloadDocx()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>DOCX</span>
              </button>

              {onSaveToLibrary && (
                <button
                  type="button"
                  disabled={!extractedText.trim() || !ocrVerified}
                  onClick={() => {
                    const base = (uploadedDoc?.name || 'OCR Extract').replace(/\.[^.]+$/, '');
                    onSaveToLibrary(`OCR: ${base}`, extractedText.trim());
                  }}
                  title={ocrVerified ? 'Save verified OCR text to Studio Saved Library' : 'Check verification box below before saving'}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-40"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Save to Library</span>
                </button>
              )}

              <button
                type="button"
                disabled={!extractedText}
                data-testid="ocr-download-pdf-btn"
                onClick={() => void handleDownloadPdf()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
            </div>
          </div>

          {detectedCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Detected:</span>
              {detectedCategories.map((cat) => (
                <span
                  key={cat}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            rows={17}
            value={extractedText}
            readOnly={!isEditing && extractedText.length > 0}
            onChange={(e) => setExtractedText(e.target.value)}
            placeholder="Extracted text, mathematical equations, chemical formulas, headings, and lists will appear here. Click Edit Text anytime to refine before copying or downloading as TXT, DOCX, or PDF."
            data-testid="ocr-extracted-textarea"
            className={`w-full p-4 rounded-xl border text-sm leading-relaxed font-sans text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/80 focus:outline-none transition-colors ${
              isEditing
                ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-white dark:bg-slate-900'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          />

          {extractedText.trim().length > 0 && (
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-950 dark:text-amber-200 cursor-pointer">
              <input
                type="checkbox"
                checked={ocrVerified}
                onChange={(e) => setOcrVerified(e.target.checked)}
                className="rounded border-amber-400 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                I have reviewed and verified the OCR-extracted text (uncertain words corrected) before saving or using for AI generation.
              </span>
            </label>
          )}

          {qualityNote && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {qualityNote}
            </p>
          )}
        </div>
      </div>

      {/* Live Camera Capture Modal */}
      {showCameraModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Capture Document with Camera"
          className="fixed inset-0 z-[95] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 text-white rounded-2xl border border-slate-700 max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Camera className="w-4 h-4 text-sky-400" />
                <span>Capture Note or Textbook Page</span>
              </h4>
              <button
                type="button"
                onClick={() => {
                  stopCameraStream();
                  setShowCameraModal(false);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {cameraError ? (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-200 text-xs">
                  {cameraError}
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = cameraFacing === 'environment' ? 'user' : 'environment';
                    setCameraFacing(next);
                    void startLiveCamera(next);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Flip Camera</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(cameraError)}
                  onClick={handleCaptureFrame}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  <span>Capture Photo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
