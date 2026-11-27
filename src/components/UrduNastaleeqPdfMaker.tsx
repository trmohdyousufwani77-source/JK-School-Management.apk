import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Download,
  Printer,
  Share2,
  Copy,
  Check,
  Trash2,
  Clock,
  AlignRight,
  AlignCenter,
  AlignLeft,
  AlignJustify,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import type { SchoolProfile, User } from '../types';
import { printHtmlDocumentSafely } from '../utils/studioMediaStore';
import { guardSensitiveExport } from '../utils/biometricProtection';

interface UrduPdfHistoryItem {
  id: string;
  fileName: string;
  title: string;
  content: string;
  fontSize: number;
  align: 'right' | 'center' | 'left' | 'justify';
  pageSize: 'a4' | 'letter';
  orientation: 'portrait' | 'landscape';
  marginPreset: 'narrow' | 'normal' | 'wide';
  createdAt: string;
}

interface UrduNastaleeqPdfMakerProps {
  school: SchoolProfile;
  currentUser: User;
}

const HISTORY_STORAGE_KEY = 'sm_urdu_nastaleeq_pdf_history_v1';

const URDU_DIACRITICS = [
  { char: 'َ', label: 'زبر' },
  { char: 'ِ', label: 'زیر' },
  { char: 'ُ', label: 'پیش' },
  { char: 'ّ', label: 'تشدید' },
  { char: 'ْ', label: 'جزم' },
  { char: 'ٰ', label: 'کھڑی زبر' },
  { char: '۔', label: 'ختمہ' },
  { char: '،', label: 'سکتہ' },
  { char: '؟', label: 'سوالیہ' },
  { char: '«»', label: 'واوین' },
];

const SAMPLE_TEMPLATES = [
  {
    name: 'اسکول نوٹس',
    title: 'ضروری اطلاع نامہ',
    body: `بسم اللہ الرحمن الرحیم\n\nتمام طلبہ اور والدین کو مطلع کیا جاتا ہے کہ اسکول میں سالانہ امتحانات کا آغاز آئندہ ماہ کی پہلی تاریخ سے ہوگا۔\n\nتمام طلبہ وقت کی پابندی کریں اور روزانہ باقاعدگی سے حاضر رہیں۔\n\nوالسلام\nپرنسپل / ہیڈ ماسٹر`,
  },
  {
    name: 'درخواست برائے رخصت',
    title: 'درخواست برائے رخصت بیماری',
    body: `بخدمت جناب ہیڈ ماسٹر صاحب\n\nجنابِ عالی!\nمودبانہ گزارش ہے کہ کل رات سے مجھے شدید بخار ہے جس کی وجہ سے میں آج اسکول حاضر ہونے سے قاصر ہوں۔\n\nبراہِ کرم مجھے دو یوم کی رخصت عنایت فرمائیں۔ عین نوازش ہوگی۔\n\nالعارض\nآپ کا تابعدار شاگرد`,
  },
  {
    name: 'سبق کا خلاصہ',
    title: 'سبق کا خلاصہ — علم کی اہمیت',
    body: `علم وہ نور ہے جو انسان کو جہالت کے اندھیروں سے نکال کر روشنی کی طرف لے جاتا ہے۔\n\nعلم کے بغیر کوئی قوم ترقی نہیں کر سکتی۔ ہمیں چاہیے کہ ہم محنت اور لگن سے تعلیم حاصل کریں اور اپنے والدین، اساتذہ اور ملک کا نام روشن کریں۔`,
  },
];

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPageDimensionsMm(pageSize: 'a4' | 'letter', orientation: 'portrait' | 'landscape') {
  const base = pageSize === 'a4' ? { w: 210, h: 297 } : { w: 215.9, h: 279.4 };
  return orientation === 'portrait' ? base : { w: base.h, h: base.w };
}

function getMarginPx(preset: 'narrow' | 'normal' | 'wide'): number {
  if (preset === 'narrow') return 64;
  if (preset === 'wide') return 128;
  return 96;
}

