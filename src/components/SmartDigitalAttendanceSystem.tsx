import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  LogOut,
  CalendarPlus,
  Bell,
  ShieldCheck,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  FileCheck2,
  UserPlus,
  LayoutDashboard,
  Languages,
  MapPin,
  AlertTriangle,
  Building2,
  RefreshCw,
  Upload,
} from 'lucide-react';
import type { SchoolProfile, TeacherProfile, User } from '../types';
import {
  AttendanceNotification,
  AttendanceSecurityLog,
  BiometricFaceTemplate,
  DEFAULT_ATTENDANCE_CATEGORIES,
  DEFAULT_VPN_SECURITY_POLICY,
  DigitalAttendanceAuditLog,
  DigitalAttendanceRecord,
  DigitalAttendanceRole,
  DigitalEmployeeProfile,
  FiveStatusAiVerification,
  HalfDayMode,
  HierarchicalLeaveApplication,
  TeacherLeaveType,
  VpnSecurityPolicy,
} from '../types/digitalAttendance';
import { computeMonthlyEmployeeSummary } from '../utils/digitalAttendanceExports';
import { FaceAttendanceVerificationModal } from './FaceAttendanceVerificationModal';
import { AadhaarAuthentication } from './AadhaarAuthentication';
import {
  AdminSecurityAndReportsPanel,
  LeaveApprovalQueuePanel,
  TeacherRegistrationPanel,
} from './SmartAttendancePanels';
import {
  checkNetworkSecurityStatus,
  setVpnAdminOverride,
  type NetworkMonitorResult,
} from '../utils/networkMonitor';

interface SmartDigitalAttendanceSystemProps {
  school: SchoolProfile;
  currentUser: User;
  teachers: TeacherProfile[];
  onUpdateSchool: React.Dispatch<React.SetStateAction<SchoolProfile>>;
}

type ActiveViewTab =
  | 'teacher-dashboard'
  | 'headmaster-dashboard'
  | 'officer-approvals'
  | 'admin-dashboard'
  | 'registration';

const FIVE_ROLES: DigitalAttendanceRole[] = [
  'Teacher',
  'Headmaster / Principal',
  'ZEO (Zonal Education Officer)',
  'CEO (Chief Education Officer)',
  'Super Administrator',
];

const LEAVE_TYPES: TeacherLeaveType[] = [
  'Casual Leave',
  'Medical Leave',
  '1st Half-Day Leave',
  '2nd Half-Day Leave',
];

const FACE_TEMPLATES_STORAGE_KEY = 'sm_teacher_face_templates_v2';

function getTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function getCurrentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function defaultRoleForUser(user: User): DigitalAttendanceRole {
  if (user.role === 'admin') return 'Super Administrator';
  if (user.role === 'head_teacher') return 'Headmaster / Principal';
  return 'Teacher';
}

function defaultTabForRole(role: DigitalAttendanceRole): ActiveViewTab {
  if (role === 'Teacher') return 'teacher-dashboard';
  if (role === 'Headmaster / Principal') return 'headmaster-dashboard';
  if (role === 'ZEO (Zonal Education Officer)' || role === 'CEO (Chief Education Officer)') {
    return 'officer-approvals';
  }
  return 'admin-dashboard';
}

