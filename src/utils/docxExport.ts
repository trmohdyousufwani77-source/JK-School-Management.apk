import JSZip from 'jszip';
import { guardSensitiveExport } from './biometricProtection';

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildParagraphXml(text: string, options?: { bold?: boolean; sizeHalfPt?: number; colorHex?: string; spacingAfter?: number }): string {
  const safeText = escapeXml(text);
  const runProps: string[] = [];
  if (options?.bold) runProps.push('<w:b/>');
  if (options?.sizeHalfPt) {
    runProps.push(`<w:sz w:val="${options.sizeHalfPt}"/><w:szCs w:val="${options.sizeHalfPt}"/>`);
  }
  if (options?.colorHex) {
    runProps.push(`<w:color w:val="${options.colorHex}"/>`);
  }
  const rPr = runProps.length > 0 ? `<w:rPr>${runProps.join('')}</w:rPr>` : '';
  const spacingAfter = options?.spacingAfter ?? 120;
  return `<w:p><w:pPr><w:spacing w:after="${spacingAfter}" w:line="276" w:lineRule="auto"/></w:pPr><w:r>${rPr}<w:t xml:space="preserve">${safeText}</w:t></w:r></w:p>`;
}

export interface DocxExportOptions {
  title: string;
  subtitle?: string;
  schoolName?: string;
  bodyText: string;
  filename: string;
  skipBiometricGuard?: boolean;
}

/**
 * Generates an authentic Microsoft Word (.docx) OOXML package client-side using JSZip.
 * Preserves headings, bullet points, paragraphs, math symbols, and UTF-8 scientific notations.
 */
export async function exportTextToDocx(options: DocxExportOptions): Promise<boolean> {
  if (!options.skipBiometricGuard) {
    const allowed = await guardSensitiveExport(`Export Word Document (${options.filename})`);
    if (!allowed) return false;
  }

  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  const paragraphs: string[] = [];

  if (options.schoolName) {
    paragraphs.push(
      buildParagraphXml(options.schoolName, {
        bold: true,
        sizeHalfPt: 22,
        colorHex: '4F46E5',
        spacingAfter: 60,
      })
    );
  }

  paragraphs.push(
    buildParagraphXml(options.title || 'AI Teaching & Learning Studio Document', {
      bold: true,
      sizeHalfPt: 32,
      colorHex: '0F172A',
      spacingAfter: 80,
    })
  );

  if (options.subtitle) {
    paragraphs.push(
      buildParagraphXml(options.subtitle, {
        sizeHalfPt: 20,
        colorHex: '475569',
        spacingAfter: 200,
      })
    );
  }

  const rawLines = String(options.bodyText || '').split(/\r?\n/);
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      paragraphs.push('<w:p/>');
      continue;
    }
    const isHeading =
      /^#{1,3}\s+/.test(trimmed) ||
      /^(Section|Part|Unit|Chapter|Topic|Objective|Formula|Question Paper|Answer Key)/i.test(trimmed) ||
      (/^[A-Z0-9\s:&\-]{4,60}$/.test(trimmed) && /[A-Z]/.test(trimmed));

    const cleanLine = trimmed.replace(/^#{1,3}\s+/, '');
    if (isHeading) {
      paragraphs.push(
        buildParagraphXml(cleanLine, {
          bold: true,
          sizeHalfPt: 24,
          colorHex: '1E293B',
          spacingAfter: 100,
        })
      );
    } else {
      paragraphs.push(
        buildParagraphXml(rawLine, {
          sizeHalfPt: 22,
          colorHex: '1E293B',
          spacingAfter: 100,
        })
      );
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  zip.file('word/document.xml', documentXml);

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const safeFilename = options.filename.toLowerCase().endsWith('.docx')
    ? options.filename
    : `${options.filename}.docx`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename.replace(/[^a-zA-Z0-9._-]+/g, '_');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}
