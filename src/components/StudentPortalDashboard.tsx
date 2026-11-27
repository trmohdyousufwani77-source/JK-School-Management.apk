import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  GraduationCap,
  CalendarCheck,
  BookOpen,
  Award,
  Bell,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  QrCode,
  Camera,
  CameraOff,
  Upload,
  X,
  ScanLine,
} from 'lucide-react';
import type {
  AttendanceAuditLog,
  AttendanceRecord,
  Examination,
  NoticeBoardItem,
  SchoolProfile,
  Student,
  StudentMarkEntry,
  User,
} from '../types';
import { calculateAttendancePercentage, calculateStudentExamSummary } from '../utils/calculations';
import { sampleSubjectConfigs } from '../utils/sampleData';

interface StudentPortalDashboardProps {
  school: SchoolProfile;
  currentUser: User;
  students: Student[];
  attendanceRecords: AttendanceRecord[];
  examinations: Examination[];
  marksEntries: StudentMarkEntry[];
  notices: NoticeBoardItem[];
  onMarkAttendance?: (records: AttendanceRecord[], auditLogs: AttendanceAuditLog[]) => void;
}

interface QuickScanResult {
  status: 'marked' | 'already_marked' | 'not_found';
  student?: Student;
  rawCode: string;
  timestamp: string;
  message: string;
}

function resolveScannedStudent(rawText: string, students: Student[]): Student | null {
  const cleaned = rawText.trim();
  if (!cleaned) return null;

  let candidateIds: string[] = [cleaned];
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      const fields = [
        parsed.studentId,
        parsed.id,
        parsed.admissionNumber,
        parsed.admNo,
        parsed.srn,
      ];
      fields.forEach((f) => {
        if (typeof f === 'string' && f.trim()) candidateIds.push(f.trim());
      });
    }
  } catch {
    // Plain-text QR payload (e.g. Admission Number or Student ID)
    const pipeParts = cleaned.split(/[|,\n]/).map((p) => p.trim()).filter(Boolean);
    candidateIds = [...candidateIds, ...pipeParts];
  }

  const normalized = candidateIds.map((c) => c.toLowerCase());
  return (
    students.find(
      (s) =>
        normalized.includes(s.id.toLowerCase()) ||
        normalized.includes(s.admissionNumber.toLowerCase()) ||
        normalized.some((token) => token.includes(s.admissionNumber.toLowerCase()))
    ) || null
  );
}

