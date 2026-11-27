import type { jsPDF as JsPdfType } from 'jspdf';
import { LESSON_SECTIONS, OutputLang, StructuredLessonPlan } from '../types/lessonPlan';

export interface LessonPlanPdfParams {
  schoolName: string;
  schoolCode?: string;
  teacherName: string;
  subject: string;
  classLevel: string;
  chapter?: string;
  topic?: string;
  duration: string;
  language: OutputLang;
  isRtl: boolean;
  plan: StructuredLessonPlan;
  generatedDate?: string;
}

export interface GeneratedLessonPlanPdfPayload {
  fileName: string;
  blob: Blob;
  file: File;
  base64: string;
}

export function lessonPlanToPlainText(plan: StructuredLessonPlan): string {
  return [
    plan.title,
    '',
    ...LESSON_SECTIONS.flatMap(({ key, label }) => [label, plan[key] || '—', '']),
  ].join('\n');
}

export function buildLessonPlanPdfFileName(
  title: string,
  subject: string,
  classLevel: string
): string {
  const base = `${subject}_${classLevel}_${title || 'lesson_plan'}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `Lesson_Plan_${base || 'structured'}.pdf`;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const result: string[] = [];
  const paragraphs = (text || '—').split('\n');
  for (const para of paragraphs) {
    const trimmed = para.trimEnd();
    if (!trimmed) {
      result.push('');
      continue;
    }
    let line = '';
    for (const word of trimmed.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        result.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) result.push(line);
  }
  return result.length > 0 ? result : ['—'];
}

/**
 * Renders structured multi-page A4 PDF for RTL / non-Latin scripts (Urdu / Kashmiri)
 * matching the exact institutional header, metadata table, and 13 structured fields.
 */
function renderStructuredMultilingualPdf(
  doc: JsPdfType,
  params: LessonPlanPdfParams,
  formattedDate: string
): void {
  const canvasW = 1240;
  const canvasH = 1754;
  const margin = 72;
  const contentW = canvasW - margin * 2;
  const footerReserve = 76;

  const bodyFont = params.isRtl
    ? '27px "Noori Nastaleeq", "Noto Nastaliq Urdu", "Noto Sans Arabic", serif'
    : '24px "Plus Jakarta Sans", "Noto Sans Devanagari", sans-serif';
  const bodyLineH = params.isRtl ? 46 : 36;

  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = canvasW;
  measureCanvas.height = 100;
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) return;
  measureCtx.font = bodyFont;

  const sectionBlocks = LESSON_SECTIONS.map(({ key, label }) => ({
    label,
    lines: wrapCanvasText(measureCtx, params.plan[key] || '—', contentW - 44),
  }));

  const pageCanvases: HTMLCanvasElement[] = [];

  const createPage = (isFirst: boolean): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; y: number } => {
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasW, canvasH);
    pageCanvases.push(canvas);

    let y = margin;
    if (isFirst) {
      // Institutional Banner
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(margin, y, contentW, 168);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.direction = 'ltr';
      ctx.fillText(params.schoolName.slice(0, 56), margin + 28, y + 52);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '20px "Plus Jakarta Sans", sans-serif';
      const subLine = params.schoolCode
        ? `STRUCTURED LESSON PLAN · School Code: ${params.schoolCode}`
        : 'STRUCTURED LESSON PLAN';
      ctx.fillText(subLine, margin + 28, y + 88);

      ctx.fillStyle = '#FDE68A';
      ctx.font = 'bold 26px "Plus Jakarta Sans", "Noto Sans Arabic", sans-serif';
      ctx.fillText((params.plan.title || 'Structured Lesson Plan').slice(0, 72), margin + 28, y + 136);
      y += 186;

      // Structured Metadata Grid (2 rows x 4 cells)
      const metaCells = [
        ['Subject', params.subject],
        ['Class / Grade', params.classLevel],
        ['Duration', params.duration],
        ['Language', params.language],
        ['Topic', params.topic || params.plan.title || '—'],
        ['Chapter', params.chapter || '—'],
        ['Teacher', params.teacherName || '—'],
        ['Date', formattedDate],
      ];
      const cellW = contentW / 4;
      const cellH = 66;
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;

      metaCells.forEach(([k, v], idx) => {
        const col = idx % 4;
        const row = Math.floor(idx / 4);
        const cx = margin + col * cellW;
        const cy = y + row * cellH;
        ctx.fillStyle = row === 0 ? '#F8FAFC' : '#FFFFFF';
        ctx.fillRect(cx, cy, cellW, cellH);
        ctx.strokeRect(cx, cy, cellW, cellH);

        ctx.fillStyle = '#64748B';
        ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.direction = 'ltr';
        ctx.fillText(k, cx + 12, cy + 24);

        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 19px "Plus Jakarta Sans", "Noto Sans Arabic", sans-serif';
        ctx.fillText((v || '—').slice(0, 22), cx + 12, cy + 50);
      });
      y += cellH * 2 + 26;
    }

    return { canvas, ctx, y };
  };

  let current = createPage(true);

  for (const block of sectionBlocks) {
    const headerH = 48;
    const minNeeded = headerH + bodyLineH + 34;
    if (current.y + minNeeded > canvasH - footerReserve) {
      current = createPage(false);
    }

    // Section Header Strip
    current.ctx.fillStyle = '#EEF2FF';
    current.ctx.fillRect(margin, current.y, contentW, headerH);
    current.ctx.strokeStyle = '#C7D2FE';
    current.ctx.lineWidth = 1.5;
    current.ctx.strokeRect(margin, current.y, contentW, headerH);

    current.ctx.fillStyle = '#1E1B4B';
    current.ctx.font = 'bold 23px "Plus Jakarta Sans", sans-serif';
    current.ctx.textAlign = 'left';
    current.ctx.direction = 'ltr';
    current.ctx.fillText(block.label, margin + 20, current.y + 32);
    current.y += headerH;

    // Draw lines inside structured box (paginating cleanly if a single section spans pages)
    let boxStartY = current.y;
    current.y += 38;

    const flushBoxBorder = (ctx: CanvasRenderingContext2D, topY: number, bottomY: number) => {
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(margin, topY, contentW, Math.max(24, bottomY - topY));
    };

    for (const line of block.lines) {
      if (current.y + bodyLineH > canvasH - footerReserve) {
        flushBoxBorder(current.ctx, boxStartY, current.y);
        current = createPage(false);
        boxStartY = current.y;
        current.y += 38;
      }
      current.ctx.fillStyle = '#1E293B';
      current.ctx.font = bodyFont;
      current.ctx.direction = params.isRtl ? 'rtl' : 'ltr';
      current.ctx.textAlign = params.isRtl ? 'right' : 'left';
      const drawX = params.isRtl ? canvasW - margin - 22 : margin + 22;
      if (line) {
        current.ctx.fillText(line, drawX, current.y);
      }
      current.y += bodyLineH;
    }

    flushBoxBorder(current.ctx, boxStartY, current.y + 8);
    current.y += 26;
  }

  // Paint page footers & commit pages to jsPDF
  const totalPages = pageCanvases.length;
  pageCanvases.forEach((canvas, idx) => {
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(margin, canvasH - 58);
    ctx.lineTo(canvasW - margin, canvasH - 58);
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = '18px "Plus Jakarta Sans", sans-serif';
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillText(`${params.schoolName} · Structured Lesson Plan`, margin, canvasH - 30);
    ctx.textAlign = 'right';
    ctx.fillText(`Page ${idx + 1} of ${totalPages}`, canvasW - margin, canvasH - 30);

    if (idx > 0) doc.addPage();
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
  });
}

/**
 * Builds a complete, structured A4 jsPDF document matching all 13 lesson plan fields
 * (Objectives, Outcomes, Previous Knowledge, TLM, Introduction, Presentation, Activities,
 * Methodology, Blackboard Work, Assessment, Homework, Conclusion).
 */
export async function buildLessonPlanPdfDocument(
  params: LessonPlanPdfParams
): Promise<{ doc: JsPdfType; fileName: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const formattedDate =
    params.generatedDate ||
    new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const bodyText = lessonPlanToPlainText(params.plan);
  const hasNonLatin = /[\u0600-\u06FF\u0900-\u097F]/.test(
    `${bodyText} ${params.topic || ''} ${params.chapter || ''}`
  );

  if (params.isRtl || hasNonLatin) {
    renderStructuredMultilingualPdf(doc, params, formattedDate);
  } else {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 13;
    const maxW = pageW - margin * 2;
    const footerLimit = pageH - 18;

    // 1. Institutional Header Banner
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, 11, maxW, 25, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(params.schoolName.slice(0, 68), margin + 4, 18.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const subtitle = params.schoolCode
      ? `STRUCTURED LESSON PLAN  |  School Code: ${params.schoolCode}`
      : 'STRUCTURED LESSON PLAN';
    doc.text(subtitle, margin + 4, 24);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(253, 230, 138);
    doc.text((params.plan.title || 'Structured Lesson Plan').slice(0, 86), margin + 4, 31.5);

    // 2. Structured Metadata Table (2 rows x 4 columns)
    let y = 39;
    const metaCells: Array<[string, string]> = [
      ['Subject', params.subject || '—'],
      ['Class / Grade', params.classLevel || '—'],
      ['Duration', params.duration || '—'],
      ['Language', params.language || 'English'],
      ['Topic', params.topic || params.plan.title || '—'],
      ['Chapter', params.chapter || '—'],
      ['Teacher', params.teacherName || '—'],
      ['Date', formattedDate],
    ];
    const colW = maxW / 4;
    const rowH = 11.5;

    metaCells.forEach(([label, value], index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const cx = margin + col * colW;
      const cy = y + row * rowH;

      doc.setFillColor(row === 0 ? 248 : 255, row === 0 ? 250 : 255, row === 0 ? 252 : 255);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      doc.rect(cx, cy, colW, rowH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), cx + 2.2, cy + 4);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.3);
      doc.setTextColor(15, 23, 42);
      const clipped = doc.splitTextToSize(value, colW - 4.4)[0] || '—';
      doc.text(clipped, cx + 2.2, cy + 9);
    });

    y += rowH * 2 + 6;

    // 3. All 13 Structured Lesson Plan Sections
    const lineH = 4.6;
    const headerH = 6.8;

    LESSON_SECTIONS.forEach(({ key, label }) => {
      const contentStr = (params.plan[key] || '—').trim() || '—';
      const wrappedLines = doc.splitTextToSize(contentStr, maxW - 6) as string[];

      // Prevent orphaned section header at page bottom
      if (y + headerH + lineH * 2 + 4 > footerLimit) {
        doc.addPage();
        y = 16;
      }

      // Section Header Band
      doc.setFillColor(238, 242, 255);
      doc.setDrawColor(199, 210, 254);
      doc.setLineWidth(0.25);
      doc.rect(margin, y, maxW, headerH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      doc.setTextColor(30, 27, 75);
      doc.text(label, margin + 3, y + 4.7);
      y += headerH;

      // Render section lines inside clean bordered box with automatic page breaks
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(51, 65, 85);

      let boxTop = y;
      let cursorY = y + 4.8;

      wrappedLines.forEach((line, lineIdx) => {
        if (cursorY > footerLimit - 2) {
          // Close box on current page
          doc.setDrawColor(226, 232, 240);
          doc.rect(margin, boxTop, maxW, cursorY - boxTop - 2, 'S');
          doc.addPage();
          boxTop = 16;
          cursorY = boxTop + 4.8;
        }
        doc.text(line, margin + 3, cursorY);
        cursorY += lineH;

        if (lineIdx === wrappedLines.length - 1) {
          const boxBottom = cursorY - 1.5;
          doc.setDrawColor(226, 232, 240);
          doc.rect(margin, boxTop, maxW, Math.max(7.5, boxBottom - boxTop), 'S');
          y = boxBottom + 3.5;
        }
      });
    });

    // 4. Consistent Footer on Every Page
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(margin, pageH - 12, pageW - margin, pageH - 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `${params.schoolName.slice(0, 52)}  ·  ${params.subject} (${params.classLevel})`,
        margin,
        pageH - 7.5
      );
      doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 7.5, { align: 'right' });
    }
  }

  const fileName = buildLessonPlanPdfFileName(
    params.plan.title || params.topic || 'lesson_plan',
    params.subject,
    params.classLevel
  );
  return { doc, fileName };
}

export async function exportLessonPlanPdf(
  params: LessonPlanPdfParams
): Promise<{ fileName: string }> {
  const { doc, fileName } = await buildLessonPlanPdfDocument(params);
  doc.save(fileName);
  return { fileName };
}

export async function createLessonPlanPdfPayload(
  params: LessonPlanPdfParams
): Promise<GeneratedLessonPlanPdfPayload> {
  const { doc, fileName } = await buildLessonPlanPdfDocument(params);
  const blob = doc.output('blob');
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.includes('base64,') ? dataUri.split('base64,')[1] : dataUri;
  return { fileName, blob, file, base64 };
}
