import { SchoolProfile } from '../types';
import { guardSensitiveExport } from './biometricProtection';

export interface BrandedDocumentSection {
  heading: string;
  body: string;
}

export interface BrandedDocumentOptions {
  school: SchoolProfile;
  documentType: string; // e.g., "DAILY TEACHER'S DIARY", "LESSON PLAN", "T1 EXAMINATION QUESTION PAPER"
  title: string;
  teacherName?: string;
  className?: string;
  section?: string;
  subject?: string;
  date?: string;
  examName?: string;
  maxMarks?: string | number;
  timeAllowed?: string;
  isRtl?: boolean;
  sections?: BrandedDocumentSection[];
  bodyText?: string;
  filenameBase: string;
}

function buildSchoolAddressLine(school: SchoolProfile): string {
  const parts = [
    school.address,
    school.villageTown,
    school.blockTehsil,
    school.district,
    school.state,
    school.pinCode ? `PIN: ${school.pinCode}` : '',
  ]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  // Deduplicate repeated segments
  const unique: string[] = [];
  for (const part of parts) {
    if (!unique.some((u) => u.toLowerCase().includes(part.toLowerCase()))) {
      unique.push(part);
    }
  }
  return unique.join(', ');
}

function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src || (!src.startsWith('data:image/') && !src.startsWith('https://') && !src.startsWith('http://') && !src.startsWith('/'))) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = String(text || '').split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    const trimmed = para.trimEnd();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/**
 * Renders a branded school record onto one or more high-DPI A4 canvases (1240 x 1754)
 * featuring the registered School Logo, School Name, Address, Affiliation/U-DISE,
 * Academic Session, Teacher/Class/Subject metadata, and crisp structured sections.
 */
