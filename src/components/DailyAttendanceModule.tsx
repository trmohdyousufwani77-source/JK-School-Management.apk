import React, { useMemo, useState, useEffect } from 'react';
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  FileCheck2,
  Search,
  Save,
  CheckCheck,
  Users,
  X,
  FileDown,
  RefreshCw,
  Wifi,
  WifiOff,
  QrCode,
  FileText,
} from 'lucide-react';
import { QrAttendanceScanner } from './QrAttendanceScanner';
import {
  AttendanceAuditLog,
  AttendanceRecord,
  AttendanceStatus,
  SchoolProfile,
  Student,
  User,
} from '../types';
import { deduplicateStudentsByAdmissionNumber } from '../utils/calculations';
import {
  exportPendingLocalScansToCsv,
  filterPendingLocalScanRecords,
} from '../utils/pendingScanCsvExport';
import {
  buildDailyScanSummaryAndEntries,
  exportScanHistoryToPdf,
} from '../utils/scanHistoryPdfExport';

export { exportPendingLocalScansToCsv };

export interface DailyAttendanceModuleProps {
  students: Student[];
  school: SchoolProfile;
  currentUser: User;
  attendanceRecords: AttendanceRecord[];
  selectedDate?: string;
  selectedClass?: string;
  selectedSection?: string;
  isOffline?: boolean;
  autoSyncEnabled?: boolean;
  onToggleAutoSync?: (enabled: boolean) => void;
  onTriggerSyncOfflineData?: () => void;
  onDateChange?: (date: string) => void;
  onClassChange?: (cls: string) => void;
  onSectionChange?: (sec: string) => void;
  onSaveAttendance: (newRecords: AttendanceRecord[], auditEntries: AttendanceAuditLog[]) => void;
}

const STATUS_OPTIONS: Array<{
  value: AttendanceStatus;
  label: string;
  shortLabel: string;
  activeClass: string;
  idleClass: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: 'Present',
    label: 'Present',
    shortLabel: 'Present',
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-xs',
    idleClass: 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300',
    icon: CheckCircle2,
  },
  {
    value: 'Absent',
    label: 'Absent',
    shortLabel: 'Absent',
    activeClass: 'bg-rose-600 text-white border-rose-600 shadow-xs',
    idleClass: 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300',
    icon: XCircle,
  },
  {
    value: 'Late',
    label: 'Late',
    shortLabel: 'Late',
    activeClass: 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs',
    idleClass: 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300',
    icon: Clock,
  },
  {
    value: 'Approved_Leave',
    label: 'Leave',
    shortLabel: 'Leave',
    activeClass: 'bg-blue-600 text-white border-blue-600 shadow-xs',
    idleClass: 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300',
    icon: FileCheck2,
  },
];

