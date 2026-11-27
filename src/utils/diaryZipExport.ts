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

function buildMonthlyDiaryPdfArrayBuffer(params: {
  schoolName: string;
  schoolAddress?: string;
  academicSession?: string;
  teacherName: string;
  monthKey: string;
  entries: DailyTeacherDiaryEntry[];
}): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const monthLabel = formatMonthLabel(params.monthKey);
  const sorted = [...params.entries].sort((a, b) => a.date.localeCompare(b.date));

  const bodyLines = sorted.map((e, idx) =>
    [
      `${idx + 1}. Date: ${e.date} | Class: ${e.classNumber || '-'}-${e.section || '-'} | Subject: ${e.subject || '-'} | Language: ${e.language}`,
      `   Lesson Name: ${e.lessonName}`,
      `   Topic: ${e.topic}${e.subTopic && e.subTopic !== '-' ? ` · Sub-topic: ${e.subTopic}` : ''}`,
      e.learningObjectives ? `   Objectives: ${e.learningObjectives}` : '',
      e.homeworkAssigned ? `   Homework: ${e.homeworkAssigned}` : '',
      e.dailyTeachingSummary ? `   Summary: ${e.dailyTeachingSummary}` : '',
      '',
    ]
      .filter(Boolean)
      .join('\n')
  );
  const fullText = bodyLines.join('\n');
  const hasRtlOrUnicode =
    sorted.some(
      (e) =>
        e.language === 'Urdu' ||
        (e.language === 'Kashmiri' && e.kashmiriScript === 'perso-arabic')
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
      const fontStack = '26px "Noori Nastaleeq", "Noto Nastaliq Urdu", "Noto Sans Arabic", "Plus Jakarta Sans", sans-serif';
      mCtx.font = fontStack;

      const wrapped: string[] = [];
      for (const para of fullText.split('\n')) {
        const trimmed = para.trimEnd();
        if (!trimmed) {
          wrapped.push('');
          continue;
        }
        let line = '';
        for (const word of trimmed.split(/\s+/)) {
          const candidate = line ? `${line} ${word}` : word;
          if (mCtx.measureText(candidate).width > contentW && line) {
            wrapped.push(line);
            line = word;
          } else {
            line = candidate;
          }
        }
        if (line) wrapped.push(line);
      }

      const lineH = 44;
      const firstPageLines = Math.floor((canvasH - margin * 2 - 220 - 70) / lineH);
      const nextPageLines = Math.floor((canvasH - margin * 2 - 70) / lineH);
      const pages: string[][] = [];
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
        ctx.font = fontStack;
        ctx.textAlign = 'left';
        for (const ln of lines) {
          if (ln) ctx.fillText(ln, margin, y);
          y += lineH;
        }

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
    doc.text(entry.date, margin + 2, y + 5);
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
}): Promise<{ monthCount: number; filename: string }> {
  const grouped = new Map<string, DailyTeacherDiaryEntry[]>();
  for (const entry of params.entries) {
    const monthKey = (entry.date || 'unknown').slice(0, 7);
    const bucket = grouped.get(monthKey) || [];
    bucket.push(entry);
    grouped.set(monthKey, bucket);
  }

  const zip = new JSZip();
  const sortedMonths = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));

  for (const monthKey of sortedMonths) {
    const monthEntries = grouped.get(monthKey) || [];
    const pdfBuffer = buildMonthlyDiaryPdfArrayBuffer({
      schoolName: params.schoolName,
      schoolAddress: params.schoolAddress,
      academicSession: params.academicSession,
      teacherName: params.teacherName,
      monthKey,
      entries: monthEntries,
    });
    const safeMonth = monthKey.replace(/[^0-9A-Za-z_-]/g, '_');
    zip.file(`Daily_Teachers_Diary_${safeMonth}.pdf`, pdfBuffer);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const todayStr = new Date().toISOString().slice(0, 10);
  const filename = `Daily_Teachers_Diary_All_Records_${todayStr}.zip`;
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { monthCount: sortedMonths.length, filename };
}
