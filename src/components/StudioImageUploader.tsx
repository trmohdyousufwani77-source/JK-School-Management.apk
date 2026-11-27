import React, { useCallback, useEffect, useRef, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import {
  Camera,
  Image as ImageIcon,
  Plus,
  Eye,
  Edit3,
  Trash2,
  X,
  RotateCw,
  RotateCcw,
  RefreshCw,
  Check,
  Sliders,
  Crop,
  SwitchCamera,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
} from 'lucide-react';
import {
  StudioUploadedImage,
  applyStudioImageEdits,
  normalizeImageFileToStudioImage,
} from '../utils/studioMediaStore';

interface StudioImageUploaderProps {
  images: StudioUploadedImage[];
  onAddImages: (newImages: StudioUploadedImage[]) => Promise<void> | void;
  onUpdateImage: (updated: StudioUploadedImage) => Promise<void> | void;
  onDeleteImage: (id: string) => Promise<void> | void;
  onToggleSelect: (id: string) => void;
  compactTitle?: string;
  helperText?: string;
}

async function cropImageWithPixelArea(params: {
  imageSrc: string;
  croppedAreaPixels: Area;
  rotation: number;
  brightnessPct: number;
  contrastPct: number;
}): Promise<{ dataUrl: string; width: number; height: number; sizeBytes: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load image for cropping.'));
    el.src = params.imageSrc;
  });

  const rad = (params.rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bBoxW = Math.round(img.width * cos + img.height * sin);
  const bBoxH = Math.round(img.width * sin + img.height * cos);

  // Step 1: draw rotated + filtered full image
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = bBoxW;
  tempCanvas.height = bBoxH;
  const tCtx = tempCanvas.getContext('2d');
  if (!tCtx) throw new Error('Canvas unavailable.');

  tCtx.fillStyle = '#FFFFFF';
  tCtx.fillRect(0, 0, bBoxW, bBoxH);
  tCtx.filter = `brightness(${params.brightnessPct}%) contrast(${params.contrastPct}%)`;
  tCtx.translate(bBoxW / 2, bBoxH / 2);
  tCtx.rotate(rad);
  tCtx.drawImage(img, -img.width / 2, -img.height / 2);

  // Step 2: extract exact react-easy-crop pixel area
  const outW = Math.max(40, Math.round(params.croppedAreaPixels.width));
  const outH = Math.max(40, Math.round(params.croppedAreaPixels.height));
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(outW, outH));
  const finalW = Math.max(40, Math.round(outW * scale));
  const finalH = Math.max(40, Math.round(outH * scale));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = finalW;
  outCanvas.height = finalH;
  const oCtx = outCanvas.getContext('2d');
  if (!oCtx) throw new Error('Canvas unavailable.');

  oCtx.fillStyle = '#FFFFFF';
  oCtx.fillRect(0, 0, finalW, finalH);
  oCtx.drawImage(
    tempCanvas,
    params.croppedAreaPixels.x,
    params.croppedAreaPixels.y,
    outW,
    outH,
    0,
    0,
    finalW,
    finalH
  );

  const dataUrl = outCanvas.toDataURL('image/jpeg', 0.9);
  const sizeBytes = Math.round((dataUrl.length * 3) / 4);
  return { dataUrl, width: finalW, height: finalH, sizeBytes };
}

