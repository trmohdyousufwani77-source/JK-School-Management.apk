import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import type { DailyTeacherDiaryEntry } from '../components/DailyTeacherDiary';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatMonthLabel(monthKey: string): string {
  const [yStr, mStr] = monthKey.split('-');
  const mIdx = Number(mStr) - 1;
  if (!yStr || Number.isNaN(mIdx) || mIdx < 0 || mIdx > 11) return monthKey;
  return `${MONTH_NAMES[mIdx]} ${yStr}`;
}

function normalizeMonthKey(rawDate?: string): string {
  const str = String(rawDate || '').trim();
  if (/^\d{4}-\d{2}/.test(str)) {
    return str.slice(0, 7);
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return 'Undated';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to encode file'));
    reader.readAsDataURL(blob);
  });
}

interface NativeExportBridge {
  saveBase64File?: (filename: string, mimeType: string, base64Data: string) => boolean | void;
}

/**
 * Cross-platform file download delivery across Web, Windows Desktop, iOS Safari/PWA, and Android WebView:
 *  1) Native Android WebView bridge (`SchoolMasterExportBridge.saveBase64File`) if present
 *  2) Web Share API with File attachment on iOS/Android standalone/WebView environments
 *  3) Standard browser `<a download>` with delayed `URL.revokeObjectURL` (60s) so Safari/Firefox/Android
 *     never abort the download prematurely
 */
async function deliverZipCrossPlatform(
  zipBlob: Blob,
  filename: string
): Promise<'native-bridge' | 'web-share' | 'browser-download'> {
  if (typeof window === 'undefined') return 'browser-download';

  // 1. Native Android WebView JS bridge (if running inside packaged APK with export bridge)
  const bridge = (window as unknown as { SchoolMasterExportBridge?: NativeExportBridge })
    .SchoolMasterExportBridge;
  if (bridge && typeof bridge.saveBase64File === 'function') {
    try {
      const base64 = await blobToBase64(zipBlob);
      const handled = bridge.saveBase64File(filename, 'application/zip', base64);
      if (handled !== false) {
        return 'native-bridge';
      }
    } catch {
      // Fall through to Web Share / browser download
    }
  }

  // 2. Mobile iOS / Android standalone PWA or WebView Web Share API (if supported for ZIP files)
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isMobileOrWebView =
    /Android|iPhone|iPad|iPod|\bwv\b/i.test(ua) ||
    window.location.protocol === 'file:' ||
    window.location.protocol === 'capacitor:';

  if (
    isMobileOrWebView &&
    typeof File !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      const zipFile = new File([zipBlob], filename, { type: 'application/zip' });
      if (navigator.canShare({ files: [zipFile] })) {
        await navigator.share({
          files: [zipFile],
          title: "Daily Teacher's Diary — Monthly PDF Archive",
          text: `School Master monthly teacher diary PDF archive (${filename})`,
        });
        return 'web-share';
      }
    } catch (err) {
      // If user dismissed share sheet, do not force duplicate download; otherwise fall back
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'web-share';
      }
    }
  }

  // 3. Universal browser download (Windows, macOS, Linux, Android Chrome, iOS Safari 13+)
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Delay revoking the blob URL so mobile Safari, Android Chrome, and Firefox finish streaming the ZIP
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, 60_000);

  return 'browser-download';
}