export const DailyAttendanceModule: React.FC<DailyAttendanceModuleProps> = ({
  students,
  school,
  currentUser,
  attendanceRecords,
  selectedDate: externalDate,
  selectedClass: externalClass,
  selectedSection: externalSection,
  isOffline = false,
  autoSyncEnabled = true,
  onToggleAutoSync,
  onTriggerSyncOfflineData,
  onDateChange,
  onClassChange,
  onSectionChange,
  onSaveAttendance,
}) => {
  const [internalDate, setInternalDate] = useState<string>(
    externalDate || new Date().toISOString().slice(0, 10)
  );
  const [internalClass, setInternalClass] = useState<string>(
    externalClass || school.classesOffered?.[0] || '5'
  );
  const [internalSection, setInternalSection] = useState<string>(externalSection || 'A');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [draftStatuses, setDraftStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [moduleView, setModuleView] = useState<'rollcall' | 'qr-scanner'>('rollcall');
  const [syncPeakPending, setSyncPeakPending] = useState<number>(0);
  const [isSyncingNow, setIsSyncingNow] = useState<boolean>(false);

  const pendingLocalScans = useMemo(
    () => filterPendingLocalScanRecords(attendanceRecords),
    [attendanceRecords]
  );

  // Track peak pending batch size so the visual sync progress bar gives granular feedback as records drain
  useEffect(() => {
    const count = pendingLocalScans.length;
    if (count > syncPeakPending) {
      setSyncPeakPending(count);
    } else if (count === 0) {
      setIsSyncingNow(false);
      if (syncPeakPending > 0) {
        const timer = window.setTimeout(() => setSyncPeakPending(0), 2200);
        return () => window.clearTimeout(timer);
      }
    }
  }, [pendingLocalScans.length, syncPeakPending]);

  const activeDate = externalDate ?? internalDate;
  const activeClass = externalClass ?? internalClass;
  const activeSection = externalSection ?? internalSection;

  const todayRecordCount = useMemo(
    () => attendanceRecords.filter((rec) => rec.date === activeDate).length,
    [attendanceRecords, activeDate]
  );

  const syncProgressMetrics = useMemo(() => {
    const remaining = pendingLocalScans.length;
    const totalPool = Math.max(remaining, syncPeakPending, todayRecordCount);
    const synced = Math.max(0, totalPool - remaining);
    const pct = totalPool > 0 ? Math.round((synced / totalPool) * 100) : 100;
    return { remaining, synced, totalPool, pct };
  }, [pendingLocalScans.length, syncPeakPending, todayRecordCount]);

  const handleManualSyncClick = () => {
    if (!onTriggerSyncOfflineData || isOffline || pendingLocalScans.length === 0) return;
    setSyncPeakPending((prev) => Math.max(prev, pendingLocalScans.length));
    setIsSyncingNow(true);
    onTriggerSyncOfflineData();
    window.setTimeout(() => setIsSyncingNow(false), 1800);
  };

  const handleExportPendingScansCsv = () => {
    const result = exportPendingLocalScansToCsv(
      attendanceRecords,
      students,
      school.name || 'SchoolMaster'
    );
    if (result.exportedCount === 0) {
      setStatusMessage('No pending local scan records found — all attendance scans are synced.');
    } else {
      setStatusMessage(
        `Exported ${result.exportedCount} pending local scan record(s) to temporary CSV: ${result.fileName}`
      );
    }
    window.setTimeout(() => setStatusMessage(null), 4500);
  };

  const handleExportScanHistoryPdf = () => {
    const summary = buildDailyScanSummaryAndEntries(attendanceRecords, students, activeDate, 'ALL');
    const result = exportScanHistoryToPdf({
      school,
      selectedDate: activeDate,
      preparedBy: currentUser.name,
      totalScannedToday: summary.totalScannedToday,
      classBreakdown: summary.classBreakdown,
      entries: summary.entries,
      activeClassFilter: 'ALL',
      pendingCount: summary.pendingCount,
    });
    setStatusMessage(
      `Exported Scan History PDF (${result.totalScannedToday} total present across ${summary.classBreakdown.length} class${
        summary.classBreakdown.length === 1 ? '' : 'es'
      }): ${result.fileName}`
    );
    window.setTimeout(() => setStatusMessage(null), 4500);
  };

  const setDate = (val: string) => {
    setInternalDate(val);
    onDateChange?.(val);
  };
  const setClass = (val: string) => {
    setInternalClass(val);
    onClassChange?.(val);
  };
  const setSection = (val: string) => {
    setInternalSection(val);
    onSectionChange?.(val);
  };

  const classStudents = useMemo(() => {
    const active = deduplicateStudentsByAdmissionNumber(students).filter(
      (s) => s.status === 'Active'
    );
    return active
      .filter((s) => s.classNumber === activeClass && s.section === activeSection)
      .sort((a, b) => a.rollNumber - b.rollNumber);
  }, [students, activeClass, activeSection]);

  // Hydrate draft statuses from saved attendanceRecords for activeDate + class
  useEffect(() => {
    const next: Record<string, AttendanceStatus> = {};
    classStudents.forEach((st) => {
      const existing = attendanceRecords.find(
        (r) => r.studentId === st.id && r.date === activeDate
      );
      if (existing) {
        next[st.id] = existing.status;
      }
    });
    setDraftStatuses(next);
    setHasUnsavedChanges(false);
  }, [activeDate, classStudents, attendanceRecords]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return classStudents;
    return classStudents.filter((st) =>
      `${st.fullName} ${st.admissionNumber} ${st.rollNumber} ${st.fatherName || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [classStudents, searchQuery]);

  const stats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    let unmarked = 0;
    classStudents.forEach((st) => {
      const status = draftStatuses[st.id];
      if (status === 'Present') present++;
      else if (status === 'Absent') absent++;
      else if (status === 'Late') late++;
      else if (status === 'Approved_Leave') leave++;
      else unmarked++;
    });
    const pct =
      classStudents.length > 0
        ? Math.round(((present + late) / classStudents.length) * 100)
        : 0;
    return { present, absent, late, leave, unmarked, pct };
  }, [classStudents, draftStatuses]);

  const handleMarkStatus = (studentId: string, status: AttendanceStatus) => {
    setDraftStatuses((prev) => ({ ...prev, [studentId]: status }));
    setHasUnsavedChanges(true);
  };

  const handleMarkAllPresent = () => {
    const next: Record<string, AttendanceStatus> = { ...draftStatuses };
    classStudents.forEach((st) => {
      next[st.id] = 'Present';
    });
    setDraftStatuses(next);
    setHasUnsavedChanges(true);
    setStatusMessage(`Marked all ${classStudents.length} students Present — click Save Attendance to commit.`);
    window.setTimeout(() => setStatusMessage(null), 3200);
  };

  const handleCommitAttendance = () => {
    const nowIso = new Date().toISOString();
    const recordsToSave: AttendanceRecord[] = [];
    const auditEntries: AttendanceAuditLog[] = [];

    classStudents.forEach((st) => {
      const status = draftStatuses[st.id];
      if (!status) return;
      const existing = attendanceRecords.find(
        (r) => r.studentId === st.id && r.date === activeDate
      );
      recordsToSave.push({
        id: existing?.id || `att-${st.id}-${activeDate}`,
        date: activeDate,
        studentId: st.id,
        classNumber: st.classNumber,
        section: st.section,
        status,
        academicSession: school.academicSession || '2026-2027',
        markedByUserId: currentUser.id,
        markedAt: nowIso,
        isOfflineSynced: typeof navigator !== 'undefined' ? navigator.onLine : true,
        remarks: existing?.remarks || 'Marked via Photo Roll-Call Module',
      });
      if (existing && existing.status !== status) {
        auditEntries.push({
          id: `audit-${st.id}-${activeDate}-${Date.now()}`,
          timestamp: nowIso,
          userId: currentUser.id,
          userName: currentUser.name,
          studentId: st.id,
          studentName: st.fullName,
          date: activeDate,
          previousStatus: existing.status,
          newStatus: status,
          reason: `Updated from ${existing.status} to ${status} via Daily Attendance Module`,
        });
      }
    });

    if (recordsToSave.length === 0) {
      setStatusMessage('Mark at least one student before saving.');
      window.setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    onSaveAttendance(recordsToSave, auditEntries);
    setHasUnsavedChanges(false);
    setStatusMessage(
      `Saved attendance for ${recordsToSave.length} student(s) in Class ${activeClass}-${activeSection} (${activeDate}).`
    );
    window.setTimeout(() => setStatusMessage(null), 3500);
  };

  return (
    <section
      aria-label="Daily Attendance Photo Roll-Call Module"
      className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
    >
      {/* Header & Controls */}
      <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>Daily Attendance Module — Photo Roll-Call</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mark Present, Absent, Late, or Leave with each student&apos;s central profile photograph displayed beside their name.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Mode Switcher: Photo Roll-Call | QR Scanner */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setModuleView('rollcall')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                moduleView === 'rollcall'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Photo Roll-Call</span>
            </button>
            <button
              type="button"
              onClick={() => setModuleView('qr-scanner')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                moduleView === 'qr-scanner'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QR Scanner</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportScanHistoryPdf}
            data-testid="export-scan-history-pdf-btn"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 transition-colors whitespace-nowrap shrink-0"
            title="Export current daily scan history log with daily total count and per-class breakdown to PDF"
          >
            <FileText className="w-4 h-4 text-rose-600" />
            <span>Export Scan PDF</span>
          </button>

          <button
            type="button"
            onClick={handleExportPendingScansCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition-colors whitespace-nowrap shrink-0"
            title="Export all unsynced Pending local scan records to a temporary CSV file"
          >
            <FileDown className="w-4 h-4 text-amber-700" />
            <span>Export Pending CSV</span>
            <span className="font-mono tabular-nums font-bold">({pendingLocalScans.length})</span>
          </button>
          {moduleView === 'rollcall' && (
            <>
              <button
                type="button"
                onClick={handleMarkAllPresent}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                <CheckCheck className="w-4 h-4 text-emerald-600" />
                <span>Mark All Present</span>
              </button>
              <button
                type="button"
                onClick={handleCommitAttendance}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors whitespace-nowrap shrink-0"
              >
                <Save className="w-4 h-4" />
                <span>{hasUnsavedChanges ? 'Save Attendance *' : 'Save Attendance'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Attendance Sync Settings & Granular Sync Progress Bar Strip */}
      <div className="px-5 py-3.5 bg-white border-b border-slate-200 space-y-2.5 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
              {isOffline ? (
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              ) : (
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>{isOffline ? 'Offline Mode' : 'Online'}</span>
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span
              className={`font-mono tabular-nums font-semibold ${
                syncProgressMetrics.remaining > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {syncProgressMetrics.remaining > 0
                ? `${syncProgressMetrics.remaining} unsynced record${
                    syncProgressMetrics.remaining === 1 ? '' : 's'
                  } remaining`
                : 'All attendance records synced'}
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>
              {autoSyncEnabled
                ? 'Auto-Sync enabled on reconnect'
                : 'Auto-Sync paused — sync manually or export CSV'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {onToggleAutoSync && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                  Auto-Sync
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoSyncEnabled}
                  aria-label="Toggle automatic Firebase synchronization when device regains network connectivity"
                  onClick={() => onToggleAutoSync(!autoSyncEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    autoSyncEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                      autoSyncEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            )}

            {onTriggerSyncOfflineData && pendingLocalScans.length > 0 && !isOffline && (
              <button
                type="button"
                disabled={isSyncingNow}
                onClick={handleManualSyncClick}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                <span>
                  {isSyncingNow
                    ? `Syncing (${syncProgressMetrics.remaining})...`
                    : `Sync Remaining (${syncProgressMetrics.remaining})`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Visual Sync Progress Bar (shows granular remaining sync status during intermittent connectivity) */}
        <div
          data-testid="attendance-sync-progress-indicator"
          className={`rounded-xl border px-3.5 py-2.5 space-y-1.5 ${
            syncProgressMetrics.remaining > 0
              ? 'bg-amber-50/70 border-amber-200'
              : 'bg-slate-50/80 border-slate-200'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-slate-800">
              {syncProgressMetrics.remaining === 0
                ? 'Cloud Synchronization Complete'
                : isOffline
                ? `Queued Offline — ${syncProgressMetrics.remaining} of ${syncProgressMetrics.totalPool} remaining to sync`
                : isSyncingNow
                ? `Uploading to Firebase — ${syncProgressMetrics.remaining} record${
                    syncProgressMetrics.remaining === 1 ? '' : 's'
                  } remaining`
                : `Pending Cloud Upload — ${syncProgressMetrics.remaining} of ${syncProgressMetrics.totalPool} record${
                    syncProgressMetrics.totalPool === 1 ? '' : 's'
                  } remaining`}
            </span>
            <span className="font-mono tabular-nums font-bold text-slate-700">
              {syncProgressMetrics.synced}/{syncProgressMetrics.totalPool} synced ({syncProgressMetrics.pct}%)
            </span>
          </div>

          <div
            role="progressbar"
            aria-label="Remaining attendance synchronization progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={syncProgressMetrics.pct}
            className="w-full h-2 rounded-full bg-slate-200 overflow-hidden flex"
          >
            <div
              className={`h-full transition-all duration-300 ${
                syncProgressMetrics.remaining === 0 ? 'bg-emerald-600' : 'bg-indigo-600'
              }`}
              style={{ width: `${Math.max(syncProgressMetrics.pct, syncProgressMetrics.remaining === 0 ? 100 : 4)}%` }}
            />
            {syncProgressMetrics.remaining > 0 && (
              <div
                className="h-full bg-amber-400 transition-all duration-300"
                style={{ width: `${Math.max(0, 100 - syncProgressMetrics.pct)}%` }}
              />
            )}
          </div>
        </div>
      </div>

      {moduleView === 'qr-scanner' ? (
        <div className="p-4 sm:p-5 bg-slate-50/70">
          <QrAttendanceScanner
            students={students}
            attendanceRecords={attendanceRecords}
            school={school}
            currentUser={currentUser}
            selectedDate={activeDate}
            onSaveAttendance={onSaveAttendance}
          />
        </div>
      ) : (
        <>
      {/* Filters & Live Summary Strip */}
      <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="date"
              value={activeDate}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Attendance date"
              className="bg-transparent text-slate-800 font-semibold focus:outline-none"
            />
          </div>

          <select
            value={activeClass}
            onChange={(e) => setClass(e.target.value)}
            aria-label="Select class"
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {(school.classesOffered || ['1', '2', '3', '4', '5', '6', '7', '8']).map((cls) => (
              <option key={cls} value={cls}>
                Class {cls}
              </option>
            ))}
          </select>

          <select
            value={activeSection}
            onChange={(e) => setSection(e.target.value)}
            aria-label="Select section"
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="A">Section A</option>
            <option value="B">Section B</option>
            <option value="C">Section C</option>
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student or roll #..."
              aria-label="Search students"
              className="pl-8 pr-7 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-800 w-48 sm:w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Clean Tabular Summary Numbers */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
          <span className="text-emerald-700 font-bold">Present: {stats.present}</span>
          <span className="text-slate-300">·</span>
          <span className="text-rose-700 font-bold">Absent: {stats.absent}</span>
          <span className="text-slate-300">·</span>
          <span className="text-amber-700 font-bold">Late: {stats.late}</span>
          <span className="text-slate-300">·</span>
          <span className="text-blue-700 font-bold">Leave: {stats.leave}</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-800 font-extrabold">Rate: {stats.pct}%</span>
        </div>
      </div>

      {statusMessage && (
        <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
          <span>{statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Student Photo Cards Grid */}
      <div className="p-5">
        {filteredStudents.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No active students match Class {activeClass}-{activeSection}
            {searchQuery ? ` for "${searchQuery}"` : ''}.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredStudents.map((student) => {
              const currentStatus = draftStatuses[student.id];
              const initials = student.fullName
                .split(' ')
                .slice(0, 2)
                .map((p) => p[0])
                .join('')
                .toUpperCase();

              return (
                <div
                  key={student.id}
                  className={`p-3.5 rounded-xl border transition-colors flex flex-col justify-between gap-3 ${
                    currentStatus === 'Present'
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : currentStatus === 'Absent'
                      ? 'bg-rose-50/40 border-rose-200'
                      : currentStatus === 'Late'
                      ? 'bg-amber-50/40 border-amber-200'
                      : currentStatus === 'Approved_Leave'
                      ? 'bg-blue-50/40 border-blue-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {student.photoDataUrl ? (
                      <img
                        src={student.photoDataUrl}
                        alt={`${student.fullName} profile photograph`}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0">
                        {initials}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-slate-900 truncate">
                          {student.fullName}
                        </h3>
                        <span className="text-xs font-mono tabular-nums font-bold text-slate-500 shrink-0">
                          #{String(student.rollNumber).padStart(2, '0')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {student.fatherName ? `S/D/o ${student.fatherName}` : 'Student'} ·{' '}
                        <span className="font-mono">{student.admissionNumber}</span>
                      </p>
                    </div>
                  </div>

                  {/* 4 Attendance Status Buttons: Present / Absent / Late / Leave */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {STATUS_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isActive = currentStatus === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleMarkStatus(student.id, opt.value)}
                          className={`inline-flex items-center justify-center gap-1 py-2 px-2 rounded-lg text-[11px] font-bold border transition-colors whitespace-nowrap ${
                            isActive ? opt.activeClass : opt.idleClass
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span>{opt.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
        </>
      )}
    </section>
  );
};