export const StudentPortalDashboard: React.FC<StudentPortalDashboardProps> = ({
  school,
  currentUser,
  students,
  attendanceRecords,
  examinations,
  marksEntries,
  notices,
  onMarkAttendance,
}) => {
  const activeStudents = useMemo(
    () => students.filter((s) => s.status !== 'Transferred' && s.status !== 'Archived'),
    [students]
  );

  const [selectedStudentId, setSelectedStudentId] = useState<string>(activeStudents[0]?.id || '');

  // Quick Scan QR Attendance Camera Modal state
  const [isQuickScanOpen, setIsQuickScanOpen] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualQrInput, setManualQrInput] = useState<string>('');
  const [scanResult, setScanResult] = useState<QuickScanResult | null>(null);
  const [recentQuickScans, setRecentQuickScans] = useState<QuickScanResult[]>([]);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastDecodedRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scannerElementId = 'student-portal-quick-scan-reader';

  const student = useMemo(
    () => activeStudents.find((s) => s.id === selectedStudentId) || activeStudents[0] || null,
    [activeStudents, selectedStudentId]
  );

  const studentAttendance = useMemo(() => {
    if (!student) return [];
    return attendanceRecords
      .filter((r) => r.studentId === student.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendanceRecords, student]);

  const presentCount = studentAttendance.filter((r) => r.status === 'Present' || r.status === 'Late').length;
  const absentCount = studentAttendance.filter((r) => r.status === 'Absent').length;

  const attendancePct = useMemo(
    () => (student ? calculateAttendancePercentage(presentCount, studentAttendance.length) : 0),
    [student, presentCount, studentAttendance.length]
  );

  const latestExam = examinations[0] || null;
  const studentExamMarks = useMemo(() => {
    if (!student || !latestExam) return [];
    return marksEntries.filter((m) => m.studentId === student.id && m.examId === latestExam.id);
  }, [student, latestExam, marksEntries]);

  const subjectNameMap = useMemo(() => {
    const map = new Map<string, string>();
    sampleSubjectConfigs.forEach((s) => map.set(s.code, s.name));
    return map;
  }, []);

  const examSummary = useMemo(() => {
    if (!student || !latestExam || studentExamMarks.length === 0) return null;
    const derivedSubjects = studentExamMarks.map((m) => ({
      code: m.subjectCode,
      name: subjectNameMap.get(m.subjectCode) || m.subjectCode,
      maxMarks: m.maxMarks || 100,
      passingMarks: Math.round((m.maxMarks || 100) * 0.33),
      isCompulsory: true,
    }));
    return calculateStudentExamSummary(
      student.id,
      student.fullName,
      student.rollNumber,
      student.classNumber,
      student.section,
      latestExam.id,
      latestExam.name,
      studentExamMarks,
      derivedSubjects,
      school.gradingScale,
      attendancePct
    );
  }, [student, latestExam, studentExamMarks, subjectNameMap, school.gradingScale, attendancePct]);

  const savedStudioMaterials = useMemo(() => {
    try {
      const raw = localStorage.getItem('sm_ai_smart_edu_saved_v1');
      const parsed = raw ? (JSON.parse(raw) as Array<{ id: string; title: string; type: string; subject: string; classLevel: string; savedAt: string }>) : [];
      return parsed.slice(0, 6);
    } catch {
      return [];
    }
  }, []);

  const stopCameraScanner = async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    setCameraActive(false);
    if (instance) {
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
      } catch {
        // Ignore stop race on unmount
      }
      try {
        instance.clear();
      } catch {
        // Ignore clear errors if DOM already removed
      }
    }
  };

  const processQrScan = (decodedText: string) => {
    const now = Date.now();
    if (
      lastDecodedRef.current.text === decodedText &&
      now - lastDecodedRef.current.at < 2500
    ) {
      return;
    }
    lastDecodedRef.current = { text: decodedText, at: now };

    const matched = resolveScannedStudent(decodedText, activeStudents);
    const isoNow = new Date().toISOString();
    const todayDate = isoNow.slice(0, 10);

    if (!matched) {
      const notFoundResult: QuickScanResult = {
        status: 'not_found',
        rawCode: decodedText,
        timestamp: isoNow,
        message: `No active student ID matched "${decodedText.slice(0, 48)}".`,
      };
      setScanResult(notFoundResult);
      return;
    }

    setSelectedStudentId(matched.id);

    const existingToday = attendanceRecords.find(
      (r) => r.studentId === matched.id && r.date === todayDate && (r.status === 'Present' || r.status === 'Late')
    );

    if (existingToday) {
      const alreadyResult: QuickScanResult = {
        status: 'already_marked',
        student: matched,
        rawCode: decodedText,
        timestamp: isoNow,
        message: `${matched.fullName} (Class ${matched.classNumber}-${matched.section}) is already marked ${existingToday.status} for ${todayDate}.`,
      };
      setScanResult(alreadyResult);
      setRecentQuickScans((prev) => [alreadyResult, ...prev].slice(0, 6));
      return;
    }

    const newRecord: AttendanceRecord = {
      id: `att-qr-${matched.id}-${todayDate}`,
      studentId: matched.id,
      classNumber: matched.classNumber,
      section: matched.section,
      academicSession: matched.academicSession || school.academicSession,
      date: todayDate,
      status: 'Present',
      markedByUserId: currentUser.id,
      markedAt: isoNow,
      remarks: 'Quick Scan QR Check-In (Student Portal)',
    };

    const existingAnyToday = attendanceRecords.find(
      (r) => r.studentId === matched.id && r.date === todayDate
    );

    const auditEntry: AttendanceAuditLog = {
      id: `audit-qr-${Date.now()}-${matched.id}`,
      timestamp: isoNow,
      userId: currentUser.id,
      userName: currentUser.name,
      studentId: matched.id,
      studentName: matched.fullName,
      date: todayDate,
      previousStatus: existingAnyToday ? existingAnyToday.status : 'Absent',
      newStatus: 'Present',
      reason: 'Real-time QR ID Quick Scan in Student Portal',
    };

    if (onMarkAttendance) {
      onMarkAttendance([newRecord], [auditEntry]);
    }

    const markedResult: QuickScanResult = {
      status: 'marked',
      student: matched,
      rawCode: decodedText,
      timestamp: isoNow,
      message: `Marked Present for ${matched.fullName} (Adm: ${matched.admissionNumber}, Class ${matched.classNumber}-${matched.section}).`,
    };
    setScanResult(markedResult);
    setRecentQuickScans((prev) => [markedResult, ...prev].slice(0, 6));
  };

  // Start / stop live camera when Quick Scan modal opens or closes
  useEffect(() => {
    if (!isQuickScanOpen) {
      void stopCameraScanner();
      return;
    }

    let cancelled = false;
    setCameraError(null);

    const startCamera = async () => {
      await new Promise((r) => setTimeout(r, 120));
      if (cancelled) return;
      const container = document.getElementById(scannerElementId);
      if (!container) return;

      try {
        const html5Qr = new Html5Qrcode(scannerElementId, { verbose: false });
        scannerRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
          (decodedText) => {
            if (!cancelled) processQrScan(decodedText);
          },
          () => {
            // Frame had no QR code — continue scanning silently
          }
        );
        if (!cancelled) {
          setCameraActive(true);
        }
      } catch (err) {
        if (!cancelled) {
          setCameraActive(false);
          const msg = err instanceof Error ? err.message : 'Camera access was denied or unavailable.';
          setCameraError(
            `${msg} You can still scan a Student ID QR image file or enter an Admission Number below.`
          );
        }
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      void stopCameraScanner();
    };
  }, [isQuickScanOpen]);

  const handleScanQrImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);
    try {
      const tempId = 'student-portal-qr-file-temp';
      let tempEl = document.getElementById(tempId);
      if (!tempEl) {
        tempEl = document.createElement('div');
        tempEl.id = tempId;
        tempEl.style.display = 'none';
        document.body.appendChild(tempEl);
      }
      const fileScanner = new Html5Qrcode(tempId, { verbose: false });
      const decoded = await fileScanner.scanFile(file, false);
      fileScanner.clear();
      processQrScan(decoded);
    } catch {
      setCameraError('Could not detect a valid Student ID QR code in the selected image.');
    } finally {
      e.target.value = '';
    }
  };

  if (!student) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-600">
        No active student profiles available yet. Add a student in Student Management to preview the Student Dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-5 text-slate-900">
      {/* Header & Scoped Student Profile Selector + Quick Scan Attendance Button */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {student.photoDataUrl ? (
            <img
              src={student.photoDataUrl}
              alt={student.fullName}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-extrabold text-lg shrink-0">
              {student.fullName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-indigo-600 shrink-0" />
              <span>Student Dashboard — {student.fullName}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
              <span className="font-mono tabular-nums">Adm No: {student.admissionNumber}</span>
              <span aria-hidden="true">·</span>
              <span>Class {student.classNumber}-{student.section}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Roll #{student.rollNumber}</span>
              <span aria-hidden="true">·</span>
              <span>Session {student.academicSession}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="student-portal-quick-scan-btn"
            onClick={() => {
              setScanResult(null);
              setIsQuickScanOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-sm transition-colors whitespace-nowrap"
          >
            <QrCode className="w-4 h-4" />
            <span>Quick Scan</span>
          </button>

          <label className="text-xs font-bold text-slate-600">Student View:</label>
          <select
            value={student.id}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            aria-label="Select student profile"
            className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-900"
          >
            {activeStudents.slice(0, 60).map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} (Class {s.classNumber}-{s.section}, Roll #{s.rollNumber})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
          <div className="text-xs font-semibold text-slate-500">Attendance Percentage</div>
          <div className={`text-2xl font-extrabold font-mono tabular-nums ${attendancePct >= 75 ? 'text-emerald-700' : 'text-rose-600'}`}>
            {attendancePct}%
          </div>
          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
            {presentCount} Present · {absentCount} Absent
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
          <div className="text-xs font-semibold text-slate-500">Academic Standing</div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-indigo-700">
            {examSummary ? `${examSummary.percentage}%` : '—'}
          </div>
          <div className="text-[11px] text-slate-500">
            {examSummary ? `Grade ${examSummary.overallGrade} · ${latestExam?.name}` : 'Awaiting published marks'}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
          <div className="text-xs font-semibold text-slate-500">Learning Materials</div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900">
            {savedStudioMaterials.length}
          </div>
          <div className="text-[11px] text-slate-500">AI Q&amp;A, Worksheets &amp; Lesson Notes</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
          <div className="text-xs font-semibold text-slate-500">Parent Contact</div>
          <div className="text-base font-extrabold font-mono tabular-nums text-slate-900 truncate">
            {student.mobileNumber || 'Not registered'}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            Guardian: {student.fatherName || student.guardianName || '—'}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Attendance History & Academic Report */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-emerald-600" />
              <span>Attendance History (Recent Records)</span>
            </h2>
            {studentAttendance.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No attendance entries recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2 pr-3 font-bold">Date</th>
                      <th className="py-2 px-3 font-bold">Status</th>
                      <th className="py-2 pl-3 font-bold">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentAttendance.slice(0, 12).map((rec) => (
                      <tr key={rec.id}>
                        <td className="py-2 pr-3 font-mono tabular-nums text-slate-800">{rec.date}</td>
                        <td className="py-2 px-3 font-bold">
                          <span className={`inline-flex items-center gap-1 ${rec.status === 'Present' ? 'text-emerald-700' : rec.status === 'Absent' ? 'text-rose-600' : 'text-amber-700'}`}>
                            {rec.status === 'Present' ? <CheckCircle2 className="w-3.5 h-3.5" /> : rec.status === 'Absent' ? <XCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                            {rec.status}
                          </span>
                        </td>
                        <td className="py-2 pl-3 text-slate-500">{rec.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-600" />
              <span>Academic Report Summary</span>
            </h2>
            {examSummary && latestExam ? (
              <div className="space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <span className="font-bold text-slate-900">{latestExam.name}</span>
                  <span className="font-mono tabular-nums font-bold text-indigo-700">
                    {examSummary.totalMarksObtained}/{examSummary.totalMaxMarks} ({examSummary.percentage}% · Grade {examSummary.overallGrade})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {studentExamMarks.map((sr) => (
                    <div key={sr.subjectCode} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        {subjectNameMap.get(sr.subjectCode) || sr.subjectCode}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-slate-900">
                        {sr.isAbsent ? 'AB' : `${sr.marksObtained}/${sr.maxMarks || 100}`} ({sr.grade || '—'})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Academic assessment marks for this student will appear once entered by subject teachers.</p>
            )}
          </div>
        </div>

        {/* Right: Learning Materials, Homework & Notifications */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span>Learning Materials, Worksheets &amp; Homework</span>
            </h2>
            {savedStudioMaterials.length === 0 ? (
              <p className="text-xs text-slate-500">
                AI-generated Q&amp;A sets, lesson materials, and worksheets saved in the AI Teaching &amp; Learning Studio will automatically appear here for students.
              </p>
            ) : (
              <div className="space-y-2">
                {savedStudioMaterials.map((item) => (
                  <div key={item.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5 text-xs">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {item.subject} · {item.classLevel} · {item.type.toUpperCase()} · {new Date(item.savedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600" />
              <span>School Announcements &amp; Notifications</span>
            </h2>
            {notices.length === 0 ? (
              <p className="text-xs text-slate-500">No active school announcements at this time.</p>
            ) : (
              <div className="space-y-2">
                {notices.slice(0, 5).map((n) => (
                  <div key={n.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs">
                    <div className="font-bold text-slate-900">{n.title}</div>
                    <p className="text-slate-600 line-clamp-2">{n.body}</p>
                    <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                      {new Date(n.createdAt).toLocaleDateString('en-IN')} · {n.priority}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-xs text-slate-600 flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              Viewing scoped student record as <strong>{currentUser.name}</strong> ({school.name}). Students only access their own authorized academic information.
            </span>
          </div>
        </div>
      </div>

      {/* Quick Scan Live Camera QR Attendance Modal */}
      {isQuickScanOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick Scan Student ID QR Attendance"
          data-testid="student-portal-quick-scan-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ScanLine className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <h3 className="text-sm font-extrabold">Quick Scan — Real-Time QR Attendance</h3>
                  <p className="text-[11px] text-slate-300">
                    Point camera at any Student ID Card QR code to mark Present immediately
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickScanOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                aria-label="Close Quick Scan scanner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              {/* Camera Viewport */}
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 relative min-h-[240px] flex flex-col items-center justify-center">
                <div id={scannerElementId} className="w-full" />
                {!cameraActive && !cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300 p-4 text-center">
                    <Camera className="w-8 h-8 text-indigo-400 animate-pulse" />
                    <span className="font-semibold">Starting camera for QR code scan...</span>
                  </div>
                )}
                {cameraError && (
                  <div className="p-5 text-center space-y-2 text-slate-200">
                    <CameraOff className="w-8 h-8 text-amber-400 mx-auto" />
                    <p className="font-bold text-amber-200">Camera Unavailable</p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">{cameraError}</p>
                  </div>
                )}
              </div>

              {/* Real-Time Scan Feedback Banner */}
              {scanResult && (
                <div
                  role="status"
                  data-testid="quick-scan-result-banner"
                  className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                    scanResult.status === 'marked'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : scanResult.status === 'already_marked'
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {scanResult.status === 'not_found' ? (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <div className="font-extrabold">
                      {scanResult.status === 'marked'
                        ? 'Attendance Marked Present'
                        : scanResult.status === 'already_marked'
                        ? 'Already Checked In Today'
                        : 'Student QR Not Recognized'}
                    </div>
                    <p className="text-[11px] leading-relaxed">{scanResult.message}</p>
                    <div className="text-[10px] font-mono opacity-75">
                      {new Date(scanResult.timestamp).toLocaleTimeString('en-IN')}
                    </div>
                  </div>
                </div>
              )}

              {/* Image Upload & Manual QR / Admission No Fallback */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-1 border-t border-slate-100">
                <form
                  className="sm:col-span-8 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!manualQrInput.trim()) return;
                    processQrScan(manualQrInput.trim());
                    setManualQrInput('');
                  }}
                >
                  <input
                    type="text"
                    value={manualQrInput}
                    onChange={(e) => setManualQrInput(e.target.value)}
                    placeholder="Or enter Admission No / QR payload..."
                    aria-label="Manual Admission Number or QR payload"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold whitespace-nowrap"
                  >
                    Check In
                  </button>
                </form>

                <div className="sm:col-span-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleScanQrImageFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Scan QR Image</span>
                  </button>
                </div>
              </div>

              {/* Recent Quick Scans in this Session */}
              {recentQuickScans.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Recent Check-Ins ({recentQuickScans.length})
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {recentQuickScans.map((item, idx) => (
                      <div
                        key={`${item.timestamp}-${idx}`}
                        className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="font-semibold text-slate-800 truncate">
                          {item.student?.fullName} ({item.student?.admissionNumber})
                        </span>
                        <span className="font-mono text-emerald-700 font-bold shrink-0">
                          Present · {new Date(item.timestamp).toLocaleTimeString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