async function buildMonthlyDiaryPdfArrayBuffer(params: {
  schoolName: string;
  schoolAddress?: string;
  academicSession?: string;
  teacherName: string;
  monthKey: string;
  entries: DailyTeacherDiaryEntry[];
}): Promise<ArrayBuffer> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font readiness errors
    }
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const monthLabel = formatMonthLabel(params.monthKey);
  const sorted = [...params.entries].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const bodyLines = sorted.map((e, idx) =>
    [
      `#${idx + 1} | Date: ${e.date || '-'} | Subject: ${e.subject || '-'}`,
      `Topic Name: ${e.topic || '-'} | Lesson Name: ${e.lessonName || '-'}`,
      e.lessonIntroduction ? `Introduction: ${e.lessonIntroduction}` : '',
      e.learningObjectives ? `تٔعلیمی مقصَد (Objectives): ${e.learningObjectives}` : '',
      e.teachingMethodology ? `تدریسی طریقہٕ کار (Method): ${e.teachingMethodology}` : '',
      e.classroomTeachingActivities ? `کلاس روم سرگرمیہٕ (Activities): ${e.classroomTeachingActivities}` : '',
      e.lessonExplanation ? `سبقُک خلاصہٕ (Explanation): ${e.lessonExplanation}` : '',
      e.homeworkAssigned ? `گھرٕچ کٲم (Homework): ${e.homeworkAssigned}` : '',
      e.learningOutcomes ? `تٔعلیمی نتیجہٕ (Outcomes): ${e.learningOutcomes}` : '',
      e.dailyTeachingSummary ? `خلاصہٕ (Summary): ${e.dailyTeachingSummary}` : '',
      '────────────────────────────────────────',
      '',
    ]
      .filter(Boolean)
      .join('\n')
  );
  const fullText = bodyLines.join('\n');
  const containsRtl = (str: string) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(str);
  const hasRtlOrUnicode =
    sorted.some(
      (e) =>
        e.language === 'Urdu' ||
        (e.language === 'Kashmiri' && e.kashmiriScript !== 'devanagari')
    ) || /[\u0600-\u06FF\u0900-\u097F]/.test(fullText);

  if (hasRtlOrUnicode && typeof document !== 'undefined') {
    const canvasW = 1240;
    const canvasH = 1754;
    const margin = 80;
    const contentW = canvasW - margin * 2;
    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = canvasW;
    measureCanvas.height = canvasH;
    const mCtx = measureCanvas.getContext('2d');

    if (mCtx) {
      const kashmiriFont =
        '25px "Scheherazade New", "Noto Sans Arabic", "Noto Nastaliq Urdu", "Plus Jakarta Sans", serif';
      const latinFont = '21px "Plus Jakarta Sans", Arial, sans-serif';

      const wrapped: Array<{ text: string; rtl: boolean }> = [];
      for (const para of fullText.split('\n')) {
        const trimmed = para.trimEnd();
        if (!trimmed) {
          wrapped.push({ text: '', rtl: false });
          continue;
        }
        const isLineRtl = containsRtl(trimmed);
        mCtx.font = isLineRtl ? kashmiriFont : latinFont;
        let line = '';
        for (const word of trimmed.split(/\s+/)) {
          const candidate = line ? `${line} ${word}` : word;
          if (mCtx.measureText(candidate).width > contentW && line) {
            wrapped.push({ text: line, rtl: isLineRtl });
            line = word;
          } else {
            line = candidate;
          }
        }
        if (line) wrapped.push({ text: line, rtl: isLineRtl });
      }

      const lineH = 44;
      const firstPageLines = Math.floor((canvasH - margin * 2 - 220 - 70) / lineH);
      const nextPageLines = Math.floor((canvasH - margin * 2 - 70) / lineH);
      const pages: Array<Array<{ text: string; rtl: boolean }>> = [];
      let cursor = 0;
      pages.push(wrapped.slice(0, firstPageLines));
      cursor += firstPageLines;
      while (cursor < wrapped.length) {
        pages.push(wrapped.slice(cursor, cursor + nextPageLines));
        cursor += nextPageLines;
      }

      pages.forEach((lines, pageIndex) => {
        if (pageIndex > 0) doc.addPage();
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvasW;
        pageCanvas.height = canvasH;
        const ctx = pageCanvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvasW, canvasH);

        let y = margin;
        if (pageIndex === 0) {
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(margin, y, contentW, 165);
          ctx.fillStyle = '#FFFFFF';
          ctx.direction = 'ltr';
          ctx.font = 'bold 30px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(params.schoolName.slice(0, 58), margin + 28, y + 48);
          ctx.fillStyle = '#FDE68A';
          ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(`DAILY TEACHER'S DIARY — ${monthLabel}`, margin + 28, y + 86);
          ctx.fillStyle = '#CBD5E1';
          ctx.font = '19px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(
            `Teacher: ${params.teacherName} · Entries: ${sorted.length}${params.academicSession ? ` · Session: ${params.academicSession}` : ''}`,
            margin + 28,
            y + 120
          );
          if (params.schoolAddress) {
            ctx.fillText(params.schoolAddress.slice(0, 82), margin + 28, y + 148);
          }
          y += 215;
        }

        ctx.fillStyle = '#1E293B';
        for (const item of lines) {
          if (item.text) {
            ctx.font = item.rtl ? kashmiriFont : latinFont;
            ctx.direction = item.rtl ? 'rtl' : 'ltr';
            ctx.textAlign = item.rtl ? 'right' : 'left';
            ctx.fillText(item.text, item.rtl ? canvasW - margin : margin, y);
          }
          y += lineH;
        }

        ctx.direction = 'ltr';
        ctx.fillStyle = '#64748B';
        ctx.font = '18px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(
          `Daily Teacher's Diary (${monthLabel}) · Page ${pageIndex + 1} of ${pages.length}`,
          canvasW - margin,
          canvasH - 40
        );

        doc.addImage(pageCanvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
      });

      return doc.output('arraybuffer');
    }
  }

  // Clean vector PDF table for English records
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const usableW = pageW - margin * 2;

  doc.setFillColor(15, 23, 42);
  doc.rect(margin, 12, usableW, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(params.schoolName.slice(0, 68), margin + 4, 20);
  doc.setTextColor(253, 230, 138);
  doc.setFontSize(10.5);
  doc.text(`DAILY TEACHER'S DIARY — ${monthLabel}`, margin + 4, 27);
  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.text(
    `Teacher: ${params.teacherName} · Monthly Entries: ${sorted.length}${params.academicSession ? ` · Session: ${params.academicSession}` : ''}`,
    margin + 4,
    33
  );
  if (params.schoolAddress) {
    doc.text(params.schoolAddress.slice(0, 95), margin + 4, 38.5);
  }

  let y = 48;

  const drawTableHeader = () => {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, usableW, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(15, 23, 42);
    doc.text('Date', margin + 2, y + 5.5);
    doc.text('Class/Subj', margin + 24, y + 5.5);
    doc.text('Lesson Name & Topic', margin + 52, y + 5.5);
    doc.text('Summary / Homework', margin + 120, y + 5.5);
    y += 8;
  };

  drawTableHeader();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);

  for (const entry of sorted) {
    const clsSubj = `${entry.classNumber || '-'}-${entry.section || '-'}\n${entry.subject || ''}`.trim();
    const lessonBlock = [entry.lessonName || '-', entry.topic ? `Topic: ${entry.topic}` : '']
      .filter(Boolean)
      .join('\n');
    const summaryBlock = [
      entry.dailyTeachingSummary || entry.learningObjectives || entry.subTopic || '-',
      entry.homeworkAssigned ? `HW: ${entry.homeworkAssigned}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const clsLines = doc.splitTextToSize(clsSubj, 26) as string[];
    const lessonLines = doc.splitTextToSize(lessonBlock, 65) as string[];
    const summaryLines = doc.splitTextToSize(summaryBlock, 60) as string[];
    const maxLines = Math.max(1, clsLines.length, lessonLines.length, summaryLines.length);
    const rowH = Math.max(9, maxLines * 4.2 + 3.5);

    if (y + rowH > pageH - 18) {
      doc.addPage();
      y = 16;
      drawTableHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
    }

    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, usableW, rowH);
    doc.text(entry.date || '-', margin + 2, y + 5);
    doc.text(clsLines, margin + 24, y + 5);
    doc.text(lessonLines, margin + 52, y + 5);
    doc.text(summaryLines, margin + 120, y + 5);
    y += rowH;
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Daily Teacher's Diary (${monthLabel}) · Page ${p} of ${totalPages}`,
      pageW - margin,
      pageH - 9,
      { align: 'right' }
    );
  }

  return doc.output('arraybuffer');
}