function loadSavedTemplates(): Record<string, BiometricFaceTemplate> {
  try {
    const raw = localStorage.getItem(FACE_TEMPLATES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTemplateLocally(employeeId: string, template: BiometricFaceTemplate) {
  try {
    const map = loadSavedTemplates();
    map[employeeId] = template;
    localStorage.setItem(FACE_TEMPLATES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

function statusPillStyle(code: string): string {
  switch (code) {
    case 'P':
    case 'OD':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60';
    case 'LA':
    case 'ED':
    case 'FH':
    case 'SH':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60';
    case 'AL':
    case 'ML':
    case 'CL':
    case 'EL':
      return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60';
    default:
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60';
  }
}

export const SmartDigitalAttendanceSystem: React.FC<SmartDigitalAttendanceSystemProps> = ({
  school,
  currentUser,
  teachers,
}) => {
  const [activeRole, setActiveRole] = useState<DigitalAttendanceRole>(() =>
    defaultRoleForUser(currentUser)
  );
  const [activeTab, setActiveTab] = useState<ActiveViewTab>(() =>
    defaultTabForRole(defaultRoleForUser(currentUser))
  );
  const [lang, setLang] = useState<'en' | 'ur'>('en');
  const [monthKey, setMonthKey] = useState<string>(() => getCurrentMonthKey());

  // Backend-persisted state
  const [serverTeachers, setServerTeachers] = useState<DigitalEmployeeProfile[]>([]);
  const [records, setRecords] = useState<DigitalAttendanceRecord[]>([]);
  const [hierarchicalLeaves, setHierarchicalLeaves] = useState<HierarchicalLeaveApplication[]>([]);
  const [securityLogs, setSecurityLogs] = useState<AttendanceSecurityLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<DigitalAttendanceAuditLog[]>([]);
  const [notifications, setNotifications] = useState<AttendanceNotification[]>([]);
  const [securityPolicy, setSecurityPolicy] = useState<VpnSecurityPolicy>(
    DEFAULT_VPN_SECURITY_POLICY
  );
  const [localTemplates, setLocalTemplates] = useState<Record<string, BiometricFaceTemplate>>(() =>
    loadSavedTemplates()
  );

  const [loadingState, setLoadingState] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null);

  // Selected Teacher profile for Teacher Dashboard / Attendance Marking
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [lastVerification, setLastVerification] = useState<FiveStatusAiVerification | null>(null);
  const [networkMonitorState, setNetworkMonitorState] = useState<NetworkMonitorResult | null>(null);
  const [checkingNetwork, setCheckingNetwork] = useState(false);
  const [savingVpnOverride, setSavingVpnOverride] = useState(false);

  // Face Modal State
  const [faceModal, setFaceModal] = useState<{
    mode: 'register' | 'verify';
    employee: DigitalEmployeeProfile;
  } | null>(null);

  // Teacher Leave Application Form
  const [leaveType, setLeaveType] = useState<TeacherLeaveType>('Casual Leave');
  const [leaveFromDate, setLeaveFromDate] = useState<string>(() => getTodayIso());
  const [leaveToDate, setLeaveToDate] = useState<string>(() => getTodayIso());
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveDocName, setLeaveDocName] = useState('');
  const [leaveDocDataUrl, setLeaveDocDataUrl] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);

  // Headmaster Leave Application Form (routed to ZEO / CEO)
  const [hmLeaveType, setHmLeaveType] = useState<TeacherLeaveType>('Casual Leave');
  const [hmLeaveFromDate, setHmLeaveFromDate] = useState<string>(() => getTodayIso());
  const [hmLeaveToDate, setHmLeaveToDate] = useState<string>(() => getTodayIso());
  const [hmLeaveReason, setHmLeaveReason] = useState('');
  const [hmTargetAuthority, setHmTargetAuthority] = useState<'ZEO' | 'CEO'>('ZEO');
  const [hmDocName, setHmDocName] = useState('');
  const [hmDocDataUrl, setHmDocDataUrl] = useState('');
  const [submittingHmLeave, setSubmittingHmLeave] = useState(false);

  const showToast = useCallback((msg: string, tone: 'success' | 'error' = 'success') => {
    setToast({ msg, tone });
    setTimeout(() => setToast((cur) => (cur?.msg === msg ? null : cur)), 4200);
  }, []);

  const fetchServerState = useCallback(async () => {
    setLoadingState(true);
    try {
      const resp = await fetch('/api/smart-attendance/state');
      if (!resp.ok) return;
      const data = await resp.json();
      if (data?.ok && data.state) {
        setServerTeachers(Array.isArray(data.state.teachers) ? data.state.teachers : []);
        setRecords(Array.isArray(data.state.records) ? data.state.records : []);
        setHierarchicalLeaves(
          Array.isArray(data.state.hierarchicalLeaves) ? data.state.hierarchicalLeaves : []
        );
        setSecurityLogs(Array.isArray(data.state.securityLogs) ? data.state.securityLogs : []);
        setAuditLogs(Array.isArray(data.state.auditLogs) ? data.state.auditLogs : []);
        setNotifications(Array.isArray(data.state.notifications) ? data.state.notifications : []);
        if (data.state.securityPolicy) {
          setSecurityPolicy(data.state.securityPolicy);
        }
      }
    } catch {
      // Non-fatal; retains current UI state
    } finally {
      setLoadingState(false);
    }
  }, []);

  const runLiveNetworkMonitor = useCallback(
    async (simulateVpn = false) => {
      setCheckingNetwork(true);
      try {
        const res = await checkNetworkSecurityStatus(simulateVpn);
        setNetworkMonitorState(res);
        setSecurityPolicy(res.policy);
        if (simulateVpn) {
          showToast(
            res.assessment.riskLevel === 'Blocked_By_Policy'
              ? 'Simulated VPN tunnel detected and flagged (Admin Override is OFF).'
              : 'Simulated VPN tunnel detected and permitted via Admin Override.',
            res.assessment.riskLevel === 'Blocked_By_Policy' ? 'error' : 'success'
          );
        }
      } catch {
        // ignore transient network check error
      } finally {
        setCheckingNetwork(false);
      }
    },
    [showToast]
  );

  const handleToggleTeacherDashboardVpnOverride = async () => {
    setSavingVpnOverride(true);
    try {
      const updated = await setVpnAdminOverride({
        vpnAllowed: !securityPolicy.vpnAllowed,
        actorName: currentUser.name || activeRole,
        actorRole: activeRole,
      });
      setSecurityPolicy(updated);
      await runLiveNetworkMonitor(false);
      showToast(
        updated.vpnAllowed
          ? 'VPN / Proxy Admin Override ENABLED (exceptional VPN attendance allowed & logged).'
          : 'VPN / Proxy Admin Override DISABLED (default strict VPN blocking active).'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update override.', 'error');
    } finally {
      setSavingVpnOverride(false);
    }
  };

  useEffect(() => {
    fetchServerState();
    runLiveNetworkMonitor(false);
  }, [fetchServerState, runLiveNetworkMonitor]);

  // Merge SchoolMaster teachers prop + backend registered teachers (Teachers Only)
  const allEmployees: DigitalEmployeeProfile[] = useMemo(() => {
    const byEmpId = new Map<string, DigitalEmployeeProfile>();

    // 1. Seed from existing school teachers prop
    (teachers || []).forEach((t, idx) => {
      const empId = t.employeeId || `TCH-${String(idx + 1).padStart(3, '0')}`;
      byEmpId.set(empId, {
        id: t.id || `tch-prop-${idx}`,
        employeeId: empId,
        name: t.name,
        designation: t.designation || 'Teacher',
        department: t.subjectSpecialization || 'Academics',
        subject: t.subjectSpecialization || 'General',
        mobileNumber: t.contactNumber || 'Not Recorded',
        email: t.email || '',
        schoolName: t.schoolName || school.name || 'Government School',
        schoolCode: school.code || 'JK-UDISE-01',
        zoneName: 'Zone Srinagar Central',
        districtName: t.district || school.district || 'Srinagar',
        dateOfJoining: t.dateOfJoining || '2022-04-01',
        employmentStatus: 'Active',
        accountStatus: 'Active',
        staffCategory: 'Teaching Staff',
        accountRole: /head|principal/i.test(t.designation || '')
          ? 'Headmaster / Principal'
          : 'Teacher',
        aadhaarStatus: 'Verified',
        maskedAadhaar: `XXXX-XXXX-${String(1200 + idx * 7).slice(-4)}`,
        authorizedLocation: {
          latitude: 34.0837,
          longitude: 74.7973,
          radiusMeters: 250,
          addressLabel: t.schoolName || school.name || 'School Campus',
        },
        faceTemplate: localTemplates[empId] || null,
        leaveBalances: {
          CL: t.casualLeaveBalance ?? 12,
          EL: t.earnedLeaveBalance ?? 15,
          ML: t.medicalLeaveBalance ?? 10,
        },
      });
    });

    // 2. Overlay / add teachers registered through Smart Attendance API
    serverTeachers.forEach((st) => {
      const empId = st.employeeId || st.id;
      byEmpId.set(empId, {
        ...st,
        faceTemplate: localTemplates[empId] || st.faceTemplate || null,
      });
    });

    // 3. Ensure at least one default teacher exists if school has no teachers yet
    if (byEmpId.size === 0) {
      const fallbackEmpId = 'TCH-001';
      byEmpId.set(fallbackEmpId, {
        id: 'tch-default-1',
        employeeId: fallbackEmpId,
        name: currentUser.name || 'Mohd Yousuf Wani',
        designation: 'Senior Teacher',
        department: 'Science',
        subject: 'Science',
        mobileNumber: '+91 94190 00001',
        email: currentUser.email || '',
        schoolName: school.name || 'Government High School',
        schoolCode: school.code || 'JK-UDISE-0101',
        zoneName: 'Zone Srinagar Central',
        districtName: school.district || 'Srinagar',
        dateOfJoining: '2020-03-15',
        employmentStatus: 'Active',
        accountStatus: 'Active',
        staffCategory: 'Teaching Staff',
        accountRole: 'Teacher',
        aadhaarStatus: 'Verified',
        maskedAadhaar: 'XXXX-XXXX-4821',
        authorizedLocation: {
          latitude: 34.0837,
          longitude: 74.7973,
          radiusMeters: 250,
          addressLabel: school.name || 'School Campus',
        },
        faceTemplate: localTemplates[fallbackEmpId] || null,
        leaveBalances: { CL: 12, EL: 15, ML: 10 },
      });
    }

    return Array.from(byEmpId.values());
  }, [teachers, serverTeachers, localTemplates, school, currentUser]);

  const activeTeacher: DigitalEmployeeProfile = useMemo(() => {
    if (selectedTeacherId) {
      const found = allEmployees.find((e) => e.employeeId === selectedTeacherId);
      if (found) return found;
    }
    return allEmployees[0];
  }, [allEmployees, selectedTeacherId]);

  const todayIso = getTodayIso();

  const todayTeacherRecord = useMemo(
    () =>
      records.find((r) => r.employeeId === activeTeacher.employeeId && r.date === todayIso) || null,
    [records, activeTeacher.employeeId, todayIso]
  );

  const teacherHistory = useMemo(
    () =>
      records
        .filter((r) => r.employeeId === activeTeacher.employeeId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [records, activeTeacher.employeeId]
  );

  const teacherMonthlySummary = useMemo(
    () =>
      computeMonthlyEmployeeSummary({
        employee: activeTeacher,
        monthKey,
        records,
        categories: DEFAULT_ATTENDANCE_CATEGORIES,
        weeklyOffDay: 0,
      }),
    [activeTeacher, monthKey, records]
  );

  const teacherLeaves = useMemo(
    () => hierarchicalLeaves.filter((l) => l.employeeId === activeTeacher.employeeId),
    [hierarchicalLeaves, activeTeacher.employeeId]
  );

  const headmasterQueueLeaves = useMemo(
    () => hierarchicalLeaves.filter((l) => l.applicantRole === 'Teacher'),
    [hierarchicalLeaves]
  );

  const officerQueueLeaves = useMemo(() => {
    if (activeRole === 'ZEO (Zonal Education Officer)') {
      return hierarchicalLeaves.filter(
        (l) =>
          l.approvalLevel === 'ZEO' ||
          l.applicantRole === 'Headmaster / Principal' ||
          l.status === 'Forwarded for Higher Approval'
      );
    }
    return hierarchicalLeaves.filter(
      (l) =>
        l.approvalLevel === 'CEO' ||
        l.applicantRole === 'Headmaster / Principal' ||
        l.status === 'Forwarded for Higher Approval'
    );
  }, [hierarchicalLeaves, activeRole]);

  // Role-based visible tabs (Administrative users only see authorized dashboards/approvals; Teachers see teacher attendance & leave)
  const availableTabs = useMemo(() => {
    if (activeRole === 'Teacher') {
      return [
        { id: 'teacher-dashboard' as const, label: lang === 'ur' ? 'استاد حاضری ڈیش بورڈ' : 'Teacher Attendance & Leave', icon: LayoutDashboard },
        { id: 'registration' as const, label: lang === 'ur' ? 'رجسٹریشن اور آدھار' : 'Registration & Aadhaar', icon: UserPlus },
      ];
    }
    if (activeRole === 'Headmaster / Principal') {
      return [
        { id: 'headmaster-dashboard' as const, label: lang === 'ur' ? 'ہیڈماسٹر ڈیش بورڈ' : 'Headmaster Dashboard', icon: ShieldCheck },
        { id: 'registration' as const, label: lang === 'ur' ? 'اساتذہ رجسٹریشن' : 'Teacher Registration', icon: UserPlus },
        { id: 'teacher-dashboard' as const, label: lang === 'ur' ? 'میری حاضری' : 'My Personal Attendance', icon: Camera },
      ];
    }
    if (
      activeRole === 'ZEO (Zonal Education Officer)' ||
      activeRole === 'CEO (Chief Education Officer)'
    ) {
      return [
        {
          id: 'officer-approvals' as const,
          label:
            activeRole === 'ZEO (Zonal Education Officer)'
              ? lang === 'ur'
                ? 'زیڈ ای او منظوری ڈیش بورڈ'
                : 'ZEO Approval Dashboard'
              : lang === 'ur'
              ? 'سی ای او منظوری ڈیش بورڈ'
              : 'CEO Approval Dashboard',
          icon: FileCheck2,
        },
        { id: 'admin-dashboard' as const, label: lang === 'ur' ? 'رپورٹس اور نگرانی' : 'Reports & Oversight', icon: Building2 },
        { id: 'registration' as const, label: lang === 'ur' ? 'اساتذہ فہرست' : 'Teachers Directory', icon: Users },
      ];
    }
    // Super Administrator
    return [
      { id: 'admin-dashboard' as const, label: lang === 'ur' ? 'مرکزی ایڈمن ڈیش بورڈ' : 'Centralized Admin Dashboard', icon: ShieldCheck },
      { id: 'officer-approvals' as const, label: lang === 'ur' ? 'چھٹیوں کی منظوری' : 'All Leave Approvals', icon: FileCheck2 },
      { id: 'registration' as const, label: lang === 'ur' ? 'اساتذہ رجسٹریشن و فعال سازی' : 'Teacher Registration & Activation', icon: UserPlus },
    ];
  }, [activeRole, lang]);

  const handleRoleSwitch = (nextRole: DigitalAttendanceRole) => {
    setActiveRole(nextRole);
    setActiveTab(defaultTabForRole(nextRole));
  };

  const handleTriggerBrowserNotification = (title: string, body: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    }
  };

  const handleCheckout = async () => {
    try {
      const resp = await fetch('/api/smart-attendance/attendance/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: activeTeacher.employeeId,
          employeeName: activeTeacher.name,
          date: todayIso,
          schoolEndTime: '15:30',
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || 'Check-out failed.');
      }
      await fetchServerState();
      showToast(`Check-Out recorded at ${data.record.checkOutTime} (${data.record.categoryLabel}).`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to record check-out.', 'error');
    }
  };

  const handleLeaveDocUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setterName: (v: string) => void,
    setterUrl: (v: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      showToast('Supporting document must be under 1.5 MB.', 'error');
      return;
    }
    setterName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setterUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleTeacherLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (leaveReason.trim().length < 4) {
      showToast('Reason for leave is mandatory.', 'error');
      return;
    }
    setSubmittingLeave(true);
    try {
      const resp = await fetch('/api/smart-attendance/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: activeTeacher.employeeId,
          teacherName: activeTeacher.name,
          applicantRole: 'Teacher',
          schoolName: activeTeacher.schoolName || school.name,
          schoolCode: activeTeacher.schoolCode || school.code || 'JK-UDISE-01',
          zoneName: activeTeacher.zoneName || 'Zone Srinagar Central',
          districtName: activeTeacher.districtName || school.district || 'Srinagar',
          leaveCategory: leaveType,
          fromDate: leaveFromDate,
          toDate:
            leaveType === '1st Half-Day Leave' || leaveType === '2nd Half-Day Leave'
              ? leaveFromDate
              : leaveToDate,
          reason: leaveReason.trim(),
          supportingDocumentName: leaveDocName || undefined,
          supportingDocumentDataUrl: leaveDocDataUrl || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Failed to submit leave.');
      setLeaveReason('');
      setLeaveDocName('');
      setLeaveDocDataUrl('');
      await fetchServerState();
      showToast(
        `Leave Application ${data.application.referenceNumber} submitted to Headmaster / Principal.`
      );
      handleTriggerBrowserNotification(
        `Leave Submitted (${data.application.referenceNumber})`,
        `${activeTeacher.name} applied for ${leaveType}.`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to submit leave.', 'error');
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleHeadmasterLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hmLeaveReason.trim().length < 4) {
      showToast('Reason for Headmaster leave is mandatory.', 'error');
      return;
    }
    setSubmittingHmLeave(true);
    try {
      const hmName = currentUser.name || 'Headmaster / Principal';
      const hmEmpId = `HM-${(school.code || '001').slice(-4)}`;
      const resp = await fetch('/api/smart-attendance/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: hmEmpId,
          teacherName: hmName,
          applicantRole: 'Headmaster / Principal',
          schoolName: school.name || 'Government School',
          schoolCode: school.code || 'JK-UDISE-01',
          zoneName: 'Zone Srinagar Central',
          districtName: school.district || 'Srinagar',
          leaveCategory: hmLeaveType,
          fromDate: hmLeaveFromDate,
          toDate:
            hmLeaveType === '1st Half-Day Leave' || hmLeaveType === '2nd Half-Day Leave'
              ? hmLeaveFromDate
              : hmLeaveToDate,
          reason: hmLeaveReason.trim(),
          targetAuthority: hmTargetAuthority,
          supportingDocumentName: hmDocName || undefined,
          supportingDocumentDataUrl: hmDocDataUrl || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Failed to submit Headmaster leave.');
      setHmLeaveReason('');
      setHmDocName('');
      setHmDocDataUrl('');
      await fetchServerState();
      showToast(
        `Headmaster Leave ${data.application.referenceNumber} routed to ${hmTargetAuthority} Dashboard.`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to submit leave.', 'error');
    } finally {
      setSubmittingHmLeave(false);
    }
  };

  const handleCancelLeave = async (lv: HierarchicalLeaveApplication) => {
    try {
      const resp = await fetch(`/api/smart-attendance/leaves/${encodeURIComponent(lv.id)}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'Cancelled',
          reason: 'Cancelled by applicant prior to approval.',
          actorName: activeTeacher.name,
          actorRole: activeRole,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Unable to cancel leave.');
      await fetchServerState();
      showToast(`Leave ${lv.referenceNumber} cancelled.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cancel failed.', 'error');
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className="space-y-5 pb-12">
      {/* Top Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 max-w-md ${
            toast.tone === 'error'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-800'
          }`}
        >
          {toast.tone === 'error' ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 dark:text-emerald-600" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Clean Header Bar — Role Switcher, Language Switcher, Notifications */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {lang === 'ur'
                ? 'سمارٹ ڈیجیٹل اسکول اساتذہ حاضری مینجمنٹ سسٹم'
                : 'Smart Digital School Attendance Management System'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'ur'
                ? 'صرف اساتذہ کے لیے · اے آئی لائیو کیمرہ تصدیق · محفوظ آدھار · وی پی این سکیورٹی · کثیر سطحی چھٹی منظوری'
                : 'Teachers Only · AI Live Camera Verification · Privacy-Compliant Masked Aadhaar · VPN Security · Multi-Level Leave Approvals'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Role Access Level Selector */}
            <select
              aria-label="Active User Role"
              value={activeRole}
              onChange={(e) => handleRoleSwitch(e.target.value as DigitalAttendanceRole)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-white"
            >
              {FIVE_ROLES.map((r) => (
                <option key={r} value={r}>
                  Role: {r}
                </option>
              ))}
            </select>

            {/* English / Urdu Toggle */}
            <button
              type="button"
              onClick={() => setLang((prev) => (prev === 'en' ? 'ur' : 'en'))}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
            >
              <Languages className="w-3.5 h-3.5 text-teal-600" />
              {lang === 'en' ? 'اردو' : 'English'}
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={fetchServerState}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              title="Sync live attendance state"
            >
              <RefreshCw className={`w-4 h-4 ${loadingState ? 'animate-spin' : ''}`} />
            </button>

            {/* Notifications Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications((s) => !s)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
              >
                <Bell className="w-3.5 h-3.5 text-teal-600" />
                <span>{lang === 'ur' ? 'اطلاعات' : 'Alerts'}</span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-3 z-40 space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Attendance & Leave Notifications
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if ('Notification' in window && Notification.permission === 'default') {
                          Notification.requestPermission();
                        }
                        setShowNotifications(false);
                      }}
                      className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      Enable Push / Close
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-1.5">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-500 p-3 text-center">No notifications yet.</p>
                    ) : (
                      notifications.slice(0, 15).map((n) => (
                        <div
                          key={n.id}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 text-xs space-y-0.5"
                        >
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {n.title}
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-300">
                            {n.message}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {new Date(n.timestamp).toLocaleString()}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Role-Scoped Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          {availableTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
                  active
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
       * TAB 1: TEACHER ATTENDANCE & LEAVE DASHBOARD
       * ====================================================================*/}
      {activeTab === 'teacher-dashboard' && (
        <div className="space-y-6">
          {/* Active Teacher Profile & Quick Check-In / Check-Out Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Select Teacher Profile"
                    value={activeTeacher.employeeId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className="text-base font-bold bg-transparent text-slate-900 dark:text-white border-b border-dashed border-slate-300 dark:border-slate-700 pb-0.5 pr-4 focus:outline-none"
                  >
                    {allEmployees.map((emp) => (
                      <option
                        key={emp.employeeId}
                        value={emp.employeeId}
                        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      >
                        {emp.name} ({emp.employeeId})
                      </option>
                    ))}
                  </select>
                  <span className="px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                    {activeTeacher.maskedAadhaar || activeTeacher.alternativeIdType || 'Verified ID'}
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3">
                  <span>
                    {activeTeacher.designation} · {activeTeacher.schoolName || school.name} (
                    {activeTeacher.schoolCode || school.code || 'UDISE'})
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-teal-600" />
                    Geofence: {activeTeacher.authorizedLocation?.radiusMeters || 250}m radius
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!activeTeacher.faceTemplate && (
                  <button
                    type="button"
                    onClick={() => setFaceModal({ mode: 'register', employee: activeTeacher })}
                    className="px-3.5 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Camera className="w-4 h-4" />
                    Register Face Template First
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFaceModal({ mode: 'verify', employee: activeTeacher })}
                  className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center gap-2 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  {lang === 'ur' ? 'لائیو کیمرہ حاضری لگائیں' : 'Mark Attendance (AI Live Camera)'}
                </button>
                <button
                  type="button"
                  disabled={!todayTeacherRecord || Boolean(todayTeacherRecord.checkOutTime)}
                  onClick={handleCheckout}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 disabled:opacity-45 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                  {todayTeacherRecord?.checkOutTime
                    ? `Checked Out (${todayTeacherRecord.checkOutTime})`
                    : lang === 'ur'
                    ? 'چیک آؤٹ'
                    : 'Check-Out'}
                </button>
              </div>
            </div>

            {/* Today's Status & Monthly Summary Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Today's Status</div>
                <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {todayTeacherRecord
                    ? `${todayTeacherRecord.categoryLabel || todayTeacherRecord.statusCode} (${todayTeacherRecord.statusCode})`
                    : 'Not Marked Yet'}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Check-In / Check-Out
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-white font-mono mt-1">
                  {todayTeacherRecord?.checkInTime || '--:--'} /{' '}
                  {todayTeacherRecord?.checkOutTime || '--:--'}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Monthly Attendance
                </div>
                <div className="text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                  {teacherMonthlySummary.attendancePercentage}% ({teacherMonthlySummary.totalPresentDays}d)
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Leave Status</div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">
                  Appr: {teacherLeaves.filter((l) => l.status === 'Approved').length} · Pend:{' '}
                  {teacherLeaves.filter((l) => l.status === 'Pending' || l.status === 'Forwarded for Higher Approval').length} · Rej:{' '}
                  {teacherLeaves.filter((l) => l.status === 'Rejected').length}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Verification Status
                </div>
                <div className="text-xs font-bold text-teal-700 dark:text-teal-400 mt-1 truncate">
                  {lastVerification?.attendanceVerificationStatus ||
                    todayTeacherRecord?.aiVerification?.attendanceVerificationStatus ||
                    (activeTeacher.faceTemplate ? 'Ready for Live Scan' : 'Face Unregistered')}
                </div>
              </div>
            </div>
          </div>

          {/* Live Network & VPN Monitor + Admin Override Setting in Teacher Dashboard */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-0.5 text-xs">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck
                  className={`w-4 h-4 ${
                    networkMonitorState?.assessment.riskLevel === 'Blocked_By_Policy'
                      ? 'text-rose-600'
                      : 'text-teal-600'
                  }`}
                />
                <span>Network &amp; VPN Monitoring Utility</span>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {networkMonitorState
                    ? `${networkMonitorState.assessment.publicIp} · ${
                        networkMonitorState.assessment.vpnDetected ||
                        networkMonitorState.assessment.proxyDetected
                          ? 'VPN / Proxy Flagged'
                          : 'Clean Network'
                      }`
                    : 'Monitoring active'}
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400">
                {networkMonitorState?.assessment.recommendation ||
                  'Detects VPN tunnels, multi-hop proxies, and suspicious network changes before attendance check-in.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={checkingNetwork}
                onClick={() => runLiveNetworkMonitor(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {checkingNetwork ? 'Scanning...' : 'Scan Network'}
              </button>
              <button
                type="button"
                disabled={checkingNetwork}
                onClick={() => runLiveNetworkMonitor(true)}
                className="px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              >
                Test VPN Alert
              </button>
              <button
                type="button"
                disabled={savingVpnOverride}
                onClick={handleToggleTeacherDashboardVpnOverride}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  securityPolicy.vpnAllowed
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                }`}
              >
                Admin Override (VPN): {securityPolicy.vpnAllowed ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* AadhaarAuthentication Component (Mock Integration, Masking Logic & Consent Management) */}
          <AadhaarAuthentication
            employee={activeTeacher}
            onToast={showToast}
            onVerified={() => fetchServerState()}
          />

          {/* Two-Column: Apply Leave + Attendance History & Leave Tracker */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Teacher Leave Application Form */}
            <form
              onSubmit={handleTeacherLeaveSubmit}
              className="xl:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3.5"
            >
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CalendarPlus className="w-4 h-4 text-teal-600" />
                  {lang === 'ur' ? 'چھٹی کی درخواست (اساتذہ)' : 'Apply for Teacher Leave'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Automatically routed to Headmaster / Principal with unique Leave Reference ID
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {LEAVE_TYPES.map((lt) => (
                  <button
                    key={lt}
                    type="button"
                    onClick={() => setLeaveType(lt)}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold text-left transition-colors ${
                      leaveType === lt
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-200'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {lt}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    From Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={leaveFromDate}
                    onChange={(e) => setLeaveFromDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    To Date *
                  </label>
                  <input
                    type="date"
                    required
                    disabled={
                      leaveType === '1st Half-Day Leave' || leaveType === '2nd Half-Day Leave'
                    }
                    value={
                      leaveType === '1st Half-Day Leave' || leaveType === '2nd Half-Day Leave'
                        ? leaveFromDate
                        : leaveToDate
                    }
                    onChange={(e) => setLeaveToDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-60 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Leave (Mandatory) *
                </label>
                <textarea
                  rows={3}
                  required
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Provide a clear reason for your leave request..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Supporting Document{' '}
                  {leaveType === 'Medical Leave' ? '(Medical Certificate Recommended)' : '(Optional)'}
                </label>
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 cursor-pointer text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <Upload className="w-4 h-4 text-teal-600" />
                  <span className="truncate">
                    {leaveDocName || 'Attach Medical Certificate / PDF / Image'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => handleLeaveDocUpload(e, setLeaveDocName, setLeaveDocDataUrl)}
                    className="hidden"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={submittingLeave}
                className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
              >
                {submittingLeave ? 'Submitting Application...' : 'Submit Leave Application'}
              </button>
            </form>

            {/* Right Column: Attendance History + My Leave Applications */}
            <div className="xl:col-span-7 space-y-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Attendance History & Server Timestamps
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {teacherHistory.length} records
                  </span>
                </div>
                {teacherHistory.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                    No attendance records yet. Use Mark Attendance (AI Live Camera) to check in.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                          <th className="py-2 pr-3 font-semibold">Date</th>
                          <th className="py-2 px-2 font-semibold">Status</th>
                          <th className="py-2 px-2 font-semibold">In / Out</th>
                          <th className="py-2 px-2 font-semibold">Verification / TXN</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {teacherHistory.slice(0, 12).map((rec) => (
                          <tr key={rec.id} className="text-slate-800 dark:text-slate-200">
                            <td className="py-2 pr-3 font-mono">{rec.date}</td>
                            <td className="py-2 px-2">
                              <span
                                className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${statusPillStyle(
                                  rec.statusCode
                                )}`}
                              >
                                {rec.categoryLabel || rec.statusCode} ({rec.statusCode})
                              </span>
                            </td>
                            <td className="py-2 px-2 font-mono">
                              {rec.checkInTime} / {rec.checkOutTime || '-'}
                            </td>
                            <td className="py-2 px-2 text-[11px] text-slate-500 dark:text-slate-400">
                              {rec.transactionId || rec.verificationMethod}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  My Leave Applications & Decision History
                </h3>
                {teacherLeaves.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                    No leave applications submitted yet.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {teacherLeaves.map((lv) => (
                      <div
                        key={lv.id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {lv.leaveCategory} ·{' '}
                            <span className="font-mono text-teal-700 dark:text-teal-400">
                              {lv.referenceNumber}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {lv.status}
                            </span>
                            {lv.status === 'Pending' && (
                              <button
                                type="button"
                                onClick={() => handleCancelLeave(lv)}
                                className="text-[11px] text-rose-600 hover:underline font-semibold"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-slate-600 dark:text-slate-400">
                          {lv.fromDate}
                          {lv.toDate !== lv.fromDate ? ` to ${lv.toDate}` : ''} ({lv.numberOfDays}d) ·
                          Level: {lv.approvalLevel}
                        </div>
                        {lv.decisionReason && (
                          <div className="text-[11px] text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800">
                            <strong>
                              {lv.decidedBy} ({lv.decidedByRole}):
                            </strong>{' '}
                            {lv.decisionReason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
       * TAB 2: HEADMASTER / PRINCIPAL DASHBOARD
       * ====================================================================*/}
      {activeTab === 'headmaster-dashboard' && (
        <div className="space-y-6">
          {/* Teacher Leave Approvals Queue (with Approve / Reject / Forward to ZEO or CEO) */}
          <LeaveApprovalQueuePanel
            title="Headmaster Leave Approval Dashboard — Teacher Applications"
            subtitle="Filter by teacher, date, or leave type. Mandatory reason is required for every approval, rejection, or forwarding action."
            leaves={headmasterQueueLeaves}
            activeRole={activeRole}
            actorName={currentUser.name || 'Headmaster / Principal'}
            allowForwarding={true}
            onRefreshState={fetchServerState}
            onToast={showToast}
          />

          {/* Separate Headmaster Leave Application Form -> Routes to ZEO / CEO */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <form
              onSubmit={handleHeadmasterLeaveSubmit}
              className="xl:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3.5"
            >
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CalendarPlus className="w-4 h-4 text-indigo-600" />
                  Headmaster / Principal Leave Application
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Dedicated leadership leave workflow routed directly to ZEO or CEO Dashboard
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Leave Type
                  </label>
                  <select
                    value={hmLeaveType}
                    onChange={(e) => setHmLeaveType(e.target.value as TeacherLeaveType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                  >
                    {LEAVE_TYPES.map((lt) => (
                      <option key={lt} value={lt}>
                        {lt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Approving Officer
                  </label>
                  <select
                    value={hmTargetAuthority}
                    onChange={(e) => setHmTargetAuthority(e.target.value as 'ZEO' | 'CEO')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="ZEO">ZEO (Zonal Education Officer)</option>
                    <option value="CEO">CEO (Chief Education Officer)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    From Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={hmLeaveFromDate}
                    onChange={(e) => setHmLeaveFromDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    To Date *
                  </label>
                  <input
                    type="date"
                    required
                    disabled={
                      hmLeaveType === '1st Half-Day Leave' || hmLeaveType === '2nd Half-Day Leave'
                    }
                    value={
                      hmLeaveType === '1st Half-Day Leave' || hmLeaveType === '2nd Half-Day Leave'
                        ? hmLeaveFromDate
                        : hmLeaveToDate
                    }
                    onChange={(e) => setHmLeaveToDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Leave (Mandatory) *
                </label>
                <textarea
                  rows={2}
                  required
                  value={hmLeaveReason}
                  onChange={(e) => setHmLeaveReason(e.target.value)}
                  placeholder="Enter reason and charge handover arrangement..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 cursor-pointer text-xs text-slate-600 dark:text-slate-300">
                <Upload className="w-4 h-4 text-indigo-600" />
                <span className="truncate">{hmDocName || 'Attach supporting document (optional)'}</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => handleLeaveDocUpload(e, setHmDocName, setHmDocDataUrl)}
                  className="hidden"
                />
              </label>

              <button
                type="submit"
                disabled={submittingHmLeave}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
              >
                {submittingHmLeave
                  ? 'Submitting to Officer...'
                  : `Submit Headmaster Leave to ${hmTargetAuthority}`}
              </button>
            </form>

            {/* Today's School Teachers Attendance Roster */}
            <div className="xl:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Today's School Teachers Attendance ({todayIso})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {allEmployees.length} teaching staff · Click Verify to test live camera attendance
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3 font-semibold">Teacher</th>
                      <th className="py-2 px-2 font-semibold">Masked ID</th>
                      <th className="py-2 px-2 font-semibold">Today</th>
                      <th className="py-2 pl-2 font-semibold text-right">Check-In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {allEmployees.map((emp) => {
                      const rec = records.find(
                        (r) => r.employeeId === emp.employeeId && r.date === todayIso
                      );
                      return (
                        <tr key={emp.id} className="text-slate-800 dark:text-slate-200">
                          <td className="py-2 pr-3 font-semibold">
                            {emp.name}{' '}
                            <span className="font-mono text-[11px] text-slate-400">
                              ({emp.employeeId})
                            </span>
                          </td>
                          <td className="py-2 px-2 font-mono text-[11px] text-slate-500">
                            {emp.maskedAadhaar || emp.alternativeIdRef || '-'}
                          </td>
                          <td className="py-2 px-2">
                            {rec ? (
                              <span
                                className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${statusPillStyle(
                                  rec.statusCode
                                )}`}
                              >
                                {rec.categoryLabel || rec.statusCode}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">Unmarked</span>
                            )}
                          </td>
                          <td className="py-2 pl-2 text-right font-mono text-[11px]">
                            {rec?.checkInTime || '--:--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
       * TAB 3: ZEO / CEO APPROVAL DASHBOARD
       * ====================================================================*/}
      {activeTab === 'officer-approvals' && (
        <LeaveApprovalQueuePanel
          title={
            activeRole === 'ZEO (Zonal Education Officer)'
              ? 'ZEO Approval Dashboard — Headmaster & Forwarded Teacher Leaves'
              : activeRole === 'CEO (Chief Education Officer)'
              ? 'CEO Approval Dashboard — Headmaster & Escalated Teacher Leaves'
              : 'Centralized Leave Approvals Oversight'
          }
          subtitle="Compulsory approval or rejection reason is enforced on every decision. Approved leaves automatically update attendance records."
          leaves={
            activeRole === 'Super Administrator' ? hierarchicalLeaves : officerQueueLeaves
          }
          activeRole={activeRole}
          actorName={currentUser.name || activeRole}
          allowForwarding={activeRole === 'ZEO (Zonal Education Officer)'}
          onRefreshState={fetchServerState}
          onToast={showToast}
        />
      )}

      {/* =====================================================================
       * TAB 4: CENTRALIZED ADMINISTRATOR DASHBOARD & VPN SECURITY
       * ====================================================================*/}
      {activeTab === 'admin-dashboard' && (
        <AdminSecurityAndReportsPanel
          school={school}
          employees={allEmployees}
          records={records}
          hierarchicalLeaves={hierarchicalLeaves}
          securityLogs={securityLogs}
          auditLogs={auditLogs}
          securityPolicy={securityPolicy}
          categories={DEFAULT_ATTENDANCE_CATEGORIES}
          activeRole={activeRole}
          actorName={currentUser.name || activeRole}
          monthKey={monthKey}
          onChangeMonthKey={setMonthKey}
          onRefreshState={fetchServerState}
          onToast={showToast}
        />
      )}

      {/* =====================================================================
       * TAB 5: TEACHER REGISTRATION & AADHAAR VERIFICATION
       * ====================================================================*/}
      {activeTab === 'registration' && (
        <TeacherRegistrationPanel
          school={school}
          employees={allEmployees}
          activeRole={activeRole}
          actorName={currentUser.name || activeRole}
          onRefreshState={fetchServerState}
          onOpenFaceRegister={(emp) => setFaceModal({ mode: 'register', employee: emp })}
          onToast={showToast}
        />
      )}

      {/* AI LIVE CAMERA VERIFICATION MODAL */}
      {faceModal && (
        <FaceAttendanceVerificationModal
          mode={faceModal.mode}
          employee={faceModal.employee}
          actorName={currentUser.name || activeRole}
          schoolContext={{
            schoolName: faceModal.employee.schoolName || school.name || 'School',
            schoolCode: faceModal.employee.schoolCode || school.code || '',
            zoneName: faceModal.employee.zoneName || 'Zone Srinagar Central',
            schoolLatitude: faceModal.employee.authorizedLocation?.latitude ?? 34.0837,
            schoolLongitude: faceModal.employee.authorizedLocation?.longitude ?? 74.7973,
            geofenceRadiusMeters: faceModal.employee.authorizedLocation?.radiusMeters ?? 250,
            schoolStartTime: '09:30',
          }}
          onClose={() => setFaceModal(null)}
          onRegistered={(empId, template) => {
            saveTemplateLocally(empId, template);
            setLocalTemplates((prev) => ({ ...prev, [empId]: template }));
            showToast('Encrypted SHA-256 face reference template registered.');
          }}
          onVerifiedSuccess={async (payload) => {
            if (payload.verification) {
              setLastVerification(payload.verification);
            }
            if (payload.verificationMethod === 'alternative_pin') {
              // Persist documented alternative verification locally & refresh
              const nowIso = new Date().toISOString();
              const halfMode: HalfDayMode = payload.halfDayMode;
              const code =
                halfMode === 'first_half_leave_second_half_present'
                  ? 'FH'
                  : halfMode === 'first_half_present_second_half_leave'
                  ? 'SH'
                  : 'P';
              setRecords((prev) => [
                {
                  id: `att-alt-${payload.employeeId}-${todayIso}`,
                  employeeId: payload.employeeId,
                  employeeName: faceModal.employee.name,
                  schoolName: faceModal.employee.schoolName || school.name,
                  date: todayIso,
                  statusCode: code,
                  categoryLabel: code === 'P' ? 'Present' : 'Half-Day Leave',
                  checkInTime: new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  serverTimestamp: nowIso,
                  verificationMethod: 'alternative_pin',
                  livenessVerified: false,
                  remarks: payload.remarks,
                  markedBy: currentUser.name || faceModal.employee.name,
                  updatedAt: nowIso,
                },
                ...prev.filter(
                  (r) => !(r.employeeId === payload.employeeId && r.date === todayIso)
                ),
              ]);
              showToast('Alternative attendance verification recorded.');
            } else {
              await fetchServerState();
              showToast(
                `Attendance verified (${payload.verification?.transactionId || 'Live AI'}).`
              );
              handleTriggerBrowserNotification(
                'Teacher Attendance Confirmed',
                `${faceModal.employee.name} checked in via live AI verification.`
              );
            }
          }}
          onVerificationFailed={async (_empId, reason, extra) => {
            if (extra?.verification) {
              setLastVerification(extra.verification);
            }
            await fetchServerState();
            showToast(reason, 'error');
          }}
        />
      )}
    </div>
  );
};
