export interface ScienceDiagramElement {
  type: string;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  w?: number;
  h?: number;
  r?: number;
  rx?: number;
  ry?: number;
  label?: string;
  color?: string;
  dashed?: boolean;
}

export interface ScienceNoteSection {
  heading: string;
  points: string[];
  underlinedTerms?: string[];
}

export interface ScienceFormulaItem {
  title: string;
  expression: string;
  explanation?: string;
}

export interface ScienceNoteSheet {
  title: string;
  subheading: string;
  sections: ScienceNoteSection[];
  formulas: ScienceFormulaItem[];
  diagram: {
    title: string;
    caption: string;
    elements: ScienceDiagramElement[];
  };
  keyTakeaway: string;
}

export type NotebookInkTheme = 'classic-blue' | 'exam-black' | 'dual-ink';

export interface RenderedNotebookImages {
  pngDataUrl: string;
  jpgDataUrl: string;
}

function getInkPalette(inkTheme: NotebookInkTheme) {
  if (inkTheme === 'exam-black') {
    return {
      heading: '#0F172A',
      body: '#1E293B',
      accent: '#334155',
      formula: '#0F172A',
      underline: '#475569',
      marginText: '#475569',
    };
  }
  if (inkTheme === 'dual-ink') {
    return {
      heading: '#991B1B',
      body: '#1E3A8A',
      accent: '#047857',
      formula: '#7C2D12',
      underline: '#DC2626',
      marginText: '#991B1B',
    };
  }
  return {
    heading: '#1E3A8A',
    body: '#1D4ED8',
    accent: '#0F766E',
    formula: '#1E40AF',
    underline: '#DC2626',
    marginText: '#1E3A8A',
  };
}

function drawSketchyLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth = 2.2,
  dashed = false
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dashed) ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + ((x2 - x1) * 0.008);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  dashed = false
) {
  drawSketchyLine(ctx, x1, y1, x2, y2, color, 2.4, dashed);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 13;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
  ctx.restore();
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function sanitizeInkColor(raw?: string, fallback = '#1E3A8A'): string {
  const allowed = ['#1E3A8A', '#B91C1C', '#047857', '#1F2937', '#0F766E', '#7C2D12', '#4338CA'];
  if (!raw) return fallback;
  const upper = raw.trim().toUpperCase();
  if (allowed.includes(upper)) return upper;
  if (/^#[0-9A-F]{6}$/.test(upper)) return upper;
  return fallback;
}

/**
 * Renders a high-DPI realistic handwritten Science notebook page onto an offscreen HTML5 canvas
 * and returns both PNG and JPG data URLs. Pure Canvas 2D drawing — zero HTML/SVG injection.
 */
export async function renderScienceNoteToCanvas(params: {
  subject: string;
  classLevel: string;
  pageNumber: number;
  noteSheet: ScienceNoteSheet;
  inkTheme?: NotebookInkTheme;
}): Promise<RenderedNotebookImages> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed with fallback cursive font if web fonts unavailable
    }
  }

  const W = 1240;
  const H = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to initialize canvas renderer in this browser.');
  }

  const palette = getInkPalette(params.inkTheme || 'dual-ink');
  const handFont = '"Kalam", "Caveat", "Comic Sans MS", cursive';

  // 1. Warm paper base + subtle notebook vignette
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#FDFBF4');
  bgGrad.addColorStop(0.5, '#FAF7EC');
  bgGrad.addColorStop(1, '#F5F0E1');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle paper texture speckles (deterministic so output looks crisp and organic)
  ctx.fillStyle = 'rgba(120, 105, 75, 0.035)';
  for (let i = 0; i < 650; i++) {
    const px = ((i * 197) % W);
    const py = ((i * 353) % H);
    ctx.fillRect(px, py, 2, 2);
  }

  // 2. Ruled horizontal blue notebook lines
  const topHeaderY = 148;
  const lineSpacing = 44;
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.38)';
  ctx.lineWidth = 1.4;
  for (let y = topHeaderY; y < H - 56; y += lineSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Double pink/red horizontal top margin header line
  ctx.strokeStyle = 'rgba(225, 29, 72, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, topHeaderY - 12);
  ctx.lineTo(W, topHeaderY - 12);
  ctx.moveTo(0, topHeaderY - 6);
  ctx.lineTo(W, topHeaderY - 6);
  ctx.stroke();

  // Double vertical red margin line
  const marginX = 142;
  ctx.strokeStyle = 'rgba(225, 29, 72, 0.52)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(marginX, 0);
  ctx.lineTo(marginX, H);
  ctx.moveTo(marginX + 6, 0);
  ctx.lineTo(marginX + 6, H);
  ctx.stroke();

  // Notebook binder punch holes on left edge
  for (const holeY of [260, 620, 980, 1340, 1600]) {
    ctx.save();
    ctx.fillStyle = '#E7E2D2';
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(54, holeY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 3. Notebook top header box (Subject, Class, Date, Page No.)
  ctx.fillStyle = palette.marginText;
  ctx.font = `700 24px ${handFont}`;
  ctx.fillText(`Subject: ${params.subject} (${params.classLevel})`, marginX + 24, 62);

  // Page & Date stamp box top-right
  ctx.save();
  ctx.strokeStyle = 'rgba(225, 29, 72, 0.55)';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(W - 265, 26, 225, 86);
  ctx.beginPath();
  ctx.moveTo(W - 265, 68);
  ctx.lineTo(W - 40, 68);
  ctx.stroke();
  ctx.fillStyle = '#64748B';
  ctx.font = `700 20px ${handFont}`;
  ctx.fillText(`Page No.:  ${String(params.pageNumber).padStart(2, '0')}`, W - 250, 56);
  const todayLabel = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  ctx.fillText(`Date: ${todayLabel}`, W - 250, 99);
  ctx.restore();

  // Main handwritten topic heading
  const contentX = marginX + 28;
  const contentW = W - contentX - 54;
  let cursorY = topHeaderY + 34;

  ctx.fillStyle = palette.heading;
  ctx.font = `700 38px ${handFont}`;
  const titleLines = wrapCanvasText(ctx, params.noteSheet.title || params.subject, contentW);
  for (const tLine of titleLines.slice(0, 2)) {
    ctx.fillText(tLine, contentX, cursorY);
    const titleW = Math.min(contentW, ctx.measureText(tLine).width + 16);
    drawSketchyLine(ctx, contentX, cursorY + 8, contentX + titleW, cursorY + 8, palette.underline, 2.6);
    drawSketchyLine(ctx, contentX + 4, cursorY + 14, contentX + titleW - 8, cursorY + 14, palette.underline, 1.4);
    cursorY += lineSpacing;
  }

  if (params.noteSheet.subheading) {
    ctx.fillStyle = palette.accent;
    ctx.font = `700 23px ${handFont}`;
    ctx.fillText(params.noteSheet.subheading.slice(0, 86), contentX, cursorY - 2);
    cursorY += lineSpacing;
  }

  // 4. Structured handwritten sections with underlined key terms
  const maxContentY = 1040;
  for (const section of (params.noteSheet.sections || []).slice(0, 3)) {
    if (cursorY > maxContentY) break;

    // Section heading with arrow bullet
    ctx.fillStyle = palette.heading;
    ctx.font = `700 27px ${handFont}`;
    const secHead = `▸ ${section.heading}`;
    ctx.fillText(secHead.slice(0, 72), contentX, cursorY);
    const headW = Math.min(contentW, ctx.measureText(secHead).width);
    drawSketchyLine(ctx, contentX + 24, cursorY + 6, contentX + headW, cursorY + 6, palette.heading, 1.5);
    cursorY += lineSpacing;

    const terms = (section.underlinedTerms || [])
      .map((t) => String(t || '').trim().toLowerCase())
      .filter((t) => t.length >= 3);

    ctx.font = `400 24px ${handFont}`;
    for (const point of (section.points || []).slice(0, 3)) {
      if (cursorY > maxContentY) break;
      const wrapped = wrapCanvasText(ctx, `• ${point}`, contentW - 14);
      for (let li = 0; li < wrapped.length; li++) {
        if (cursorY > maxContentY) break;
        const lineText = wrapped[li];
        const drawX = li === 0 ? contentX + 12 : contentX + 34;

        ctx.fillStyle = palette.body;
        ctx.fillText(lineText, drawX, cursorY);

        // Ink underline key scientific terms appearing on this line
        const lowerLine = lineText.toLowerCase();
        for (const term of terms) {
          const idx = lowerLine.indexOf(term);
          if (idx >= 0) {
            const prefix = lineText.slice(0, idx);
            const matched = lineText.slice(idx, idx + term.length);
            const startX = drawX + ctx.measureText(prefix).width;
            const termW = ctx.measureText(matched).width;
            drawSketchyLine(ctx, startX, cursorY + 5, startX + termW, cursorY + 5, palette.underline, 1.8);
          }
        }
        cursorY += lineSpacing;
      }
    }
  }

  // 5. Highlighted Handwritten Formula / Chemical Equation Box
  const formulas = (params.noteSheet.formulas || []).slice(0, 3);
  if (formulas.length > 0) {
    cursorY = Math.max(cursorY + 6, 860);
    const boxH = 54 + formulas.length * 56;
    const boxTop = Math.min(cursorY - 26, 1085 - boxH);

    ctx.save();
    ctx.fillStyle = 'rgba(254, 249, 195, 0.55)';
    ctx.strokeStyle = palette.underline;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([10, 5]);
    ctx.fillRect(contentX, boxTop, contentW, boxH);
    ctx.strokeRect(contentX, boxTop, contentW, boxH);
    ctx.restore();

    ctx.fillStyle = palette.underline;
    ctx.font = `700 22px ${handFont}`;
    ctx.fillText('★ Key Formulas / Equations:', contentX + 18, boxTop + 32);

    let fY = boxTop + 72;
    for (const f of formulas) {
      ctx.fillStyle = palette.formula;
      ctx.font = `700 26px ${handFont}`;
      const exprText = `${f.title ? `${f.title}: ` : ''}${f.expression}`;
      ctx.fillText(exprText.slice(0, 74), contentX + 24, fY);
      if (f.explanation) {
        ctx.fillStyle = '#475569';
        ctx.font = `400 19px ${handFont}`;
        ctx.fillText(`(${f.explanation.slice(0, 88)})`, contentX + 32, fY + 23);
      }
      fY += 56;
    }
    cursorY = boxTop + boxH + 26;
  }

  // 6. Hand-Sketched Labelled Science Diagram Box
  const diagramBoxTop = Math.max(cursorY, 1105);
  const diagramBoxH = 445;
  const diagramX = contentX;
  const diagramW = contentW;

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.strokeStyle = palette.heading;
  ctx.lineWidth = 2.2;
  ctx.fillRect(diagramX, diagramBoxTop, diagramW, diagramBoxH);
  ctx.strokeRect(diagramX, diagramBoxTop, diagramW, diagramBoxH);
  ctx.restore();

  // Diagram Title
  const diagTitle = params.noteSheet.diagram?.title || `Labelled Diagram: ${params.noteSheet.title}`;
  ctx.fillStyle = palette.heading;
  ctx.font = `700 24px ${handFont}`;
  ctx.fillText(`Fig. ${params.pageNumber}: ${diagTitle.slice(0, 68)}`, diagramX + 18, diagramBoxTop + 34);
  drawSketchyLine(ctx, diagramX + 18, diagramBoxTop + 42, diagramX + 380, diagramBoxTop + 42, palette.accent, 1.5);

  // Map normalized 520x260 diagram space into inner box
  const innerX = diagramX + 26;
  const innerY = diagramBoxTop + 56;
  const innerW = diagramW - 52;
  const innerH = diagramBoxH - 104;
  const scaleX = innerW / 520;
  const scaleY = innerH / 260;

  const elements = Array.isArray(params.noteSheet.diagram?.elements)
    ? params.noteSheet.diagram.elements
    : [];

  for (const el of elements) {
    const type = String(el.type || '').toLowerCase();
    const color = sanitizeInkColor(el.color, palette.heading);
    const ex = innerX + (Number(el.x) || 0) * scaleX;
    const ey = innerY + (Number(el.y) || 0) * scaleY;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4;
    if (el.dashed) ctx.setLineDash([7, 5]);

    if (type === 'rect') {
      const rw = Math.max(12, (Number(el.w) || 70) * scaleX);
      const rh = Math.max(12, (Number(el.h) || 40) * scaleY);
      ctx.fillStyle = `${color}16`;
      ctx.fillRect(ex, ey, rw, rh);
      ctx.strokeRect(ex, ey, rw, rh);
      if (el.label) {
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = `700 20px ${handFont}`;
        ctx.fillText(String(el.label).slice(0, 30), ex + 10, ey + rh / 2 + 7);
      }
    } else if (type === 'circle') {
      const rad = Math.max(8, (Number(el.r) || 26) * Math.min(scaleX, scaleY));
      ctx.fillStyle = `${color}16`;
      ctx.beginPath();
      ctx.arc(ex, ey, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (el.label) {
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = `700 19px ${handFont}`;
        ctx.textAlign = 'center';
        ctx.fillText(String(el.label).slice(0, 26), ex, ey + 6);
        ctx.textAlign = 'left';
      }
    } else if (type === 'ellipse') {
      const rx = Math.max(10, (Number(el.rx) || 42) * scaleX);
      const ry = Math.max(10, (Number(el.ry) || 26) * scaleY);
      ctx.fillStyle = `${color}16`;
      ctx.beginPath();
      ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (el.label) {
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = `700 19px ${handFont}`;
        ctx.textAlign = 'center';
        ctx.fillText(String(el.label).slice(0, 26), ex, ey + 6);
        ctx.textAlign = 'left';
      }
    } else if (type === 'line') {
      const ex2 = innerX + (Number(el.x2) || (Number(el.x) || 0) + 60) * scaleX;
      const ey2 = innerY + (Number(el.y2) || (Number(el.y) || 0)) * scaleY;
      drawSketchyLine(ctx, ex, ey, ex2, ey2, color, 2.3, Boolean(el.dashed));
      if (el.label) {
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = `700 18px ${handFont}`;
        ctx.fillText(String(el.label).slice(0, 28), (ex + ex2) / 2 + 6, (ey + ey2) / 2 - 8);
      }
    } else if (type === 'arrow') {
      const ex2 = innerX + (Number(el.x2) || (Number(el.x) || 0) + 65) * scaleX;
      const ey2 = innerY + (Number(el.y2) || (Number(el.y) || 0)) * scaleY;
      drawArrow(ctx, ex, ey, ex2, ey2, color, Boolean(el.dashed));
      if (el.label) {
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = `700 18px ${handFont}`;
        ctx.fillText(String(el.label).slice(0, 28), (ex + ex2) / 2 + 6, (ey + ey2) / 2 - 8);
      }
    } else if (type === 'text' && el.label) {
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = `700 20px ${handFont}`;
      ctx.fillText(String(el.label).slice(0, 40), ex, ey);
    }
    ctx.restore();
  }

  // Diagram Caption
  const captionText = params.noteSheet.diagram?.caption || `Diagrammatic representation of ${params.noteSheet.title}`;
  ctx.fillStyle = '#475569';
  ctx.font = `400 19px ${handFont}`;
  ctx.fillText(`Note: ${captionText.slice(0, 92)}`, diagramX + 18, diagramBoxTop + diagramBoxH - 16);

  // 7. Key Takeaway Footer Line
  if (params.noteSheet.keyTakeaway) {
    const takeawayY = diagramBoxTop + diagramBoxH + 42;
    ctx.fillStyle = palette.accent;
    ctx.font = `700 23px ${handFont}`;
    const takeawayWrapped = wrapCanvasText(ctx, `✓ Quick Summary: ${params.noteSheet.keyTakeaway}`, contentW);
    takeawayWrapped.slice(0, 2).forEach((line, idx) => {
      ctx.fillText(line, contentX, takeawayY + idx * 34);
    });
  }

  // Subtle academic verification footer
  ctx.fillStyle = '#64748B';
  ctx.font = '500 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    'AI Teaching & Learning Studio · Science Notebook Creator — Verify formulas & labels against your prescribed textbook.',
    contentX,
    H - 28
  );

  return {
    pngDataUrl: canvas.toDataURL('image/png'),
    jpgDataUrl: canvas.toDataURL('image/jpeg', 0.94),
  };
}
