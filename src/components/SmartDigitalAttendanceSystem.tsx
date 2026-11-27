import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Camera,
  HeartPulse,
  Briefcase,
  CalendarClock,
  FileSpreadsheet,
  Users,
  ShieldCheck,
  Bell,
  Lock,
  Unlock,
  Download,
  Printer,
  Plus,
  Edit3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Upload,
  Search,
  KeyRound,
  History,
  Building2,
  DatabaseBackup,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { SchoolProfile, TeacherProfile, User } from '../types';
import {
  AttendanceCategoryConfig,
  AttendanceNotification,
  BiometricFaceTemplate,
  DEFAULT_ATTENDANCE_CATEGORIES,
  DigitalAttendanceAuditLog,
  DigitalAttendancePersistedState,
  DigitalAttendanceRecord,
  DigitalAttendanceRole,
  DigitalEmployeeProfile,
  GeneralLeaveApplication,
  HalfDayMode,
  MedicalLeaveApplication,
  MonthLockState,
  OnDutyApplication,
} from '../types/digitalAttendance';
import {
  computeMonthlyEmployeeSummary,
  enumerateDatesInclusive,
  exportMonthlyAttendanceExcel,
  exportMonthlyAttendancePdf,
  getDaysInMonth,
  getMonthName,
} from '../utils/digitalAttendanceExports';
import { sha256Hex } from '../utils/biometricFaceEngine';
import { printHtmlDocumentSafely } from '../utils/studioMediaStore';
import { guardSensitiveExport } from '../utils/biometricProtection';
import { FaceAttendanceVerificationModal } from './FaceAttendanceVerificationModal';

type DigitalAttendanceTab =
  | 'dashboard'
  | 'daily-face'
  | 'medical-leave'
  | 'on-duty'
  | 'leave-management'
  | 'monthly-register'
  | 'staff-profiles'
  | 'admin-audit';

interface SmartDigitalAttendanceSystemProps {
  school: SchoolProfile;
  currentUser: User;
  teachers: TeacherProfile[];
  onUpdateSchool: React.Dispatch<React.SetStateAction<SchoolProfile>>;
}

const STORAGE_KEY = 'sm_digital_staff_attendance_system_v1';

function getTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getCurrentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatNowTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function mapAppUserToDigitalRole(user: User): DigitalAttendanceRole {
  if (user.role === 'admin') return 'Super Administrator';
  if (user.role === 'head_teacher') return 'Headmaster/Principal';
  return 'Teaching Staff';
}