export async function exportAllDiaryRecordsZip(params: {
  schoolName: string;
  schoolAddress?: string;
  academicSession?: string;
  teacherName: string;
  entries: DailyTeacherDiaryEntry[];
}): Promise<{ monthCount: number; filename: string; deliveryMethod: string }> {
  const grouped = new Map<string, DailyTeacherDiaryEntry[]>();
  for (const entry of params.entries) {
    const monthKey = normalizeMonthKey(entry.date);
    const bucket = grouped.get(monthKey) || [];
    bucket.push(entry);
    grouped.set(monthKey, bucket);
  }

  const zip = new JSZip();
  const sortedMonths = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));
  const summaryLines: string[] = [
    `SCHOOL MASTER — DAILY TEACHER'S DIARY MONTHLY PDF ARCHIVE`,
    `==========================================================`,
    `School: ${params.schoolName}`,
    params.schoolAddress ? `Address: ${params.schoolAddress}` : '',
    params.academicSession ? `Academic Session: ${params.academicSession}` : '',
    `Teacher: ${params.teacherName}`,
    `Generated: ${new Date().toLocaleString()}`,
    `Total Diary Entries: ${params.entries.length}`,
    `Monthly PDF Documents Included: ${sortedMonths.length}`,
    ``,
    `Included Monthly PDF Files:`,
  ].filter(Boolean);

  for (const monthKey of sortedMonths) {
    const monthEntries = grouped.get(monthKey) || [];
    const pdfBuffer = await buildMonthlyDiaryPdfArrayBuffer({
      schoolName: params.schoolName,
      schoolAddress: params.schoolAddress,
      academicSession: params.academicSession,
      teacherName: params.teacherName,
      monthKey,
      entries: monthEntries,
    });
    const safeMonth = monthKey.replace(/[^0-9A-Za-z_-]/g, '_');
    const pdfFilename = `Daily_Teachers_Diary_${safeMonth}.pdf`;
    zip.file(pdfFilename, pdfBuffer);
    summaryLines.push(
      `  - ${pdfFilename} (${formatMonthLabel(monthKey)}: ${monthEntries.length} ${
        monthEntries.length === 1 ? 'entry' : 'entries'
      })`
    );
  }

  zip.file('00_Archive_Index.txt', summaryLines.join('\n'));

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const todayStr = new Date().toISOString().slice(0, 10);
  const filename = `Daily_Teachers_Diary_All_Records_${todayStr}.zip`;
  const deliveryMethod = await deliverZipCrossPlatform(zipBlob, filename);

  return { monthCount: sortedMonths.length, filename, deliveryMethod };
}
