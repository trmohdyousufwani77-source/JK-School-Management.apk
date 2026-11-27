import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copyright,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Globe,
  HelpCircle,
  History,
  Info,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MessageSquareQuote,
  Phone,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  UserCheck,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  DeveloperAdminProfile,
  SchoolAboutUsInfo,
  SchoolInfoAuditEntry,
  SchoolProfile,
} from '../types';
import { Language } from '../utils/translations';
import { usePermissions } from '../hooks/usePermissions';
import { auth } from '../firebase';
import { SchoolFaqModule } from './SchoolFaqModule';
import {
  downloadAppErrorsJson,
  HeartbeatPingResult,
  loadAppErrorLogs,
  loadOfflineSyncQueue,
  runProductionHeartbeatPing,
} from '../utils/diagnosticsLogger';

interface ChangelogRelease {
  version: string;
  releaseDate: string;
  channel: string;
  highlights: string[];
}

interface AboutUsAppInfoProps {
  profiles: DeveloperAdminProfile[];
  activeProfile: DeveloperAdminProfile;
  school: SchoolProfile;
  language: Language;
  onUpdateSchool?: (updated: SchoolProfile) => void;
  onUpdatePrimaryInstitution?: (newInstitutionName: string) => void;
  onSaveProfile?: (updated: DeveloperAdminProfile) => void;
  onAddProfile?: (created: DeveloperAdminProfile) => void;
  onSelectActiveProfile?: (profileId: string) => void;
  onNavigateToChatbot?: () => void;
}

const ABOUT_US_STORAGE_KEY = 'school_master_v1_school_about_us_info';
const ABOUT_AUDIT_STORAGE_KEY = 'school_master_v1_school_info_audit_logs';

// Fixed, immutable App Developer & Administrator identity across Android, iOS, Windows & Web
const FIXED_ADMIN_NAME = 'Mohd Yousuf Wani';
const FIXED_ADMIN_DESIGNATION = 'App Developer / Administrator';

const isLegacyDefaultInstitution = (value?: string): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  return (
    normalized === 'govt middle school pamposh colony' ||
    normalized === 'govt middle school, pamposh colony' ||
    normalized === 'government middle school pamposh colony' ||
    normalized === 'government boys middle school pamposh colony'
  );
};

function buildDefaultAboutUsInfo(school: SchoolProfile): SchoolAboutUsInfo {
  const institutionName = (school.name || '').trim();
  return {
    id: 'school-about-main',
    schoolName: institutionName,
    schoolIntroduction:
      'A dedicated educational institution using the SchoolMaster platform to deliver structured academics, digital attendance tracking, and holistic student development under the NEP 2020 framework.',
    schoolHistory:
      'Committed to transparent academic administration, inclusive learning, and modern digital record-keeping across primary, middle, and secondary classrooms.',
    schoolVision:
      'To nurture confident, compassionate, and lifelong learners equipped with strong foundational skills, ethical values, and digital readiness.',
    schoolMission:
      'Deliver inclusive, student-centric education through regular attendance tracking, Holistic Progress Cards (HPC), engaged teaching faculty, and transparent parent-school collaboration.',
    schoolObjectives:
      '1. Ensure 100% enrollment and consistent daily student attendance.\n2. Track academic and co-scholastic progress transparently through NEP 2020 Holistic Progress Cards.\n3. Empower teachers with streamlined leave, attendance, and JKEPM appraisal workflows.',
    schoolAddress: school.address || '',
    schoolContactNumber: school.contactNumber || '',
    schoolEmail: school.email || '',
    schoolWebsite: school.website || 'https://education.jk.gov.in',
    schoolLogoDataUrl: school.logoDataUrl,
    schoolFacilities:
      'Well-ventilated classrooms, School Library & Reading Corner, Drinking Water & Sanitation Facilities, Playground, and Smart Digital Attendance & ID Card System.',
    principalsMessage:
      'Welcome to our digital school platform. Together with dedicated teachers and supportive parents, we strive every day to build a safe, joyful, and high-achieving learning environment for every child.',
    otherSchoolInfo: `U-DISE Code: ${school.code} • Academic Session: ${school.academicSession} • Working Days: ${school.workingDaysPerWeek} days/week`,
    appName: 'SchoolMaster (HPC & JKHRMS)',
    appDescription:
      'Comprehensive School Administration, Touchless QR Daily Attendance, NEP 2020 Holistic Progress Card (HPC), Teacher Leave Management, and JKEPM Appraisal application.',
    appVersion: 'v1.0.4 (Android / iOS / Windows / Web)',
    appFeatures:
      '• Touchless QR Student Attendance with Geolocation Audit\n• NEP 2020 13-Section Holistic Progress Cards (HPC) & PDF Export\n• Student Admission, Promotion & Smart QR ID Card Studio\n• Teacher Management, Service Book & Leave Statement System\n• JKEPM Quarterly Self-Assessment & CPIS Portal\n• Offline-First Sync with Firebase Cloud Backup',
    appPurpose:
      'Streamline daily academic administration, reduce manual paperwork, ensure transparent attendance and assessment records, and provide offline-capable school management for teachers and administrators.',
    appSupportEmail: school.email || 'support@schoolmaster.edu.in',
    appSupportContactNumber: school.contactNumber || '+91 194 240 0000',
    privacyPolicy:
      'Student and teacher records are stored securely with strict role-based access control. Personal data is used solely for authorized school administration, attendance tracking, and statutory educational reporting. No student information is shared with unauthorized third parties.',
    termsAndConditions:
      'Authorized school personnel must maintain confidentiality of login credentials and student records. All administrative updates to school profiles, attendance, and appraisals are logged for institutional accountability.',
    copyrightInfo: `© ${new Date().getFullYear()} ${institutionName || 'SchoolMaster Platform'}. All Rights Reserved.`,
    updatedAt: new Date().toISOString(),
    updatedByName: 'System Default',
    updatedByRole: 'school_admin',
  };
}