export const StudioImageUploader: React.FC<StudioImageUploaderProps> = ({
  images,
  onAddImages,
  onUpdateImage,
  onDeleteImage,
  onToggleSelect,
  compactTitle = 'Educational Material Images (Textbook Pages, Handwritten Notes, Worksheets & Diagrams)',
  helperText = 'Capture directly with your camera or upload from gallery. Crop specific paragraphs or diagrams before sending to AI — originals remain safely preserved.',
}) => {
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraFallbackInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Live Camera Modal
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Preview Lightbox Modal
  const [previewImage, setPreviewImage] = useState<StudioUploadedImage | null>(null);
  const [previewZoom, setPreviewZoom] = useState<number>(1);

  // Edit / Interactive Crop Modal (powered by react-easy-crop)
  const [editingImage, setEditingImage] = useState<StudioUploadedImage | null>(null);
  const [isNewUploadCropMode, setIsNewUploadCropMode] = useState<boolean>(false);
  const [editName, setEditName] = useState('');
  const [cropPos, setCropPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState<number>(1);
  const [cropAspect, setCropAspect] = useState<number | undefined>(4 / 3);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [rotateDeg, setRotateDeg] = useState(0);
  const [brightnessPct, setBrightnessPct] = useState(100);
  const [contrastPct, setContrastPct] = useState(100);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete Confirmation Modal
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<StudioUploadedImage | null>(null);

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const openEditor = (img: StudioUploadedImage, isNewUpload = false) => {
    setEditingImage(img);
    setIsNewUploadCropMode(isNewUpload);
    setEditName(img.name);
    setCropPos({ x: 0, y: 0 });
    setCropZoom(1);
    setCropAspect(4 / 3);
    setCroppedAreaPixels(null);
    setRotateDeg(0);
    setBrightnessPct(100);
    setContrastPct(100);
  };

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (!cameraModalOpen) {
      stopCameraStream();
      return;
    }
    let cancelled = false;
    setCameraError(null);

    const startCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Live camera stream is not supported in this browser. Use the Capture Photo File button below.');
        return;
      }
      try {
        stopCameraStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1600 }, height: { ideal: 1200 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setCameraError('Camera access was blocked or unavailable. Allow camera permission or use Capture Photo File below.');
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [cameraModalOpen, cameraFacing]);

  const handleFilesSelected = async (files: FileList | null, source: 'camera' | 'gallery') => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setIsProcessing(true);
    try {
      const processed: StudioUploadedImage[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const normalized = await normalizeImageFileToStudioImage(file, file.name, source);
        processed.push(normalized);
      }
      if (processed.length === 0) {
        setUploadError('Please select valid image files (JPEG, PNG, or WebP).');
      } else if (processed.length === 1) {
        // Open lightweight react-easy-crop immediately in the upload flow so teacher can crop paragraph/diagram before AI
        openEditor(processed[0], true);
      } else {
        await onAddImages(processed);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to process uploaded image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCaptureCameraFrame = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('Camera preview is still starting. Please wait a moment or use Capture Photo File.');
      return;
    }
    setIsProcessing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
      );
      if (!blob) return;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const captured = await normalizeImageFileToStudioImage(
        blob,
        `Camera_Capture_${stamp}.jpg`,
        'camera'
      );
      setCameraModalOpen(false);
      // Immediately let teacher crop specific paragraph or diagram before sending to AI
      openEditor(captured, true);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Unable to capture photo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReplaceImageFile = async (files: FileList | null) => {
    if (!files || files.length === 0 || !editingImage) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return;
    setIsSavingEdit(true);
    try {
      const fresh = await normalizeImageFileToStudioImage(file, file.name, 'gallery');
      const replaced: StudioUploadedImage = {
        ...editingImage,
        name: editName.trim() || fresh.name,
        mimeType: fresh.mimeType,
        dataUrl: fresh.dataUrl,
        originalDataUrl: fresh.originalDataUrl,
        width: fresh.width,
        height: fresh.height,
        sizeBytes: fresh.sizeBytes,
        updatedAt: new Date().toISOString(),
      };
      if (!isNewUploadCropMode) {
        await onUpdateImage(replaced);
      }
      setEditingImage(replaced);
      setCropPos({ x: 0, y: 0 });
      setCropZoom(1);
      setRotateDeg(0);
      setBrightnessPct(100);
      setContrastPct(100);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleUseFullPageWithoutCrop = async () => {
    if (!editingImage) return;
    setIsSavingEdit(true);
    try {
      const finalImg: StudioUploadedImage = {
        ...editingImage,
        name: editName.trim() || editingImage.name,
        updatedAt: new Date().toISOString(),
      };
      if (isNewUploadCropMode) {
        await onAddImages([finalImg]);
      } else {
        await onUpdateImage(finalImg);
      }
      setEditingImage(null);
      setIsNewUploadCropMode(false);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleApplyImageEdits = async () => {
    if (!editingImage) return;
    setIsSavingEdit(true);
    try {
      let nextDataUrl = editingImage.dataUrl;
      let nextW = editingImage.width;
      let nextH = editingImage.height;
      let nextBytes = editingImage.sizeBytes;

      if (croppedAreaPixels && croppedAreaPixels.width > 10 && croppedAreaPixels.height > 10) {
        const result = await cropImageWithPixelArea({
          imageSrc: editingImage.dataUrl,
          croppedAreaPixels,
          rotation: rotateDeg,
          brightnessPct,
          contrastPct,
        });
        nextDataUrl = result.dataUrl;
        nextW = result.width;
        nextH = result.height;
        nextBytes = result.sizeBytes;
      } else if (rotateDeg !== 0 || brightnessPct !== 100 || contrastPct !== 100) {
        const result = await applyStudioImageEdits(editingImage.dataUrl, {
          rotateDeg,
          cropTopPct: 0,
          cropBottomPct: 0,
          cropLeftPct: 0,
          cropRightPct: 0,
          brightnessPct,
          contrastPct,
        });
        nextDataUrl = result.dataUrl;
        nextW = result.width;
        nextH = result.height;
        nextBytes = result.sizeBytes;
      }

      const finalImg: StudioUploadedImage = {
        ...editingImage,
        name: editName.trim() || editingImage.name,
        dataUrl: nextDataUrl,
        width: nextW,
        height: nextH,
        sizeBytes: nextBytes,
        updatedAt: new Date().toISOString(),
      };

      if (isNewUploadCropMode) {
        await onAddImages([finalImg]);
      } else {
        await onUpdateImage(finalImg);
      }
      setEditingImage(null);
      setIsNewUploadCropMode(false);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleRestoreOriginal = async () => {
    if (!editingImage) return;
    setIsSavingEdit(true);
    try {
      const restored: StudioUploadedImage = {
        ...editingImage,
        dataUrl: editingImage.originalDataUrl || editingImage.dataUrl,
        updatedAt: new Date().toISOString(),
      };
      if (!isNewUploadCropMode) {
        await onUpdateImage(restored);
      }
      setEditingImage(restored);
      setCropPos({ x: 0, y: 0 });
      setCropZoom(1);
      setRotateDeg(0);
      setBrightnessPct(100);
      setContrastPct(100);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const selectedCount = images.filter((i) => i.selectedForAi).length;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800/60 p-4 space-y-3.5">
      {/* Hidden File Inputs */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFilesSelected(e.target.files, 'gallery');
          e.target.value = '';
        }}
      />
      <input
        ref={cameraFallbackInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFilesSelected(e.target.files, 'camera');
          e.target.value = '';
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleReplaceImageFile(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Top Row: Title + Prominent Open Camera & Upload from Gallery Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{compactTitle}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{helperText}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="studio-open-camera-btn"
            disabled={isProcessing}
            onClick={() => setCameraModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <Camera className="w-4 h-4" />
            <span>Open Camera</span>
          </button>

          <button
            type="button"
            data-testid="studio-upload-gallery-btn"
            disabled={isProcessing}
            onClick={() => galleryInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 text-xs font-bold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <ImageIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Upload from Gallery</span>
          </button>

          {images.length > 0 && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => galleryInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-200/80 dark:bg-slate-700 hover:bg-slate-300/80 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              title="Add another educational image"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Image</span>
            </button>
          )}
        </div>
      </div>

      {uploadError && (
        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Uploaded Images Grid */}
      {images.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/60 p-5 text-center space-y-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            No educational images uploaded yet
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
            Take a clear photo of a textbook page, handwritten notes, diagram, or worksheet using Open Camera, or pick existing images via Upload from Gallery. An interactive cropper opens automatically so you can isolate any paragraph or diagram before AI analysis.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold tabular-nums">
              {images.length} saved image{images.length === 1 ? '' : 's'} · {selectedCount} selected for AI reading
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Click Crop / Edit on any page to isolate a specific paragraph or diagram
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {images.map((img) => (
              <div
                key={img.id}
                className={`rounded-xl border bg-white dark:bg-slate-900 overflow-hidden transition-all ${
                  img.selectedForAi
                    ? 'border-indigo-500 ring-1 ring-indigo-500/30'
                    : 'border-slate-200 dark:border-slate-700 opacity-85'
                }`}
              >
                <div className="relative aspect-[4/3] bg-slate-100 dark:bg-slate-950 overflow-hidden">
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => {
                      setPreviewImage(img);
                      setPreviewZoom(1);
                    }}
                  />
                  <label className="absolute top-2 left-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 text-white text-[11px] font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={img.selectedForAi}
                      onChange={() => onToggleSelect(img.id)}
                      className="rounded border-slate-400 text-indigo-500 focus:ring-indigo-500"
                    />
                    <span>{img.selectedForAi ? 'Use in AI' : 'Excluded'}</span>
                  </label>
                </div>

                <div className="p-3 space-y-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate" title={img.name}>
                      {img.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {img.source === 'camera' ? 'Camera' : 'Gallery'} · {img.width}×{img.height} ·{' '}
                      {Math.max(1, Math.round(img.sizeBytes / 1024))} KB
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewImage(img);
                        setPreviewZoom(1);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold transition-colors whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>

                    <button
                      type="button"
                      data-testid={`studio-crop-edit-btn-${img.id}`}
                      onClick={() => openEditor(img, false)}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-[11px] font-semibold transition-colors whitespace-nowrap"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span>Crop / Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTarget(img)}
                      className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-[11px] font-semibold transition-colors whitespace-nowrap"
                      title="Delete Image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* LIVE CAMERA CAPTURE MODAL                                         */}
      {/* ================================================================= */}
      {cameraModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Direct Camera Capture"
          className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Capture Educational Material Photo
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setCameraModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close camera"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-[4/3] flex items-center justify-center">
                {cameraError ? (
                  <div className="p-6 text-center space-y-3 max-w-md">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                    <p className="text-xs text-slate-200 leading-relaxed">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setCameraModalOpen(false);
                        cameraFallbackInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Use Device Camera Picker</span>
                    </button>
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100"
                  >
                    <SwitchCamera className="w-4 h-4" />
                    <span>Flip Camera</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCameraModalOpen(false);
                      cameraFallbackInputRef.current?.click();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Native Camera File</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCameraModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    Cancel
                  </button>
                  {!cameraError && (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void handleCaptureCameraFrame()}
                      className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-60"
                    >
                      <Camera className="w-4 h-4" />
                      <span>{isProcessing ? 'Capturing...' : 'Capture & Crop'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* FULL-SCREEN PREVIEW IMAGE MODAL                                   */}
      {/* ================================================================= */}
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Preview Uploaded Image"
          className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {previewImage.name}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {previewImage.width}×{previewImage.height}px · {Math.max(1, Math.round(previewImage.sizeBytes / 1024))} KB
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreviewZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono tabular-nums px-1.5 text-slate-700 dark:text-slate-200">
                  {Math.round(previewZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = previewImage;
                    setPreviewImage(null);
                    openEditor(target, false);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Crop / Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-slate-950/90 flex items-center justify-center">
              <img
                src={previewImage.dataUrl}
                alt={previewImage.name}
                referrerPolicy="no-referrer"
                style={{ transform: `scale(${previewZoom})`, transformOrigin: 'center center' }}
                className="max-w-full max-h-[70vh] object-contain transition-transform duration-150 rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* REACT-EASY-CROP INTERACTIVE CROP & EDIT MODAL                     */}
      {/* ================================================================= */}
      {editingImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Crop and Edit Textbook Image"
          data-testid="studio-easy-crop-modal"
          className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-4xl max-h-[92vh] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Crop className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isNewUploadCropMode
                    ? 'Crop Textbook Paragraph or Diagram Before AI Analysis'
                    : 'Crop & Edit Educational Image'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingImage(null);
                  setIsNewUploadCropMode(false);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close cropper"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* react-easy-crop Interactive Stage */}
              <div className="lg:col-span-7 flex flex-col gap-3">
                <div
                  className="relative rounded-xl bg-slate-950 border border-slate-800 h-[360px] sm:h-[400px] overflow-hidden"
                  style={{ filter: `brightness(${brightnessPct}%) contrast(${contrastPct}%)` }}
                >
                  <Cropper
                    image={editingImage.dataUrl}
                    crop={cropPos}
                    zoom={cropZoom}
                    rotation={rotateDeg}
                    aspect={cropAspect}
                    onCropChange={setCropPos}
                    onZoomChange={setCropZoom}
                    onRotationChange={setRotateDeg}
                    onCropComplete={onCropComplete}
                    showGrid
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => replaceInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Replace</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotateDeg((d) => d - 90)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>-90°</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotateDeg((d) => d + 90)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>+90°</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRestoreOriginal()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 text-xs font-semibold ml-auto"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Restore Original</span>
                  </button>
                </div>
              </div>

              {/* Right Controls: Aspect Presets, Zoom, Title & Clarity */}
              <div className="lg:col-span-5 space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Image Title / Label
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <Crop className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Crop Frame Preset (Paragraph / Diagram)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: 'Paragraph (16:9)', val: 16 / 9 },
                      { label: 'Diagram (4:3)', val: 4 / 3 },
                      { label: 'Square (1:1)', val: 1 },
                      { label: 'Full Page (3:4)', val: 3 / 4 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setCropAspect(preset.val)}
                        className={`px-2.5 py-1.5 rounded-lg font-semibold border transition-colors ${
                          cropAspect === preset.val
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      <span>Crop Zoom</span>
                      <span className="font-mono tabular-nums">{cropZoom.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.1}
                      value={cropZoom}
                      onChange={(e) => setCropZoom(Number(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                  {croppedAreaPixels && (
                    <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                      Selected region: {Math.round(croppedAreaPixels.width)}×{Math.round(croppedAreaPixels.height)} px
                    </p>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
                    <Sliders className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Page Legibility Adjustments</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      <span>Brightness</span>
                      <span className="font-mono tabular-nums">{brightnessPct}%</span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={150}
                      value={brightnessPct}
                      onChange={(e) => setBrightnessPct(Number(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      <span>Contrast</span>
                      <span className="font-mono tabular-nums">{contrastPct}%</span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={160}
                      value={contrastPct}
                      onChange={(e) => setContrastPct(Number(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              {isNewUploadCropMode ? (
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => void handleUseFullPageWithoutCrop()}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-800 dark:text-slate-100"
                >
                  Use Full Page Without Crop
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingImage(null);
                    setIsNewUploadCropMode(false);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="studio-apply-crop-btn"
                  disabled={isSavingEdit}
                  onClick={() => void handleApplyImageEdits()}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-60"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isSavingEdit
                      ? 'Applying Crop...'
                      : isNewUploadCropMode
                      ? 'Crop & Send to AI Studio'
                      : 'Save Cropped Image'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* DELETE CONFIRMATION MODAL                                         */}
      {/* ================================================================= */}
      {confirmDeleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Delete Image"
          className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Delete Uploaded Image?
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Are you sure you want to permanently delete &ldquo;{confirmDeleteTarget.name}&rdquo;? This image will be removed from your saved studio gallery.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = confirmDeleteTarget.id;
                  setConfirmDeleteTarget(null);
                  await onDeleteImage(id);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
