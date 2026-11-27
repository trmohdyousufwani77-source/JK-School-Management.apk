import { jsPDF } from 'jspdf';
import { AttendanceRecord, SchoolProfile, Student } from '../types';
import {
  deduplicateStudentsByAdmissionNumber,
  formatSchoolAddressOnce,
} from './calculations';

export interface ScanHistoryPdfClassBreakdown {
  label: string;
  scanned: number;
  total: number;
}

export interface ScanHistoryPdfEntry {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  classLabel: string;
  rollNumber: string | number;
  scannedAt: string;
  timestampMs: number;
  sourceLabel: string;
  isSynced: boolean;
  photoDataUrl?: string;
}

export interface ScanHistoryPdfExportParams {
  school: SchoolProfile;
  selectedDate: string;
  preparedBy: string;
  totalScannedToday: number;
  classBreakdown: ScanHistoryPdfClassBreakdown[];
  entries: ScanHistoryPdfEntry[];
  activeClassFilter?: string;
  pendingCount?: number;
}

export interface ScanHistoryPdfExportResult {
  fileName: string;
  exportedEntries: number;
  totalScannedToday: number;
}

/**
 * Builds the daily scan summary (total count + per-class breakdown) and chronological
 * scan history entries with live profile photographs fetched from the central student roster.
 */
export function buildDailyScanSummaryAndEntries(
  attendanceRecords: AttendanceRecord[],
  students: Student[],
  selectedDate: string,
  activeClassFilter = 'ALL'
): {
  totalScannedToday: number;
  pendingCount: number;
  classBreakdown: ScanHistoryPdfClassBreakdown[];
  entries: ScanHistoryPdfEntry[];
} {
  const activeStudents = deduplicateStudentsByAdmissionNumber(students).filter(
    (s) => s.status === 'Active'
  );
  const studentById = new Map(activeStudents.map((s) => [s.id, s]));

  const classTotals = new Map<string, number>();
  activeStudents.forEach((st) => {
    const key = `${st.classNumber}-${st.section}`;
    classTotals.set(key, (classTotals.get(key) || 0) + 1);
  });

  const combinedByStudent = new Map<string, ScanHistoryPdfEntry>();
  const classBreakdownMap = new Map<string, ScanHistoryPdfClassBreakdown>();

  attendanceRecords.forEach((rec) => {
    if (rec.date !== selectedDate || rec.status !== 'Present') return;
    const remarkLower = (rec.remarks || '').toLowerCase();
    const isQrOrOverride =
      remarkLower.includes('qr') ||
      remarkLower.includes('scan') ||
      remarkLower.includes('manual override');
    if (!isQrOrOverride) return;

    const st = studentById.get(rec.studentId);
    const clsNum = st?.classNumber || rec.classNumber || 'Unassigned';
    const sec = st?.section || rec.section || 'A';
    const classKey = `${clsNum}-${sec}`;
    const classLabel = `Class ${classKey}`;

    const parsedMs = rec.markedAt ? Date.parse(rec.markedAt) : 0;
    const tsMs = Number.isFinite(parsedMs) && parsedMs > 0 ? parsedMs : Date.now();
    const formattedTime = new Date(tsMs).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const existing = combinedByStudent.get(rec.studentId);
    if (!existing || tsMs >= existing.timestampMs) {
      combinedByStudent.set(rec.studentId, {
        studentId: rec.studentId,
        studentName: st?.fullName || `Student ${rec.studentId}`,
        admissionNumber: st?.admissionNumber || rec.studentId,
        classLabel,
        rollNumber: st?.rollNumber ?? '—',
        scannedAt: formattedTime,
        timestampMs: tsMs,
        sourceLabel: remarkLower.includes('manual override') ? 'Manual Override' : 'QR Scan',
        isSynced: rec.isOfflineSynced !== false,
        photoDataUrl: st?.photoDataUrl,
      });
    }
  });

  combinedByStudent.forEach((entry) => {
    const rawKey = entry.classLabel.replace(/^Class\s+/i, '');
    const current = classBreakdownMap.get(entry.classLabel) || {
      label: entry.classLabel,
      scanned: 0,
      total: classTotals.get(rawKey) || 0,
    };
    current.scanned += 1;
    classBreakdownMap.set(entry.classLabel, current);
  });

  const classBreakdown = Array.from(classBreakdownMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );

  const allEntries = Array.from(combinedByStudent.values()).sort(
    (a, b) => b.timestampMs - a.timestampMs
  );

  const entries =
    activeClassFilter && activeClassFilter !== 'ALL'
      ? allEntries.filter((e) => e.classLabel === activeClassFilter)
      : allEntries;

  const pendingCount = attendanceRecords.filter((rec) => rec.isOfflineSynced === false).length;

  return {
    totalScannedToday: allEntries.length,
    pendingCount,
    classBreakdown,
    entries,
  };
}

