import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  QrCode,
  RotateCw,
  Search,
  AlertCircle,
  UserCheck,
  Volume2,
  VolumeX,
  UserPlus,
  BarChart3,
  Clock,
  FileText,
} from 'lucide-react';
import { AttendanceAuditLog, AttendanceRecord, SchoolProfile, Student, User } from '../types';
import {
  deduplicateStudentsByAdmissionNumber,
  extractAdmissionOrIdFromQrText,
} from '../utils/calculations';
import { exportScanHistoryToPdf } from '../utils/scanHistoryPdfExport';
import { guardSensitiveExport } from '../utils/biometricProtection';

export interface QrAttendanceScannerProps {
  students: Student[];
  attendanceRecords?: AttendanceRecord[];
  school: SchoolProfile;
  currentUser: User;
  selectedDate: string;
  onSaveAttendance: (newRecords: AttendanceRecord[], auditEntries: AttendanceAuditLog[]) => void;
  onStudentMarkedPresent?: (student: Student, rawPayload: string) => void;
}

interface ScannedLogItem {
  id: string;
  student: Student;
  scannedAt: string;
  timestampMs: number;
  rawCode: string;
  source: 'qr' | 'manual_override';
  isSynced: boolean;
}

/**
 * Small resilient student profile photo thumbnail with graceful initials fallback.
 */