async function renderBrandedDocumentPages(
  options: BrandedDocumentOptions
): Promise<HTMLCanvasElement[]> {
  const W = 1240;
  const H = 1754;
  const PAD = 72;
  const CONTENT_W = W - PAD * 2;
  const FOOTER_H = 74;

  const logoImg = options.school.logoDataUrl
    ? await loadImageSafe(options.school.logoDataUrl)
    : null;

  const schoolName = options.school.name || '';
  const schoolAddress = buildSchoolAddressLine(options.school);
  const schoolCode = options.school.code || '';
  const schoolSession = options.school.academicSession || '';
  const schoolContact = [options.school.contactNumber, options.school.email]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join('  |  ');

  // Build normalized blocks
  const blocks: Array<{ kind: 'heading' | 'line' | 'spacer'; text: string }> = [];
  if (options.sections && options.sections.length > 0) {
    for (const sec of options.sections) {
      if (!sec.body?.trim()) continue;
      blocks.push({ kind: 'heading', text: sec.heading });
      const rawLines = sec.body.split('\n');
      for (const l of rawLines) {
        blocks.push({ kind: 'line', text: l });
      }
      blocks.push({ kind: 'spacer', text: '' });
    }
  } else if (options.bodyText) {
    for (const l of options.bodyText.split('\n')) {
      const isHeading =
        /^(SECTION\s+[A-Z0-9]|PART\s+[A-Z0-9]|Q\d+\.|#{1,3}\s|\d+\.\s+[A-Z])/i.test(l.trim()) &&
        l.trim().length < 95;
      blocks.push({ kind: isHeading ? 'heading' : 'line', text: l.replace(/^#{1,3}\s+/, '') });
    }
  }

  const pages: HTMLCanvasElement[] = [];

  const createPage = (pageNum: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; startY: number } => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Clean white sheet
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // Subtle official border frame
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 36, W - 72, H - 72);

    let y = 58;

    if (pageNum === 1) {
      // Official Branded School Header Band
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(36, 36, W - 72, 198);

      // Gold accent bar
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(36, 234, W - 72, 6);

      // School Logo box (auto-fetched from School Profile)
      let textLeft = PAD;
      if (logoImg) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(PAD, 66, 128, 128, 16);
        ctx.fill();
        const aspect = logoImg.width / Math.max(1, logoImg.height);
        let drawW = 110;
        let drawH = 110;
        if (aspect > 1) drawH = 110 / aspect;
        else drawW = 110 * aspect;
        ctx.drawImage(
          logoImg,
          PAD + (128 - drawW) / 2,
          66 + (128 - drawH) / 2,
          drawW,
          drawH
        );
        textLeft = PAD + 152;
      }

      const headerMaxW = W - PAD - textLeft;
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';

      // Document Type Pill Label
      ctx.fillStyle = '#FCD34D';
      ctx.font = 'bold 20px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText(options.documentType.toUpperCase(), textLeft, 90);

      // School Name (never invented)
      if (schoolName) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 32px "Plus Jakarta Sans", Arial, sans-serif';
        const nameLines = wrapCanvasText(ctx, schoolName, headerMaxW).slice(0, 2);
        let ny = 130;
        for (const nl of nameLines) {
          ctx.fillText(nl, textLeft, ny);
          ny += 36;
        }
      }

      // School Address & Code & Contact
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '500 18px "Plus Jakarta Sans", Arial, sans-serif';
      const metaLine1 = [schoolAddress, schoolCode ? `U-DISE / Recognition: ${schoolCode}` : '']
        .filter(Boolean)
        .join('  •  ');
      if (metaLine1) {
        const ml = wrapCanvasText(ctx, metaLine1, headerMaxW)[0] || '';
        ctx.fillText(ml, textLeft, 192);
      }
      if (schoolContact) {
        ctx.fillStyle = '#94A3B8';
        ctx.font = '500 16px "Plus Jakarta Sans", Arial, sans-serif';
        ctx.fillText(schoolContact.slice(0, 95), textLeft, 218);
      }

      y = 268;

      // Structured Metadata Grid (Academic Session, Teacher, Class/Section, Subject, Date, Exam Marks/Time)
      const metaEntries: Array<[string, string]> = [];
      if (options.examName) metaEntries.push(['Examination', options.examName]);
      if (schoolSession) metaEntries.push(['Academic Session', schoolSession]);
      if (options.className) {
        metaEntries.push([
          'Class / Section',
          options.section ? `${options.className} - ${options.section}` : options.className,
        ]);
      }
      if (options.subject) metaEntries.push(['Subject', options.subject]);
      if (options.teacherName) metaEntries.push(['Teacher', options.teacherName]);
      if (options.date) metaEntries.push(['Date', options.date]);
      if (options.maxMarks !== undefined && options.maxMarks !== '') {
        metaEntries.push(['Maximum Marks', String(options.maxMarks)]);
      }
      if (options.timeAllowed) metaEntries.push(['Time Allowed', options.timeAllowed]);

      const cols = 2;
      const rowsCount = Math.ceil(metaEntries.length / cols);
      const boxH = Math.max(66, rowsCount * 36 + 26);

      ctx.fillStyle = '#F8FAFC';
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(PAD, y, CONTENT_W, boxH, 12);
      ctx.fill();
      ctx.stroke();

      const colW = CONTENT_W / cols;
      metaEntries.forEach(([label, val], idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const mx = PAD + 18 + col * colW;
        const my = y + 32 + row * 34;
        ctx.fillStyle = '#64748B';
        ctx.font = '700 17px "Plus Jakarta Sans", Arial, sans-serif';
        ctx.fillText(`${label}: `, mx, my);
        const lw = ctx.measureText(`${label}: `).width;
        ctx.fillStyle = '#0F172A';
        ctx.font = '700 18px "Plus Jakarta Sans", Arial, sans-serif';
        ctx.fillText(val.slice(0, 42), mx + lw, my);
      });

      y += boxH + 26;

      // Document Title Banner
      ctx.fillStyle = '#1E1B4B';
      ctx.font = '800 26px "Plus Jakarta Sans", Arial, sans-serif';
      const titleLines = wrapCanvasText(ctx, options.title, CONTENT_W);
      for (const tl of titleLines) {
        ctx.fillText(tl, PAD, y);
        y += 34;
      }
      ctx.strokeStyle = '#6366F1';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(PAD, y - 6);
      ctx.lineTo(PAD + 140, y - 6);
      ctx.stroke();
      y += 22;
    } else {
      // Continuation page compact header
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(36, 36, W - 72, 64);
      ctx.fillStyle = '#334155';
      ctx.font = '700 18px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${schoolName || 'School Record'}  •  ${options.title.slice(0, 60)}`,
        PAD,
        75
      );
      y = 132;
    }

    pages.push(canvas);
    return { canvas, ctx, startY: y };
  };

  let pageNum = 1;
  let { ctx, startY: y } = createPage(pageNum);
  const maxY = H - FOOTER_H - 36;
  const isRtl = Boolean(options.isRtl);

  for (const blk of blocks) {
    if (blk.kind === 'spacer') {
      y += 12;
      continue;
    }

    if (blk.kind === 'heading') {
      ctx.font = isRtl
        ? '700 24px "Noto Nastaliq Urdu", "Noto Sans Arabic", Arial, sans-serif'
        : '800 21px "Plus Jakarta Sans", Arial, sans-serif';
      const wrapped = wrapCanvasText(ctx, blk.text, CONTENT_W);
      const neededH = wrapped.length * 32 + 16;
      if (y + neededH > maxY) {
        pageNum += 1;
        ({ ctx, startY: y } = createPage(pageNum));
      }
      ctx.fillStyle = '#EEF2FF';
      ctx.beginPath();
      ctx.roundRect(PAD, y - 22, CONTENT_W, wrapped.length * 30 + 12, 8);
      ctx.fill();

      ctx.fillStyle = '#312E81';
      ctx.direction = isRtl ? 'rtl' : 'ltr';
      ctx.textAlign = isRtl ? 'right' : 'left';
      for (const line of wrapped) {
        ctx.fillText(line, isRtl ? W - PAD - 12 : PAD + 12, y + 4);
        y += 30;
      }
      y += 14;
    } else {
      ctx.font = isRtl
        ? '500 22px "Noto Nastaliq Urdu", "Noto Sans Arabic", Arial, sans-serif'
        : '400 19px "Plus Jakarta Sans", Arial, sans-serif';
      const lineStep = isRtl ? 38 : 29;
      const wrapped = wrapCanvasText(ctx, blk.text, CONTENT_W - 12);
      for (const line of wrapped) {
        if (y + lineStep > maxY) {
          pageNum += 1;
          ({ ctx, startY: y } = createPage(pageNum));
          ctx.font = isRtl
            ? '500 22px "Noto Nastaliq Urdu", "Noto Sans Arabic", Arial, sans-serif'
            : '400 19px "Plus Jakarta Sans", Arial, sans-serif';
        }
        ctx.fillStyle = '#1E293B';
        ctx.direction = isRtl ? 'rtl' : 'ltr';
        ctx.textAlign = isRtl ? 'right' : 'left';
        ctx.fillText(line, isRtl ? W - PAD - 6 : PAD + 6, y);
        y += lineStep;
      }
    }
  }

  // Stamp official footer on every page
  pages.forEach((canvas, idx) => {
    const fCtx = canvas.getContext('2d')!;
    fCtx.direction = 'ltr';
    fCtx.strokeStyle = '#E2E8F0';
    fCtx.lineWidth = 1.5;
    fCtx.beginPath();
    fCtx.moveTo(PAD, H - 82);
    fCtx.lineTo(W - PAD, H - 82);
    fCtx.stroke();

    fCtx.fillStyle = '#64748B';
    fCtx.font = '600 15px "Plus Jakarta Sans", Arial, sans-serif';
    fCtx.textAlign = 'left';
    const footerLeft = [
      schoolName,
      schoolSession ? `Session ${schoolSession}` : '',
      options.teacherName ? `Prepared by: ${options.teacherName}` : '',
    ]
      .filter(Boolean)
      .join('  •  ');
    fCtx.fillText(footerLeft.slice(0, 95), PAD, H - 52);

    fCtx.textAlign = 'right';
    fCtx.fillText(`Page ${idx + 1} of ${pages.length}`, W - PAD, H - 52);
  });

  return pages;
}