export const AboutUsAppInfo: React.FC<AboutUsAppInfoProps> = ({
  school,
  language,
  onUpdateSchool,
  onUpdatePrimaryInstitution,
  onNavigateToChatbot,
}) => {
  const { currentUser, effectiveRole } = usePermissions();

  // Admin privilege check for independent Primary Institution editing ONLY.
  // Administrator identity (Mohd Yousuf Wani) and App Information remain permanently locked for ALL users.
  const hasAdminPrivileges =
    effectiveRole === 'primary_admin' ||
    effectiveRole === 'senior_admin' ||
    effectiveRole === 'junior_admin';

  const activeRoleDisplay =
    effectiveRole === 'primary_admin'
      ? 'Super Admin'
      : hasAdminPrivileges
      ? 'School Admin'
      : 'Read-Only User';

  // Section tabs
  const [activeSection, setActiveSection] = useState<'about-us' | 'faq' | 'app-info' | 'developer' | 'audit'>(() => {
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#faq-')) {
      return 'faq';
    }
    return 'about-us';
  });

  // Independent Primary Institution editing state (enabled ONLY for users with admin privileges)
  const [isEditingPrimaryInstitution, setIsEditingPrimaryInstitution] = useState<boolean>(false);
  const [primaryInstitutionDraft, setPrimaryInstitutionDraft] = useState<string>(school.name || '');

  useEffect(() => {
    setPrimaryInstitutionDraft(school.name || '');
  }, [school.name]);

  // Automatically close Primary Institution editor if user switches to a non-admin role
  useEffect(() => {
    if (!hasAdminPrivileges && isEditingPrimaryInstitution) {
      setIsEditingPrimaryInstitution(false);
    }
  }, [hasAdminPrivileges, isEditingPrimaryInstitution]);

  // Read-Only Institutional About Us & App Information state
  const [schoolAboutInfo] = useState<SchoolAboutUsInfo>(() => {
    const fallback = buildDefaultAboutUsInfo(school);
    try {
      const raw = localStorage.getItem(ABOUT_US_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SchoolAboutUsInfo>;
        const cleanedSchoolName = isLegacyDefaultInstitution(parsed.schoolName)
          ? ''
          : parsed.schoolName || '';
        return {
          ...fallback,
          ...parsed,
          schoolName: (school.name || cleanedSchoolName || '').trim(),
          schoolLogoDataUrl: parsed.schoolLogoDataUrl !== undefined ? parsed.schoolLogoDataUrl : school.logoDataUrl,
        };
      }
    } catch {
      // ignore storage errors
    }
    return fallback;
  });

  const currentPrimaryInstitution = (school.name || '').trim();

  const handleSavePrimaryInstitution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAdminPrivileges) {
      setIsEditingPrimaryInstitution(false);
      return;
    }
    const trimmed = primaryInstitutionDraft.trim();
    if (onUpdatePrimaryInstitution) {
      onUpdatePrimaryInstitution(trimmed);
    } else if (onUpdateSchool) {
      onUpdateSchool({
        ...school,
        name: trimmed,
        adminName: FIXED_ADMIN_NAME,
      });
    }
    try {
      const raw = localStorage.getItem(ABOUT_US_STORAGE_KEY);
      const existing = raw ? (JSON.parse(raw) as Record<string, any>) : {};
      localStorage.setItem(
        ABOUT_US_STORAGE_KEY,
        JSON.stringify({
          ...existing,
          schoolName: trimmed,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore storage errors
    }
    setIsEditingPrimaryInstitution(false);
    showToast(
      trimmed
        ? `Primary Institution updated to "${trimmed}". Administrator identity remains unchanged.`
        : 'Primary Institution cleared. You can enter a new institution name anytime.'
    );
  };

  const [aboutAuditLogs] = useState<SchoolInfoAuditEntry[]>(() => {
    try {
      const raw = localStorage.getItem(ABOUT_AUDIT_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as SchoolInfoAuditEntry[];
    } catch {
      // ignore
    }
    return [];
  });

  const [revisionLimit, setRevisionLimit] = useState<5 | 10>(10);

  // Changelog Modal & Network Health Ping State
  const [showChangelogModal, setShowChangelogModal] = useState<boolean>(false);
  const [changelogEntries, setChangelogEntries] = useState<ChangelogRelease[]>([]);
  const [loadingChangelog, setLoadingChangelog] = useState<boolean>(false);
  const [pingResult, setPingResult] = useState<HeartbeatPingResult | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(() => loadOfflineSyncQueue().length);
  const [appErrorCount, setAppErrorCount] = useState<number>(() => loadAppErrorLogs().length);
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [lastSyncAt, setLastSyncAt] = useState<string>(() => {
    try {
      return localStorage.getItem('school_master_last_cloud_sync_at') || new Date().toISOString();
    } catch {
      return new Date().toISOString();
    }
  });

  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleOpenChangelog = async () => {
    setShowChangelogModal(true);
    if (changelogEntries.length > 0) return;
    setLoadingChangelog(true);
    try {
      const res = await fetch('/version_history.json', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.releases)) {
          setChangelogEntries(data.releases as ChangelogRelease[]);
        }
      }
    } catch {
      // ignore fetch error
    } finally {
      setLoadingChangelog(false);
    }
  };

  const handleRunProductionPing = async () => {
    setIsPinging(true);
    try {
      const result = await runProductionHeartbeatPing('/api/health');
      setPingResult(result);
      setOfflineQueueCount(loadOfflineSyncQueue().length);
      setAppErrorCount(loadAppErrorLogs().length);
      if (result.ok) {
        const ts = new Date().toISOString();
        setLastSyncAt(ts);
        try {
          localStorage.setItem('school_master_last_cloud_sync_at', ts);
        } catch {
          // ignore
        }
        showToast(`Production API reachable (HTTP ${result.status}) in ${result.latencyMs} ms.`);
      } else {
        showToast(
          `Production API check failed (${result.status || 'Network Error'}). Logged to app_errors.json.`,
          'error'
        );
      }
    } finally {
      setIsPinging(false);
    }
  };

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ type, text });
    window.setTimeout(() => setToastMsg(null), 4500);
  };

  const displayedLogo =
    schoolAboutInfo.schoolLogoDataUrl !== undefined
      ? schoolAboutInfo.schoolLogoDataUrl
      : school.logoDataUrl;

  const latestSchoolUpdate = useMemo(() => {
    return aboutAuditLogs.find(
      (entry) =>
        entry.section === 'About Us' ||
        entry.section === 'App Information' ||
        entry.section === 'School Logo'
    );
  }, [aboutAuditLogs]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Confirmation / Error Toast Banner */}
      {toastMsg && (
        <div
          role="status"
          data-testid="about-us-toast"
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-sm ${
            toastMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            aria-label="Dismiss message"
            className="opacity-70 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Module Header */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-slate-900 text-white flex items-center justify-center shadow-md shrink-0">
            <Info className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900">
              {language === 'ur' ? 'ہمارے بارے میں اور ایپ کی معلومات' : 'About Us & App Information'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Read-only institutional About Us, Application Information, and protected Administrator Profile across Android, iOS, Windows, and Web.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold border bg-slate-100 text-slate-700 border-slate-200">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>{activeRoleDisplay}</span>
          </span>
          <span
            data-testid="about-us-locked-badge"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold bg-amber-50 text-amber-900 border border-amber-300"
          >
            <Lock className="w-3.5 h-3.5 text-amber-700" />
            <span>{hasAdminPrivileges ? 'Administrator Identity Locked' : 'Locked Read-Only Mode'}</span>
          </span>
        </div>
      </div>

      {/* Prominent Locked Status Visual Banner */}
      <div
        data-testid="about-us-locked-status-banner"
        className={`rounded-2xl border p-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
          hasAdminPrivileges
            ? 'bg-amber-50/90 border-amber-300 text-amber-950'
            : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
              hasAdminPrivileges
                ? 'bg-amber-100 border-amber-300 text-amber-700'
                : 'bg-amber-400/20 border-amber-300/40 text-amber-300'
            }`}
          >
            <Lock className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <p className="font-black">
              {hasAdminPrivileges
                ? 'Protected Configuration Status: Administrator Identity & App Info Permanently Locked'
                : 'Locked Read-Only Status: Administrative Privileges Required for Primary Institution Updates'}
            </p>
            <p className={hasAdminPrivileges ? 'text-amber-900/90 leading-relaxed' : 'text-slate-300 leading-relaxed'}>
              {hasAdminPrivileges
                ? 'App Developer & Administrator details (Mohd Yousuf Wani — App Developer / Administrator) and App Information are strictly read-only across Android, iOS, Windows, and Web. Primary Institution can be configured independently below.'
                : 'Your account does not hold administrative privileges. All edit inputs and update/remove action buttons are hidden and replaced with read-only displays across Android, iOS, Windows, and Web.'}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-extrabold text-[11px] shrink-0 self-start sm:self-center border ${
            hasAdminPrivileges
              ? 'bg-white border-amber-300 text-amber-900'
              : 'bg-amber-400/15 border-amber-300/40 text-amber-200'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>LOCKED</span>
        </span>
      </div>

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="About Us and App Information sections"
        className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs inline-flex flex-wrap gap-1.5 no-print"
      >
        {[
          { id: 'about-us' as const, label: 'About Us (School)', icon: Building2 },
          { id: 'faq' as const, label: 'FAQ Center', icon: HelpCircle },
          { id: 'app-info' as const, label: 'App Info & Network Health', icon: Smartphone },
          { id: 'developer' as const, label: 'Administrator Profile (Protected)', icon: Shield },
          {
            id: 'audit' as const,
            label: `Update Audit Log (${aboutAuditLogs.length})`,
            icon: History,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setActiveSection(tab.id);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                active
                  ? tab.id === 'developer'
                    ? 'bg-slate-900 text-amber-300 shadow-sm'
                    : 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ================================================================= */}
      {/* SECTION A: ABOUT US (SCHOOL ADMIN EDITABLE ONLY)                  */}
      {/* ================================================================= */}
      {activeSection === 'about-us' && (
        <section
          aria-label="School About Us"
          data-testid="about-us-school-section"
          className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
        >
          {/* Top Transparency Banner — appears ONLY after a School Admin has updated school info */}
          {latestSchoolUpdate && (
            <div
              data-testid="about-us-transparency-banner"
              className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-950 text-xs flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 font-bold">
                <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  Last updated on{' '}
                  <strong className="font-extrabold">
                    {new Date(latestSchoolUpdate.timestamp).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </strong>{' '}
                  by {latestSchoolUpdate.actorName} ({latestSchoolUpdate.section})
                </span>
              </div>
              <span className="text-[11px] font-mono text-emerald-800">
                {new Date(latestSchoolUpdate.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}

          {/* Header Banner with Circular Logo Preview & Conditionally Disabled Edit/Save */}
          <div className="p-6 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-20 h-20 rounded-full bg-white p-2 border-2 border-white/30 flex items-center justify-center shrink-0 shadow-md overflow-hidden">
                {displayedLogo ? (
                  <img
                    src={displayedLogo}
                    alt={`${currentPrimaryInstitution || 'Institution'} Logo`}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <Building2 className="w-9 h-9 text-indigo-700" />
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[10px] font-extrabold uppercase tracking-wider text-emerald-200">
                  <Building2 className="w-3 h-3" />
                  <span>About Us</span>
                </span>
                <h2 className="text-lg sm:text-2xl font-black tracking-tight text-white truncate">
                  {currentPrimaryInstitution || 'Primary Institution Not Configured'}
                </h2>
                {schoolAboutInfo.schoolAddress && (
                  <p className="text-xs text-indigo-200 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span className="truncate">{schoolAboutInfo.schoolAddress}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span
                data-testid="about-us-readonly-badge"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 border border-white/25 text-white text-xs font-extrabold"
              >
                <Lock className="w-3.5 h-3.5 text-amber-300" />
                <span>Protected About Us</span>
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6">
              <div className="space-y-5 text-xs">
                {/* Primary Institution (Editable independently) + Fixed App Developer & Administrator Card */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Independent Editable Primary Institution Card */}
                  <div
                    data-testid="primary-institution-card"
                    className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-indigo-600" />
                        <span>Primary Institution</span>
                      </span>
                      {hasAdminPrivileges ? (
                        !isEditingPrimaryInstitution && (
                          <button
                            type="button"
                            data-testid="edit-primary-institution-btn"
                            onClick={() => {
                              setPrimaryInstitutionDraft(currentPrimaryInstitution);
                              setIsEditingPrimaryInstitution(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition-colors"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit Primary Institution</span>
                          </button>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-extrabold">
                          <Lock className="w-3 h-3" />
                          <span>Read-Only</span>
                        </span>
                      )}
                    </div>

                    {hasAdminPrivileges && isEditingPrimaryInstitution ? (
                      <form onSubmit={handleSavePrimaryInstitution} className="space-y-2.5">
                        <input
                          type="text"
                          data-testid="primary-institution-input"
                          value={primaryInstitutionDraft}
                          onChange={(e) => setPrimaryInstitutionDraft(e.target.value)}
                          placeholder="Enter Primary Institution Name"
                          maxLength={180}
                          className="w-full px-3 py-2 rounded-xl border border-indigo-300 bg-white text-slate-900 font-bold text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="submit"
                            data-testid="save-primary-institution-btn"
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>Save Institution</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPrimaryInstitutionDraft(currentPrimaryInstitution);
                              setIsEditingPrimaryInstitution(false);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-1">
                        <p
                          data-testid="primary-institution-display"
                          className="text-sm font-black text-slate-900"
                        >
                          {currentPrimaryInstitution || 'Not Configured'}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          {hasAdminPrivileges
                            ? 'Primary Institution is editable independently and synced across Android, iOS, Windows, and Web.'
                            : 'Displayed in read-only mode. Contact a School Administrator to update the Primary Institution.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Fixed Protected App Developer & Administrator Card */}
                  <div
                    data-testid="about-us-fixed-administrator-card"
                    className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-amber-300" />
                        <span>App Developer &amp; Administrator</span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-400/20 border border-amber-300/30 text-amber-200 text-[10px] font-extrabold">
                        <Lock className="w-3 h-3" />
                        <span>Locked</span>
                      </span>
                    </div>
                    <div className="pt-0.5">
                      <p className="text-base font-black text-white">{FIXED_ADMIN_NAME}</p>
                      <p className="text-xs font-bold text-indigo-200 mt-0.5">{FIXED_ADMIN_DESIGNATION}</p>
                    </div>
                  </div>
                </div>

                {/* Contact Quick Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" />
                      <span>School Address</span>
                    </span>
                    <p className="font-bold text-slate-900">{schoolAboutInfo.schoolAddress || '—'}</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Contact Number</span>
                    </span>
                    <p className="font-mono font-bold text-slate-900">{schoolAboutInfo.schoolContactNumber || '—'}</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Email Address</span>
                    </span>
                    <p className="font-bold text-slate-900 break-all">{schoolAboutInfo.schoolEmail || '—'}</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-sky-600" />
                      <span>Website</span>
                    </span>
                    <p className="font-bold text-indigo-700 break-all">{schoolAboutInfo.schoolWebsite || '—'}</p>
                  </div>
                </div>

                {/* Structured About Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1.5">
                    <h3 className="font-black text-slate-900 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-indigo-600" />
                      <span>School Introduction / About School</span>
                    </h3>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-line">
                      {schoolAboutInfo.schoolIntroduction}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1.5">
                    <h3 className="font-black text-slate-900 flex items-center gap-1.5">
                      <History className="w-4 h-4 text-amber-600" />
                      <span>School History</span>
                    </h3>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-line">
                      {schoolAboutInfo.schoolHistory}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 space-y-1.5">
                    <h3 className="font-black text-emerald-950 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>School Vision</span>
                    </h3>
                    <p className="text-emerald-900/90 leading-relaxed whitespace-pre-line">
                      {schoolAboutInfo.schoolVision}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 space-y-1.5">
                    <h3 className="font-black text-indigo-950 flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-indigo-600" />
                      <span>School Mission</span>
                    </h3>
                    <p className="text-indigo-900/90 leading-relaxed whitespace-pre-line">
                      {schoolAboutInfo.schoolMission}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1.5">
                    <h3 className="font-black text-slate-900 flex items-center gap-1.5">
                      <ClipboardList className="w-4 h-4 text-indigo-600" />
                      <span>School Objectives</span>
                    </h3>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-line">
                      {schoolAboutInfo.schoolObjectives}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1.5">
                    <h3 className="font-black text-slate-900 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-emerald-600" />
                      <span>School Facilities</span>
                    </h3>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-line">
                      {schoolAboutInfo.schoolFacilities}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-1.5">
                    <h3 className="font-black text-amber-950 flex items-center gap-1.5">
                      <MessageSquareQuote className="w-4 h-4 text-amber-600" />
                      <span>Principal&apos;s Message</span>
                    </h3>
                    <p className="text-amber-950/90 leading-relaxed whitespace-pre-line">
                      {schoolAboutInfo.principalsMessage}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1.5">
                    <h3 className="font-black text-slate-900 flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-slate-600" />
                      <span>Other School Information</span>
                    </h3>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-line">
                      {schoolAboutInfo.otherSchoolInfo}
                    </p>
                  </div>
                </div>

                {/* Revision History & Recent Updates Audit View inside About Us (Last 5 / Last 10) */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-indigo-600" />
                      <h3 className="font-black text-slate-900">
                        Revision History &amp; Recent Updates
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setRevisionLimit(5)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                          revisionLimit === 5
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        Last 5
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevisionLimit(10)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                          revisionLimit === 10
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        Last 10
                      </button>
                    </div>
                  </div>

                  {aboutAuditLogs.length === 0 ? (
                    <div className="p-5 text-center text-slate-500">
                      No school information revisions recorded yet. Edits by School Admins appear here with Admin name, timestamp, and changed fields.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {aboutAuditLogs.slice(0, revisionLimit).map((log) => (
                        <div
                          key={log.id}
                          className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70"
                        >
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-extrabold text-slate-900">{log.actorName}</span>
                              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                                {log.section}
                              </span>
                            </div>
                            <p className="text-slate-600">{log.summary}</p>
                            {log.changedFields.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {log.changedFields.map((field) => (
                                  <span
                                    key={`${log.id}-${field}`}
                                    className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]"
                                  >
                                    {field}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
          </div>
        </section>
      )}

      {/* ================================================================= */}
      {/* SECTION A2: FREQUENTLY ASKED QUESTIONS (FAQ CENTER — READ-ONLY)   */}
      {/* ================================================================= */}
      {activeSection === 'faq' && (
        <SchoolFaqModule
          schoolName={currentPrimaryInstitution || 'SchoolMaster Platform'}
          canEdit={false}
          actorName={currentUser.name}
          onNotify={showToast}
        />
      )}

      {/* ================================================================= */}
      {/* SECTION B: APP INFORMATION, SUPPORT, CHANGELOG & NETWORK HEALTH   */}
      {/* ================================================================= */}
      {activeSection === 'app-info' && (
        <section
          aria-label="Application Information"
          data-testid="about-us-app-info-section"
          className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
        >
          <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  {schoolAboutInfo.appName}
                </h2>
                <p className="text-xs text-slate-500">
                  Version <strong className="font-mono text-indigo-700">{schoolAboutInfo.appVersion}</strong> • Read-Only Protected (Android, iOS, Windows &amp; Web)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleOpenChangelog()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold transition-colors"
              >
                <History className="w-3.5 h-3.5 text-indigo-600" />
                <span>View Full Changelog</span>
              </button>

              <span
                data-testid="app-info-readonly-badge"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-extrabold"
              >
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>Read-Only Protected</span>
              </span>
            </div>
          </div>

          <div className="p-6 text-xs">
              <div className="space-y-5">
                {/* Fixed Protected App Developer & Administrator Block inside App Information */}
                <div
                  data-testid="app-info-fixed-administrator-card"
                  className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                      <span>App Developer &amp; Administrator</span>
                    </span>
                    <p className="text-base font-black text-white">{FIXED_ADMIN_NAME}</p>
                    <p className="text-xs font-bold text-indigo-200">{FIXED_ADMIN_DESIGNATION}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400/20 border border-amber-300/30 text-amber-200 text-[11px] font-extrabold self-start sm:self-center">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Fixed • Read-Only</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">App Name</span>
                    <strong className="text-slate-900 font-extrabold mt-0.5 block">{schoolAboutInfo.appName}</strong>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">App Version</span>
                    <strong className="text-indigo-700 font-mono font-extrabold mt-0.5 block">{schoolAboutInfo.appVersion}</strong>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Support Email</span>
                    <strong className="text-slate-900 font-bold mt-0.5 block break-all">{schoolAboutInfo.appSupportEmail || '—'}</strong>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Support Contact</span>
                    <strong className="text-slate-900 font-mono font-bold mt-0.5 block">{schoolAboutInfo.appSupportContactNumber || '—'}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1.5">
                    <h3 className="font-black text-slate-900">App Description</h3>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-line">{schoolAboutInfo.appDescription}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1.5">
                    <h3 className="font-black text-slate-900">App Purpose</h3>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-line">{schoolAboutInfo.appPurpose}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-200/80 space-y-1.5 md:col-span-2">
                    <h3 className="font-black text-indigo-950">Key App Features</h3>
                    <p className="text-indigo-950/90 leading-relaxed whitespace-pre-line">{schoolAboutInfo.appFeatures}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1.5">
                    <h3 className="font-black text-slate-900 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span>Privacy Policy</span>
                    </h3>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-line">{schoolAboutInfo.privacyPolicy}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1.5">
                    <h3 className="font-black text-slate-900 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      <span>Terms &amp; Conditions</span>
                    </h3>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-line">{schoolAboutInfo.termsAndConditions}</p>
                  </div>
                </div>

                {/* Contact Support Action Bar (mailto: & tel:) */}
                <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black text-indigo-950">Need Help? Contact Support</h3>
                    <p className="text-[11px] text-indigo-900/80 mt-0.5">
                      Reach our school technical support desk directly via email or telephone.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`mailto:${schoolAboutInfo.appSupportEmail || 'support@schoolmaster.edu.in'}?subject=${encodeURIComponent(
                        `SchoolMaster Support Request — ${currentPrimaryInstitution || 'SchoolMaster Platform'}`
                      )}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Email Support</span>
                    </a>
                    <a
                      href={`tel:${(schoolAboutInfo.appSupportContactNumber || '+911942400000').replace(/[^0-9+]/g, '')}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Call Support</span>
                    </a>
                  </div>
                </div>

                {/* Network Health & Production Connection Test Diagnostics */}
                <div
                  data-testid="about-network-health-panel"
                  className="p-4 sm:p-5 rounded-2xl bg-slate-900 text-white space-y-4 border border-slate-800"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-3 h-3 rounded-full shrink-0 ${
                          pingResult
                            ? pingResult.ok
                              ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                              : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                            : isBrowserOnline
                            ? 'bg-emerald-400'
                            : 'bg-rose-500'
                        }`}
                      />
                      <div>
                        <h3 className="font-black text-sm text-white flex items-center gap-1.5">
                          <Activity className="w-4 h-4 text-emerald-400" />
                          <span>Network Health &amp; Production Connection Test</span>
                        </h3>
                        <p className="text-[11px] text-slate-300">
                          Verify live backend API reachability to diagnose whether Page Not Found / 404 issues are network-related.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isPinging}
                        onClick={() => void handleRunProductionPing()}
                        data-testid="network-health-ping-btn"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold transition-colors disabled:opacity-60"
                      >
                        {isPinging ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span>{isPinging ? 'Testing...' : 'Production Connection Test (Ping)'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const count = downloadAppErrorsJson();
                          showToast(`Downloaded app_errors.json (${count} entries).`);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>app_errors.json ({appErrorCount})</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-slate-400 uppercase font-bold text-[10px] block">
                        Browser &amp; Firebase
                      </span>
                      <div className="mt-1 flex items-center gap-1.5 font-extrabold">
                        {isBrowserOnline ? (
                          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                        )}
                        <span>
                          {isBrowserOnline
                            ? auth.currentUser
                              ? 'Connected (Firebase Signed In)'
                              : 'Online (Local + Server Ready)'
                            : 'Offline Mode'}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-slate-400 uppercase font-bold text-[10px] block">
                        Offline Sync Queue
                      </span>
                      <strong className="mt-1 block text-sm font-black text-amber-300">
                        {offlineQueueCount} Pending Item(s)
                      </strong>
                    </div>

                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-slate-400 uppercase font-bold text-[10px] block">
                        Last Successful Sync
                      </span>
                      <strong className="mt-1 block font-mono text-slate-200">
                        {new Date(lastSyncAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </strong>
                    </div>

                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-slate-400 uppercase font-bold text-[10px] block">
                        API Ping Status
                      </span>
                      {pingResult ? (
                        <div className="mt-1 flex items-center gap-1.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              pingResult.ok ? 'bg-emerald-400' : 'bg-rose-500'
                            }`}
                          />
                          <strong
                            className={pingResult.ok ? 'text-emerald-300' : 'text-rose-300'}
                          >
                            {pingResult.ok
                              ? `HTTP ${pingResult.status} • ${pingResult.latencyMs} ms`
                              : `FAILED (${pingResult.status || 'ERR'})`}
                          </strong>
                        </div>
                      ) : (
                        <span className="mt-1 block text-slate-400">Click Ping to test /api/health</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* School Master AI Chatbot Promo Card */}
                <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-900 via-slate-900 to-emerald-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 border border-indigo-700/60">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                      <Bot className="w-6 h-6 text-amber-300" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">
                        SCHOOL MASTER AI CHATBOT – Your Smart Learning Companion!
                      </h3>
                      <p className="text-[11px] text-indigo-100 mt-0.5">
                        24/7 homework help, multi-subject explanations, and exam revision. &ldquo;School Master AI – Learn Smart, Learn Better!&rdquo;
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {onNavigateToChatbot && (
                      <button
                        type="button"
                        onClick={onNavigateToChatbot}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Open AI Chatbot</span>
                      </button>
                    )}
                    <a
                      href="https://play.google.com/store/apps"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/25 font-bold"
                    >
                      <span>Google Play</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-100/80 border border-slate-200 flex items-center gap-2 text-slate-700 font-semibold">
                  <Copyright className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>{schoolAboutInfo.copyrightInfo}</span>
                </div>
              </div>
          </div>
        </section>
      )}

      {/* ================================================================= */}
      {/* SECTION C: DEVELOPER / ADMINISTRATOR PROFILE (FIXED & PROTECTED)  */}
      {/* ================================================================= */}
      {activeSection === 'developer' && (
        <section
          aria-label="Protected App Developer and Administrator Profile"
          data-testid="protected-developer-profile-section"
          className="space-y-5"
        >
          {/* Strict Protection Notice */}
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start gap-3 shadow-xs">
            <Lock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-black text-amber-950">
                Protected / Read-Only Administrator Identity (Android, iOS, Windows &amp; Web)
              </p>
              <p className="text-amber-900/90 leading-relaxed">
                The App Developer &amp; Administrator identity is permanently fixed and read-only. It cannot be edited, renamed, updated, or deleted through application settings or user interface actions.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl font-black text-amber-300 shrink-0">
                  M
                </div>
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/30 text-[10px] font-extrabold uppercase tracking-wider text-amber-200">
                    <ShieldCheck className="w-3 h-3" />
                    <span>App Developer &amp; Administrator</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    {FIXED_ADMIN_NAME}
                  </h2>
                  <p className="text-xs sm:text-sm font-bold text-indigo-200">
                    {FIXED_ADMIN_DESIGNATION}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-400/20 border border-amber-300/40 text-amber-100 text-xs font-extrabold">
                  <Lock className="w-4 h-4 text-amber-300" />
                  <span>Permanently Locked • Read-Only</span>
                </span>
              </div>
            </div>

            <div className="p-6">
              <div className="space-y-6">
                {/* Display ONLY Mohd Yousuf Wani and App Developer / Administrator */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                      <span>App Developer &amp; Administrator</span>
                    </span>
                    <p className="text-base font-black text-slate-900">{FIXED_ADMIN_NAME}</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-amber-600" />
                      <span>Designation</span>
                    </span>
                    <p className="text-base font-black text-indigo-900">{FIXED_ADMIN_DESIGNATION}</p>
                  </div>
                </div>

                {/* Role-Based Access Control (RBAC) Matrix */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-800">
                      Role-Based Access Control (RBAC) Enforcement Matrix
                    </h3>
                    <span className="text-[10px] font-bold text-slate-500">
                      Consistent across Android, iOS, Windows &amp; Web
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-white border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                          <th className="py-2.5 px-4">User Role</th>
                          <th className="py-2.5 px-4">Primary Institution</th>
                          <th className="py-2.5 px-4">App Information</th>
                          <th className="py-2.5 px-4">App Developer &amp; Administrator</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr>
                          <td className="py-2.5 px-4 font-bold text-slate-900">Super / School Admin</td>
                          <td className="py-2.5 px-4 font-bold text-emerald-700">Editable (Independent)</td>
                          <td className="py-2.5 px-4 font-bold text-amber-700">Locked Read-Only</td>
                          <td className="py-2.5 px-4 font-bold text-rose-700">Fixed • Read-Only</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-4 font-bold text-slate-900">Teacher / Staff / Student</td>
                          <td className="py-2.5 px-4 text-slate-600">Read-Only (Edit Hidden)</td>
                          <td className="py-2.5 px-4 text-slate-600">Locked Read-Only</td>
                          <td className="py-2.5 px-4 text-slate-600">Fixed • Read-Only</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-4 font-bold text-indigo-900">System Administration (Server-Level)</td>
                          <td className="py-2.5 px-4 font-bold text-indigo-700">Editable &amp; Persistent</td>
                          <td className="py-2.5 px-4 font-bold text-indigo-700">Protected Read-Only UI</td>
                          <td className="py-2.5 px-4 font-bold text-indigo-700">Protected Immutable Identity</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================================================================= */}
      {/* SECTION D: SCHOOL INFO UPDATE AUDIT LOG                           */}
      {/* ================================================================= */}
      {activeSection === 'audit' && (
        <section
          aria-label="School Information Audit Log"
          data-testid="school-info-audit-log-section"
          className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
        >
          <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600" />
                <span>School Information Update Audit Log</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Immutable history of School Admin edits to About Us, App Information, and School Logo.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono text-xs font-bold">
              {aboutAuditLogs.length} Record(s)
            </span>
          </div>

          <div className="p-5">
            {aboutAuditLogs.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 space-y-1.5">
                <History className="w-7 h-7 text-slate-300 mx-auto" />
                <p className="font-bold text-slate-700">No School Information Edits Recorded Yet</p>
                <p>Any update made by a School Admin to About Us or App Information will be logged here automatically.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Section</th>
                      <th className="py-2.5 px-3">Actor &amp; Role</th>
                      <th className="py-2.5 px-3">Summary &amp; Changed Fields</th>
                      <th className="py-2.5 px-3">Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {aboutAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[10px]">
                            {log.section}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{log.actorName}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{log.actorRole}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{log.summary}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              log.syncedToCloud
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {log.syncedToCloud ? 'Cloud Logged' : 'Local Logged'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Full Version History / Changelog Modal (/version_history.json) */}
      {showChangelogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm no-print">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <History className="w-5 h-5 text-amber-300" />
                <div>
                  <h3 className="text-sm font-black">SchoolMaster Full Version Changelog</h3>
                  <p className="text-[11px] text-slate-300">Loaded from /version_history.json</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChangelogModal(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {loadingChangelog ? (
                <div className="py-10 flex items-center justify-center gap-2 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Loading changelog...</span>
                </div>
              ) : changelogEntries.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  Unable to load version history entries.
                </p>
              ) : (
                changelogEntries.map((rel) => (
                  <div
                    key={rel.version}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-mono font-extrabold">
                          v{rel.version}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                          {rel.channel}
                        </span>
                      </div>
                      <span className="font-mono text-slate-500">{rel.releaseDate}</span>
                    </div>
                    <ul className="space-y-1.5 list-disc pl-5 text-slate-700 leading-relaxed">
                      {rel.highlights.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowChangelogModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold"
              >
                Close Changelog
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