export const UrduNastaleeqPdfMaker: React.FC<UrduNastaleeqPdfMakerProps> = ({ school, currentUser }) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [docTitle, setDocTitle] = useState<string>('ضروری اطلاع نامہ');
  const [pdfFileName, setPdfFileName] = useState<string>('Urdu_Nastaleeq_Document');
  const [urduText, setUrduText] = useState<string>(SAMPLE_TEMPLATES[0].body);
  const [fontSize, setFontSize] = useState<number>(22);
  const [align, setAlign] = useState<'right' | 'center' | 'left' | 'justify'>('right');
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('a4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [marginPreset, setMarginPreset] = useState<'narrow' | 'normal' | 'wide'>('normal');
  const [includeSchoolHeader, setIncludeSchoolHeader] = useState<boolean>(true);

  const [copied, setCopied] = useState<boolean>(false);
  const [isBuildingPdf, setIsBuildingPdf] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [history, setHistory] = useState<UrduPdfHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as UrduPdfHistoryItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 25)));
    } catch {
      // Ignore storage quota errors
    }
  }, [history]);

  const notify = (msg: string) => {
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(null), 3500);
  };

  const insertAtCursor = (snippet: string) => {
    const el = textareaRef.current;
    if (!el) {
      setUrduText((prev) => prev + snippet);
      return;
    }
    const start = el.selectionStart ?? urduText.length;
    const end = el.selectionEnd ?? urduText.length;
    const next = urduText.slice(0, start) + snippet + urduText.slice(end);
    setUrduText(next);
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const renderNastaleeqPagesToCanvases = async (): Promise<HTMLCanvasElement[]> => {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready;
    }

    const dims = getPageDimensionsMm(pageSize, orientation);
    // High-resolution 150 DPI canvas scale
    const pxPerMm = 6;
    const canvasW = Math.round(dims.w * pxPerMm);
    const canvasH = Math.round(dims.h * pxPerMm);
    const margin = getMarginPx(marginPreset);
    const contentW = canvasW - margin * 2;
    const bodyPx = Math.round(fontSize * 1.45);
    const lineH = Math.round(bodyPx * 2.15); // Generous Nastaleeq ascender/descender clearance

    const fontStack = `"Noori Nastaleeq", "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Noto Sans Arabic", serif`;
    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = canvasW;
    measureCanvas.height = canvasH;
    const mCtx = measureCanvas.getContext('2d');
    if (!mCtx) return [];

    mCtx.font = `${bodyPx}px ${fontStack}`;

    const wrappedLines: string[] = [];
    const rawParagraphs = urduText.split('\n');
    for (const para of rawParagraphs) {
      const cleaned = para.trimEnd();
      if (!cleaned) {
        wrappedLines.push('');
        continue;
      }
      const words = cleaned.split(/\s+/);
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (mCtx.measureText(candidate).width > contentW && current) {
          wrappedLines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      if (current) wrappedLines.push(current);
    }

    const headerHeight = includeSchoolHeader ? 185 : docTitle.trim() ? 95 : 10;
    const footerHeight = 64;
    const firstPageMaxLines = Math.max(1, Math.floor((canvasH - margin * 2 - headerHeight - footerHeight) / lineH));
    const nextPageMaxLines = Math.max(1, Math.floor((canvasH - margin * 2 - footerHeight) / lineH));

    const pages: string[][] = [];
    if (wrappedLines.length === 0) {
      pages.push(['']);
    } else {
      pages.push(wrappedLines.slice(0, firstPageMaxLines));
      let idx = firstPageMaxLines;
      while (idx < wrappedLines.length) {
        pages.push(wrappedLines.slice(idx, idx + nextPageMaxLines));
        idx += nextPageMaxLines;
      }
    }

    const canvases: HTMLCanvasElement[] = [];

    pages.forEach((lines, pIdx) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Subtle formal page border
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2;
      ctx.strokeRect(margin * 0.55, margin * 0.55, canvasW - margin * 1.1, canvasH - margin * 1.1);

      let y = margin;

      if (pIdx === 0) {
        if (includeSchoolHeader) {
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(margin, y, contentW, 118);

          ctx.fillStyle = '#FFFFFF';
          ctx.direction = 'rtl';
          ctx.textAlign = 'center';
          ctx.font = `bold 34px ${fontStack}`;
          ctx.fillText(
            (school.nameUrdu || school.name || 'اسمارٹ ڈیجیٹل اسکول').slice(0, 64),
            canvasW / 2,
            y + 58
          );

          ctx.fillStyle = '#FDE68A';
          ctx.direction = 'ltr';
          ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(
            `${school.name || ''} ${school.district ? `· ${school.district}` : ''}`.trim().slice(0, 88),
            canvasW / 2,
            y + 98
          );
          y += 140;
        }

        if (docTitle.trim()) {
          ctx.fillStyle = '#0F172A';
          ctx.direction = 'rtl';
          ctx.textAlign = 'center';
          ctx.font = `bold ${Math.round(bodyPx * 1.25)}px ${fontStack}`;
          ctx.fillText(docTitle.trim(), canvasW / 2, y + 32);
          y += 62;
        }
      }

      // Draw Nastaleeq RTL paragraphs with authentic shaping via browser canvas engine
      ctx.fillStyle = '#0F172A';
      ctx.font = `${bodyPx}px ${fontStack}`;
      ctx.direction = 'rtl';

      let drawX = canvasW - margin;
      if (align === 'center') {
        ctx.textAlign = 'center';
        drawX = canvasW / 2;
      } else if (align === 'left') {
        ctx.textAlign = 'left';
        drawX = margin;
      } else {
        ctx.textAlign = 'right';
        drawX = canvasW - margin;
      }

      for (const line of lines) {
        if (line) {
          ctx.fillText(line, drawX, y + bodyPx);
        }
        y += lineH;
      }

      // Footer
      ctx.direction = 'ltr';
      ctx.fillStyle = '#64748B';
      ctx.font = '16px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Prepared by ${currentUser.name || 'Teacher'} · ${new Date().toLocaleDateString()}`, margin, canvasH - margin * 0.65);
      ctx.textAlign = 'right';
      ctx.fillText(`Page ${pIdx + 1} of ${pages.length}`, canvasW - margin, canvasH - margin * 0.65);

      canvases.push(canvas);
    });

    return canvases;
  };

  const buildPdfDocument = async (): Promise<{ doc: jsPDF; fileName: string; pageCount: number }> => {
    const canvases = await renderNastaleeqPagesToCanvases();
    const dims = getPageDimensionsMm(pageSize, orientation);
    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: pageSize,
    });

    canvases.forEach((canvas, idx) => {
      if (idx > 0) doc.addPage();
      const imgData = canvas.toDataURL('image/jpeg', 0.94);
      doc.addImage(imgData, 'JPEG', 0, 0, dims.w, dims.h);
    });

    const cleanSlug =
      (pdfFileName || docTitle || 'Urdu_Nastaleeq_Document')
        .trim()
        .replace(/\.pdf$/i, '')
        .replace(/[^\w\-\u0600-\u06FF ]+/g, '')
        .replace(/\s+/g, '_') || 'Urdu_Nastaleeq_Document';

    return {
      doc,
      fileName: `${cleanSlug}.pdf`,
      pageCount: canvases.length,
    };
  };

  const recordConversionHistory = (fileName: string) => {
    const item: UrduPdfHistoryItem = {
      id: `urdu-pdf-${Date.now()}`,
      fileName,
      title: docTitle.trim() || 'Untitled Urdu Document',
      content: urduText,
      fontSize,
      align,
      pageSize,
      orientation,
      marginPreset,
      createdAt: new Date().toISOString(),
    };
    setHistory((prev) => [item, ...prev.filter((h) => h.fileName !== fileName || h.content !== urduText)].slice(0, 25));
  };

  const handleDownloadPdf = async () => {
    if (!urduText.trim() && !docTitle.trim()) {
      notify('Please enter Urdu text before generating a PDF.');
      return;
    }
    const allowed = await guardSensitiveExport(`Urdu Nastaleeq PDF (${pdfFileName || 'Document'}.pdf)`);
    if (!allowed) return;

    setIsBuildingPdf(true);
    try {
      const { doc, fileName, pageCount } = await buildPdfDocument();
      doc.save(fileName);
      recordConversionHistory(fileName);
      notify(`Downloaded "${fileName}" (${pageCount} page${pageCount === 1 ? '' : 's'}) in authentic Nastaleeq script.`);
    } finally {
      setIsBuildingPdf(false);
    }
  };

  const handleSharePdf = async () => {
    const allowed = await guardSensitiveExport(`Share Urdu Nastaleeq PDF (${pdfFileName || 'Document'}.pdf)`);
    if (!allowed) return;

    setIsBuildingPdf(true);
    try {
      const { doc, fileName } = await buildPdfDocument();
      const blob = doc.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: docTitle || 'Urdu Nastaleeq PDF',
          text: `${docTitle || 'Urdu Document'} — Generated via SchoolMaster Urdu Nastaleeq PDF Maker`,
          files: [file],
        });
        recordConversionHistory(fileName);
        notify(`Shared "${fileName}".`);
      } else {
        doc.save(fileName);
        recordConversionHistory(fileName);
        notify(`Direct file sharing is unavailable in this browser — downloaded "${fileName}" instead.`);
      }
    } catch {
      // User cancelled share sheet
    } finally {
      setIsBuildingPdf(false);
    }
  };

  const handlePrintUrduDocument = () => {
    const marginCss = marginPreset === 'narrow' ? '12mm' : marginPreset === 'wide' ? '26mm' : '18mm';
    const html = `<!doctype html>
<html dir="rtl" lang="ur">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docTitle || pdfFileName)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: ${pageSize.toUpperCase()} ${orientation}; margin: ${marginCss}; }
    body {
      font-family: "Noori Nastaleeq", "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", serif;
      direction: rtl;
      text-align: ${align};
      font-size: ${fontSize}px;
      line-height: 2.25;
      color: #0f172a;
      margin: 0;
    }
    .hdr { background: #0f172a; color: #fff; text-align: center; padding: 14px 18px; border-radius: 8px; margin-bottom: 18px; }
    .hdr h1 { margin: 0; font-size: 24px; }
    .hdr p { margin: 6px 0 0 0; font-family: Arial, sans-serif; font-size: 12px; color: #fde68a; direction: ltr; }
    .doc-title { text-align: center; font-size: ${Math.round(fontSize * 1.25)}px; font-weight: 700; margin-bottom: 14px; }
    .content { white-space: pre-wrap; }
  </style>
</head>
<body>
  ${
    includeSchoolHeader
      ? `<div class="hdr"><h1>${escapeHtml(school.nameUrdu || school.name || 'اسمارٹ اسکول')}</h1><p>${escapeHtml(school.name || '')} ${school.district ? `· ${escapeHtml(school.district)}` : ''}</p></div>`
      : ''
  }
  ${docTitle.trim() ? `<div class="doc-title">${escapeHtml(docTitle)}</div>` : ''}
  <div class="content">${escapeHtml(urduText)}</div>
</body>
</html>`;
    printHtmlDocumentSafely(html);
  };

  const handleCopyUrdu = async () => {
    try {
      await navigator.clipboard.writeText(`${docTitle ? `${docTitle}\n\n` : ''}${urduText}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      notify('Copied Urdu text to clipboard.');
    } catch {
      notify('Clipboard access unavailable.');
    }
  };

  const estimatedPages = useMemo(() => {
    const lines = urduText.split('\n').reduce((acc, p) => acc + Math.max(1, Math.ceil(p.length / 46)), 0);
    const linesPerPage = orientation === 'landscape' ? 10 : 15;
    return Math.max(1, Math.ceil(lines / linesPerPage));
  }, [urduText, orientation]);

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>URDU NASTALEEQ PDF MAKER</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Write Urdu. Convert to Nastaleeq. Download PDF. · Authentic Unicode RTL shaping, ligature &amp; diacritic preservation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleCopyUrdu()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied' : 'Copy Urdu'}</span>
          </button>
          <button
            type="button"
            onClick={handlePrintUrduDocument}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>
          <button
            type="button"
            disabled={isBuildingPdf}
            onClick={() => void handleSharePdf()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 text-xs font-bold whitespace-nowrap disabled:opacity-60"
          >
            <Share2 className="w-4 h-4" />
            <span>Share PDF</span>
          </button>
          <button
            type="button"
            data-testid="urdu-nastaleeq-download-pdf-btn"
            disabled={isBuildingPdf}
            onClick={() => void handleDownloadPdf()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold whitespace-nowrap disabled:opacity-60"
          >
            <Download className="w-4 h-4" />
            <span>{isBuildingPdf ? 'Rendering Nastaleeq...' : 'Download PDF'}</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold">
          {statusMsg}
        </div>
      )}

      {/* Workspace Split: Editor + Live Nastaleeq PDF Preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left: Urdu Editor & Typography Controls */}
        <div className="xl:col-span-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
              Urdu Unicode Editor (RTL)
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {SAMPLE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => {
                    setDocTitle(tpl.title);
                    setUrduText(tpl.body);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 text-xs font-semibold text-slate-700 dark:text-slate-200 font-urdu"
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                Document Heading (عنوان)
              </label>
              <input
                type="text"
                dir="rtl"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="عنوان یہاں لکھیں..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-urdu text-base"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                PDF File Name (Rename PDF)
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={pdfFileName}
                  onChange={(e) => setPdfFileName(e.target.value)}
                  placeholder="Urdu_Nastaleeq_Document"
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                />
                <span className="text-xs font-mono text-slate-500">.pdf</span>
              </div>
            </div>
          </div>

          {/* Diacritics & Urdu Punctuation Quick Bar */}
          <div className="flex flex-wrap items-center gap-1.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <span className="text-[11px] font-bold text-slate-500 mr-1">اعراب و رموز:</span>
            {URDU_DIACRITICS.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => insertAtCursor(d.char)}
                title={d.label}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-xs font-urdu text-slate-800 dark:text-slate-100"
              >
                {d.label} ({d.char})
              </button>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            dir="rtl"
            rows={10}
            value={urduText}
            onChange={(e) => setUrduText(e.target.value)}
            placeholder="اپنا اردو مضمون، نوٹس، درخواست یا سبق یہاں لکھیں یا پیسٹ کریں..."
            style={{
              fontFamily: '"Noori Nastaleeq", "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", serif',
              fontSize: `${fontSize}px`,
              lineHeight: 2.2,
              textAlign: align,
            }}
            className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          {/* Formatting & Page Layout Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold">Font Size</span>
                <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                  {fontSize}px
                </span>
              </div>
              <input
                type="range"
                min={14}
                max={34}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full accent-emerald-600"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
              <span className="font-bold block">Text Alignment</span>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    { id: 'right', icon: AlignRight, label: 'Right' },
                    { id: 'center', icon: AlignCenter, label: 'Center' },
                    { id: 'left', icon: AlignLeft, label: 'Left' },
                    { id: 'justify', icon: AlignJustify, label: 'Justify' },
                  ] as const
                ).map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAlign(a.id)}
                      title={a.label}
                      className={`py-1.5 rounded-lg flex items-center justify-center border transition-colors ${
                        align === a.id
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <span className="font-bold block">Page Size &amp; Orientation</span>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as 'a4' | 'letter')}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-semibold"
                >
                  <option value="a4">A4</option>
                  <option value="letter">Letter</option>
                </select>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-semibold"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <span className="font-bold block">Page Margins &amp; School Header</span>
              <div className="flex items-center justify-between gap-2">
                <select
                  value={marginPreset}
                  onChange={(e) => setMarginPreset(e.target.value as 'narrow' | 'normal' | 'wide')}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-semibold"
                >
                  <option value="narrow">Narrow</option>
                  <option value="normal">Normal</option>
                  <option value="wide">Wide</option>
                </select>
                <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={includeSchoolHeader}
                    onChange={(e) => setIncludeSchoolHeader(e.target.checked)}
                    className="rounded accent-emerald-600"
                  />
                  <span>Header</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Nastaleeq PDF Document Preview */}
        <div className="xl:col-span-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Live Noori Nastaleeq PDF Preview</span>
            </span>
            <span className="text-slate-500 font-mono tabular-nums">
              {pageSize.toUpperCase()} · {orientation} · Est. {estimatedPages} page{estimatedPages === 1 ? '' : 's'}
            </span>
          </div>

          <div className="rounded-xl bg-slate-100 dark:bg-slate-950 p-4 overflow-auto max-h-[640px] flex justify-center">
            <div
              dir="rtl"
              style={{
                width: orientation === 'landscape' ? '100%' : 'min(100%, 540px)',
                minHeight: orientation === 'landscape' ? '380px' : '620px',
                padding: marginPreset === 'narrow' ? '22px' : marginPreset === 'wide' ? '44px' : '32px',
                fontFamily: '"Noori Nastaleeq", "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", serif',
              }}
              className="bg-white text-slate-900 rounded-lg shadow-md border border-slate-200 space-y-4"
            >
              {includeSchoolHeader && (
                <div className="bg-slate-900 text-white rounded-lg px-4 py-3 text-center">
                  <div className="text-lg font-bold leading-loose">
                    {school.nameUrdu || school.name || 'اسمارٹ ڈیجیٹل اسکول'}
                  </div>
                  <div dir="ltr" className="text-[11px] font-sans text-amber-300 font-semibold">
                    {school.name} {school.district ? `· ${school.district}` : ''}
                  </div>
                </div>
              )}

              {docTitle.trim() && (
                <h2
                  style={{ fontSize: `${Math.round(fontSize * 1.2)}px`, lineHeight: 2.1 }}
                  className="text-center font-bold text-slate-950 border-b border-slate-200 pb-2"
                >
                  {docTitle}
                </h2>
              )}

              <div
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: 2.25,
                  textAlign: align,
                }}
                className="whitespace-pre-wrap text-slate-900"
              >
                {urduText || 'یہاں آپ کی تحریر نوری نستعلیق رسم الخط میں نظر آئے گی۔'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Conversion History */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>Recent Urdu Nastaleeq PDF Conversions ({history.length})</span>
          </h3>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setHistory([])}
              className="text-xs font-semibold text-rose-600 hover:underline inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No recent PDF conversions yet. Write or paste Urdu text above and click Download PDF to keep a quick conversion history.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {history.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col justify-between gap-2.5"
              >
                <div className="space-y-1">
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">{item.fileName}</div>
                  <div dir="rtl" className="text-sm font-urdu text-slate-700 dark:text-slate-200 truncate">
                    {item.title}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {item.pageSize.toUpperCase()} · {item.orientation} · {new Date(item.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setDocTitle(item.title);
                      setPdfFileName(item.fileName.replace(/\.pdf$/i, ''));
                      setUrduText(item.content);
                      setFontSize(item.fontSize);
                      setAlign(item.align);
                      setPageSize(item.pageSize);
                      setOrientation(item.orientation);
                      setMarginPreset(item.marginPreset);
                      notify(`Loaded "${item.fileName}" into editor.`);
                    }}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Re-open in Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistory((prev) => prev.filter((x) => x.id !== item.id))}
                    aria-label={`Delete ${item.fileName}`}
                    className="p-1 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