const StudentScanPhotoThumb: React.FC<{
  photoUrl?: string;
  fullName: string;
  sizeClass?: string;
}> = ({ photoUrl, fullName, sizeClass = 'w-9 h-9' }) => {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [photoUrl]);

  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt={`${fullName} profile photo`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${sizeClass} rounded-full object-cover border border-slate-200 ring-1 ring-slate-200/80 shrink-0`}
      />
    );
  }
  return (
    <div
      aria-label={`${fullName} initials`}
      className={`${sizeClass} rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold flex items-center justify-center shrink-0`}
    >
      {initials || 'ST'}
    </div>
  );
};

/**
 * Triggers a subtle classroom-friendly haptic tap + short confirmation beep
 * immediately after a student QR scan succeeds.
 */
function triggerQrSuccessConfirmationFeedback(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(40);
    } catch {
      // Ignore unsupported vibration environments
    }
  }
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const harmonic = ctx.createOscillator();
    const gain = ctx.createGain();
    const harmonicGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, now); // Clean C6 confirmation beep
    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(1567.98, now); // Soft G6 overtone

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.085, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);

    harmonicGain.gain.setValueAtTime(0.001, now);
    harmonicGain.gain.linearRampToValueAtTime(0.03, now + 0.012);
    harmonicGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.13);

    osc.connect(gain);
    harmonic.connect(harmonicGain);
    gain.connect(ctx.destination);
    harmonicGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.17);
    harmonic.start(now);
    harmonic.stop(now + 0.14);

    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 240);
  } catch {
    // Ignore restricted audio environments
  }
}

export const QrAttendanceScanner: React.FC<QrAttendanceScannerProps> = ({
  students,
  attendanceRecords = [],
  school,
  currentUser,
  selectedDate,
  onSaveAttendance,
  onStudentMarkedPresent,
}) => {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const readerElementId = `sm-qr-att-reader-${reactId}`;

  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState<string>('');
  const [lastScanned, setLastScanned] = useState<ScannedLogItem | null>(null);
  const [recentScans, setRecentScans] = useState<ScannedLogItem[]>([]);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Subtle beep & haptic feedback preference (enabled by default for classroom confirmation)
  const [feedbackEnabled, setFeedbackEnabled] = useState<boolean>(true);
  const feedbackEnabledRef = useRef<boolean>(true);
  useEffect(() => {
    feedbackEnabledRef.current = feedbackEnabled;
  }, [feedbackEnabled]);

  // Manual Override toggle (search by student name or roll number when ID card is missing/damaged)
  const [manualOverrideEnabled, setManualOverrideEnabled] = useState<boolean>(false);
  const [overrideSearchQuery, setOverrideSearchQuery] = useState<string>('');
  const [showManualRollPanel, setShowManualRollPanel] = useState<boolean>(false);
  const [manualRollText, setManualRollText] = useState<string>('');
  const [showAlignTooltip, setShowAlignTooltip] = useState<boolean>(true);
  const [frameFeedback, setFrameFeedback] = useState<'idle' | 'success' | 'fail'>('idle');
  const frameFeedbackTimerRef = useRef<number | null>(null);

  const flashFrameFeedback = (status: 'success' | 'fail') => {
    setFrameFeedback(status);
    if (frameFeedbackTimerRef.current !== null) {
      window.clearTimeout(frameFeedbackTimerRef.current);
    }
    frameFeedbackTimerRef.current = window.setTimeout(() => {
      setFrameFeedback('idle');
      frameFeedbackTimerRef.current = null;
    }, 1500);
  };

  // Class filter dropdown state inside Daily Scan Summary card for filtering the Last 5 Scan History log
  const [scanHistoryClassFilter, setScanHistoryClassFilter] = useState<string>('ALL');

  // 'Scan Successful' visual overlay state displayed directly over the camera viewport upon decode
  const [scanSuccessOverlay, setScanSuccessOverlay] = useState<{
    key: number;
    studentName: string;
    classLabel: string;
    rollNumber: string;
    admissionNumber: string;
    source: 'qr' | 'manual_override';
  } | null>(null);
  const overlayTimerRef = useRef<number | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cooldownMapRef = useRef<Map<string, number>>(new Map());

  const activeStudents = useMemo(
    () => deduplicateStudentsByAdmissionNumber(students).filter((s) => s.status === 'Active'),
    [students]
  );

  // Live lookup map for central student profile photographs (always reflects latest profile photo)
  const studentProfileMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach((st) => {
      map.set(st.id, st);
      if (st.admissionNumber) map.set(st.admissionNumber.toLowerCase(), st);
    });
    return map;
  }, [students]);

  const [pdfExportNotice, setPdfExportNotice] = useState<string | null>(null);

  // Present students map for selectedDate (from persisted attendanceRecords + live session)
  const presentTodayIds = useMemo(() => {
    const set = new Set<string>();
    attendanceRecords.forEach((rec) => {
      if (rec.date === selectedDate && rec.status === 'Present') {
        set.add(rec.studentId);
      }
    });
    recentScans.forEach((item) => set.add(item.student.id));
    return set;
  }, [attendanceRecords, selectedDate, recentScans]);

  // Daily Scan Summary: total students marked 'Present' via QR today + breakdown by class
  const dailyScanSummary = useMemo(() => {
    const studentById = new Map(activeStudents.map((s) => [s.id, s]));
    const qrPresentStudentIds = new Map<
      string,
      { classNumber: string; section: string }
    >();

    // Persisted QR scans for selectedDate
    attendanceRecords.forEach((rec) => {
      if (rec.date !== selectedDate || rec.status !== 'Present') return;
      const remarkLower = (rec.remarks || '').toLowerCase();
      const isQrOrOverride =
        remarkLower.includes('qr') ||
        remarkLower.includes('scan') ||
        remarkLower.includes('manual override');
      if (isQrOrOverride) {
        const st = studentById.get(rec.studentId);
        qrPresentStudentIds.set(rec.studentId, {
          classNumber: st?.classNumber || rec.classNumber || 'Unassigned',
          section: st?.section || rec.section || 'A',
        });
      }
    });

    // Live session QR / Manual Override scans
    recentScans.forEach((item) => {
      qrPresentStudentIds.set(item.student.id, {
        classNumber: item.student.classNumber || 'Unassigned',
        section: item.student.section || 'A',
      });
    });

    const classTotals = new Map<string, number>();
    activeStudents.forEach((st) => {
      const key = `${st.classNumber}-${st.section}`;
      classTotals.set(key, (classTotals.get(key) || 0) + 1);
    });

    const byClassMap = new Map<string, { label: string; scanned: number; total: number }>();
    qrPresentStudentIds.forEach(({ classNumber, section }) => {
      const key = `${classNumber}-${section}`;
      const existing = byClassMap.get(key) || {
        label: `Class ${classNumber}-${section}`,
        scanned: 0,
        total: classTotals.get(key) || 0,
      };
      existing.scanned += 1;
      byClassMap.set(key, existing);
    });

    const breakdown = Array.from(byClassMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true })
    );

    return {
      totalScannedToday: qrPresentStudentIds.size,
      breakdown,
    };
  }, [activeStudents, attendanceRecords, recentScans, selectedDate]);

  // Available classes for the Scan History class filter dropdown inside the Daily Scan Summary card
  const availableScanClasses = useMemo<string[]>(() => {
    const classSet = new Set<string>();
    activeStudents.forEach((st) => {
      classSet.add(`Class ${st.classNumber}-${st.section}`);
    });
    dailyScanSummary.breakdown.forEach((b) => classSet.add(b.label));
    return Array.from(classSet).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
  }, [activeStudents, dailyScanSummary.breakdown]);

  // All combined today scans (sorted newest-first) for PDF export and filtered Last-5 view
  const allCombinedTodayScans = useMemo<ScannedLogItem[]>(() => {
    const studentById = new Map(activeStudents.map((s) => [s.id, s]));
    const combinedByStudent = new Map<string, ScannedLogItem>();

    // Hydrate persisted QR / Manual Override scans for selectedDate
    attendanceRecords.forEach((rec) => {
      if (rec.date !== selectedDate || rec.status !== 'Present') return;
      const remarkLower = (rec.remarks || '').toLowerCase();
      const isQrOrOverride =
        remarkLower.includes('qr') ||
        remarkLower.includes('scan') ||
        remarkLower.includes('manual override');
      if (!isQrOrOverride) return;
      const st = studentById.get(rec.studentId);
      if (!st) return;

      const parsedMs = rec.markedAt ? Date.parse(rec.markedAt) : 0;
      const tsMs = Number.isFinite(parsedMs) && parsedMs > 0 ? parsedMs : Date.now();
      const formattedTime = new Date(tsMs).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const existing = combinedByStudent.get(st.id);
      if (!existing || tsMs >= existing.timestampMs) {
        combinedByStudent.set(st.id, {
          id: rec.id,
          student: st,
          scannedAt: formattedTime,
          timestampMs: tsMs,
          rawCode: st.admissionNumber || st.id,
          source: remarkLower.includes('manual override') ? 'manual_override' : 'qr',
          isSynced: rec.isOfflineSynced !== false,
        });
      }
    });

    // Overlay live session scans (newest wins)
    recentScans.forEach((item) => {
      const existing = combinedByStudent.get(item.student.id);
      if (!existing || item.timestampMs >= existing.timestampMs) {
        combinedByStudent.set(item.student.id, item);
      }
    });

    return Array.from(combinedByStudent.values()).sort((a, b) => b.timestampMs - a.timestampMs);
  }, [activeStudents, attendanceRecords, recentScans, selectedDate]);

  // Last 5 successful student scans (filtered by class dropdown in Daily Scan Summary card)
  const lastFiveScanHistory = useMemo<ScannedLogItem[]>(() => {
    return allCombinedTodayScans
      .filter((item) => {
        if (scanHistoryClassFilter === 'ALL') return true;
        return `Class ${item.student.classNumber}-${item.student.section}` === scanHistoryClassFilter;
      })
      .slice(0, 5);
  }, [allCombinedTodayScans, scanHistoryClassFilter]);

  const scannerSyncProgress = useMemo(() => {
    const total = allCombinedTodayScans.length;
    const pending = allCombinedTodayScans.filter((item) => !item.isSynced).length;
    const synced = Math.max(0, total - pending);
    const pct = total > 0 ? Math.round((synced / total) * 100) : 100;
    return { total, pending, synced, pct };
  }, [allCombinedTodayScans]);

  const handleExportCurrentScanHistoryPdf = async () => {
    const allowed = await guardSensitiveExport(`QR Scan History PDF (${selectedDate})`);
    if (!allowed) return;
    const filteredEntries = allCombinedTodayScans
      .filter((item) => {
        if (scanHistoryClassFilter === 'ALL') return true;
        return `Class ${item.student.classNumber}-${item.student.section}` === scanHistoryClassFilter;
      })
      .map((item) => {
        const latestProfile =
          studentProfileMap.get(item.student.id) ||
          studentProfileMap.get((item.student.admissionNumber || '').toLowerCase()) ||
          item.student;
        return {
          studentId: item.student.id,
          studentName: latestProfile.fullName,
          admissionNumber: latestProfile.admissionNumber || item.student.id,
          classLabel: `Class ${latestProfile.classNumber}-${latestProfile.section}`,
          rollNumber: latestProfile.rollNumber,
          scannedAt: item.scannedAt,
          timestampMs: item.timestampMs,
          sourceLabel: item.source === 'manual_override' ? 'Manual Override' : 'QR Scan',
          isSynced: item.isSynced,
          photoDataUrl: latestProfile.photoDataUrl,
        };
      });

    const result = exportScanHistoryToPdf({
      school,
      selectedDate,
      preparedBy: currentUser.name,
      totalScannedToday: dailyScanSummary.totalScannedToday,
      classBreakdown: dailyScanSummary.breakdown,
      entries: filteredEntries,
      activeClassFilter: scanHistoryClassFilter,
      pendingCount: scannerSyncProgress.pending,
    });
    setPdfExportNotice(`Downloaded ${result.fileName} (${result.totalScannedToday} total present)`);
    window.setTimeout(() => setPdfExportNotice(null), 4000);
  };

  // Manual Override search results (search by name, roll number, admission number, or class)
  const overrideSearchResults = useMemo(() => {
    const q = overrideSearchQuery.trim().toLowerCase();
    const list = q
      ? activeStudents.filter((st) => {
          const hay = `${st.fullName} ${st.admissionNumber || ''} ${st.id} class ${st.classNumber} ${st.section} ${st.rollNumber}`.toLowerCase();
          return hay.includes(q);
        })
      : activeStudents.slice(0, 8);
    return list.slice(0, 12);
  }, [activeStudents, overrideSearchQuery]);

  const findStudentByQr = (rawText: string): Student | null => {
    const cleaned = rawText.trim();
    if (!cleaned) return null;
    const extracted = extractAdmissionOrIdFromQrText(cleaned)?.trim().toLowerCase() || '';
    const lowerRaw = cleaned.toLowerCase();

    return (
      activeStudents.find((st) => {
        const id = st.id.toLowerCase();
        const adm = (st.admissionNumber || '').toLowerCase();
        return (
          (extracted && (id === extracted || adm === extracted)) ||
          id === lowerRaw ||
          adm === lowerRaw ||
          lowerRaw.includes(id) ||
          (adm && lowerRaw.includes(adm))
        );
      }) || null
    );
  };

  const commitPresentForStudent = (
    matched: Student,
    rawCode: string,
    source: 'qr' | 'manual_override'
  ) => {
    const now = Date.now();
    setFeedbackError(null);
    const nowIso = new Date().toISOString();
    const record: AttendanceRecord = {
      id: `att-${matched.id}-${selectedDate}`,
      date: selectedDate,
      studentId: matched.id,
      classNumber: matched.classNumber,
      section: matched.section,
      status: 'Present',
      academicSession: school.academicSession || '2026-2027',
      markedByUserId: currentUser.id,
      markedAt: nowIso,
      isOfflineSynced: typeof navigator !== 'undefined' ? navigator.onLine : true,
      remarks:
        source === 'manual_override'
          ? 'Marked Present via Manual Override (QR Attendance Scanner)'
          : 'Marked Present via Student ID QR Scanner',
    };

    onSaveAttendance([record], []);
    onStudentMarkedPresent?.(matched, rawCode);

    if (feedbackEnabledRef.current) {
      triggerQrSuccessConfirmationFeedback();
    }

    const entry: ScannedLogItem = {
      id: `qr-${matched.id}-${now}`,
      student: matched,
      scannedAt: new Date(now).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      timestampMs: now,
      rawCode,
      source,
      isSynced: record.isOfflineSynced !== false,
    };
    setLastScanned(entry);
    setRecentScans((prev) => [entry, ...prev.filter((x) => x.student.id !== matched.id)].slice(0, 20));

    // Trigger 'Scan Successful' overlay animation & green border flash directly over the camera viewport
    flashFrameFeedback('success');
    if (overlayTimerRef.current !== null) {
      window.clearTimeout(overlayTimerRef.current);
    }
    setScanSuccessOverlay({
      key: now,
      studentName: matched.fullName,
      classLabel: `Class ${matched.classNumber}-${matched.section}`,
      rollNumber: String(matched.rollNumber),
      admissionNumber: matched.admissionNumber || matched.id,
      source,
    });
    overlayTimerRef.current = window.setTimeout(() => {
      setScanSuccessOverlay(null);
      overlayTimerRef.current = null;
    }, 1550);
  };

  const markStudentPresentFromQr = (rawText: string) => {
    const now = Date.now();
    const prevTs = cooldownMapRef.current.get(rawText) || 0;
    if (now - prevTs < 2500) return;
    cooldownMapRef.current.set(rawText, now);

    const matched = findStudentByQr(rawText);
    if (!matched) {
      flashFrameFeedback('fail');
      setFeedbackError(`No matching active student found for QR code "${rawText.slice(0, 60)}".`);
      window.setTimeout(() => setFeedbackError(null), 3500);
      return;
    }

    commitPresentForStudent(matched, rawText, 'qr');
  };

  const handleManualRollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = manualRollText.trim();
    if (!raw) return;
    const numericRoll = Number(raw);
    const matched = activeStudents.find(
      (s) =>
        String(s.rollNumber) === raw ||
        (!Number.isNaN(numericRoll) && s.rollNumber === numericRoll) ||
        (s.admissionNumber || '').toLowerCase() === raw.toLowerCase()
    );
    if (!matched) {
      flashFrameFeedback('fail');
      setFeedbackError(`No active student found for Roll Number "${raw}".`);
      window.setTimeout(() => setFeedbackError(null), 3500);
      return;
    }
    commitPresentForStudent(matched, `ROLL:${matched.rollNumber}`, 'manual_override');
    setManualRollText('');
  };

  const stopCamera = async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    if (instance) {
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
        instance.clear();
      } catch {
        // Ignore teardown race conditions
      }
    }
    setIsScanning(false);
  };

  const startCamera = async (nextFacing: 'environment' | 'user' = facingMode) => {
    await stopCamera();
    setCameraError(null);
    try {
      const html5Qr = new Html5Qrcode(readerElementId);
      scannerRef.current = html5Qr;
      await html5Qr.start(
        { facingMode: nextFacing },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          markStudentPresentFromQr(decodedText);
        },
        () => {
          // Frame without QR code — ignore
        }
      );
      setIsScanning(true);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to access device camera. Check browser camera permissions or use Manual Override below.';
      setCameraError(msg);
      setIsScanning(false);
    }
  };

  useEffect(() => {
    return () => {
      if (overlayTimerRef.current !== null) {
        window.clearTimeout(overlayTimerRef.current);
      }
      void stopCamera();
    };
  }, []);

  const handleToggleFacing = async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    if (isScanning) {
      await startCamera(next);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    markStudentPresentFromQr(manualInput.trim());
    setManualInput('');
  };

  return (
    <section
      aria-label="QR Attendance Scanner"
      className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
    >
      <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-indigo-600" />
            <span>QR Attendance Scanner</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Scan any student ID card QR code to mark them Present instantly for {selectedDate}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Beep & Haptic Feedback Toggle */}
          <button
            type="button"
            onClick={() => setFeedbackEnabled((prev) => !prev)}
            aria-pressed={feedbackEnabled}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
              feedbackEnabled
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
            }`}
            title="Toggle short confirmation beep and subtle haptic feedback on successful QR scan"
          >
            {feedbackEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{feedbackEnabled ? 'Beep & Haptics On' : 'Sound Muted'}</span>
          </button>

          {/* Enter Roll Number Manually Button */}
          <button
            type="button"
            onClick={() => setShowManualRollPanel((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
              showManualRollPanel
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
            }`}
          >
            <span>Enter Roll Number Manually</span>
          </button>

          {/* Manual Override Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={manualOverrideEnabled}
            onClick={() => setManualOverrideEnabled((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 ${
              manualOverrideEnabled
                ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Manual Override: {manualOverrideEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleFacing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Flip Camera</span>
          </button>

          <button
            type="button"
            onClick={() => (isScanning ? void stopCamera() : void startCamera())}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
              isScanning
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {isScanning ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            <span>{isScanning ? 'Stop Camera' : 'Start QR Camera'}</span>
          </button>
        </div>
      </div>

      {/* Daily Scan Summary Card (Total Present via QR Today + Class Breakdown) */}
      <div className="px-5 pt-4">
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-white to-emerald-50/70 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  Daily Scan Summary ({selectedDate})
                </h3>
                <p className="text-[11px] text-slate-600">
                  Total students marked &lsquo;Present&rsquo; via QR &amp; Manual Override today across classes
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              {/* Class Filter Dropdown for Last 5 Scan History Log */}
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200">
                <label
                  htmlFor="scan-history-class-filter"
                  className="text-[11px] font-semibold text-slate-600 whitespace-nowrap"
                >
                  Filter History:
                </label>
                <select
                  id="scan-history-class-filter"
                  aria-label="Filter last 5 scan history by class"
                  value={scanHistoryClassFilter}
                  onChange={(e) => setScanHistoryClassFilter(e.target.value)}
                  className="text-xs font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer pr-1"
                >
                  <option value="ALL">All Classes</option>
                  {availableScanClasses.map((clsLabel) => {
                    const matchedCount = dailyScanSummary.breakdown.find(
                      (b) => b.label === clsLabel
                    )?.scanned;
                    return (
                      <option key={clsLabel} value={clsLabel}>
                        {clsLabel}
                        {matchedCount ? ` (${matchedCount})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-baseline gap-2 bg-white px-3.5 py-2 rounded-xl border border-indigo-200 shadow-2xs">
                <span className="text-2xl font-black font-mono tabular-nums text-emerald-700">
                  {dailyScanSummary.totalScannedToday}
                </span>
                <span className="text-[11px] font-bold text-slate-600">Present Today</span>
              </div>
            </div>
          </div>

          {dailyScanSummary.breakdown.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {dailyScanSummary.breakdown.map((cls) => {
                const pct = cls.total > 0 ? Math.min(100, Math.round((cls.scanned / cls.total) * 100)) : 100;
                const isSelectedClass = scanHistoryClassFilter === cls.label;
                return (
                  <button
                    key={cls.label}
                    type="button"
                    onClick={() =>
                      setScanHistoryClassFilter((prev) => (prev === cls.label ? 'ALL' : cls.label))
                    }
                    className={`text-left rounded-xl bg-white border px-3 py-2 space-y-1.5 transition-colors ${
                      isSelectedClass
                        ? 'border-indigo-500 ring-1 ring-indigo-400/50'
                        : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-xs">
                      <span className="font-bold text-slate-800 truncate">{cls.label}</span>
                      <span className="font-mono tabular-nums font-extrabold text-emerald-700">
                        {cls.scanned}
                        {cls.total > 0 ? `/${cls.total}` : ''}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              No students have been marked via QR scan yet for {selectedDate}. Scan an ID card or enable Manual Override to begin.
            </p>
          )}
          {scannerSyncProgress.pending > 0 && (
            <div className="rounded-xl bg-amber-50/80 border border-amber-200 px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-semibold text-amber-950">
                  Sync Status · {scannerSyncProgress.pending} unsynced scan{scannerSyncProgress.pending === 1 ? '' : 's'} remaining
                </span>
                <span className="font-mono tabular-nums font-bold text-amber-900">
                  {scannerSyncProgress.synced}/{scannerSyncProgress.total} ({scannerSyncProgress.pct}%)
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="QR scan cloud sync progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={scannerSyncProgress.pct}
                className="w-full h-1.5 rounded-full bg-amber-200/80 overflow-hidden"
              >
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(scannerSyncProgress.pct, 4)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scan History Log (Last 5 Successful Student Scans with Timestamps & Profile Photos) */}
      <div className="px-5 pt-3">
        <div
          aria-label="Scan History Log"
          className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
        >
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-slate-900">
                  Scan History — Last 5 Successful Scans
                  {scanHistoryClassFilter !== 'ALL' ? ` (${scanHistoryClassFilter})` : ''}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Immediate verification log with student profile photos and scan timestamps for {selectedDate}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {scanHistoryClassFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setScanHistoryClassFilter('ALL')}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline whitespace-nowrap"
                >
                  Show All
                </button>
              )}
              <span className="text-xs font-mono tabular-nums font-semibold text-slate-600">
                {lastFiveScanHistory.length} / 5 shown
              </span>
              <button
                type="button"
                onClick={handleExportCurrentScanHistoryPdf}
                data-testid="qr-export-scan-history-pdf-btn"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-colors whitespace-nowrap shrink-0"
                title="Export scan history log, daily total count, and per-class breakdown to PDF"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Export PDF</span>
              </button>
            </div>
          </div>

          {pdfExportNotice && (
            <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-[11px] font-semibold">
              {pdfExportNotice}
            </div>
          )}

          {lastFiveScanHistory.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-slate-500">
              {scanHistoryClassFilter === 'ALL'
                ? `No successful student scans recorded yet for ${selectedDate}. The 5 most recent verified scans will appear here with timestamps.`
                : `No successful scans recorded yet for ${scanHistoryClassFilter} on ${selectedDate}.`}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {lastFiveScanHistory.map((item, idx) => {
                const liveProfile =
                  studentProfileMap.get(item.student.id) ||
                  studentProfileMap.get((item.student.admissionNumber || '').toLowerCase()) ||
                  item.student;
                return (
                  <div
                    key={item.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[11px] font-mono tabular-nums font-bold text-slate-400 w-4 shrink-0">
                        #{idx + 1}
                      </span>
                      <StudentScanPhotoThumb
                        photoUrl={liveProfile.photoDataUrl}
                        fullName={liveProfile.fullName}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {liveProfile.fullName}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500">
                          <span className="font-mono tabular-nums">
                            Class {liveProfile.classNumber}-{liveProfile.section}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">Roll #{liveProfile.rollNumber}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.source === 'manual_override' ? 'Manual Override' : 'QR Scan'}</span>
                          <span aria-hidden="true">·</span>
                          <span className={item.isSynced ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                            {item.isSynced ? 'Synced' : 'Pending Sync'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="inline-flex items-center gap-1 text-xs font-mono tabular-nums font-bold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{item.scannedAt}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Manual Override Panel (Damaged or Missing ID Card Search by Name) */}
      {manualOverrideEnabled && (
        <div className="px-5 pt-4">
          <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-amber-700" />
                  <span>Manual Override — Missing or Damaged Student ID Card</span>
                </h3>
                <p className="text-[11px] text-amber-900/80">
                  Search any student by full name, roll number, or class to mark them &lsquo;Present&rsquo; manually for {selectedDate}.
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-amber-700 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={overrideSearchQuery}
                  onChange={(e) => setOverrideSearchQuery(e.target.value)}
                  placeholder="Search student by name..."
                  aria-label="Manual override student name search"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-amber-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {overrideSearchResults.length === 0 ? (
              <p className="text-xs text-amber-900/80 py-2">
                No active students match &ldquo;{overrideSearchQuery}&rdquo;.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
                {overrideSearchResults.map((student) => {
                  const alreadyPresent = presentTodayIds.has(student.id);
                  return (
                    <div
                      key={student.id}
                      className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-white border border-amber-200/80"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {student.photoDataUrl ? (
                          <img
                            src={student.photoDataUrl}
                            alt={student.fullName}
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-200 shrink-0">
                            {student.fullName
                              .split(' ')
                              .slice(0, 2)
                              .map((p) => p[0])
                              .join('')
                              .toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{student.fullName}</p>
                          <p className="text-[11px] text-slate-500 font-mono truncate">
                            Class {student.classNumber}-{student.section} · Roll #{student.rollNumber}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          commitPresentForStudent(
                            student,
                            `MANUAL:${student.admissionNumber || student.id}`,
                            'manual_override'
                          )
                        }
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors ${
                          alreadyPresent
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {alreadyPresent ? 'Present ✓' : 'Mark Present'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Live Camera Viewport + Quick ID Input */}
        <div className="lg:col-span-7 space-y-4">
          {showAlignTooltip && (
            <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-3.5 py-2.5 flex items-start justify-between gap-2 text-xs">
              <p className="text-indigo-950">
                <strong className="font-bold">Alignment Guide:</strong> Hold the student ID card 15–20 cm from the camera and center the QR code inside the frame under clear light. The border flashes green on success or red if unrecognized.
              </p>
              <button
                type="button"
                onClick={() => setShowAlignTooltip(false)}
                className="text-[11px] font-bold text-indigo-700 hover:text-indigo-950 shrink-0"
              >
                Hide
              </button>
            </div>
          )}

          {showManualRollPanel && (
            <form
              onSubmit={handleManualRollSubmit}
              className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex flex-wrap items-center gap-2"
            >
              <input
                type="text"
                inputMode="numeric"
                value={manualRollText}
                onChange={(e) => setManualRollText(e.target.value)}
                placeholder="Enter damaged ID card Roll Number or Adm No..."
                className="flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-white border border-amber-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap"
              >
                Log Attendance
              </button>
            </form>
          )}

          <div
            className={`rounded-2xl bg-slate-950 overflow-hidden relative min-h-[260px] flex items-center justify-center transition-all duration-300 ${
              frameFeedback === 'success'
                ? 'border-4 border-emerald-400 ring-4 ring-emerald-500/35'
                : frameFeedback === 'fail'
                ? 'border-4 border-rose-500 ring-4 ring-rose-500/35'
                : 'border-2 border-slate-800'
            }`}
          >
            <div
              id={readerElementId}
              className="w-full [&_video]:w-full [&_video]:max-h-[340px] [&_video]:object-cover"
            />
            {!isScanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-300 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <QrCode className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Camera Ready for Student ID QR Codes</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Click &ldquo;Start QR Camera&rdquo; for continuous scanning with beep &amp; haptic confirmation, or use Enter Roll Number Manually above.
                  </p>
                </div>
              </div>
            )}

            {/* 'Scan Successful' Overlay Animation over Camera View */}
            {scanSuccessOverlay && (
              <div
                key={scanSuccessOverlay.key}
                role="status"
                aria-live="polite"
                className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center bg-emerald-950/70 backdrop-blur-[2px] animate-scan-success-pop p-4"
              >
                <div className="flex flex-col items-center text-center max-w-xs">
                  <div className="relative flex items-center justify-center mb-3">
                    <span
                      aria-hidden="true"
                      className="absolute w-16 h-16 rounded-full border-2 border-emerald-400 animate-scan-success-ring"
                    />
                    <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg">
                      <CheckCircle2 className="w-9 h-9" />
                    </div>
                  </div>
                  <p className="text-base font-extrabold text-white tracking-tight">
                    Scan Successful
                  </p>
                  <p className="text-sm font-bold text-emerald-200 mt-0.5 truncate max-w-full">
                    {scanSuccessOverlay.studentName}
                  </p>
                  <p className="text-xs font-mono tabular-nums text-emerald-100/90 mt-1">
                    {scanSuccessOverlay.classLabel} · Roll #{scanSuccessOverlay.rollNumber} · Present
                  </p>
                </div>
              </div>
            )}
          </div>

          {cameraError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{cameraError}</span>
            </div>
          )}

          {feedbackError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{feedbackError}</span>
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Scan hardware barcode or enter Student ID / Admission #..."
                aria-label="Manual student QR or ID input"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
            >
              Mark Present
            </button>
          </form>
        </div>

        {/* Right: Instant Verification Card & Today's QR Log */}
        <div className="lg:col-span-5 space-y-4">
          {lastScanned ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3.5">
              {lastScanned.student.photoDataUrl ? (
                <img
                  src={lastScanned.student.photoDataUrl}
                  alt={lastScanned.student.fullName}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-xl object-cover border border-emerald-300 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-emerald-600 text-white font-bold text-base flex items-center justify-center shrink-0">
                  {lastScanned.student.fullName
                    .split(' ')
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join('')
                    .toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Marked Present ({lastScanned.scannedAt})
                    {lastScanned.source === 'manual_override' ? ' · Manual Override' : ''}
                  </span>
                </div>
                <p className="text-sm font-extrabold text-slate-900 truncate mt-0.5">
                  {lastScanned.student.fullName}
                </p>
                <p className="text-xs text-slate-600 font-mono tabular-nums">
                  Class {lastScanned.student.classNumber}-{lastScanned.student.section} · Roll #
                  {lastScanned.student.rollNumber} · {lastScanned.student.admissionNumber}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-3">
              <UserCheck className="w-5 h-5 text-slate-400 shrink-0" />
              <span>Awaiting first student QR scan for {selectedDate}.</span>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Session QR Scans</span>
              <span className="font-mono tabular-nums text-emerald-700">
                {recentScans.length} Present
              </span>
            </div>
            {recentScans.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Scanned students will appear here immediately with their profile photos.
              </div>
            ) : (
              <div className="max-h-[260px] overflow-y-auto divide-y divide-slate-100">
                {recentScans.map((item) => (
                  <div key={item.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.student.photoDataUrl ? (
                        <img
                          src={item.student.photoDataUrl}
                          alt={item.student.fullName}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold flex items-center justify-center shrink-0">
                          {item.student.fullName
                            .split(' ')
                            .slice(0, 2)
                            .map((p) => p[0])
                            .join('')
                            .toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {item.student.fullName}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                          Class {item.student.classNumber}-{item.student.section} · #
                          {item.student.rollNumber}
                          {item.source === 'manual_override' ? ' · Manual' : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-emerald-700 font-semibold shrink-0">
                      {item.scannedAt}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
