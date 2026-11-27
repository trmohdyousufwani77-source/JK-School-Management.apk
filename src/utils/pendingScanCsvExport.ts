import { AttendanceRecord, Student } from '../types';

export interface PendingScanCsvExportResult {
  exportedCount: number;
  fileName: string | null;
  csvContent: string;
}

function escapeCsvCell(value: string | number | undefined | null): string {
  const raw = String(value ?? '').replace(/\r?\n/g, ' | ');
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return `"${raw}"`;
}

/**
 * Returns all local attendance / QR scan records still waiting for cloud synchronization
 * (`isOfflineSynced === false`), sorted chronologically newest-first.
 */
export function filterPendingLocalScanRecords(
  attendanceRecords: AttendanceRecord[]
): AttendanceRecord[] {
  return attendanceRecords
    .filter((rec) => rec.isOfflineSynced === false)
    .sort((a, b) => (b.markedAt || b.date || '').localeCompare(a.markedAt || a.date || ''));
}

/**
 * Formats pending local scan records into a UTF-8 CSV string with headers and full student metadata.
 */
export function formatPendingScansToCsv(
  pendingRecords: AttendanceRecord[],
  students: Student[],
  schoolName: string
): string {
  const studentMap = new Map(students.map((st) => [st.id, st]));
  const headers = [
    'Record ID',
    'Date',
    'Scan Timestamp',
    'Student ID',
    'Admission Number',
    'Student Name',
    'Class',
    'Section',
    'Roll Number',
    'Attendance Status',
    'Sync Status',
    'Source / Remarks',
    'School Name',
  ];

  const rows = pendingRecords.map((rec) => {
    const st = studentMap.get(rec.studentId);
    const formattedTs = rec.markedAt
      ? new Date(rec.markedAt).toLocaleString('en-IN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      : `${rec.date} 00:00:00`;

    return [
      escapeCsvCell(rec.id),
      escapeCsvCell(rec.date),
      escapeCsvCell(formattedTs),
      escapeCsvCell(rec.studentId),
      escapeCsvCell(st?.admissionNumber || ''),
      escapeCsvCell(st?.fullName || 'Unknown Student'),
      escapeCsvCell(st?.classNumber || rec.classNumber || ''),
      escapeCsvCell(st?.section || rec.section || ''),
      escapeCsvCell(st?.rollNumber ?? ''),
      escapeCsvCell(rec.status),
      escapeCsvCell('PENDING_SYNC'),
      escapeCsvCell(rec.remarks || 'Local Offline Scan'),
      escapeCsvCell(schoolName || 'SchoolMaster'),
    ].join(',');
  });

  // Prepend UTF-8 BOM so Microsoft Excel / LibreOffice open multilingual names cleanly
  return `\uFEFF${[headers.map(escapeCsvCell).join(','), ...rows].join('\n')}`;
}

/**
 * Exports all 'Pending' local scan records (`isOfflineSynced === false`) into a temporary
 * downloadable CSV file for extended offline periods.
 */
export function exportPendingLocalScansToCsv(
  attendanceRecords: AttendanceRecord[],
  students: Student[],
  schoolName: string
): PendingScanCsvExportResult {
  const pendingRecords = filterPendingLocalScanRecords(attendanceRecords);
  const csvContent = formatPendingScansToCsv(pendingRecords, students, schoolName);

  if (pendingRecords.length === 0) {
    return {
      exportedCount: 0,
      fileName: null,
      csvContent,
    };
  }

  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const fileName = `Pending_Local_Scans_Temp_${stamp}.csv`;

  if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const tempUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = tempUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(tempUrl), 4000);
  }

  return {
    exportedCount: pendingRecords.length,
    fileName,
    csvContent,
  };
}