function halfDayModeToCode(mode: HalfDayMode): string {
  switch (mode) {
    case 'full_present':
      return 'P';
    case 'first_half_present_second_half_leave':
      return 'SH';
    case 'first_half_leave_second_half_present':
      return 'FH';
    case 'full_leave':
      return 'CL';
    case 'full_absent':
      return 'A';
  }
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function seedEmployeesFromTeachers(teachers: TeacherProfile[]): DigitalEmployeeProfile[] {
  const mapped: DigitalEmployeeProfile[] = teachers.map((t, idx) => ({
    id: t.id || `emp-${idx + 1}`,
    employeeId: t.employeeId || `EMP-${String(idx + 101).padStart(3, '0')}`,
    name: t.name,
    designation: t.designation || 'Teacher',
    department: t.subjectSpecialization ? `${t.subjectSpecialization} Dept.` : 'Academics',
    subject: t.subjectSpecialization || 'General',
    mobileNumber: t.contactNumber || '',
    dateOfJoining: t.dateOfJoining || '2021-04-01',
    photoDataUrl: undefined,
    employmentStatus: t.employmentStatus === 'Deputation' ? 'On Deputation' : 'Active',
    staffCategory: 'Teaching Staff',
    accountRole:
      (t.designation || '').toLowerCase().includes('head') || (t.designation || '').toLowerCase().includes('principal')
        ? 'Headmaster/Principal'
        : 'Teaching Staff',
    faceTemplate: null,
    leaveBalances: {
      CL: typeof t.casualLeaveBalance === 'number' ? t.casualLeaveBalance : 12,
      EL: typeof t.earnedLeaveBalance === 'number' ? t.earnedLeaveBalance : 15,
      ML: typeof t.medicalLeaveBalance === 'number' ? t.medicalLeaveBalance : 10,
    },
  }));

  if (mapped.length === 0) {
    mapped.push(
      {
        id: 'emp-seed-1',
        employeeId: 'EMP-101',
        name: 'Mohd Yousuf Wani',
        designation: 'Headmaster',
        department: 'Administration',
        subject: 'Educational Administration',
        mobileNumber: '9419000101',
        dateOfJoining: '2010-03-15',
        employmentStatus: 'Active',
        staffCategory: 'Teaching Staff',
        accountRole: 'Headmaster/Principal',
        faceTemplate: null,
        leaveBalances: { CL: 12, EL: 15, ML: 10 },
      },
      {
        id: 'emp-seed-2',
        employeeId: 'EMP-102',
        name: 'Shabnam Ara',
        designation: 'Senior Teacher',
        department: 'Science',
        subject: 'Science',
        mobileNumber: '9419000102',
        dateOfJoining: '2016-08-01',
        employmentStatus: 'Active',
        staffCategory: 'Teaching Staff',
        accountRole: 'Teaching Staff',
        faceTemplate: null,
        leaveBalances: { CL: 12, EL: 15, ML: 10 },
      },
      {
        id: 'emp-seed-3',
        employeeId: 'EMP-103',
        name: 'Tariq Ahmad Dar',
        designation: 'Office Clerk',
        department: 'School Office',
        subject: 'Administration',
        mobileNumber: '9419000103',
        dateOfJoining: '2018-05-10',
        employmentStatus: 'Active',
        staffCategory: 'Non-Teaching Staff',
        accountRole: 'Attendance Administrator',
        faceTemplate: null,
        leaveBalances: { CL: 12, EL: 15, ML: 10 },
      }
    );
  }
  return mapped;
}

const CHART_COLORS = ['#059669', '#e11d48', '#d97706', '#0284c7', '#4f46e5'];

export const SmartDigitalAttendanceSystem: React.FC<SmartDigitalAttendanceSystemProps> = ({
  school,
  currentUser,
  teachers,
  onUpdateSchool,
}) => {
  const todayIso = useMemo(() => getTodayIso(), []);
  const currentMonthKey = useMemo(() => getCurrentMonthKey(), []);

  const [activeTab, setActiveTab] = useState<DigitalAttendanceTab>('dashboard');
  const [activeRole, setActiveRole] = useState<DigitalAttendanceRole>(() =>
    mapAppUserToDigitalRole(currentUser)
  );
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [state, setState] = useState<DigitalAttendancePersistedState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DigitalAttendancePersistedState;
        if (parsed && Array.isArray(parsed.employees)) {
          return parsed;
        }
      }
    } catch {
      // Fallback to initial seed
    }
    return {
      employees: seedEmployeesFromTeachers(teachers),
      records: [],
      medicalLeaves: [],
      onDutyApplications: [],
      generalLeaves: [],
      categories: DEFAULT_ATTENDANCE_CATEGORIES,
      auditLogs: [],
      monthLocks: [],
      notifications: [],
      rules: {
        schoolStartTime: '09:00',
        schoolEndTime: '15:30',
        firstHalfCutoff: '12:30',
        weeklyOffDay: 0,
        dataRetentionDays: 365,
        academicSession: school.academicSession || '2026-27',
      },
      adminRemarksByEmployeeMonth: {},
    };
  });

  // Sync from backend server store on mount
  const hydratedFromServerRef = useRef(false);
  useEffect(() => {
    let active = true;
    fetch('/api/digital-attendance/state')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data?.ok || !data.state) return;
        const serverState = data.state as DigitalAttendancePersistedState;
        if (Array.isArray(serverState.employees) && serverState.employees.length > 0) {
          hydratedFromServerRef.current = true;
          setState(serverState);
        }
      })
      .catch(() => {
        // Offline / local fallback works seamlessly
      });
    return () => {
      active = false;
    };
  }, []);

  // Persist to localStorage & backend whenever state updates
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota errors
    }
    const timer = window.setTimeout(() => {
      fetch('/api/digital-attendance/state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': activeRole,
          'x-actor-name': currentUser.name,
        },
        body: JSON.stringify({ state }),
      }).catch(() => {
        // Offline-safe
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [state, activeRole, currentUser.name]);

  const notify = (msg: string) => {
    setStatusBanner(msg);
    setErrorBanner(null);
    window.setTimeout(() => setStatusBanner(null), 4000);
  };

  const pushNotification = (
    kind: AttendanceNotification['kind'],
    title: string,
    message: string
  ): AttendanceNotification => ({
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    title,
    message,
    timestamp: new Date().toISOString(),
    read: false,
  });

  const makeAudit = (
    action: DigitalAttendanceAuditLog['action'],
    reason: string,
    extras?: Partial<DigitalAttendanceAuditLog>
  ): DigitalAttendanceAuditLog => ({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    actorName: currentUser.name,
    actorRole: activeRole,
    action,
    reason,
    ...extras,
  });

  const canApproveLeaves =
    activeRole === 'Super Administrator' || activeRole === 'Headmaster/Principal';
  const canCorrectAttendance =
    activeRole === 'Super Administrator' ||
    activeRole === 'Headmaster/Principal' ||
    activeRole === 'Attendance Administrator';

  const isMonthLocked = (monthKey: string): MonthLockState | undefined =>
    state.monthLocks.find((m) => m.monthKey === monthKey && m.locked);

  // =========================================================================
  // INTERACTIVE MODALS & FORM STATES
  // =========================================================================
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [faceModal, setFaceModal] = useState<{
    mode: 'register' | 'verify';
    employee: DigitalEmployeeProfile;
  } | null>(null);

  // Manual Authorized Correction Modal
  const [correctionTarget, setCorrectionTarget] = useState<{
    employee: DigitalEmployeeProfile;
    date: string;
    currentCode: string;
  } | null>(null);
  const [correctionCode, setCorrectionCode] = useState<string>('P');
  const [correctionReason, setCorrectionReason] = useState<string>('');

  // Medical Leave Form
  const [mlEmployeeId, setMlEmployeeId] = useState<string>(state.employees[0]?.employeeId || '');
  const [mlFromDate, setMlFromDate] = useState<string>(todayIso);
  const [mlToDate, setMlToDate] = useState<string>(todayIso);
  const [mlReason, setMlReason] = useState<string>('');
  const [mlCertName, setMlCertName] = useState<string>('');
  const [mlCertDataUrl, setMlCertDataUrl] = useState<string>('');
  const [reviewRemarksMap, setReviewRemarksMap] = useState<Record<string, string>>({});

  // On-Duty (OD) Form
  const [odEmployeeId, setOdEmployeeId] = useState<string>(state.employees[0]?.employeeId || '');
  const [odDateOfDuty, setOdDateOfDuty] = useState<string>(todayIso);
  const [odLocation, setOdLocation] = useState<string>('');
  const [odPurpose, setOdPurpose] = useState<string>('');
  const [odOrderNumber, setOdOrderNumber] = useState<string>('');
  const [odOrderDate, setOdOrderDate] = useState<string>(todayIso);
  const [odIssuingAuthority, setOdIssuingAuthority] = useState<string>('Zonal Education Officer (ZEO)');
  const [odFromDate, setOdFromDate] = useState<string>(todayIso);
  const [odToDate, setOdToDate] = useState<string>(todayIso);
  const [odDocName, setOdDocName] = useState<string>('');
  const [odDocDataUrl, setOdDocDataUrl] = useState<string>('');

  // General Leave Form
  const [glEmployeeId, setGlEmployeeId] = useState<string>(state.employees[0]?.employeeId || '');
  const [glCategory, setGlCategory] = useState<string>('CL');
  const [glFromDate, setGlFromDate] = useState<string>(todayIso);
  const [glToDate, setGlToDate] = useState<string>(todayIso);
  const [glReason, setGlReason] = useState<string>('');
  const [glDocName, setGlDocName] = useState<string>('');
  const [glDocDataUrl, setGlDocDataUrl] = useState<string>('');

  // Monthly Register Filters & Lock/Reopen Modal
  const [registerMonth, setRegisterMonth] = useState<string>(currentMonthKey);
  const [registerEmployeeFilter, setRegisterEmployeeFilter] = useState<string>('ALL');
  const [registerDesignationFilter, setRegisterDesignationFilter] = useState<string>('ALL');
  const [reopenMonthModalOpen, setReopenMonthModalOpen] = useState<boolean>(false);
  const [reopenReason, setReopenReason] = useState<string>('');

  // Staff Profile Add / Edit Modal
  const [staffSearch, setStaffSearch] = useState<string>('');
  const [showAddStaffForm, setShowAddStaffForm] = useState<boolean>(false);
  const [staffForm, setStaffForm] = useState<{
    id?: string;
    name: string;
    employeeId: string;
    designation: string;
    department: string;
    subject: string;
    mobileNumber: string;
    dateOfJoining: string;
    staffCategory: 'Teaching Staff' | 'Non-Teaching Staff';
    accountRole: DigitalAttendanceRole;
    employmentStatus: 'Active' | 'On Deputation' | 'Inactive';
    photoDataUrl?: string;
    alternativePin: string;
  }>({
    name: '',
    employeeId: '',
    designation: 'Teacher',
    department: 'Academics',
    subject: '',
    mobileNumber: '',
    dateOfJoining: todayIso,
    staffCategory: 'Teaching Staff',
    accountRole: 'Teaching Staff',
    employmentStatus: 'Active',
    alternativePin: '',
  });

  // Custom Category Form
  const [newCatCode, setNewCatCode] = useState<string>('');
  const [newCatLabel, setNewCatLabel] = useState<string>('');
  const [newCatPresentWeight, setNewCatPresentWeight] = useState<number>(0);
  const [newCatLeaveWeight, setNewCatLeaveWeight] = useState<number>(1);

  // School Profile Admin Editor Form
  const [schoolDraft, setSchoolDraft] = useState({
    name: school.name || '',
    address: school.address || '',
    district: school.district || '',
    stateUt: school.state || 'Jammu & Kashmir',
    udiseCode: school.code || '',
    academicYear: school.academicSession || state.rules.academicSession,
    headmasterName: school.headmasterName || school.headTeacherName || '',
    contact: school.contactNumber || '',
    email: school.email || '',
    logo: school.logoDataUrl || '',
  });

  const backupInputRef = useRef<HTMLInputElement | null>(null);

  // =========================================================================
  // COMPUTED METRICS & MONTHLY REGISTER SUMMARIES
  // =========================================================================
  const todayRecordsByEmp = useMemo(() => {
    const map = new Map<string, DigitalAttendanceRecord>();
    for (const r of state.records) {
      if (r.date === todayIso) {
        map.set(r.employeeId, r);
      }
    }
    return map;
  }, [state.records, todayIso]);

  const selectedDateRecordsByEmp = useMemo(() => {
    const map = new Map<string, DigitalAttendanceRecord>();
    for (const r of state.records) {
      if (r.date === selectedDate) {
        map.set(r.employeeId, r);
      }
    }
    return map;
  }, [state.records, selectedDate]);

  const activeEmployees = useMemo(
    () => state.employees.filter((e) => e.employmentStatus !== 'Inactive'),
    [state.employees]
  );

  const dashboardMetrics = useMemo(() => {
    let presentToday = 0;
    let absentToday = 0;
    let onLeaveToday = 0;
    let medicalLeaveToday = 0;
    let onDutyToday = 0;
    let unmarkedToday = 0;

    for (const emp of activeEmployees) {
      const rec = todayRecordsByEmp.get(emp.employeeId);
      if (!rec) {
        unmarkedToday++;
        continue;
      }
      const code = rec.statusCode.toUpperCase();
      if (code === 'P' || code === 'FH' || code === 'SH') {
        presentToday++;
        if (code === 'FH' || code === 'SH') onLeaveToday++;
      } else if (code === 'A') {
        absentToday++;
      } else if (code === 'ML') {
        medicalLeaveToday++;
        onLeaveToday++;
      } else if (code === 'OD') {
        onDutyToday++;
      } else if (code === 'CL' || code === 'EL') {
        onLeaveToday++;
      }
    }

    const pendingLeaves =
      state.medicalLeaves.filter((m) => m.status === 'Pending').length +
      state.onDutyApplications.filter((o) => o.status === 'Pending').length +
      state.generalLeaves.filter((g) => g.status === 'Pending').length;

    const monthSummaries = activeEmployees.map((emp) =>
      computeMonthlyEmployeeSummary({
        employee: emp,
        monthKey: currentMonthKey,
        records: state.records,
        categories: state.categories,
        weeklyOffDay: state.rules.weeklyOffDay,
      })
    );
    const avgMonthlyPct =
      monthSummaries.length > 0
        ? Number(
            (
              monthSummaries.reduce((acc, s) => acc + s.attendancePercentage, 0) /
              monthSummaries.length
            ).toFixed(1)
          )
        : 0;

    return {
      totalEmployees: activeEmployees.length,
      presentToday,
      absentToday,
      onLeaveToday,
      medicalLeaveToday,
      onDutyToday,
      unmarkedToday,
      pendingLeaves,
      avgMonthlyPct,
      monthSummaries,
    };
  }, [
    activeEmployees,
    todayRecordsByEmp,
    state.medicalLeaves,
    state.onDutyApplications,
    state.generalLeaves,
    state.records,
    state.categories,
    state.rules.weeklyOffDay,
    currentMonthKey,
  ]);

  const designations = useMemo(
    () => Array.from(new Set(state.employees.map((e) => e.designation).filter(Boolean))),
    [state.employees]
  );

  const registerSummaries = useMemo(() => {
    const filteredEmps = state.employees.filter((e) => {
      if (registerEmployeeFilter !== 'ALL' && e.employeeId !== registerEmployeeFilter) return false;
      if (registerDesignationFilter !== 'ALL' && e.designation !== registerDesignationFilter) return false;
      return true;
    });
    return filteredEmps.map((emp) =>
      computeMonthlyEmployeeSummary({
        employee: emp,
        monthKey: registerMonth,
        records: state.records,
        categories: state.categories,
        weeklyOffDay: state.rules.weeklyOffDay,
      })
    );
  }, [
    state.employees,
    state.records,
    state.categories,
    state.rules.weeklyOffDay,
    registerMonth,
    registerEmployeeFilter,
    registerDesignationFilter,
  ]);

  const registerDaysCount = useMemo(() => {
    const [y, m] = registerMonth.split('-').map(Number);
    return getDaysInMonth(y || new Date().getFullYear(), Math.max(0, (m || 1) - 1));
  }, [registerMonth]);

  const activeMonthLock = isMonthLocked(registerMonth);
  const unreadNotificationsCount = state.notifications.filter((n) => !n.read).length;

  // =========================================================================
  // FILE UPLOAD HELPER (PDF / IMAGE DOCUMENTS)
  // =========================================================================
  const readSupportingFile = (
    file: File,
    onLoaded: (name: string, dataUrl: string) => void
  ) => {
    if (file.size > 4 * 1024 * 1024) {
      setErrorBanner('Document file size must be under 4 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onLoaded(file.name, String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  // =========================================================================
  // ATTENDANCE MARKING, FACE REGISTRATION & AUTHORIZED CORRECTION HANDLERS
  // =========================================================================
  const handleFaceRegistered = (employeeId: string, template: BiometricFaceTemplate) => {
    const emp = state.employees.find((e) => e.employeeId === employeeId);
    setState((prev) => ({
      ...prev,
      employees: prev.employees.map((e) =>
        e.employeeId === employeeId ? { ...e, faceTemplate: template } : e
      ),
      auditLogs: [
        makeAudit(
          'FACE_REGISTERED',
          'Employee face biometric template registered with explicit informed consent (SHA-256 hash stored)',
          { targetEmployeeId: employeeId, newValue: `Hash:${template.templateHash.slice(0, 12)}...` }
        ),
        ...prev.auditLogs,
      ],
      notifications: [
        pushNotification(
          'attendance_marked',
          'Face Verification Registered',
          `${emp?.name || employeeId} completed informed-consent biometric registration.`
        ),
        ...prev.notifications,
      ],
    }));
    notify(`Face verification registered securely for ${emp?.name || employeeId}.`);
  };

  const handleFaceVerifiedAttendance = (payload: {
    employeeId: string;
    halfDayMode: HalfDayMode;
    verificationMethod: 'face_biometric' | 'alternative_pin';
    livenessScore: number;
    remarks?: string;
  }) => {
    const monthKey = selectedDate.slice(0, 7);
    if (isMonthLocked(monthKey)) {
      setErrorBanner(`Attendance for ${monthKey} is locked. Headmaster must reopen the month first.`);
      return;
    }

    // Prevent duplicate attendance entry for the same employee & date
    const existing = state.records.find(
      (r) => r.employeeId === payload.employeeId && r.date === selectedDate
    );
    if (existing) {
      setErrorBanner(
        `Duplicate prevented: ${payload.employeeId} already has attendance (${existing.statusCode}) recorded on ${selectedDate} at ${existing.checkInTime}. Use Authorized Correction to modify.`
      );
      return;
    }

    const emp = state.employees.find((e) => e.employeeId === payload.employeeId);
    const statusCode = halfDayModeToCode(payload.halfDayMode);
    const nowTime = formatNowTime();
    const record: DigitalAttendanceRecord = {
      id: `datt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      employeeId: payload.employeeId,
      date: selectedDate,
      statusCode,
      halfDayMode: payload.halfDayMode,
      checkInTime: nowTime,
      verificationMethod: payload.verificationMethod,
      livenessVerified: payload.verificationMethod === 'face_biometric',
      livenessConfidence: payload.livenessScore,
      remarks: payload.remarks,
      markedBy: currentUser.name,
      updatedAt: new Date().toISOString(),
    };

    setState((prev) => ({
      ...prev,
      records: [record, ...prev.records],
      auditLogs: [
        makeAudit(
          payload.verificationMethod === 'face_biometric' ? 'FACE_VERIFIED' : 'ATTENDANCE_MARKED',
          payload.remarks || `Verified via live camera face recognition (${payload.livenessScore}% match)`,
          {
            targetEmployeeId: payload.employeeId,
            targetDate: selectedDate,
            newValue: `${statusCode} at ${nowTime}`,
          }
        ),
        ...prev.auditLogs,
      ],
      notifications: [
        pushNotification(
          'attendance_marked',
          'Attendance Recorded',
          `${emp?.name || payload.employeeId} marked ${statusCode} on ${selectedDate} at ${nowTime}.`
        ),
        ...prev.notifications,
      ],
    }));

    notify(`Attendance marked (${statusCode}) for ${emp?.name || payload.employeeId} at ${nowTime}.`);
  };

  const handleFaceVerificationFailed = (employeeId: string, reason: string) => {
    const emp = state.employees.find((e) => e.employeeId === employeeId);
    setState((prev) => ({
      ...prev,
      auditLogs: [
        makeAudit('FACE_FAILED', reason, { targetEmployeeId: employeeId, targetDate: selectedDate }),
        ...prev.auditLogs,
      ],
      notifications: [
        pushNotification(
          'face_failed',
          'Face Verification Unsuccessful',
          `${emp?.name || employeeId}: ${reason}`
        ),
        ...prev.notifications,
      ],
    }));
  };

  const handleSaveAuthorizedCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionTarget) return;
    if (!canCorrectAttendance) {
      setErrorBanner('Only Super Administrator, Headmaster/Principal, or Attendance Administrator can correct attendance.');
      return;
    }
    const monthKey = correctionTarget.date.slice(0, 7);
    if (isMonthLocked(monthKey)) {
      setErrorBanner(`Month ${monthKey} is locked. Headmaster must reopen it before making edits.`);
      return;
    }
    if (!correctionReason.trim()) {
      setErrorBanner('Authorization reason is mandatory for every manual attendance correction.');
      return;
    }

    const nowTime = formatNowTime();
    setState((prev) => {
      const existingIdx = prev.records.findIndex(
        (r) => r.employeeId === correctionTarget.employee.employeeId && r.date === correctionTarget.date
      );
      const updatedRecord: DigitalAttendanceRecord = {
        id: existingIdx >= 0 ? prev.records[existingIdx].id : `datt-corr-${Date.now()}`,
        employeeId: correctionTarget.employee.employeeId,
        date: correctionTarget.date,
        statusCode: correctionCode,
        checkInTime: existingIdx >= 0 ? prev.records[existingIdx].checkInTime : nowTime,
        verificationMethod: 'manual_authorized',
        livenessVerified: false,
        remarks: `Manual Correction: ${correctionReason.trim()}`,
        markedBy: currentUser.name,
        updatedAt: new Date().toISOString(),
      };
      const nextRecords =
        existingIdx >= 0
          ? prev.records.map((r, i) => (i === existingIdx ? updatedRecord : r))
          : [updatedRecord, ...prev.records];

      return {
        ...prev,
        records: nextRecords,
        auditLogs: [
          makeAudit('ATTENDANCE_CORRECTED', correctionReason.trim(), {
            targetEmployeeId: correctionTarget.employee.employeeId,
            targetDate: correctionTarget.date,
            previousValue: correctionTarget.currentCode || 'Unmarked',
            newValue: correctionCode,
          }),
          ...prev.auditLogs,
        ],
        notifications: [
          pushNotification(
            'attendance_marked',
            'Manual Attendance Correction Logged',
            `${correctionTarget.employee.name} (${correctionTarget.date}) updated to ${correctionCode} by ${currentUser.name}.`
          ),
          ...prev.notifications,
        ],
      };
    });

    notify(
      `Attendance updated to ${correctionCode} for ${correctionTarget.employee.name} on ${correctionTarget.date}.`
    );
    setCorrectionTarget(null);
    setCorrectionReason('');
  };

  // =========================================================================
  // MEDICAL LEAVE (ML), ON-DUTY (OD), AND GENERAL LEAVE WORKFLOWS
  // =========================================================================
  const applyApprovedDateRangeAttendance = (
    prev: DigitalAttendancePersistedState,
    employeeId: string,
    fromDate: string,
    toDate: string,
    code: string,
    method: DigitalAttendanceRecord['verificationMethod'],
    remark: string
  ): DigitalAttendanceRecord[] => {
    const dates = enumerateDatesInclusive(fromDate, toDate);
    let nextRecords = [...prev.records];
    for (const dt of dates) {
      const idx = nextRecords.findIndex((r) => r.employeeId === employeeId && r.date === dt);
      const entry: DigitalAttendanceRecord = {
        id: idx >= 0 ? nextRecords[idx].id : `datt-auto-${dt}-${employeeId}`,
        employeeId,
        date: dt,
        statusCode: code,
        checkInTime: '09:00',
        verificationMethod: method,
        livenessVerified: false,
        remarks: remark,
        markedBy: currentUser.name,
        updatedAt: new Date().toISOString(),
      };
      if (idx >= 0) nextRecords[idx] = entry;
      else nextRecords.unshift(entry);
    }
    return nextRecords;
  };

  const handleSubmitMedicalLeave = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = state.employees.find((x) => x.employeeId === mlEmployeeId);
    const days = enumerateDatesInclusive(mlFromDate, mlToDate).length;
    if (!emp || days <= 0 || !mlReason.trim()) {
      setErrorBanner('Select employee, valid From/To dates, and enter a medical leave reason.');
      return;
    }
    const app: MedicalLeaveApplication = {
      id: `ml-${Date.now()}`,
      employeeId: emp.employeeId,
      employeeName: emp.name,
      fromDate: mlFromDate,
      toDate: mlToDate,
      numberOfDays: days,
      reason: mlReason.trim(),
      certificateName: mlCertName || undefined,
      certificateDataUrl: mlCertDataUrl || undefined,
      applicationDate: todayIso,
      status: 'Pending',
    };
    setState((prev) => ({
      ...prev,
      medicalLeaves: [app, ...prev.medicalLeaves],
      auditLogs: [
        makeAudit('MEDICAL_LEAVE_APPLIED', `${days} day(s) ML requested (${mlFromDate} to ${mlToDate})`, {
          targetEmployeeId: emp.employeeId,
        }),
        ...prev.auditLogs,
      ],
      notifications: [
        pushNotification(
          'leave_submitted',
          'Medical Leave Application Submitted',
          `${emp.name} applied for ${days} day(s) Medical Leave (${mlFromDate} to ${mlToDate}).`
        ),
        ...prev.notifications,
      ],
    }));
    setMlReason('');
    setMlCertName('');
    setMlCertDataUrl('');
    notify(`Medical Leave application submitted for ${emp.name} (${days} day${days === 1 ? '' : 's'}).`);
  };

  const handleReviewMedicalLeave = (id: string, decision: 'Approved' | 'Rejected') => {
    if (!canApproveLeaves) {
      setErrorBanner('Only Headmaster/Principal or Super Administrator can approve or reject Medical Leave.');
      return;
    }
    const app = state.medicalLeaves.find((x) => x.id === id);
    if (!app) return;
    const remarks = (reviewRemarksMap[id] || '').trim() || (decision === 'Approved' ? 'Approved by Headmaster' : 'Not approved');

    setState((prev) => {
      const nextRecords =
        decision === 'Approved'
          ? applyApprovedDateRangeAttendance(
              prev,
              app.employeeId,
              app.fromDate,
              app.toDate,
              'ML',
              'auto_medical_leave',
              `Approved Medical Leave: ${app.reason}`
            )
          : prev.records;

      const nextEmployees =
        decision === 'Approved'
          ? prev.employees.map((e) =>
              e.employeeId === app.employeeId
                ? {
                    ...e,
                    leaveBalances: {
                      ...e.leaveBalances,
                      ML: Math.max(0, e.leaveBalances.ML - app.numberOfDays),
                    },
                  }
                : e
            )
          : prev.employees;

      return {
        ...prev,
        employees: nextEmployees,
        records: nextRecords,
        medicalLeaves: prev.medicalLeaves.map((m) =>
          m.id === id
            ? {
                ...m,
                status: decision,
                headmasterRemarks: remarks,
                reviewedBy: currentUser.name,
                reviewedAt: new Date().toISOString(),
              }
            : m
        ),
        auditLogs: [
          makeAudit('MEDICAL_LEAVE_REVIEWED', `${decision}: ${remarks}`, {
            targetEmployeeId: app.employeeId,
            targetDate: `${app.fromDate}..${app.toDate}`,
            newValue: decision === 'Approved' ? 'ML Auto-Recorded' : 'Rejected',
          }),
          ...prev.auditLogs,
        ],
        notifications: [
          pushNotification(
            'leave_reviewed',
            `Medical Leave ${decision}`,
            `${app.employeeName}'s Medical Leave (${app.fromDate} to ${app.toDate}) was ${decision.toLowerCase()}.`
          ),
          ...prev.notifications,
        ],
      };
    });

    notify(
      decision === 'Approved'
        ? `Approved Medical Leave for ${app.employeeName} and automatically marked ML on attendance register.`
        : `Rejected Medical Leave for ${app.employeeName}.`
    );
  };

  const handleSubmitOnDuty = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = state.employees.find((x) => x.employeeId === odEmployeeId);
    const days = enumerateDatesInclusive(odFromDate, odToDate).length;
    if (!emp || days <= 0 || !odLocation.trim() || !odPurpose.trim() || !odOrderNumber.trim()) {
      setErrorBanner('Complete all required On-Duty fields (Employee, Location, Purpose, Order Number, From/To Dates).');
      return;
    }
    const app: OnDutyApplication = {
      id: `od-${Date.now()}`,
      employeeId: emp.employeeId,
      employeeName: emp.name,
      dateOfDuty: odDateOfDuty,
      dutyLocation: odLocation.trim(),
      dutyPurpose: odPurpose.trim(),
      orderNumber: odOrderNumber.trim(),
      orderDate: odOrderDate,
      issuingAuthority: odIssuingAuthority.trim() || 'Department of School Education',
      orderDocumentName: odDocName || undefined,
      orderDocumentDataUrl: odDocDataUrl || undefined,
      fromDate: odFromDate,
      toDate: odToDate,
      status: 'Pending',
    };
    setState((prev) => ({
      ...prev,
      onDutyApplications: [app, ...prev.onDutyApplications],
      auditLogs: [
        makeAudit(
          'ON_DUTY_APPLIED',
          `OD Order #${app.orderNumber} (${app.dutyLocation}: ${app.dutyPurpose})`,
          { targetEmployeeId: emp.employeeId, targetDate: `${odFromDate}..${odToDate}` }
        ),
        ...prev.auditLogs,
      ],
      notifications: [
        pushNotification(
          'leave_submitted',
          'On-Duty Request Submitted',
          `${emp.name} submitted On-Duty Order #${app.orderNumber} (${odFromDate} to ${odToDate}).`
        ),
        ...prev.notifications,
      ],
    }));
    setOdLocation('');
    setOdPurpose('');
    setOdOrderNumber('');
    setOdDocName('');
    setOdDocDataUrl('');
    notify(`On-Duty application submitted for ${emp.name} (Order #${app.orderNumber}).`);
  };

  const handleReviewOnDuty = (id: string, decision: 'Approved' | 'Rejected') => {
    if (!canApproveLeaves) {
      setErrorBanner('Only Headmaster/Principal or Super Administrator can approve On-Duty orders.');
      return;
    }
    const app = state.onDutyApplications.find((x) => x.id === id);
    if (!app) return;
    const remarks = (reviewRemarksMap[id] || '').trim() || (decision === 'Approved' ? 'OD Approved' : 'OD Rejected');

    setState((prev) => {
      const nextRecords =
        decision === 'Approved'
          ? applyApprovedDateRangeAttendance(
              prev,
              app.employeeId,
              app.fromDate,
              app.toDate,
              'OD',
              'auto_on_duty',
              `On Duty (${app.orderNumber}) — ${app.dutyLocation}`
            )
          : prev.records;

      return {
        ...prev,
        records: nextRecords,
        onDutyApplications: prev.onDutyApplications.map((o) =>
          o.id === id
            ? {
                ...o,
                status: decision,
                headmasterRemarks: remarks,
                reviewedBy: currentUser.name,
                reviewedAt: new Date().toISOString(),
              }
            : o
        ),
        auditLogs: [
          makeAudit('ON_DUTY_REVIEWED', `${decision}: Order #${app.orderNumber} (${remarks})`, {
            targetEmployeeId: app.employeeId,
            targetDate: `${app.fromDate}..${app.toDate}`,
            newValue: decision === 'Approved' ? 'OD Auto-Recorded' : 'Rejected',
          }),
          ...prev.auditLogs,
        ],
        notifications: [
          pushNotification(
            'od_approved',
            `On-Duty ${decision}`,
            `${app.employeeName}'s On-Duty (${app.fromDate} to ${app.toDate}) was ${decision.toLowerCase()}.`
          ),
          ...prev.notifications,
        ],
      };
    });

    notify(
      decision === 'Approved'
        ? `Approved On-Duty for ${app.employeeName} — attendance automatically marked OD for ${app.fromDate} to ${app.toDate}.`
        : `Rejected On-Duty request for ${app.employeeName}.`
    );
  };

  const handleSubmitGeneralLeave = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = state.employees.find((x) => x.employeeId === glEmployeeId);
    const days = enumerateDatesInclusive(glFromDate, glToDate).length;
    if (!emp || days <= 0 || !glReason.trim()) {
      setErrorBanner('Select employee, leave category, valid dates, and leave reason.');
      return;
    }
    const effectiveDays = glCategory === 'FH' || glCategory === 'SH' ? Number((days * 0.5).toFixed(1)) : days;
    const app: GeneralLeaveApplication = {
      id: `gl-${Date.now()}`,
      employeeId: emp.employeeId,
      employeeName: emp.name,
      leaveCategory: glCategory,
      fromDate: glFromDate,
      toDate: glToDate,
      numberOfDays: effectiveDays,
      reason: glReason.trim(),
      documentName: glDocName || undefined,
      documentDataUrl: glDocDataUrl || undefined,
      applicationDate: todayIso,
      status: 'Pending',
    };
    setState((prev) => ({
      ...prev,
      generalLeaves: [app, ...prev.generalLeaves],
      auditLogs: [
        makeAudit('LEAVE_APPLIED', `${glCategory} (${effectiveDays} day) requested`, {
          targetEmployeeId: emp.employeeId,
          targetDate: `${glFromDate}..${glToDate}`,
        }),
        ...prev.auditLogs,
      ],
      notifications: [
        pushNotification(
          'leave_submitted',
          'Leave Application Submitted',
          `${emp.name} applied for ${glCategory} (${glFromDate} to ${glToDate}).`
        ),
        ...prev.notifications,
      ],
    }));
    setGlReason('');
    setGlDocName('');
    setGlDocDataUrl('');
    notify(`Submitted ${glCategory} application for ${emp.name}.`);
  };

  const handleReviewGeneralLeave = (id: string, decision: 'Approved' | 'Rejected') => {
    if (!canApproveLeaves) {
      setErrorBanner('Only Headmaster/Principal or Super Administrator can review leave applications.');
      return;
    }
    const app = state.generalLeaves.find((x) => x.id === id);
    if (!app) return;
    const remarks = (reviewRemarksMap[id] || '').trim() || (decision === 'Approved' ? 'Approved' : 'Rejected');

    setState((prev) => {
      const nextRecords =
        decision === 'Approved'
          ? applyApprovedDateRangeAttendance(
              prev,
              app.employeeId,
              app.fromDate,
              app.toDate,
              app.leaveCategory,
              'auto_leave',
              `Approved ${app.leaveCategory}: ${app.reason}`
            )
          : prev.records;

      const nextEmployees =
        decision === 'Approved'
          ? prev.employees.map((e) => {
              if (e.employeeId !== app.employeeId) return e;
              const bal = { ...e.leaveBalances };
              if (app.leaveCategory === 'CL' || app.leaveCategory === 'FH' || app.leaveCategory === 'SH') {
                bal.CL = Math.max(0, Number((bal.CL - app.numberOfDays).toFixed(1)));
              } else if (app.leaveCategory === 'EL') {
                bal.EL = Math.max(0, Number((bal.EL - app.numberOfDays).toFixed(1)));
              }
              return { ...e, leaveBalances: bal };
            })
          : prev.employees;

      return {
        ...prev,
        employees: nextEmployees,
        records: nextRecords,
        generalLeaves: prev.generalLeaves.map((g) =>
          g.id === id
            ? {
                ...g,
                status: decision,
                headmasterRemarks: remarks,
                reviewedBy: currentUser.name,
                reviewedAt: new Date().toISOString(),
              }
            : g
        ),
        auditLogs: [
          makeAudit('LEAVE_REVIEWED', `${decision} ${app.leaveCategory}: ${remarks}`, {
            targetEmployeeId: app.employeeId,
            targetDate: `${app.fromDate}..${app.toDate}`,
            newValue: decision === 'Approved' ? `${app.leaveCategory} Auto-Recorded` : 'Rejected',
          }),
          ...prev.auditLogs,
        ],
        notifications: [
          pushNotification(
            'leave_reviewed',
            `Leave Application ${decision}`,
            `${app.employeeName}'s ${app.leaveCategory} (${app.fromDate} to ${app.toDate}) was ${decision.toLowerCase()}.`
          ),
          ...prev.notifications,
        ],
      };
    });
    notify(`${decision} ${app.leaveCategory} leave for ${app.employeeName}.`);
  };

  // =========================================================================
  // MONTHLY LOCK / REOPEN, PDF, EXCEL & PRINT EXPORTS
  // =========================================================================
  const handleLockMonth = () => {
    if (!canApproveLeaves) {
      setErrorBanner('Only Headmaster/Principal or Super Administrator can lock finalized monthly attendance.');
      return;
    }
    setState((prev) => {
      const filtered = prev.monthLocks.filter((m) => m.monthKey !== registerMonth);
      const lockRec: MonthLockState = {
        monthKey: registerMonth,
        academicSession: prev.rules.academicSession,
        locked: true,
        lockedBy: currentUser.name,
        lockedAt: new Date().toISOString(),
      };
      return {
        ...prev,
        monthLocks: [lockRec, ...filtered],
        auditLogs: [
          makeAudit('MONTH_LOCKED', `Finalized monthly attendance register locked for ${registerMonth}`, {
            targetDate: registerMonth,
            newValue: 'LOCKED',
          }),
          ...prev.auditLogs,
        ],
      };
    });
    notify(`Locked finalized monthly attendance register for ${registerMonth}.`);
  };

  const handleConfirmReopenMonth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canApproveLeaves) {
      setErrorBanner('Headmaster/Principal permission is required to reopen locked attendance.');
      return;
    }
    if (!reopenReason.trim()) {
      setErrorBanner('Provide an official reason to reopen the locked attendance month.');
      return;
    }
    setState((prev) => {
      const updated = prev.monthLocks.map((m) =>
        m.monthKey === registerMonth
          ? {
              ...m,
              locked: false,
              reopenedBy: currentUser.name,
              reopenedAt: new Date().toISOString(),
              reopenReason: reopenReason.trim(),
            }
          : m
      );
      return {
        ...prev,
        monthLocks: updated,
        auditLogs: [
          makeAudit('MONTH_REOPENED', reopenReason.trim(), {
            targetDate: registerMonth,
            previousValue: 'LOCKED',
            newValue: 'REOPENED',
          }),
          ...prev.auditLogs,
        ],
      };
    });
    setReopenReason('');
    setReopenMonthModalOpen(false);
    notify(`Reopened monthly attendance register for ${registerMonth} with Headmaster authorization.`);
  };

  const handleExportPdf = async (orientation: 'landscape' | 'portrait') => {
    const allowed = await guardSensitiveExport(`Monthly Staff Attendance Register PDF (${registerMonth})`);
    if (!allowed) return;
    exportMonthlyAttendancePdf({
      school,
      academicSession: state.rules.academicSession,
      monthKey: registerMonth,
      summaries: registerSummaries,
      orientation,
      selectedEmployeeOnly: registerEmployeeFilter !== 'ALL',
    });
    setState((prev) => ({
      ...prev,
      notifications: [
        pushNotification(
          'report_generated',
          'PDF Attendance Register Generated',
          `Exported A4 ${orientation} Monthly Attendance PDF for ${registerMonth}.`
        ),
        ...prev.notifications,
      ],
    }));
    notify(`Downloaded A4 ${orientation} PDF Attendance Register for ${registerMonth}.`);
  };

  const handleExportExcel = async (allMonths: boolean) => {
    const allowed = await guardSensitiveExport(`Monthly Staff Attendance Excel (${allMonths ? 'All Months' : registerMonth})`);
    if (!allowed) return;
    const activeMonths = allMonths
      ? Array.from(new Set([registerMonth, ...state.records.map((r) => r.date.slice(0, 7))])).sort()
      : [registerMonth];
    const targetEmployees = registerSummaries.map((s) => s.employee);
    exportMonthlyAttendanceExcel({
      school,
      academicSession: state.rules.academicSession,
      monthKeys: activeMonths,
      employees: targetEmployees,
      records: state.records,
      categories: state.categories,
      weeklyOffDay: state.rules.weeklyOffDay,
      adminRemarksByEmployeeMonth: state.adminRemarksByEmployeeMonth,
    });
    setState((prev) => ({
      ...prev,
      notifications: [
        pushNotification(
          'report_generated',
          'Excel Attendance Register Generated',
          `Exported .xlsx workbook (${activeMonths.length} month sheet${activeMonths.length === 1 ? '' : 's'}) with formulas.`
        ),
        ...prev.notifications,
      ],
    }));
    notify(`Downloaded Excel (.xlsx) Attendance Register with live formulas.`);
  };

  const handlePrintRegister = () => {
    const [y, m] = registerMonth.split('-').map(Number);
    const mName = `${getMonthName(Math.max(0, (m || 1) - 1))} ${y || new Date().getFullYear()}`;
    const dayCols = Array.from({ length: registerDaysCount }, (_, i) => `<th>${i + 1}</th>`).join('');
    const rowsHtml = registerSummaries
      .map(
        (sum, idx) => `<tr>
          <td>${idx + 1}</td>
          <td style="text-align:left;font-weight:700;">${escapeHtml(sum.employee.name)}</td>
          <td style="text-align:left;">${escapeHtml(sum.employee.designation)}</td>
          <td>${escapeHtml(sum.employee.employeeId)}</td>
          ${Array.from({ length: registerDaysCount }, (_, i) => `<td>${escapeHtml(sum.dailyCodes[i + 1] || '-')}</td>`).join('')}
          <td><strong>${sum.totalPresentDays}</strong></td>
          <td>${sum.totalAbsentDays}</td>
          <td>${sum.totalLeaveDays}</td>
          <td>${sum.medicalLeaveDays}</td>
          <td>${sum.onDutyDays}</td>
          <td><strong>${sum.attendancePercentage}%</strong></td>
        </tr>`
      )
      .join('');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Monthly Attendance Register - ${escapeHtml(mName)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: Arial, sans-serif; color: #0f172a; font-size: 10px; }
    .hdr { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
    .hdr h1 { margin: 0; font-size: 16px; }
    .hdr p { margin: 3px 0 0 0; font-size: 11px; color: #334155; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { border: 1px solid #94a3b8; padding: 3px 2px; text-align: center; font-size: 9px; }
    th { background: #f1f5f9; font-weight: 700; }
    .sig { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; border: 1px solid #94a3b8; padding: 10px; font-size: 10.5px; }
  </style>
</head>
<body>
  <div class="hdr">
    <h1>${escapeHtml(school.name || 'Smart Digital School')}</h1>
    <p>${escapeHtml(school.address || '')} · UDISE/Code: ${escapeHtml(school.code || '-')} · Monthly Attendance Register: <strong>${escapeHtml(mName)}</strong> · Session: ${escapeHtml(state.rules.academicSession)}</p>
  </div>
  <table>
    <thead>
      <tr><th>S#</th><th>Employee Name</th><th>Designation</th><th>Emp ID</th>${dayCols}<th>P</th><th>A</th><th>Lv</th><th>ML</th><th>OD</th><th>%</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="sig">
    <div>Signature of Concerned Teacher/Employee: ______________________</div>
    <div>Signature of Attendance In-charge: ______________________</div>
    <div>Verified and Attested by Headmaster/Principal: ______________________</div>
    <div>Official School Stamp: ______________________</div>
    <div>Date: ______________________</div>
  </div>
</body>
</html>`;
    printHtmlDocumentSafely(html);
  };

  // =========================================================================
  // STAFF PROFILES, CUSTOM CATEGORIES, SCHOOL PROFILE & BACKUP HANDLERS
  // =========================================================================
  const handleSaveStaffProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffForm.name.trim() || !staffForm.employeeId.trim()) {
      setErrorBanner('Employee Name and Employee ID are required.');
      return;
    }

    const pinHash = staffForm.alternativePin.trim()
      ? await sha256Hex(`SM_ALT_PIN::${staffForm.employeeId.trim()}::${staffForm.alternativePin.trim()}`)
      : undefined;

    setState((prev) => {
      const existing = prev.employees.find((x) => x.id === staffForm.id);
      const nextProfile: DigitalEmployeeProfile = {
        id: existing?.id || `emp-${Date.now()}`,
        employeeId: staffForm.employeeId.trim(),
        name: staffForm.name.trim(),
        designation: staffForm.designation.trim() || 'Teacher',
        department: staffForm.department.trim() || 'Academics',
        subject: staffForm.subject.trim() || 'General',
        mobileNumber: staffForm.mobileNumber.trim(),
        dateOfJoining: staffForm.dateOfJoining || todayIso,
        photoDataUrl: staffForm.photoDataUrl ?? existing?.photoDataUrl,
        employmentStatus: staffForm.employmentStatus,
        staffCategory: staffForm.staffCategory,
        accountRole: staffForm.accountRole,
        faceTemplate: existing?.faceTemplate || null,
        alternativePinHash: pinHash ?? existing?.alternativePinHash,
        leaveBalances: existing?.leaveBalances || { CL: 12, EL: 15, ML: 10 },
      };

      const nextList = existing
        ? prev.employees.map((x) => (x.id === existing.id ? nextProfile : x))
        : [nextProfile, ...prev.employees];

      return {
        ...prev,
        employees: nextList,
        auditLogs: [
          makeAudit('EMPLOYEE_UPDATED', `${existing ? 'Updated' : 'Added'} staff profile (${nextProfile.accountRole})`, {
            targetEmployeeId: nextProfile.employeeId,
          }),
          ...prev.auditLogs,
        ],
      };
    });

    setShowAddStaffForm(false);
    setStaffForm({
      name: '',
      employeeId: '',
      designation: 'Teacher',
      department: 'Academics',
      subject: '',
      mobileNumber: '',
      dateOfJoining: todayIso,
      staffCategory: 'Teaching Staff',
      accountRole: 'Teaching Staff',
      employmentStatus: 'Active',
      alternativePin: '',
    });
    notify('Saved employee profile.');
  };

  const handleAddCustomCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const code = newCatCode.trim().toUpperCase().slice(0, 4);
    const label = newCatLabel.trim();
    if (!code || !label) return;
    if (state.categories.some((c) => c.code.toUpperCase() === code)) {
      setErrorBanner(`Attendance category code "${code}" already exists.`);
      return;
    }
    const newCat: AttendanceCategoryConfig = {
      code,
      label,
      presentWeight: newCatPresentWeight,
      leaveWeight: newCatLeaveWeight,
      tone: 'indigo',
    };
    setState((prev) => ({
      ...prev,
      categories: [...prev.categories, newCat],
      auditLogs: [
        makeAudit('CATEGORY_ADDED', `Added custom attendance category ${code} — ${label}`, { newValue: code }),
        ...prev.auditLogs,
      ],
    }));
    setNewCatCode('');
    setNewCatLabel('');
    notify(`Added custom attendance category: ${code} (${label}).`);
  };

  const handleSaveSchoolProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSchool((prev) => ({
      ...prev,
      name: schoolDraft.name.trim() || prev.name,
      address: schoolDraft.address.trim() || prev.address,
      district: schoolDraft.district.trim() || prev.district,
      state: schoolDraft.stateUt.trim() || prev.state,
      code: schoolDraft.udiseCode.trim() || prev.code,
      academicSession: schoolDraft.academicYear.trim() || prev.academicSession,
      headmasterName: schoolDraft.headmasterName.trim() || prev.headmasterName,
      headTeacherName: schoolDraft.headmasterName.trim() || prev.headTeacherName,
      contactNumber: schoolDraft.contact.trim() || prev.contactNumber,
      email: schoolDraft.email.trim() || prev.email,
      logoDataUrl: schoolDraft.logo || prev.logoDataUrl,
    }));
    setState((prev) => ({
      ...prev,
      rules: {
        ...prev.rules,
        academicSession: schoolDraft.academicYear.trim() || prev.rules.academicSession,
      },
    }));
    notify('Updated School Administration profile details.');
  };

  const handleDownloadBackupJson = async () => {
    const allowed = await guardSensitiveExport('Smart Digital Attendance Full Database Backup (JSON)');
    if (!allowed) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      schoolName: school.name,
      udiseCode: school.code,
      state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Smart_Attendance_Backup_${todayIso}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Exported complete Attendance, Leave, OD & Audit Backup JSON for salary/service records.');
  };

  const handleRestoreBackupJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const restored = parsed.state || parsed;
        if (restored && Array.isArray(restored.employees) && Array.isArray(restored.records)) {
          setState(restored as DigitalAttendancePersistedState);
          notify('Restored attendance database from backup successfully.');
        } else {
          setErrorBanner('Invalid backup file format.');
        }
      } catch {
        setErrorBanner('Unable to read backup JSON file.');
      }
    };
    reader.readAsText(file);
  };

  const navTabs: Array<{
    id: DigitalAttendanceTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'daily-face', label: 'Face Attendance', icon: Camera },
    { id: 'medical-leave', label: 'Medical Leave (ML)', icon: HeartPulse },
    { id: 'on-duty', label: 'On-Duty (OD)', icon: Briefcase },
    { id: 'leave-management', label: 'Leave Desk', icon: CalendarClock },
    { id: 'monthly-register', label: 'Monthly Register & Reports', icon: FileSpreadsheet },
    { id: 'staff-profiles', label: 'Staff & Face Consent', icon: Users },
    { id: 'admin-audit', label: 'Admin, Rules & Audit', icon: ShieldCheck },
  ];

  const pieData = [
    { name: 'Present', value: dashboardMetrics.presentToday },
    { name: 'Absent', value: dashboardMetrics.absentToday },
    { name: 'On Leave', value: Math.max(0, dashboardMetrics.onLeaveToday - dashboardMetrics.medicalLeaveToday) },
    { name: 'Medical Leave', value: dashboardMetrics.medicalLeaveToday },
    { name: 'On Duty', value: dashboardMetrics.onDutyToday },
  ].filter((d) => d.value > 0);

  const barChartData = dashboardMetrics.monthSummaries.slice(0, 10).map((s) => ({
    name: s.employee.name.split(' ')[0],
    Present: s.totalPresentDays,
    OD: s.onDutyDays,
    Leave: s.totalLeaveDays,
    Absent: s.totalAbsentDays,
  }));

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return state.employees;
    return state.employees.filter((e) =>
      `${e.name} ${e.employeeId} ${e.designation} ${e.department} ${e.subject} ${e.accountRole}`
        .toLowerCase()
        .includes(q)
    );
  }, [state.employees, staffSearch]);

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Smart Digital School Attendance Management System</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{school.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">UDISE: {school.code || 'Configured in Admin'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">Session {state.rules.academicSession}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <span>Active Role:</span>
            <select
              value={activeRole}
              onChange={(e) => setActiveRole(e.target.value as DigitalAttendanceRole)}
              aria-label="Active Attendance Role"
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
            >
              <option value="Super Administrator">Super Administrator</option>
              <option value="Headmaster/Principal">Headmaster/Principal</option>
              <option value="Attendance Administrator">Attendance Administrator</option>
              <option value="Teaching Staff">Teaching Staff</option>
              <option value="Non-Teaching Staff">Non-Teaching Staff</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setActiveTab('daily-face')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold whitespace-nowrap shrink-0"
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span>Mark Face Attendance</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-2 flex items-center gap-1 overflow-x-auto">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setErrorBanner(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {statusBanner && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusBanner}</span>
        </div>
      )}

      {errorBanner && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* ================================================================= */}
      {/* 1. DASHBOARD — KPIS, CHARTS & NOTIFICATIONS                       */}
      {/* ================================================================= */}
      {activeTab === 'dashboard' && (
        <div className="space-y-5">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 font-mono tabular-nums">
            {[
              { label: 'Total Employees', value: dashboardMetrics.totalEmployees, tone: 'text-slate-900 dark:text-white' },
              { label: 'Present Today', value: dashboardMetrics.presentToday, tone: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Absent Today', value: dashboardMetrics.absentToday, tone: 'text-rose-600 dark:text-rose-400' },
              { label: 'On Leave Today', value: dashboardMetrics.onLeaveToday, tone: 'text-amber-600 dark:text-amber-400' },
              { label: 'Medical Leave (ML)', value: dashboardMetrics.medicalLeaveToday, tone: 'text-sky-600 dark:text-sky-400' },
              { label: 'On Duty (OD)', value: dashboardMetrics.onDutyToday, tone: 'text-indigo-600 dark:text-indigo-400' },
              { label: 'Pending Leave / OD', value: dashboardMetrics.pendingLeaves, tone: 'text-amber-700 dark:text-amber-300' },
              { label: 'Monthly Attendance %', value: `${dashboardMetrics.avgMonthlyPct}%`, tone: 'text-emerald-700 dark:text-emerald-300' },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4"
              >
                <p className="text-xs font-sans font-semibold text-slate-500 dark:text-slate-400">{kpi.label}</p>
                <p className={`text-2xl font-black mt-1.5 ${kpi.tone}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Missing Attendance Alert */}
          {dashboardMetrics.unmarkedToday > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  <strong className="font-mono tabular-nums">{dashboardMetrics.unmarkedToday}</strong> employee
                  {dashboardMetrics.unmarkedToday === 1 ? '' : 's'} have not marked attendance yet for today ({todayIso}).
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('daily-face')}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold whitespace-nowrap"
              >
                Open Face Attendance
              </button>
            </div>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-extrabold">Monthly Staff Attendance Breakdown ({currentMonthKey})</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Present, On-Duty (OD), Leave, and Absent days per employee
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('monthly-register')}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                >
                  Open Full Register
                </button>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="Present" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="OD" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Leave" fill="#d97706" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Absent" fill="#e11d48" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <div>
                <h2 className="text-sm font-extrabold">Today&apos;s Distribution</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Live status breakdown for {todayIso}</p>
              </div>
              {pieData.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center text-center text-xs text-slate-500 gap-2">
                  <Camera className="w-7 h-7 text-slate-400" />
                  <p>No attendance marked yet for today.</p>
                </div>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={78} paddingAngle={3}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Notifications Feed */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Attendance &amp; Leave Notifications</span>
                {unreadNotificationsCount > 0 && (
                  <span className="text-xs font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                    ({unreadNotificationsCount} unread)
                  </span>
                )}
              </h2>
              {state.notifications.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
                    }))
                  }
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline"
                >
                  Mark All Read
                </button>
              )}
            </div>

            {state.notifications.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Notifications for face verification, leave approvals, On-Duty orders, and monthly report generation will appear here.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto text-xs">
                {state.notifications.slice(0, 12).map((n) => (
                  <div key={n.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{n.title}</p>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">{n.message}</p>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                      {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 2. FACE RECOGNITION & DAILY ATTENDANCE                            */}
      {/* ================================================================= */}
      {activeTab === 'daily-face' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold">Face Recognition &amp; Daily Attendance</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Live camera biometric verification with anti-spoofing liveness check, First/Second Half rules, duplicate prevention, and documented Alternative Process.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <label className="font-bold text-slate-700 dark:text-slate-200">Attendance Date:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums"
              />
            </div>
          </div>

          {isMonthLocked(selectedDate.slice(0, 7)) && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                Attendance for {selectedDate.slice(0, 7)} is finalized and locked. Reopen in Monthly Register with Headmaster permission to make changes.
              </span>
            </div>
          )}

          {/* Attendance Categories Legend */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-200">Configured Status Codes:</span>
            {state.categories.map((c) => (
              <span key={c.code} className="text-slate-600 dark:text-slate-300">
                <strong className="font-mono text-slate-900 dark:text-white">{c.code}</strong> — {c.label}
              </span>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3 font-bold">Employee</th>
                  <th className="py-2.5 px-3 font-bold">Designation &amp; Dept</th>
                  <th className="py-2.5 px-3 font-bold">Biometric Status</th>
                  <th className="py-2.5 px-3 font-bold">Status ({selectedDate})</th>
                  <th className="py-2.5 px-3 font-bold">Time &amp; Method</th>
                  <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeEmployees.map((emp) => {
                  const rec = selectedDateRecordsByEmp.get(emp.employeeId);
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3">
                        <p className="font-bold text-slate-900 dark:text-white">{emp.name}</p>
                        <p className="text-[11px] font-mono tabular-nums text-slate-500">{emp.employeeId}</p>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-medium">{emp.designation}</p>
                        <p className="text-[11px] text-slate-500">{emp.department} · {emp.staffCategory}</p>
                      </td>
                      <td className="py-3 px-3">
                        {emp.faceTemplate ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            Registered · Consent Logged
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400 font-semibold">
                            Not Registered (Alternative Allowed)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold">
                        {rec ? (
                          <span
                            className={
                              rec.statusCode === 'P' || rec.statusCode === 'OD'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : rec.statusCode === 'A'
                                ? 'text-rose-700 dark:text-rose-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }
                          >
                            {rec.statusCode}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-sans font-normal">Not Marked</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300">
                        {rec ? (
                          <div>
                            <p>{rec.checkInTime}</p>
                            <p className="font-sans text-slate-500 capitalize">
                              {rec.verificationMethod.replace(/_/g, ' ')}
                            </p>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {!emp.faceTemplate && (
                            <button
                              type="button"
                              onClick={() => setFaceModal({ mode: 'register', employee: emp })}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold whitespace-nowrap"
                            >
                              Register Face
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={Boolean(rec) || Boolean(isMonthLocked(selectedDate.slice(0, 7)))}
                            onClick={() => setFaceModal({ mode: 'verify', employee: emp })}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-45 whitespace-nowrap"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>{rec ? 'Marked' : 'Verify & Mark'}</span>
                          </button>
                          {canCorrectAttendance && (
                            <button
                              type="button"
                              disabled={Boolean(isMonthLocked(selectedDate.slice(0, 7)))}
                              onClick={() => {
                                setCorrectionTarget({
                                  employee: emp,
                                  date: selectedDate,
                                  currentCode: rec?.statusCode || '',
                                });
                                setCorrectionCode(rec?.statusCode || 'P');
                                setCorrectionReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold disabled:opacity-45 whitespace-nowrap"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Correct</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 3. MEDICAL LEAVE (ML) MANAGEMENT                                  */}
      {/* ================================================================= */}
      {activeTab === 'medical-leave' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form
            onSubmit={handleSubmitMedicalLeave}
            className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3.5 text-xs"
          >
            <h2 className="text-sm font-extrabold flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-sky-600" />
              <span>Apply for Medical Leave (ML)</span>
            </h2>

            <div>
              <label className="block font-bold mb-1">Employee Name &amp; ID</label>
              <select
                value={mlEmployeeId}
                onChange={(e) => setMlEmployeeId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                {state.employees.map((e) => (
                  <option key={e.id} value={e.employeeId}>
                    {e.name} ({e.employeeId}) — ML Bal: {e.leaveBalances.ML}d
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold mb-1">From Date</label>
                <input
                  type="date"
                  required
                  value={mlFromDate}
                  onChange={(e) => setMlFromDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">To Date</label>
                <input
                  type="date"
                  required
                  value={mlToDate}
                  onChange={(e) => setMlToDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Calculated Days:</span>
              <span className="font-mono font-bold tabular-nums">
                {enumerateDatesInclusive(mlFromDate, mlToDate).length} day(s)
              </span>
            </div>

            <div>
              <label className="block font-bold mb-1">Medical Leave Reason *</label>
              <textarea
                rows={3}
                required
                value={mlReason}
                onChange={(e) => setMlReason(e.target.value)}
                placeholder="Describe medical condition or doctor's advice..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-bold mb-1">Supporting Medical Certificate (Optional PDF/Image)</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readSupportingFile(f, (n, d) => { setMlCertName(n); setMlCertDataUrl(d); });
                }}
                className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-semibold"
              />
              {mlCertName && <p className="text-[11px] text-emerald-700 mt-1">Attached: {mlCertName}</p>}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              Submit Medical Leave Application
            </button>
          </form>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 text-xs">
            <h2 className="text-sm font-extrabold">Medical Leave Applications &amp; Headmaster Approval</h2>
            {state.medicalLeaves.length === 0 ? (
              <p className="text-slate-500 py-8 text-center">No Medical Leave applications recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {state.medicalLeaves.map((ml) => (
                  <div
                    key={ml.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {ml.employeeName} <span className="font-mono text-slate-500">({ml.employeeId})</span>
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {ml.fromDate} to {ml.toDate} · {ml.numberOfDays} day(s) · Applied {ml.applicationDate}
                        </p>
                      </div>
                      <span
                        className={`font-bold ${
                          ml.status === 'Approved'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : ml.status === 'Rejected'
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {ml.status}
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-200">{ml.reason}</p>
                    {ml.certificateName && (
                      <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
                        Certificate Attached: {ml.certificateName}
                      </p>
                    )}
                    {ml.headmasterRemarks && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">
                        <strong>Headmaster Remarks:</strong> {ml.headmasterRemarks}
                      </p>
                    )}
                    {ml.status === 'Pending' && canApproveLeaves && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <input
                          type="text"
                          value={reviewRemarksMap[ml.id] || ''}
                          onChange={(e) =>
                            setReviewRemarksMap((prev) => ({ ...prev, [ml.id]: e.target.value }))
                          }
                          placeholder="Headmaster remarks..."
                          className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => handleReviewMedicalLeave(ml.id, 'Approved')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve (Mark ML)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewMedicalLeave(ml.id, 'Rejected')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold whitespace-nowrap"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 4. ON-DUTY (OD) MANAGEMENT                                        */}
      {/* ================================================================= */}
      {activeTab === 'on-duty' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form
            onSubmit={handleSubmitOnDuty}
            className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 text-xs"
          >
            <h2 className="text-sm font-extrabold flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-600" />
              <span>Submit On-Duty (OD) Order</span>
            </h2>

            <div>
              <label className="block font-bold mb-1">Employee Name</label>
              <select
                value={odEmployeeId}
                onChange={(e) => setOdEmployeeId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                {state.employees.map((e) => (
                  <option key={e.id} value={e.employeeId}>
                    {e.name} ({e.employeeId})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold mb-1">Date of Duty</label>
                <input
                  type="date"
                  required
                  value={odDateOfDuty}
                  onChange={(e) => setOdDateOfDuty(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Order Date</label>
                <input
                  type="date"
                  required
                  value={odOrderDate}
                  onChange={(e) => setOdOrderDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold mb-1">From Date</label>
                <input
                  type="date"
                  required
                  value={odFromDate}
                  onChange={(e) => setOdFromDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">To Date</label>
                <input
                  type="date"
                  required
                  value={odToDate}
                  onChange={(e) => setOdToDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold mb-1">Duty Location *</label>
              <input
                type="text"
                required
                value={odLocation}
                onChange={(e) => setOdLocation(e.target.value)}
                placeholder="e.g., DIET Training Center / ZEO Office"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-bold mb-1">Duty Name / Purpose *</label>
              <input
                type="text"
                required
                value={odPurpose}
                onChange={(e) => setOdPurpose(e.target.value)}
                placeholder="e.g., Official Examination Evaluation / Workshop"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold mb-1">Order Number *</label>
                <input
                  type="text"
                  required
                  value={odOrderNumber}
                  onChange={(e) => setOdOrderNumber(e.target.value)}
                  placeholder="e.g., CEO/2026/418"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Issuing Authority *</label>
                <input
                  type="text"
                  required
                  value={odIssuingAuthority}
                  onChange={(e) => setOdIssuingAuthority(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold mb-1">Upload Duty Order (PDF/Image)</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readSupportingFile(f, (n, d) => { setOdDocName(n); setOdDocDataUrl(d); });
                }}
                className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-semibold"
              />
              {odDocName && <p className="text-[11px] text-emerald-700 mt-1">Order File: {odDocName}</p>}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              Submit On-Duty Order
            </button>
          </form>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 text-xs">
            <h2 className="text-sm font-extrabold">On-Duty (OD) Applications &amp; Auto-Attendance Recording</h2>
            {state.onDutyApplications.length === 0 ? (
              <p className="text-slate-500 py-8 text-center">No On-Duty orders submitted yet.</p>
            ) : (
              <div className="space-y-3">
                {state.onDutyApplications.map((od) => (
                  <div
                    key={od.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 space-y-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {od.employeeName} · <span className="font-mono">Order #{od.orderNumber}</span>
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                          Period: {od.fromDate} to {od.toDate} · Order Date: {od.orderDate}
                        </p>
                      </div>
                      <span
                        className={`font-bold ${
                          od.status === 'Approved'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : od.status === 'Rejected'
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {od.status}
                      </span>
                    </div>
                    <p>
                      <strong>Purpose:</strong> {od.dutyPurpose} — <strong>Location:</strong> {od.dutyLocation}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Issuing Authority: {od.issuingAuthority}
                      {od.orderDocumentName ? ` · Attachment: ${od.orderDocumentName}` : ''}
                    </p>
                    {od.status === 'Pending' && canApproveLeaves && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <input
                          type="text"
                          value={reviewRemarksMap[od.id] || ''}
                          onChange={(e) =>
                            setReviewRemarksMap((prev) => ({ ...prev, [od.id]: e.target.value }))
                          }
                          placeholder="Headmaster remarks..."
                          className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => handleReviewOnDuty(od.id, 'Approved')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve (Auto-Record OD)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewOnDuty(od.id, 'Rejected')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold whitespace-nowrap"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 5. GENERAL LEAVE MANAGEMENT (CL, EL, FH, SH + BALANCES)           */}
      {/* ================================================================= */}
      {activeTab === 'leave-management' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form
            onSubmit={handleSubmitGeneralLeave}
            className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 text-xs"
          >
            <h2 className="text-sm font-extrabold">Apply for Casual / Earned / Half-Day Leave</h2>

            <div>
              <label className="block font-bold mb-1">Employee</label>
              <select
                value={glEmployeeId}
                onChange={(e) => setGlEmployeeId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                {state.employees.map((e) => (
                  <option key={e.id} value={e.employeeId}>
                    {e.name} — CL:{e.leaveBalances.CL} | EL:{e.leaveBalances.EL} | ML:{e.leaveBalances.ML}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold mb-1">Leave Category</label>
              <select
                value={glCategory}
                onChange={(e) => setGlCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                {state.categories
                  .filter((c) => c.leaveWeight > 0 && c.code !== 'ML')
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.label}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold mb-1">From Date</label>
                <input
                  type="date"
                  required
                  value={glFromDate}
                  onChange={(e) => setGlFromDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">To Date</label>
                <input
                  type="date"
                  required
                  value={glToDate}
                  onChange={(e) => setGlToDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold mb-1">Leave Reason *</label>
              <textarea
                rows={3}
                required
                value={glReason}
                onChange={(e) => setGlReason(e.target.value)}
                placeholder="Reason for leave..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-bold mb-1">Supporting Document (Optional)</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readSupportingFile(f, (n, d) => { setGlDocName(n); setGlDocDataUrl(d); });
                }}
                className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-semibold"
              />
              {glDocName && <p className="text-[11px] text-emerald-700 mt-1">Attached: {glDocName}</p>}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              Submit Leave Application
            </button>
          </form>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 text-xs">
            <h2 className="text-sm font-extrabold">Leave History, Balances &amp; Pending Approvals</h2>
            {state.generalLeaves.length === 0 ? (
              <p className="text-slate-500 py-8 text-center">No Casual/Earned/Half-Day leave applications yet.</p>
            ) : (
              <div className="space-y-3">
                {state.generalLeaves.map((gl) => (
                  <div
                    key={gl.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 space-y-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {gl.employeeName} · <span className="font-mono">{gl.leaveCategory}</span> ({gl.numberOfDays}d)
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {gl.fromDate} to {gl.toDate} · Applied {gl.applicationDate}
                        </p>
                      </div>
                      <span
                        className={`font-bold ${
                          gl.status === 'Approved'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : gl.status === 'Rejected'
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {gl.status}
                      </span>
                    </div>
                    <p>{gl.reason}</p>
                    {gl.status === 'Pending' && canApproveLeaves && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <input
                          type="text"
                          value={reviewRemarksMap[gl.id] || ''}
                          onChange={(e) =>
                            setReviewRemarksMap((prev) => ({ ...prev, [gl.id]: e.target.value }))
                          }
                          placeholder="Approval remarks..."
                          className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => handleReviewGeneralLeave(gl.id, 'Approved')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold whitespace-nowrap"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewGeneralLeave(gl.id, 'Rejected')}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold whitespace-nowrap"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 6. AUTOMATIC MONTHLY ATTENDANCE REGISTER, PDF & EXCEL EXPORTS     */}
      {/* ================================================================= */}
      {activeTab === 'monthly-register' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold">Automatic Monthly Attendance Register</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {school.name} · {school.address} · Session {state.rules.academicSession}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={handlePrintRegister}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-bold whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Register</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportPdf('landscape')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 dark:bg-indigo-600 text-white font-bold whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PDF (A4 Landscape)</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportPdf('portrait')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 text-white font-bold whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>PDF (A4 Portrait)</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportExcel(false)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportExcel(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>All-Months Excel</span>
              </button>
            </div>
          </div>

          {/* Filter & Month Lock Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="month"
                value={registerMonth}
                onChange={(e) => setRegisterMonth(e.target.value)}
                aria-label="Select Month"
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-semibold"
              />
              <select
                value={registerEmployeeFilter}
                onChange={(e) => setRegisterEmployeeFilter(e.target.value)}
                aria-label="Filter Employee"
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
              >
                <option value="ALL">All Employees (Consolidated)</option>
                {state.employees.map((e) => (
                  <option key={e.id} value={e.employeeId}>
                    {e.name} ({e.employeeId})
                  </option>
                ))}
              </select>
              <select
                value={registerDesignationFilter}
                onChange={(e) => setRegisterDesignationFilter(e.target.value)}
                aria-label="Filter Designation"
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
              >
                <option value="ALL">All Designations</option>
                {designations.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              {activeMonthLock ? (
                <>
                  <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 font-bold">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Month Locked by {activeMonthLock.lockedBy}</span>
                  </span>
                  {canApproveLeaves && (
                    <button
                      type="button"
                      onClick={() => setReopenMonthModalOpen(true)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold whitespace-nowrap"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Reopen Month</span>
                    </button>
                  )}
                </>
              ) : (
                canApproveLeaves && (
                  <button
                    type="button"
                    onClick={handleLockMonth}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-bold whitespace-nowrap"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Lock Finalized Month</span>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Interactive Monthly Register Table */}
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-[11px] border-collapse font-mono tabular-nums">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 px-2 text-left font-sans">Employee</th>
                  {Array.from({ length: registerDaysCount }, (_, i) => (
                    <th key={i} className="py-2 px-1 text-center min-w-[24px]">
                      {i + 1}
                    </th>
                  ))}
                  <th className="py-2 px-1.5 text-center">Work</th>
                  <th className="py-2 px-1.5 text-center">Pres</th>
                  <th className="py-2 px-1.5 text-center">Abs</th>
                  <th className="py-2 px-1.5 text-center">Lv</th>
                  <th className="py-2 px-1.5 text-center">ML</th>
                  <th className="py-2 px-1.5 text-center">OD</th>
                  <th className="py-2 px-1.5 text-center">Att %</th>
                  <th className="py-2 px-2 text-left font-sans min-w-[140px]">Admin Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {registerSummaries.map((sum) => {
                  const remKey = `${sum.employee.employeeId}_${registerMonth}`;
                  return (
                    <tr key={sum.employee.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-2 font-sans whitespace-nowrap">
                        <p className="font-bold text-slate-900 dark:text-white">{sum.employee.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {sum.employee.employeeId} · {sum.employee.designation}
                        </p>
                      </td>
                      {Array.from({ length: registerDaysCount }, (_, i) => {
                        const day = i + 1;
                        const code = sum.dailyCodes[day] || '';
                        const dateIso = `${registerMonth}-${String(day).padStart(2, '0')}`;
                        return (
                          <td key={day} className="py-1.5 px-0.5 text-center">
                            <button
                              type="button"
                              disabled={!canCorrectAttendance || Boolean(activeMonthLock)}
                              title={`Edit ${sum.employee.name} on ${dateIso}`}
                              onClick={() => {
                                setCorrectionTarget({
                                  employee: sum.employee,
                                  date: dateIso,
                                  currentCode: code,
                                });
                                setCorrectionCode(code || 'P');
                                setCorrectionReason('');
                              }}
                              className={`w-6 h-6 rounded text-[10px] font-bold ${
                                code === 'P'
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                  : code === 'A'
                                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                                  : code === 'OD'
                                  ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300'
                                  : code === 'ML'
                                  ? 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300'
                                  : code === 'W' || code === 'H'
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                  : code
                                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                  : 'text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              {code || '·'}
                            </button>
                          </td>
                        );
                      })}
                      <td className="py-2 px-1.5 text-center">{sum.totalWorkingDays}</td>
                      <td className="py-2 px-1.5 text-center font-bold text-emerald-700 dark:text-emerald-400">
                        {sum.totalPresentDays}
                      </td>
                      <td className="py-2 px-1.5 text-center text-rose-700 dark:text-rose-400">
                        {sum.totalAbsentDays}
                      </td>
                      <td className="py-2 px-1.5 text-center text-amber-700 dark:text-amber-400">
                        {sum.totalLeaveDays}
                      </td>
                      <td className="py-2 px-1.5 text-center text-sky-700 dark:text-sky-400">
                        {sum.medicalLeaveDays}
                      </td>
                      <td className="py-2 px-1.5 text-center text-indigo-700 dark:text-indigo-400">
                        {sum.onDutyDays}
                      </td>
                      <td className="py-2 px-1.5 text-center font-black">{sum.attendancePercentage}%</td>
                      <td className="py-1.5 px-2 font-sans">
                        <input
                          type="text"
                          value={state.adminRemarksByEmployeeMonth[remKey] || ''}
                          onChange={(e) =>
                            setState((prev) => ({
                              ...prev,
                              adminRemarksByEmployeeMonth: {
                                ...prev.adminRemarksByEmployeeMonth,
                                [remKey]: e.target.value,
                              },
                            }))
                          }
                          placeholder="Remarks..."
                          className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 7. STAFF PROFILES, ROLES & BIOMETRIC CONSENT                      */}
      {/* ================================================================= */}
      {activeTab === 'staff-profiles' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold">User Management, Staff Profiles &amp; Face Consent</h2>
              <p className="text-slate-500 dark:text-slate-400">
                Manage Teaching &amp; Non-Teaching staff profiles, account roles, informed-consent biometric templates, and Alternative PINs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  placeholder="Search staff..."
                  className="pl-8 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowAddStaffForm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Add Staff Profile</span>
              </button>
            </div>
          </div>

          {showAddStaffForm && (
            <form
              onSubmit={(e) => void handleSaveStaffProfile(e)}
              className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3"
            >
              <h3 className="font-extrabold text-sm">
                {staffForm.id ? 'Edit Employee Profile' : 'Register New Employee Profile'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  value={staffForm.name}
                  onChange={(e) => setStaffForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Employee Name *"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
                <input
                  type="text"
                  required
                  value={staffForm.employeeId}
                  onChange={(e) => setStaffForm((p) => ({ ...p, employeeId: e.target.value }))}
                  placeholder="Employee ID * (e.g., EMP-109)"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
                <input
                  type="text"
                  value={staffForm.designation}
                  onChange={(e) => setStaffForm((p) => ({ ...p, designation: e.target.value }))}
                  placeholder="Designation"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
                <input
                  type="text"
                  value={staffForm.department}
                  onChange={(e) => setStaffForm((p) => ({ ...p, department: e.target.value }))}
                  placeholder="Department"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
                <input
                  type="text"
                  value={staffForm.subject}
                  onChange={(e) => setStaffForm((p) => ({ ...p, subject: e.target.value }))}
                  placeholder="Subject"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
                <input
                  type="text"
                  value={staffForm.mobileNumber}
                  onChange={(e) => setStaffForm((p) => ({ ...p, mobileNumber: e.target.value }))}
                  placeholder="Mobile Number"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
                <input
                  type="date"
                  value={staffForm.dateOfJoining}
                  onChange={(e) => setStaffForm((p) => ({ ...p, dateOfJoining: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
                <select
                  value={staffForm.accountRole}
                  onChange={(e) =>
                    setStaffForm((p) => ({ ...p, accountRole: e.target.value as DigitalAttendanceRole }))
                  }
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                >
                  <option value="Super Administrator">Super Administrator</option>
                  <option value="Headmaster/Principal">Headmaster/Principal</option>
                  <option value="Attendance Administrator">Attendance Administrator</option>
                  <option value="Teaching Staff">Teaching Staff</option>
                  <option value="Non-Teaching Staff">Non-Teaching Staff</option>
                </select>
                <select
                  value={staffForm.staffCategory}
                  onChange={(e) =>
                    setStaffForm((p) => ({
                      ...p,
                      staffCategory: e.target.value as 'Teaching Staff' | 'Non-Teaching Staff',
                    }))
                  }
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="Teaching Staff">Teaching Staff</option>
                  <option value="Non-Teaching Staff">Non-Teaching Staff</option>
                </select>
                <select
                  value={staffForm.employmentStatus}
                  onChange={(e) =>
                    setStaffForm((p) => ({
                      ...p,
                      employmentStatus: e.target.value as 'Active' | 'On Deputation' | 'Inactive',
                    }))
                  }
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="Active">Active</option>
                  <option value="On Deputation">On Deputation</option>
                  <option value="Inactive">Inactive</option>
                </select>
                <input
                  type="password"
                  maxLength={8}
                  value={staffForm.alternativePin}
                  onChange={(e) => setStaffForm((p) => ({ ...p, alternativePin: e.target.value }))}
                  placeholder="Alternative PIN (4-8 digits)"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) readSupportingFile(f, (_n, d) => setStaffForm((p) => ({ ...p, photoDataUrl: d })));
                  }}
                  className="text-[11px]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddStaffForm(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  Save Employee Profile
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredStaff.map((emp) => (
              <div
                key={emp.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-3"
              >
                <div className="flex items-start gap-3">
                  {emp.photoDataUrl ? (
                    <img
                      src={emp.photoDataUrl}
                      alt={emp.name}
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-extrabold flex items-center justify-center shrink-0">
                      {emp.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-slate-900 dark:text-white truncate">{emp.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {emp.employeeId} · {emp.designation}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {emp.department} · {emp.accountRole} · {emp.employmentStatus}
                    </p>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                  <p>Subject: {emp.subject || '—'} · Joined: {emp.dateOfJoining}</p>
                  <p className="font-mono tabular-nums">
                    Leave Balances — CL: {emp.leaveBalances.CL} · EL: {emp.leaveBalances.EL} · ML: {emp.leaveBalances.ML}
                  </p>
                  <p>
                    Face Biometric:{' '}
                    {emp.faceTemplate ? (
                      <strong className="text-emerald-700 dark:text-emerald-400">
                        Registered (Hash {emp.faceTemplate.templateHash.slice(0, 8)}…)
                      </strong>
                    ) : (
                      <strong className="text-amber-700 dark:text-amber-400">Not Registered</strong>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setFaceModal({ mode: 'register', employee: emp })}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold whitespace-nowrap"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{emp.faceTemplate ? 'Re-Register Face' : 'Register Face'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStaffForm({
                        id: emp.id,
                        name: emp.name,
                        employeeId: emp.employeeId,
                        designation: emp.designation,
                        department: emp.department,
                        subject: emp.subject,
                        mobileNumber: emp.mobileNumber,
                        dateOfJoining: emp.dateOfJoining,
                        staffCategory: emp.staffCategory,
                        accountRole: emp.accountRole,
                        employmentStatus: emp.employmentStatus,
                        photoDataUrl: emp.photoDataUrl,
                        alternativePin: '',
                      });
                      setShowAddStaffForm(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 font-semibold whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  {emp.faceTemplate && (
                    <button
                      type="button"
                      onClick={() => {
                        setState((prev) => ({
                          ...prev,
                          employees: prev.employees.map((x) =>
                            x.id === emp.id ? { ...x, faceTemplate: null } : x
                          ),
                          auditLogs: [
                            makeAudit('EMPLOYEE_UPDATED', 'Biometric face template deleted per employee data-deletion right', {
                              targetEmployeeId: emp.employeeId,
                            }),
                            ...prev.auditLogs,
                          ],
                        }));
                        notify(`Deleted biometric template for ${emp.name}.`);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 font-semibold whitespace-nowrap"
                    >
                      Revoke Face
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 8. SCHOOL ADMIN, RULES, CUSTOM CATEGORIES, BACKUP & AUDIT TRAIL   */}
      {/* ================================================================= */}
      {activeTab === 'admin-audit' && (
        <div className="space-y-5 text-xs">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* School Profile Administration */}
            <form
              onSubmit={handleSaveSchoolProfile}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3"
            >
              <h2 className="text-sm font-extrabold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>School Profile &amp; Administration</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={schoolDraft.name}
                  onChange={(e) => setSchoolDraft((p) => ({ ...p, name: e.target.value }))}
                  placeholder="School Name"
                  className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <input
                  type="text"
                  value={schoolDraft.address}
                  onChange={(e) => setSchoolDraft((p) => ({ ...p, address: e.target.value }))}
                  placeholder="School Address"
                  className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <input
                  type="text"
                  value={schoolDraft.district}
                  onChange={(e) => setSchoolDraft((p) => ({ ...p, district: e.target.value }))}
                  placeholder="District"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <input
                  type="text"
                  value={schoolDraft.stateUt}
                  onChange={(e) => setSchoolDraft((p) => ({ ...p, stateUt: e.target.value }))}
                  placeholder="State / UT"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <input
                  type="text"
                  value={schoolDraft.udiseCode}
                  onChange={(e) => setSchoolDraft((p) => ({ ...p, udiseCode: e.target.value }))}
                  placeholder="School Code / UDISE Code"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
                <input
                  type="text"
                  value={schoolDraft.academicYear}
                  onChange={(e) => setSchoolDraft((p) => ({ ...p, academicYear: e.target.value }))}
                  placeholder="Academic Session (e.g., 2026-27)"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
                <input
                  type="text"
                  value={schoolDraft.headmasterName}
                  onChange={(e) => setSchoolDraft((p) => ({ ...p, headmasterName: e.target.value }))}
                  placeholder="Headmaster / Principal Name"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <input
                  type="text"
                  value={schoolDraft.contact}
                  onChange={(e) => setSchoolDraft((p) => ({ ...p, contact: e.target.value }))}
                  placeholder="Contact Number"
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
                <input
                  type="email"
                  value={schoolDraft.email}
                  onChange={(e) => setSchoolDraft((p) => ({ ...p, email: e.target.value }))}
                  placeholder="Official Email"
                  className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              >
                Save School Profile
              </button>
            </form>

            {/* Working Hours, Custom Attendance Categories & Backup/Recovery */}
            <div className="space-y-5">
              <form
                onSubmit={handleAddCustomCategory}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3"
              >
                <h2 className="text-sm font-extrabold">Add Custom Attendance Category</h2>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={newCatCode}
                    onChange={(e) => setNewCatCode(e.target.value)}
                    placeholder="Code (e.g., SL, TR)"
                    className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono uppercase"
                  />
                  <input
                    type="text"
                    required
                    value={newCatLabel}
                    onChange={(e) => setNewCatLabel(e.target.value)}
                    placeholder="Category Label (e.g., Study Leave)"
                    className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                  <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span>Present Weight:</span>
                    <select
                      value={newCatPresentWeight}
                      onChange={(e) => setNewCatPresentWeight(Number(e.target.value))}
                      className="font-mono bg-transparent font-bold"
                    >
                      <option value={0}>0.0</option>
                      <option value={0.5}>0.5</option>
                      <option value={1}>1.0</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span>Leave Weight:</span>
                    <select
                      value={newCatLeaveWeight}
                      onChange={(e) => setNewCatLeaveWeight(Number(e.target.value))}
                      className="font-mono bg-transparent font-bold"
                    >
                      <option value={0}>0.0</option>
                      <option value={0.5}>0.5</option>
                      <option value={1}>1.0</option>
                    </select>
                  </label>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-indigo-600 text-white font-bold"
                >
                  Add Attendance Category
                </button>
              </form>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <h2 className="text-sm font-extrabold flex items-center gap-2">
                  <DatabaseBackup className="w-4 h-4 text-emerald-600" />
                  <span>Backup, Recovery &amp; Data Protection Policy</span>
                </h2>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Biometric verification stores only SHA-256 hashed structural descriptors with explicit informed consent (no raw face photos saved). Retention window: <strong>{state.rules.dataRetentionDays} days</strong>. Employees may revoke biometric templates or use the documented Alternative Attendance Process at any time.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadBackupJson}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Salary/Service Backup JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => backupInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-bold whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Restore Backup</span>
                  </button>
                  <input
                    ref={backupInputRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleRestoreBackupJson(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Audit Trail Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h2 className="text-sm font-extrabold flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600" />
              <span>Immutable Attendance Modification &amp; Authorization Audit Trail</span>
            </h2>
            {state.auditLogs.length === 0 ? (
              <p className="text-slate-500 py-6 text-center">No audit events logged yet.</p>
            ) : (
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500">
                      <th className="py-2 px-2">Timestamp</th>
                      <th className="py-2 px-2">Actor &amp; Role</th>
                      <th className="py-2 px-2">Action</th>
                      <th className="py-2 px-2">Target</th>
                      <th className="py-2 px-2">Change &amp; Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {state.auditLogs.slice(0, 50).map((log) => (
                      <tr key={log.id}>
                        <td className="py-2 px-2 font-mono tabular-nums whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2 px-2">
                          <strong>{log.actorName}</strong> · {log.actorRole}
                        </td>
                        <td className="py-2 px-2 font-mono font-bold text-indigo-700 dark:text-indigo-400">
                          {log.action}
                        </td>
                        <td className="py-2 px-2 font-mono">
                          {[log.targetEmployeeId, log.targetDate].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="py-2 px-2">
                          {log.previousValue || log.newValue
                            ? `[${log.previousValue || '—'} → ${log.newValue || '—'}] `
                            : ''}
                          {log.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODALS: FACE VERIFICATION, AUTHORIZED CORRECTION, REOPEN MONTH    */}
      {/* ================================================================= */}
      {faceModal && (
        <FaceAttendanceVerificationModal
          mode={faceModal.mode}
          employee={faceModal.employee}
          actorName={currentUser.name}
          onClose={() => setFaceModal(null)}
          onRegistered={handleFaceRegistered}
          onVerifiedSuccess={handleFaceVerifiedAttendance}
          onVerificationFailed={handleFaceVerificationFailed}
        />
      )}

      {correctionTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Manual Attendance Correction"
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleSaveAuthorizedCorrection}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 space-y-4 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                <span>Authorized Attendance Correction</span>
              </h3>
              <button
                type="button"
                onClick={() => setCorrectionTarget(null)}
                aria-label="Close"
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-600 dark:text-slate-300">
              Updating <strong>{correctionTarget.employee.name}</strong> ({correctionTarget.employee.employeeId}) on{' '}
              <strong className="font-mono">{correctionTarget.date}</strong>. Current:{' '}
              <strong className="font-mono">{correctionTarget.currentCode || 'Unmarked'}</strong>.
            </p>

            <div>
              <label className="block font-bold mb-1">New Attendance Status</label>
              <select
                value={correctionCode}
                onChange={(e) => setCorrectionCode(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                {state.categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold mb-1">Authorization Reason (Logged in Audit Trail) *</label>
              <textarea
                rows={2}
                required
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="e.g., Headmaster approved half-day adjustment / camera malfunction..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCorrectionTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              >
                Save Authorized Correction
              </button>
            </div>
          </form>
        </div>
      )}

      {reopenMonthModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reopen Locked Attendance Month"
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleConfirmReopenMonth}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 space-y-4 text-xs shadow-2xl"
          >
            <h3 className="text-sm font-extrabold">Reopen Finalized Attendance ({registerMonth})</h3>
            <p className="text-slate-600 dark:text-slate-300">
              Headmaster/Principal authorization is logged permanently in the school audit trail.
            </p>
            <textarea
              rows={3}
              required
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Enter official reason for reopening finalized attendance..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReopenMonthModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                Authorize &amp; Reopen Month
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