function getSafeImageFormat(dataUrl?: string): 'JPEG' | 'PNG' | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  return null;
}

function getInitials(name: string): string {
  return (name || 'ST')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'ST';
}

/**
 * Generates and downloads a formatted A4 PDF report of the Daily Scan History Log,
 * including Daily Total Count, Per-Class Breakdown table, and timestamped Student Scan Log with photo thumbnails.
 */
export function exportScanHistoryToPdf(
  params: ScanHistoryPdfExportParams
): ScanHistoryPdfExportResult {
  const {
    school,
    selectedDate,
    preparedBy,
    totalScannedToday,
    classBreakdown,
    entries,
    activeClassFilter = 'ALL',
    pendingCount = 0,
  } = params;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 16) {
      doc.addPage();
      y = 16;
    }
  };

  // 1. Official School Header Banner
  doc.setFillColor(15, 23, 42); // Slate-900
  doc.roundedRect(margin, y, contentWidth, 24, 3, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text((school.name || 'SCHOOL MASTER AI').toUpperCase(), margin + 5, y + 8.5, {
    maxWidth: contentWidth - 10,
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  const schoolAddr = formatSchoolAddressOnce(school);
  if (schoolAddr) {
    doc.text(schoolAddr.slice(0, 95), margin + 5, y + 14.5);
  }
  doc.text(
    `Daily QR Attendance Scan History Report  |  Date: ${selectedDate}  |  Session: ${
      school.academicSession || '2026-2027'
    }`,
    margin + 5,
    y + 20
  );
  y += 29;

  // Report Meta Line
  const generatedLabel = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Prepared By: ${preparedBy || 'Teacher'}   ·   Filter: ${
      activeClassFilter === 'ALL' ? 'All Classes' : activeClassFilter
    }   ·   Generated: ${generatedLabel}`,
    margin,
    y
  );
  y += 6;

  // 2. Daily Total Count & Sync Summary KPIs (3 clean cards)
  const kpiGap = 4;
  const kpiW = (contentWidth - kpiGap * 2) / 3;
  const kpiH = 18;
  const syncedCount = Math.max(0, entries.filter((e) => e.isSynced).length);

  const kpis = [
    {
      label: 'DAILY TOTAL PRESENT (QR)',
      value: String(totalScannedToday),
      sub: `${selectedDate}`,
      bg: [236, 253, 245] as [number, number, number],
      border: [167, 243, 208] as [number, number, number],
      valColor: [4, 120, 87] as [number, number, number],
    },
    {
      label: 'CLASSES WITH SCANS',
      value: String(classBreakdown.length),
      sub: `${entries.length} log entr${entries.length === 1 ? 'y' : 'ies'} exported`,
      bg: [238, 242, 255] as [number, number, number],
      border: [199, 210, 254] as [number, number, number],
      valColor: [67, 56, 202] as [number, number, number],
    },
    {
      label: 'CLOUD SYNC STATUS',
      value: pendingCount > 0 ? `${pendingCount} Pending` : '100% Synced',
      sub: `${syncedCount} synced in current view`,
      bg: pendingCount > 0 ? ([255, 251, 235] as [number, number, number]) : ([248, 250, 252] as [number, number, number]),
      border: pendingCount > 0 ? ([253, 230, 138] as [number, number, number]) : ([226, 232, 240] as [number, number, number]),
      valColor: pendingCount > 0 ? ([180, 83, 9] as [number, number, number]) : ([15, 23, 42] as [number, number, number]),
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * (kpiW + kpiGap);
    doc.setFillColor(...kpi.bg);
    doc.setDrawColor(...kpi.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, kpiW, kpiH, 2.5, 2.5, 'FD');

    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(kpi.label, x + 3.5, y + 5.2);

    doc.setTextColor(...kpi.valColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(kpi.value, x + 3.5, y + 12);

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.text(kpi.sub, x + 3.5, y + 16);
  });
  y += kpiH + 8;

  // 3. Per-Class Breakdown Section
  ensureSpace(24);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Per-Class Attendance Scan Breakdown', margin, y);
  y += 4.5;

  if (classBreakdown.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`No class-level QR scans recorded yet for ${selectedDate}.`, margin, y + 4);
    y += 10;
  } else {
    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, contentWidth, 7, 'FD');
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Class & Section', margin + 3, y + 4.8);
    doc.text('Marked Present', margin + 78, y + 4.8, { align: 'right' });
    doc.text('Class Strength', margin + 125, y + 4.8, { align: 'right' });
    doc.text('Coverage %', margin + contentWidth - 4, y + 4.8, { align: 'right' });
    y += 7;

    classBreakdown.forEach((cls, idx) => {
      ensureSpace(8);
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 6.8, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + 6.8, margin + contentWidth, y + 6.8);

      const pct = cls.total > 0 ? Math.min(100, Math.round((cls.scanned / cls.total) * 100)) : 100;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(15, 23, 42);
      doc.text(cls.label, margin + 3, y + 4.6);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(4, 120, 87);
      doc.text(String(cls.scanned), margin + 78, y + 4.6, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(cls.total > 0 ? String(cls.total) : '—', margin + 125, y + 4.6, { align: 'right' });
      doc.text(`${pct}%`, margin + contentWidth - 4, y + 4.6, { align: 'right' });
      y += 6.8;
    });

    // Total Row
    ensureSpace(8);
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(167, 243, 208);
    doc.rect(margin, y, contentWidth, 7.2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(6, 95, 70);
    doc.text('Daily Total Across Classes', margin + 3, y + 5);
    doc.text(String(totalScannedToday), margin + 78, y + 5, { align: 'right' });
    const totalStrength = classBreakdown.reduce((sum, c) => sum + c.total, 0);
    doc.text(totalStrength > 0 ? String(totalStrength) : '—', margin + 125, y + 5, {
      align: 'right',
    });
    const overallPct =
      totalStrength > 0 ? Math.min(100, Math.round((totalScannedToday / totalStrength) * 100)) : 100;
    doc.text(`${overallPct}%`, margin + contentWidth - 4, y + 5, { align: 'right' });
    y += 12;
  }

  // 4. Detailed Scan History Log Table (with Student Photo Thumbnails)
  ensureSpace(22);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(
    `Scan History Log (${entries.length} Record${entries.length === 1 ? '' : 's'})`,
    margin,
    y
  );
  y += 4.5;

  const drawLogHeader = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(margin, y, contentWidth, 7.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.text('#', margin + 2.5, y + 5);
    doc.text('Student', margin + 18, y + 5);
    doc.text('Admission No', margin + 72, y + 5);
    doc.text('Class', margin + 104, y + 5);
    doc.text('Roll', margin + 126, y + 5);
    doc.text('Source', margin + 138, y + 5);
    doc.text('Time', margin + 164, y + 5);
    doc.text('Sync', margin + contentWidth - 2.5, y + 5, { align: 'right' });
    y += 7.5;
  };

  if (entries.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `No student scan history entries match the current filter (${
        activeClassFilter === 'ALL' ? 'All Classes' : activeClassFilter
      }) for ${selectedDate}.`,
      margin,
      y + 4
    );
    y += 10;
  } else {
    drawLogHeader();
    const rowH = 10.5;

    entries.forEach((entry, idx) => {
      if (y + rowH > pageHeight - 16) {
        doc.addPage();
        y = 16;
        drawLogHeader();
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, rowH, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + rowH, margin + contentWidth, y + rowH);

      // Row index
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.6);
      doc.setTextColor(100, 116, 139);
      doc.text(String(idx + 1), margin + 2.5, y + 6.4);

      // Student Photo Thumbnail (7.5mm x 7.5mm)
      const thumbX = margin + 8;
      const thumbY = y + 1.5;
      const thumbSize = 7.5;
      const imgFmt = getSafeImageFormat(entry.photoDataUrl);
      if (imgFmt && entry.photoDataUrl) {
        try {
          doc.addImage(entry.photoDataUrl, imgFmt, thumbX, thumbY, thumbSize, thumbSize);
          doc.setDrawColor(203, 213, 225);
          doc.rect(thumbX, thumbY, thumbSize, thumbSize, 'S');
        } catch {
          doc.setFillColor(238, 242, 255);
          doc.roundedRect(thumbX, thumbY, thumbSize, thumbSize, 1.5, 1.5, 'F');
          doc.setTextColor(67, 56, 202);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.text(getInitials(entry.studentName), thumbX + thumbSize / 2, thumbY + 4.9, {
            align: 'center',
          });
        }
      } else {
        doc.setFillColor(238, 242, 255);
        doc.setDrawColor(199, 210, 254);
        doc.roundedRect(thumbX, thumbY, thumbSize, thumbSize, 1.5, 1.5, 'FD');
        doc.setTextColor(67, 56, 202);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.text(getInitials(entry.studentName), thumbX + thumbSize / 2, thumbY + 4.9, {
          align: 'center',
        });
      }

      // Student Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      const safeName =
        entry.studentName.length > 26 ? `${entry.studentName.slice(0, 25)}…` : entry.studentName;
      doc.text(safeName, margin + 18, y + 6.4);

      // Admission No
      doc.setFont('courier', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text((entry.admissionNumber || '—').slice(0, 16), margin + 72, y + 6.4);

      // Class
      doc.setFont('helvetica', 'normal');
      doc.text(entry.classLabel.replace(/^Class\s+/i, 'Cl '), margin + 104, y + 6.4);

      // Roll
      doc.text(`#${entry.rollNumber}`, margin + 126, y + 6.4);

      // Source
      doc.setFontSize(7.2);
      doc.text(entry.sourceLabel === 'Manual Override' ? 'Manual' : 'QR Scan', margin + 138, y + 6.4);

      // Time
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(4, 120, 87);
      doc.text(entry.scannedAt, margin + 164, y + 6.4);

      // Sync Status
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      if (entry.isSynced) {
        doc.setTextColor(4, 120, 87);
        doc.text('Synced', margin + contentWidth - 2.5, y + 6.4, { align: 'right' });
      } else {
        doc.setTextColor(180, 83, 9);
        doc.text('Pending', margin + contentWidth - 2.5, y + 6.4, { align: 'right' });
      }

      y += rowH;
    });
  }

  // Footer page numbering on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `School Master AI — Official Attendance Scan Log (${selectedDate})`,
      margin,
      pageHeight - 8
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 8, {
      align: 'right',
    });
  }

  const filterSlug =
    activeClassFilter && activeClassFilter !== 'ALL'
      ? `_${activeClassFilter.replace(/[^A-Za-z0-9]+/g, '_')}`
      : '';
  const fileName = `Scan_History_Report_${selectedDate}${filterSlug}.pdf`;
  doc.save(fileName);

  return {
    fileName,
    exportedEntries: entries.length,
    totalScannedToday,
  };
}