/**
 * Exports a branded school document as high-DPI JPEG image(s) (.jpg),
 * embedding the registered School Logo, School Name, Address, Academic Session, and metadata.
 */
export async function exportBrandedSchoolJpeg(
  options: BrandedDocumentOptions
): Promise<{ exported: boolean; pageCount: number }> {
  const allowed = await guardSensitiveExport(`JPEG Export: ${options.title}`);
  if (!allowed) return { exported: false, pageCount: 0 };

  const canvases = await renderBrandedDocumentPages(options);
  const slug =
    options.filenameBase
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'school_document';

  canvases.forEach((canvas, idx) => {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download =
      canvases.length === 1 ? `${slug}.jpg` : `${slug}_page_${idx + 1}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  return { exported: true, pageCount: canvases.length };
}

/**
 * Exports a branded school document as a print-ready A4 PDF (.pdf)
 * embedding the registered School Logo, School Name, Address, Academic Session, and metadata.
 */
export async function exportBrandedSchoolPdf(
  options: BrandedDocumentOptions
): Promise<{ exported: boolean; pageCount: number }> {
  const allowed = await guardSensitiveExport(`PDF Export: ${options.title}`);
  if (!allowed) return { exported: false, pageCount: 0 };

  const canvases = await renderBrandedDocumentPages(options);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  canvases.forEach((canvas, idx) => {
    if (idx > 0) doc.addPage();
    doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageW, pageH);
  });

  const slug =
    options.filenameBase
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'school_document';

  doc.save(`${slug}.pdf`);
  return { exported: true, pageCount: canvases.length };
}
