import React, { useState, useEffect } from 'react';
import {
  Settings,
  School,
  Save,
  CheckCircle,
  RotateCcw,
  Download,
  Upload,
  Calendar,
  Award,
  Plus,
  Trash2,
  Smartphone,
  Laptop,
  Apple,
  Sparkles,
  Monitor,
  MapPin,
  Navigation,
  Compass,
  Crosshair,
  ShieldCheck,
  AlertCircle,
  UserCheck,
  Image as ImageIcon,
  FileSignature,
  Stamp,
  Bell,
  Eye,
  Edit3,
  X,
  Lock,
  Activity,
  Wifi,
  WifiOff,
  HardDrive,
  RefreshCw,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Fingerprint,
} from 'lucide-react';
import { AdminRoleType, GradeBoundary, Holiday, SchoolProfile } from '../types';
import {
  guardSensitiveExport,
  isBiometricProtectionEnabled,
  setBiometricProtectionEnabled,
} from '../utils/biometricProtection';
import { Language, translations } from '../utils/translations';

import { translateSchoolNameToUrdu } from '../utils/urduTransliteration';
import { AdminAccessControl } from './AdminAccessControl';
import {
  loadPushPreferences,
  savePushPreferences,
  PUSH_PREFS_UPDATED_EVENT,
} from '../utils/pushNotifications';
import { SchoolLogoGeneratorPanel } from './SchoolLogoGeneratorPanel';
import {
  downloadAppErrorsJson,
  downloadNavigationLogsTxt,
  downloadOfflineSyncQueueJson,
  downloadQrErrorLogsJson,
  getOrCreateDeviceId,
  loadAppErrorLogs,
  loadNavigationLogs,
  loadOfflineSyncQueue,
  loadQrErrorLogs,
  measureNetworkSignalDbm,
  OfflineSyncQueueItem,
  HeartbeatPingResult,
  runProductionHeartbeatPing,
  saveOfflineSyncQueue,
} from '../utils/diagnosticsLogger';

export type SchoolSettingsSubTab =
  | 'profile'
  | 'administrative'
  | 'location'
  | 'grading'
  | 'holidays'
  | 'backup'
  | 'system-health'
  | 'offline-activity'
  | 'admin-access';

interface SchoolSettingsProps {
  school: SchoolProfile;
  onUpdateSchool: (updated: SchoolProfile) => void;
  onResetData: () => void;
  onExportBackup: () => void;
  onImportBackup: (jsonStr: string) => void;
  language: Language;
  effectiveRole?: AdminRoleType;
  onOpenMultiPlatformModal?: (platform?: 'android' | 'ios' | 'windows') => void;
  onOpenDownloadHub?: () => void;
  onTriggerOfflineSync?: () => void;
  initialSubTab?: SchoolSettingsSubTab;
}

export const SchoolSettings: React.FC<SchoolSettingsProps> = ({
  school,
  onUpdateSchool,
  onResetData,
  onExportBackup,
  onImportBackup,
  language,
  effectiveRole = 'primary_admin',
  onOpenMultiPlatformModal,
  onOpenDownloadHub,
  onTriggerOfflineSync,
  initialSubTab = 'profile',
}) => {
  const t = translations[language];
  const isAuthorizedAdmin = effectiveRole !== 'teacher';

  const [activeTab, setActiveTab] = useState<SchoolSettingsSubTab>(initialSubTab);
  const [biometricProtection, setBiometricProtection] = useState<boolean>(() =>
    school.biometricProtectionEnabled ?? isBiometricProtectionEnabled()
  );

  useEffect(() => {
    setBiometricProtectionEnabled(biometricProtection);
  }, [biometricProtection]);

  const handleToggleBiometricProtection = () => {
    const next = !biometricProtection;
    setBiometricProtection(next);
    setBiometricProtectionEnabled(next);
    onUpdateSchool({ ...school, biometricProtectionEnabled: next });
  };

  // System Health & Network + Offline Activity State
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );
  const [pingResult, setPingResult] = useState<HeartbeatPingResult | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [swStatus, setSwStatus] = useState<string>('Checking...');
  const [storageStats, setStorageStats] = useState<{
    localStorageKb: number;
    quotaMb: number | null;
    usageMb: number | null;
  }>({ localStorageKb: 0, quotaMb: null, usageMb: null });
  const [offlineQueueItems, setOfflineQueueItems] = useState<OfflineSyncQueueItem[]>(() =>
    loadOfflineSyncQueue()
  );
  const [retryingItemId, setRetryingItemId] = useState<string | null>(null);
  const [offlineActionNotice, setOfflineActionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setIsBrowserOnline(true);
    const onOffline = () => setIsBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'system-health' && activeTab !== 'offline-activity') return;
    setOfflineQueueItems(loadOfflineSyncQueue());

    // Compute localStorage footprint
    try {
      let bytes = 0;
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key) {
          const val = window.localStorage.getItem(key) || '';
          bytes += (key.length + val.length) * 2;
        }
      }
      const localKb = Math.round(bytes / 1024);
      setStorageStats((prev) => ({ ...prev, localStorageKb: localKb }));
    } catch {
      // ignore
    }

    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      navigator.storage
        .estimate()
        .then((est) => {
          setStorageStats((prev) => ({
            ...prev,
            usageMb: est.usage !== undefined ? Number((est.usage / (1024 * 1024)).toFixed(2)) : null,
            quotaMb: est.quota !== undefined ? Number((est.quota / (1024 * 1024)).toFixed(1)) : null,
          }));
        })
        .catch(() => {});
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          if (regs.length > 0) {
            setSwStatus(`Active (${regs.length} registration${regs.length === 1 ? '' : 's'} · Network-First)`);
          } else {
            setSwStatus('Registered on production HTTPS build');
          }
        })
        .catch(() => setSwStatus('Unavailable'));
    } else {
      setSwStatus('Unsupported in this browser');
    }
  }, [activeTab]);

  const handleRunDiagnosticPing = async () => {
    setIsPinging(true);
    try {
      const res = await runProductionHeartbeatPing('/api/health');
      setPingResult(res);
    } finally {
      setIsPinging(false);
    }
  };

  const handleRetryOfflineQueueItem = async (item: OfflineSyncQueueItem) => {
    setRetryingItemId(item.id);
    setOfflineActionNotice(null);
    try {
      const ping = await runProductionHeartbeatPing('/api/health');
      const current = loadOfflineSyncQueue();
      if (ping.ok) {
        onTriggerOfflineSync?.();
        const updated = current.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'completed' as const,
                retries: q.retries + 1,
                lastAttemptAt: new Date().toISOString(),
                errorMessage: undefined,
              }
            : q
        );
        saveOfflineSyncQueue(updated);
        setOfflineQueueItems(updated);
        setOfflineActionNotice(`Synced "${item.summary}" successfully (${ping.latencyMs}ms).`);
      } else {
        const updated = current.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'failed' as const,
                retries: q.retries + 1,
                lastAttemptAt: new Date().toISOString(),
                errorMessage: ping.errorMessage || `HTTP ${ping.status}`,
              }
            : q
        );
        saveOfflineSyncQueue(updated);
        setOfflineQueueItems(updated);
        setOfflineActionNotice(`Retry failed: ${ping.errorMessage || `HTTP ${ping.status}`}`);
      }
    } finally {
      setRetryingItemId(null);
    }
  };

  const handleClearCompletedOfflineItems = () => {
    const remaining = loadOfflineSyncQueue().filter((q) => q.status !== 'completed');
    saveOfflineSyncQueue(remaining);
    setOfflineQueueItems(remaining);
    setOfflineActionNotice('Cleared all completed items from offlineSyncQueue.');
  };

  // Form states (always fallback to '' to guarantee controlled inputs)
  const [name, setName] = useState(school.name || '');
  const [nameUrdu, setNameUrdu] = useState(school.nameUrdu || 'گورنمنٹ مڈل اسکول پامپوش کالونی');
  const [nameHi, setNameHi] = useState(school.nameHi || '');
  const [code, setCode] = useState(school.code || '');
  const [address, setAddress] = useState(school.address || '');
  const [villageTown, setVillageTown] = useState(school.villageTown || '');
  const [district, setDistrict] = useState(school.district || '');
  const [state, setState] = useState(school.state || '');
  const [pinCode, setPinCode] = useState(school.pinCode || '');
  const [academicSession, setAcademicSession] = useState(school.academicSession || '2026-2027');
  const [headTeacherName, setHeadTeacherName] = useState(school.headTeacherName || '');
  const FIXED_ADMIN_NAME = 'Mohd Yousuf Wani';
  const FIXED_ADMIN_DESIGNATION = 'App Developer / Administrator';
  const [headmasterName, setHeadmasterName] = useState(school.headmasterName || school.headTeacherName || '');
  const [headmasterQualification, setHeadmasterQualification] = useState(school.headmasterQualification || 'M.Sc., M.Ed.');
  const [headmasterContact, setHeadmasterContact] = useState(school.headmasterContact || school.contactNumber || '');
  const [headmasterEmail, setHeadmasterEmail] = useState(school.headmasterEmail || school.email || '');
  const [headmasterJoiningDate, setHeadmasterJoiningDate] = useState(school.headmasterJoiningDate || '2022-04-01');
  const [isEditingHeadmaster, setIsEditingHeadmaster] = useState<boolean>(false);
  const [officialStampDataUrl, setOfficialStampDataUrl] = useState(school.officialStampDataUrl || '');
  const [headmasterSignatureDataUrl, setHeadmasterSignatureDataUrl] = useState(school.headmasterSignatureDataUrl || '');
  const [logoDataUrl, setLogoDataUrl] = useState(school.logoDataUrl || '');
  const [showLogoPreviewModal, setShowLogoPreviewModal] = useState<boolean>(false);
  const [showLogoEditModal, setShowLogoEditModal] = useState<boolean>(false);
  const [logoEditSourceUrl, setLogoEditSourceUrl] = useState<string>('');
  const [logoEditScale, setLogoEditScale] = useState<number>(100);
  const [logoEditPadding, setLogoEditPadding] = useState<number>(8);
  const [logoEditBg, setLogoEditBg] = useState<'transparent' | '#ffffff' | '#fffbeb' | '#0f172a'>('#ffffff');
  const [logoEditShape, setLogoEditShape] = useState<'rounded' | 'circle' | 'square'>('rounded');
  const [confirmDeleteLogo, setConfirmDeleteLogo] = useState<boolean>(false);
  const [logoStatusMessage, setLogoStatusMessage] = useState<string | null>(null);
  const [principalDesignation, setPrincipalDesignation] = useState<'Headmaster' | 'Principal' | 'Headmistress' | 'Officiating Principal' | 'In-Charge Headmaster'>(
    (school.principalDesignation as any) || 'Headmaster'
  );
  const [schoolCategory, setSchoolCategory] = useState<'Primary' | 'Middle' | 'High_School' | 'Higher_Secondary' | 'Composite'>(
    (school.schoolCategory as any) || 'Composite'
  );
  const [classesOffered, setClassesOffered] = useState<string[]>(
    school.classesOffered || ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
  );
  const [contactNumber, setContactNumber] = useState(school.contactNumber || '');
  const [email, setEmail] = useState(school.email || '');
  const [reportHeader, setReportHeader] = useState(school.reportHeader || '');
  const [reportFooter, setReportFooter] = useState(school.reportFooter || '');

  // School GPS Location & Geofencing states for Teacher Attendance
  const [latitude, setLatitude] = useState<number>(school.latitude ?? 28.3670);
  const [longitude, setLongitude] = useState<number>(school.longitude ?? 79.4304);
  const [geofenceRadiusMeters, setGeofenceRadiusMeters] = useState<number>(school.geofenceRadiusMeters ?? 250);
  const [locationAddress, setLocationAddress] = useState<string>(
    school.locationAddress || ''
  );
  const [requireLocationForAttendance, setRequireLocationForAttendance] = useState<boolean>(
    school.requireLocationForAttendance ?? true
  );
  const [isDetectingGps, setIsDetectingGps] = useState<boolean>(false);
  const [gpsStatusMessage, setGpsStatusMessage] = useState<string | null>(null);

  // Grading scale state
  const [gradingScale, setGradingScale] = useState<GradeBoundary[]>(school.gradingScale);
  const [holidays, setHolidays] = useState<Holiday[]>(school.holidays);

  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [parentLowAttendancePush, setParentLowAttendancePush] = useState<boolean>(
    () => loadPushPreferences().parentLowAttendanceAlerts
  );

  useEffect(() => {
    const syncPrefs = () => {
      setParentLowAttendancePush(loadPushPreferences().parentLowAttendanceAlerts);
    };
    window.addEventListener(PUSH_PREFS_UPDATED_EVENT, syncPrefs);
    return () => window.removeEventListener(PUSH_PREFS_UPDATED_EVENT, syncPrefs);
  }, []);

  const handleToggleParentLowAttendancePush = () => {
    const prefs = loadPushPreferences();
    const next = !prefs.parentLowAttendanceAlerts;
    savePushPreferences({
      ...prefs,
      parentLowAttendanceAlerts: next,
    });
    setParentLowAttendancePush(next);
  };

  useEffect(() => {
    setActiveTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    setName(school.name || '');
    if (school.address !== undefined) setAddress(school.address || '');
    if (school.villageTown !== undefined) setVillageTown(school.villageTown || '');
    if (school.district !== undefined) setDistrict(school.district || '');
    setLogoDataUrl(school.logoDataUrl || '');
  }, [school.name, school.address, school.villageTown, school.district, school.logoDataUrl]);

  const handleToggleClass = (classNum: string) => {
    setClassesOffered((prev) => {
      if (prev.includes(classNum)) {
        if (prev.length <= 1) return prev; // Keep at least one class
        return prev.filter((c) => c !== classNum);
      } else {
        const next = [...prev, classNum];
        return next.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      }
    });
  };

  const handleApplyPreset = (preset: 'primary' | 'middle' | 'high' | 'higher_sec' | 'high_and_inter' | 'composite') => {
    if (preset === 'primary') {
      setClassesOffered(['1', '2', '3', '4', '5']);
      setSchoolCategory('Primary');
    } else if (preset === 'middle') {
      setClassesOffered(['6', '7', '8']);
      setSchoolCategory('Middle');
    } else if (preset === 'high') {
      setClassesOffered(['9', '10']);
      setSchoolCategory('High_School');
    } else if (preset === 'higher_sec') {
      setClassesOffered(['11', '12']);
      setSchoolCategory('Higher_Secondary');
    } else if (preset === 'high_and_inter') {
      setClassesOffered(['8', '9', '10', '11', '12']);
      setSchoolCategory('Higher_Secondary');
    } else if (preset === 'composite') {
      setClassesOffered(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
      setSchoolCategory('Composite');
    }
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setGpsStatusMessage('Geolocation is not supported by your browser.');
      return;
    }
    setIsDetectingGps(true);
    setGpsStatusMessage('Acquiring high-accuracy school campus coordinates...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1000000) / 1000000;
        const lng = Math.round(pos.coords.longitude * 1000000) / 1000000;
        const acc = Math.round(pos.coords.accuracy);
        setLatitude(lat);
        setLongitude(lng);
        setIsDetectingGps(false);
        setGpsStatusMessage(`GPS locked: ${lat}° N, ${lng}° E (±${acc}m accuracy)`);
        setTimeout(() => setGpsStatusMessage(null), 5000);
      },
      (err) => {
        setIsDetectingGps(false);
        setGpsStatusMessage(`GPS detection error: ${err.message}. You can manually enter coordinates.`);
        setTimeout(() => setGpsStatusMessage(null), 5000);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const handleAdminImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (dataUrl: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setGpsStatusMessage('Please select an image smaller than 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result;
      if (typeof result === 'string') {
        setter(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveOfficialLogo = (nextDataUrl: string, message = 'Official School Logo saved & applied centrally.') => {
    if (!isAuthorizedAdmin) return;
    setLogoDataUrl(nextDataUrl);
    const updated: SchoolProfile = {
      ...school,
      logoDataUrl: nextDataUrl || undefined,
      officialLogoLocked: Boolean(nextDataUrl),
      officialLogoUpdatedAt: new Date().toISOString(),
    };
    onUpdateSchool(updated);
    try {
      localStorage.setItem('school_master_v1_school', JSON.stringify(updated));
    } catch (err) {
      console.warn('LocalStorage save failed:', err);
    }
    setConfirmDeleteLogo(false);
    setLogoStatusMessage(message);
    setTimeout(() => setLogoStatusMessage(null), 3500);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedHeadmaster = headmasterName.trim() || headTeacherName.trim();
    const updated: SchoolProfile = {
      ...school,
      name: name.trim(),
      nameUrdu: nameUrdu.trim(),
      nameHi: nameHi.trim(),
      code,
      address,
      villageTown,
      district,
      state,
      pinCode,
      academicSession,
      headTeacherName: resolvedHeadmaster,
      headmasterName: resolvedHeadmaster,
      headmasterQualification: headmasterQualification.trim() || school.headmasterQualification,
      headmasterContact: headmasterContact.trim() || school.headmasterContact,
      headmasterEmail: headmasterEmail.trim() || school.headmasterEmail,
      headmasterJoiningDate: headmasterJoiningDate || school.headmasterJoiningDate,
      headmasterManuallyEdited: true,
      headmasterUpdatedAt: new Date().toISOString(),
      adminName: FIXED_ADMIN_NAME,
      officialStampDataUrl: officialStampDataUrl || undefined,
      headmasterSignatureDataUrl: headmasterSignatureDataUrl || undefined,
      logoDataUrl: logoDataUrl || undefined,
      officialLogoLocked: Boolean(logoDataUrl),
      principalDesignation,
      schoolCategory,
      classesOffered,
      contactNumber,
      email,
      reportHeader,
      reportFooter,
      gradingScale,
      holidays,
      latitude,
      longitude,
      geofenceRadiusMeters,
      locationAddress,
      requireLocationForAttendance,
    };
    onUpdateSchool(updated);
    try {
      localStorage.setItem('school_master_v1_school', JSON.stringify(updated));
    } catch (err) {
      console.warn('LocalStorage save failed:', err);
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleCancelHeadmasterEdit = () => {
    setHeadmasterName(school.headmasterName || school.headTeacherName || '');
    setHeadTeacherName(school.headTeacherName || school.headmasterName || '');
    setPrincipalDesignation((school.principalDesignation as any) || 'Headmaster');
    setHeadmasterQualification(school.headmasterQualification || 'M.Sc., M.Ed.');
    setHeadmasterContact(school.headmasterContact || school.contactNumber || '');
    setHeadmasterEmail(school.headmasterEmail || school.email || '');
    setHeadmasterJoiningDate(school.headmasterJoiningDate || '2022-04-01');
    setOfficialStampDataUrl(school.officialStampDataUrl || '');
    setHeadmasterSignatureDataUrl(school.headmasterSignatureDataUrl || '');
    setIsEditingHeadmaster(false);
  };

  const handleSaveAdministrativeProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorizedAdmin) return;
    const resolvedHeadmaster = headmasterName.trim() || headTeacherName.trim();
    setHeadTeacherName(resolvedHeadmaster);
    const updated: SchoolProfile = {
      ...school,
      headTeacherName: resolvedHeadmaster,
      headmasterName: resolvedHeadmaster,
      headmasterQualification: headmasterQualification.trim() || undefined,
      headmasterContact: headmasterContact.trim() || undefined,
      headmasterEmail: headmasterEmail.trim() || undefined,
      headmasterJoiningDate: headmasterJoiningDate || undefined,
      headmasterManuallyEdited: true,
      headmasterUpdatedAt: new Date().toISOString(),
      adminName: FIXED_ADMIN_NAME,
      principalDesignation,
      officialStampDataUrl: officialStampDataUrl || undefined,
      headmasterSignatureDataUrl: headmasterSignatureDataUrl || undefined,
    };
    onUpdateSchool(updated);
    try {
      localStorage.setItem('school_master_v1_school', JSON.stringify(updated));
    } catch (err) {
      console.warn('LocalStorage save failed:', err);
    }
    setIsEditingHeadmaster(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleSaveLocation = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onUpdateSchool({
      ...school,
      latitude,
      longitude,
      geofenceRadiusMeters,
      locationAddress,
      requireLocationForAttendance,
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const [backupNotice, setBackupNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState<boolean>(false);

  const handleBackupUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const str = evt.target?.result as string;
        onImportBackup(str);
        setBackupNotice({ type: 'success', text: 'School backup restored successfully!' });
        setTimeout(() => setBackupNotice(null), 4000);
      } catch (err) {
        setBackupNotice({ type: 'error', text: 'Invalid backup JSON file. Please select a valid School Master backup.' });
        setTimeout(() => setBackupNotice(null), 5000);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-indigo-600" />
            <span>{t.schoolSettings}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {language === 'ur'
              ? 'اسکول پروفائل، یو ڈائس کوڈ، پتہ، تعلیمی سال، گریڈنگ قواعد، تعطیلات اور ڈیٹا بیک اپ۔'
              : 'School configuration, U-DISE information, academic sessions, grading scales, and backups.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {backupNotice && (
            <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
              backupNotice.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}>
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{backupNotice.text}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Settings Saved!</span>
            </div>
          )}
        </div>
      </div>

      {/* Global Biometric Protection Toggle */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            biometricProtection
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}>
            <Fingerprint className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-slate-900">Biometric Protection</h2>
              <span className={`text-[11px] font-bold ${biometricProtection ? 'text-emerald-700' : 'text-slate-500'}`}>
                · {biometricProtection ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              When enabled, teachers and administrators must complete device biometric authentication (AndroidX BiometricPrompt via androidx.biometric, Face ID, Windows Hello, or authorized PIN) before exporting any PDF or Excel reports and sensitive student data files.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={biometricProtection}
          data-testid="global-biometric-protection-toggle"
          onClick={handleToggleBiometricProtection}
          className={`relative inline-flex h-7 w-13 items-center rounded-full transition-colors shrink-0 ${
            biometricProtection ? 'bg-indigo-600' : 'bg-slate-300'
          }`}
        >
          <span className="sr-only">Toggle Global Biometric Protection</span>
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              biometricProtection ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap rounded-2xl bg-white p-1.5 border border-slate-200/80 shadow-sm text-xs font-semibold gap-1 no-print">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeTab === 'profile' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.schoolDetails}
        </button>
        <button
          onClick={() => setActiveTab('administrative')}
          className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'administrative' ? 'bg-indigo-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>{language === 'ur' ? 'انتظامی پروفائل و مہر' : 'Administrative Profile'}</span>
        </button>
        <button
          onClick={() => setActiveTab('location')}
          className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'location' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>{language === 'ur' ? 'اسکول لوکیشن و جیو فینس' : 'School GPS Location'}</span>
        </button>
        <button
          onClick={() => setActiveTab('grading')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeTab === 'grading' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.gradingRules}
        </button>
        <button
          onClick={() => setActiveTab('holidays')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeTab === 'holidays' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.holidaysCalendar}
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeTab === 'backup' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.systemBackup}
        </button>
        <button
          onClick={() => setActiveTab('system-health')}
          className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'system-health' ? 'bg-indigo-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>System Health &amp; Network</span>
        </button>
        <button
          onClick={() => setActiveTab('offline-activity')}
          className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'offline-activity' ? 'bg-indigo-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Offline Activity</span>
          {offlineQueueItems.filter((i) => i.status !== 'completed').length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-400 text-slate-950 font-black">
              {offlineQueueItems.filter((i) => i.status !== 'completed').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('admin-access')}
          className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'admin-access' ? 'bg-indigo-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Admin Access Control</span>
        </button>
      </div>

      {/* Tab: School Location & Geofencing for Teacher Attendance */}
      {activeTab === 'location' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6 text-xs">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-rose-500" />
                <span>{language === 'ur' ? 'اسکول کیمپس کی لوکیشن اور اساتذہ کی حاضری کے قواعد' : 'School Campus Location & Teacher Geofence Verification'}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {language === 'ur'
                  ? 'اساتذہ کی حاضری لگانے کے وقت جی پی ایس لوکیشن کی تصدیق کے لیے اسکول کے کوآرڈینیٹس اور دائرہ سیٹ کریں۔'
                  : 'Define statutory GPS coordinates and campus radius used to verify teacher physical presence during attendance.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleDetectLocation}
              disabled={isDetectingGps}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 transition-all active:scale-95 text-xs shadow-sm"
            >
              <Navigation className={`w-3.5 h-3.5 ${isDetectingGps ? 'animate-spin text-indigo-600' : 'text-indigo-600'}`} />
              <span>{isDetectingGps ? (language === 'ur' ? 'لوکیشن حاصل کی جا رہی ہے...' : 'Detecting GPS...') : (language === 'ur' ? 'موجودہ جی پی ایس لیں' : 'Detect School GPS Location')}</span>
            </button>
          </div>

          {gpsStatusMessage && (
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 flex items-center gap-2 animate-in fade-in">
              <Compass className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="font-medium text-xs">{gpsStatusMessage}</span>
            </div>
          )}

          {/* Interactive Radar Visual Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white relative overflow-hidden border border-slate-700/80 shadow-inner">
            <div className="absolute right-4 top-4 flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-mono font-bold text-emerald-300">Geofence Active</span>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0 shadow-lg">
                <MapPin className="w-8 h-8 text-rose-400 animate-bounce" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-white text-base tracking-tight">{school.name}</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                    U-DISE: {school.code}
                  </span>
                </div>
                <p className="text-slate-300 text-xs flex items-center gap-1.5">
                  <span className="font-mono text-cyan-300 font-bold">{latitude.toFixed(6)}° N, {longitude.toFixed(6)}° E</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-amber-300 font-semibold">{geofenceRadiusMeters} meters campus geofence</span>
                </p>
                <p className="text-[11px] text-slate-400 truncate">{locationAddress}</p>
              </div>
            </div>
          </div>

          {/* Coordinates Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>{language === 'ur' ? 'عرض بلد (Latitude)' : 'School Latitude (°N)'} *</span>
                <span className="text-[10px] text-slate-400 font-mono">e.g. 28.367012</span>
              </label>
              <input
                type="number"
                step="0.000001"
                required
                value={latitude}
                onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-xl font-mono text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>{language === 'ur' ? 'طول بلد (Longitude)' : 'School Longitude (°E)'} *</span>
                <span className="text-[10px] text-slate-400 font-mono">e.g. 79.430415</span>
              </label>
              <input
                type="number"
                step="0.000001"
                required
                value={longitude}
                onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-xl font-mono text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Geofence Radius Selector */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>{language === 'ur' ? 'کیمپس جیو فینس کا دائرہ (میٹر)' : 'Campus Geofence Boundary Radius (Meters)'}</span>
              <span className="text-[10px] font-bold text-indigo-600 font-mono">{geofenceRadiusMeters} meters</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              {[
                { label: '100m (Single Building)', val: 100 },
                { label: '250m (Standard Campus)', val: 250 },
                { label: '500m (Large Grounds)', val: 500 },
                { label: '1000m (Rural Complex)', val: 1000 },
              ].map((r) => (
                <button
                  key={r.val}
                  type="button"
                  onClick={() => setGeofenceRadiusMeters(r.val)}
                  className={`py-2 px-2.5 rounded-xl border text-center font-bold text-xs transition-all ${
                    geofenceRadiusMeters === r.val
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Campus Gate Address */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              {language === 'ur' ? 'کیمپس گیٹ یا مرکزی عمارت کا پتہ' : 'Campus Gate / Building Verification Address'}
            </label>
            <input
              type="text"
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
              placeholder="e.g. Campus Main Gate 1, Civil Lines, Station Road"
              className="w-full px-3 py-2 border rounded-xl text-slate-900"
            />
          </div>

          {/* Preset Buttons for Quick Demo/Testing */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              {language === 'ur' ? 'نمونہ اسکول مقامات (فوری انتخاب)' : 'Quick Sample Locations (1-Click Test Presets)'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {[
                { name: 'Rampur Model School', lat: 28.3670, lng: 79.4304, addr: 'Civil Lines, Station Road, Rampur' },
                { name: 'Srinagar Model Middle', lat: 34.0837, lng: 74.7973, addr: 'Lal Chowk Education Zone, Srinagar' },
                { name: 'Delhi Education Zone', lat: 28.6139, lng: 77.2090, addr: 'Central Secretariat Education Block, Delhi' },
                { name: 'Bengaluru Composite', lat: 12.9716, lng: 77.5946, addr: 'Vidhana Soudha North Campus, Bengaluru' },
              ].map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setLatitude(p.lat);
                    setLongitude(p.lng);
                    setLocationAddress(p.addr);
                  }}
                  className="p-2.5 rounded-xl border border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30 text-left transition-all"
                >
                  <p className="font-bold text-slate-800">{p.name}</p>
                  <p className="font-mono text-[10px] text-slate-500">{p.lat}, {p.lng}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Enforce Geofence Toggle */}
          <div className="pt-3 border-t border-slate-100 flex items-start gap-3 p-3.5 bg-amber-50/50 border border-amber-200/60 rounded-xl">
            <input
              type="checkbox"
              id="requireGeofenceCheck"
              checked={requireLocationForAttendance}
              onChange={(e) => setRequireLocationForAttendance(e.target.checked)}
              className="mt-1 h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
            />
            <label htmlFor="requireGeofenceCheck" className="text-xs text-slate-700 cursor-pointer">
              <span className="font-bold text-slate-900 block">
                {language === 'ur' ? 'اساتذہ کی حاضری کے لیے کیمپس جی پی ایس تصدیق لازمی قرار دیں' : 'Enforce GPS Geofence Verification for Faculty Attendance'}
              </span>
              <span className="text-[11px] text-slate-500">
                {language === 'ur'
                  ? 'جب فعال ہو، اساتذہ کو حاضری کے وقت کیمپس کی حدود (250 میٹر) کے اندر ہونا ضروری ہوگا۔ حدود سے باہر ہونے پر آڈٹ الرٹ درج ہوگا۔'
                  : 'Requires teachers to verify physical presence within the campus boundary when punching attendance. Off-campus check-ins will be flagged in the attendance audit trail.'}
              </span>
            </label>
          </div>

          {/* Save Button */}
          <div className="pt-4 border-t flex justify-end">
            <button
              type="button"
              onClick={() => handleSaveLocation()}
              className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors shadow-sm active:scale-95 text-xs"
            >
              <Save className="w-4 h-4" />
              <span>{language === 'ur' ? 'اسکول کی لوکیشن محفوظ کریں' : 'Save School Location & Geofence'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 1: Profile Form */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4 text-xs">
          {/* Centralized Official School Logo Management (Clean Section — No School Name or Emblem Fields) */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-20 h-20 rounded-2xl bg-white border border-slate-300 flex items-center justify-center overflow-hidden shadow-xs shrink-0">
                  {logoDataUrl ? (
                    <img src={logoDataUrl} alt="Official School Logo" className="w-full h-full object-contain p-1.5" />
                  ) : (
                    <School className="w-8 h-8 text-indigo-600" />
                  )}
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                    <span>Official School Logo</span>
                    {logoDataUrl && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        <Lock className="w-2.5 h-2.5" />
                        <span>Centralized</span>
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Managed centrally and displayed consistently across the School Master Widget, Automatic School Logo Generator, Smart ID Cards, and Holistic Progress Cards.
                  </p>
                  {logoStatusMessage && (
                    <p className="text-[11px] font-bold text-emerald-700 mt-1 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{logoStatusMessage}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {isAuthorizedAdmin ? (
                  <>
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{logoDataUrl ? 'Upload New' : 'Upload Logo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          handleAdminImageUpload(e, (url) => {
                            handleSaveOfficialLogo(url, 'Official School Logo uploaded & applied across the app.');
                          });
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!logoDataUrl}
                      onClick={() => {
                        setLogoEditSourceUrl(logoDataUrl);
                        setLogoEditScale(100);
                        setLogoEditPadding(8);
                        setLogoEditBg('#ffffff');
                        setLogoEditShape('rounded');
                        setShowLogoEditModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 disabled:opacity-40 text-amber-800 border border-amber-300 font-bold text-xs transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Logo</span>
                    </button>
                    <button
                      type="button"
                      disabled={!logoDataUrl}
                      onClick={() => setShowLogoPreviewModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-800 border border-slate-300 font-bold text-xs transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>
                    {logoDataUrl && (
                      <button
                        type="button"
                        onClick={() => handleSaveOfficialLogo(logoDataUrl, 'Official School Logo saved & synced centrally.')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save &amp; Apply</span>
                      </button>
                    )}
                    {logoDataUrl && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteLogo(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">
                    Authorized Admin Required to Edit Logo
                  </span>
                )}
              </div>
            </div>

            {confirmDeleteLogo && isAuthorizedAdmin && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-rose-800">
                  Remove the centrally saved Official School Logo across all widgets and modules?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveOfficialLogo('', 'Official School Logo deleted successfully.')}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteLogo(false)}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {showLogoEditModal && logoEditSourceUrl && isAuthorizedAdmin && (
              <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-black text-slate-900 text-sm">Edit Official School Logo</h4>
                      <p className="text-[11px] text-slate-500">
                        Adjust scale, padding, frame shape, and backdrop before saving to School Profile
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowLogoEditModal(false)}
                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex justify-center">
                    <div
                      className={`w-44 h-44 border border-slate-200 shadow-inner flex items-center justify-center overflow-hidden ${
                        logoEditShape === 'circle'
                          ? 'rounded-full'
                          : logoEditShape === 'rounded'
                          ? 'rounded-3xl'
                          : 'rounded-none'
                      }`}
                      style={{
                        backgroundColor: logoEditBg === 'transparent' ? '#f8fafc' : logoEditBg,
                        padding: `${logoEditPadding}%`,
                      }}
                    >
                      <img
                        src={logoEditSourceUrl}
                        alt="Edited Logo Preview"
                        className="w-full h-full object-contain transition-transform"
                        style={{ transform: `scale(${logoEditScale / 100})` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="flex justify-between font-bold text-slate-700 mb-1">
                        <span>Scale / Zoom</span>
                        <span className="font-mono">{logoEditScale}%</span>
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={140}
                        value={logoEditScale}
                        onChange={(e) => setLogoEditScale(Number(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between font-bold text-slate-700 mb-1">
                        <span>Inner Padding</span>
                        <span className="font-mono">{logoEditPadding}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={24}
                        value={logoEditPadding}
                        onChange={(e) => setLogoEditPadding(Number(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="block font-bold text-slate-700 mb-1">Frame Shape</span>
                        <div className="flex gap-1.5">
                          {(['rounded', 'circle', 'square'] as const).map((shape) => (
                            <button
                              key={shape}
                              type="button"
                              onClick={() => setLogoEditShape(shape)}
                              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold capitalize border ${
                                logoEditShape === shape
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {shape}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="block font-bold text-slate-700 mb-1">Background</span>
                        <div className="flex gap-1.5">
                          {[
                            { val: '#ffffff' as const, label: 'White' },
                            { val: '#fffbeb' as const, label: 'Cream' },
                            { val: '#0f172a' as const, label: 'Navy' },
                            { val: 'transparent' as const, label: 'None' },
                          ].map((bg) => (
                            <button
                              key={bg.val}
                              type="button"
                              onClick={() => setLogoEditBg(bg.val)}
                              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border ${
                                logoEditBg === bg.val
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {bg.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Replace Image</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          handleAdminImageUpload(e, (url) => setLogoEditSourceUrl(url));
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowLogoEditModal(false)}
                        className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const img = new window.Image();
                          img.onload = () => {
                            const size = 512;
                            const canvas = document.createElement('canvas');
                            canvas.width = size;
                            canvas.height = size;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return;

                            ctx.save();
                            if (logoEditShape === 'circle') {
                              ctx.beginPath();
                              ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                              ctx.clip();
                            } else if (logoEditShape === 'rounded') {
                              const r = 64;
                              ctx.beginPath();
                              ctx.moveTo(r, 0);
                              ctx.lineTo(size - r, 0);
                              ctx.quadraticCurveTo(size, 0, size, r);
                              ctx.lineTo(size, size - r);
                              ctx.quadraticCurveTo(size, size, size - r, size);
                              ctx.lineTo(r, size);
                              ctx.quadraticCurveTo(0, size, 0, size - r);
                              ctx.lineTo(0, r);
                              ctx.quadraticCurveTo(0, 0, r, 0);
                              ctx.closePath();
                              ctx.clip();
                            }

                            if (logoEditBg !== 'transparent') {
                              ctx.fillStyle = logoEditBg;
                              ctx.fillRect(0, 0, size, size);
                            }

                            const padPx = (logoEditPadding / 100) * size;
                            const avail = size - padPx * 2;
                            const scaleFactor = logoEditScale / 100;
                            const ratio = Math.min(avail / img.width, avail / img.height) * scaleFactor;
                            const drawW = img.width * ratio;
                            const drawH = img.height * ratio;
                            ctx.drawImage(
                              img,
                              (size - drawW) / 2,
                              (size - drawH) / 2,
                              drawW,
                              drawH
                            );
                            ctx.restore();

                            const rendered = canvas.toDataURL('image/png');
                            handleSaveOfficialLogo(
                              rendered,
                              'Edited Official School Logo saved & applied across all widgets.'
                            );
                            setShowLogoEditModal(false);
                          };
                          img.src = logoEditSourceUrl;
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                      >
                        Apply Edited Logo
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showLogoPreviewModal && logoDataUrl && (
              <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-slate-900 text-sm">Official School Logo Preview</h4>
                    <button
                      type="button"
                      onClick={() => setShowLogoPreviewModal(false)}
                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="aspect-square rounded-2xl bg-slate-50 border border-slate-200 p-6 flex items-center justify-center">
                    <img src={logoDataUrl} alt="Official School Logo Preview" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowLogoPreviewModal(false)}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                    >
                      Close Preview
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <SchoolLogoGeneratorPanel
            schoolName={name || school.name}
            motto={reportHeader || school.reportHeader || 'Knowledge • Discipline • Excellence'}
            udiseCode={code || school.code}
            currentLogoDataUrl={logoDataUrl}
            isAuthorized={isAuthorizedAdmin}
            onApplyLogo={(dataUrl) => {
              handleSaveOfficialLogo(dataUrl, 'Official School Logo saved & synced across all modules.');
            }}
            onDeleteLogo={() => {
              handleSaveOfficialLogo('', 'Official School Logo deleted successfully.');
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Primary Institution / {t.schoolName} (English)
              </label>
              <input
                type="text"
                value={name}
                placeholder="Enter Primary Institution Name"
                onChange={(e) => {
                  const val = e.target.value;
                  setName(val);
                }}
                className="w-full px-3 py-2 border rounded-xl font-medium"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700">
                  {t.schoolName} (اردو - Noori Nastaleeq)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const generated = translateSchoolNameToUrdu(name);
                    if (generated) setNameUrdu(generated);
                  }}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                  title="Automatically transliterate English school name into Urdu Noori Nastaleeq"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Auto-Urdu</span>
                </button>
              </div>
              <input
                type="text"
                dir="rtl"
                placeholder="ادارے کا نام درج کریں"
                value={nameUrdu}
                onChange={(e) => setNameUrdu(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl font-noori text-base font-bold text-slate-900 bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                style={{ fontFamily: '"Noori Nastaleeq", "Noto Nastaliq Urdu", serif', fontFeatureSettings: '"kern" 1, "liga" 1' }}
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">{t.schoolName} (हिन्दी)</label>
              <input
                type="text"
                placeholder="संस्थान का नाम दर्ज करें"
                value={nameHi}
                onChange={(e) => setNameHi(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">{t.schoolCode} (U-DISE+) *</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl font-mono font-bold text-indigo-700"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">{t.academicSession} *</label>
              <input
                type="text"
                required
                value={academicSession}
                onChange={(e) => setAcademicSession(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl font-semibold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Administrative Leadership Title *</label>
              <select
                value={principalDesignation}
                onChange={(e) => setPrincipalDesignation(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-xl font-semibold bg-white"
              >
                <option value="Principal">Principal (प्रधानाचार्य / پرنسپل)</option>
                <option value="Headmaster">Headmaster (प्रधानाध्यापक / ہیڈ ماسٹر)</option>
                <option value="Headmistress">Headmistress (प्रधानाध्यापिका)</option>
                <option value="Officiating Principal">Officiating Principal (प्रभारी प्रधानाचार्य)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">{principalDesignation} Name *</label>
              <input
                type="text"
                required
                value={headTeacherName}
                onChange={(e) => setHeadTeacherName(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl font-bold text-slate-800"
              />
            </div>
          </div>

          {/* Classes Offered & School Type Editor */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm text-indigo-950 flex items-center gap-2">
                  <span>Classes Offered & School Category</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-600 text-white">
                    {classesOffered.length} Classes Active
                  </span>
                </h3>
                <p className="text-[11px] text-indigo-700">
                  Configure school range from 8th to 12th for High School / Higher Secondary, or full K-12 composite.
                </p>
              </div>

              {/* School Category selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-600">Level:</span>
                <select
                  value={schoolCategory}
                  onChange={(e) => setSchoolCategory(e.target.value as any)}
                  className="px-2.5 py-1 rounded-xl border border-indigo-200 bg-white font-semibold text-indigo-900 text-xs focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Composite">Composite K-12 (Classes 1–12)</option>
                  <option value="Higher_Secondary">Higher Secondary / Inter (Classes 11–12 / 8–12)</option>
                  <option value="High_School">High School (Classes 9–10 / 6–10)</option>
                  <option value="Middle">Upper Primary / Middle (Classes 6–8)</option>
                  <option value="Primary">Primary School (Classes 1–5)</option>
                </select>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-slate-500 mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => handleApplyPreset('high_and_inter')}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-all shadow-2xs"
              >
                High School to Higher Sec (8th–12th)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('high')}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-indigo-600 hover:text-white transition-all shadow-2xs"
              >
                High School (9th–10th)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('higher_sec')}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-indigo-600 hover:text-white transition-all shadow-2xs"
              >
                Higher Secondary (11th–12th)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('middle')}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-indigo-600 hover:text-white transition-all shadow-2xs"
              >
                Middle (6th–8th)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('primary')}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-indigo-600 hover:text-white transition-all shadow-2xs"
              >
                Primary (1st–5th)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('composite')}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-indigo-600 hover:text-white transition-all shadow-2xs"
              >
                All (1st–12th)
              </button>
            </div>

            {/* Individual Class Checkboxes Grid 1 to 12 */}
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-2 pt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map((classNum) => {
                const isSelected = classesOffered.includes(classNum);
                const isHigher = parseInt(classNum, 10) >= 9;
                return (
                  <button
                    key={classNum}
                    type="button"
                    onClick={() => handleToggleClass(classNum)}
                    className={`py-2 px-1.5 rounded-xl border text-center font-bold text-xs transition-all flex flex-col items-center justify-center gap-0.5 ${
                      isSelected
                        ? isHigher
                          ? 'bg-amber-600 border-amber-600 text-white shadow-sm ring-1 ring-amber-400'
                          : 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-semibold opacity-80">
                      {parseInt(classNum, 10) >= 11 ? 'Sr. Sec' : parseInt(classNum, 10) >= 9 ? 'High' : 'Std'}
                    </span>
                    <span className="text-sm font-black">{classNum}th</span>
                    <span className="text-[9px]">{isSelected ? 'Active ✓' : 'Off'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Village / Town</label>
              <input
                type="text"
                value={villageTown}
                onChange={(e) => setVillageTown(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">{t.district}</label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">{t.state}</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Postal Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">{t.pinCode}</label>
              <input
                type="text"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Official School Phone</label>
              <input
                type="text"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Official Report Header Notice</label>
            <textarea
              rows={2}
              value={reportHeader}
              onChange={(e) => setReportHeader(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-xs font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Official Report Footer Statutory Note</label>
            <textarea
              rows={2}
              value={reportFooter}
              onChange={(e) => setReportFooter(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-xs font-mono"
            />
          </div>

          {/* Automated Parent Low-Attendance Push Notifications Toggle */}
          <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-900">
                  Automated Parent Low-Attendance Push Notifications (&lt;75% Threshold)
                </h3>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Automatically sends push alerts to parents when a student&apos;s cumulative attendance falls below the configured 75% threshold. Synced with Daily Attendance Settings.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                role="switch"
                aria-checked={parentLowAttendancePush}
                aria-label="Automated Parent Low-Attendance Push Notifications"
                onClick={handleToggleParentLowAttendancePush}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                  parentLowAttendancePush ? 'bg-indigo-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                    parentLowAttendancePush ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-xs font-bold text-slate-700 w-16">
                {parentLowAttendancePush ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>{t.save}</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab: Administrative Profile & Manual Headmaster Management (No Auto-Overwrite) */}
      {activeTab === 'administrative' && (
        <form onSubmit={handleSaveAdministrativeProfile} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6 text-xs">
          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                <span>Headmaster Profile &amp; Administrative Credentials (Manual Control)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Headmaster details are edited manually by authorized administrators and remain permanently saved without being automatically overwritten by any other module or database.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isEditingHeadmaster ? (
                isAuthorizedAdmin ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingHeadmaster(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Headmaster</span>
                  </button>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">
                    Authorized Admin Only
                  </span>
                )
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCancelHeadmasterEdit}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Headmaster</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Saved Manual Headmaster Summary Banner */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-black text-slate-900">
                  {headmasterName || headTeacherName || 'Mohd Yousuf Wani'}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-800 font-bold text-[10px]">
                  {principalDesignation}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Manual Record Protected</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                Qualification: <strong className="text-slate-800">{headmasterQualification || 'Not specified'}</strong> • Contact: <strong className="font-mono text-slate-800">{headmasterContact || school.contactNumber || 'Not specified'}</strong>
                {headmasterEmail ? ` • ${headmasterEmail}` : ''}
              </p>
            </div>
            {school.headmasterUpdatedAt && (
              <span className="text-[10px] font-semibold text-slate-500 shrink-0">
                Last manually saved: {new Date(school.headmasterUpdatedAt).toLocaleDateString('en-IN')}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Headmaster / Principal Name *</label>
              <input
                type="text"
                required
                disabled={!isEditingHeadmaster}
                value={headmasterName}
                onChange={(e) => {
                  setHeadmasterName(e.target.value);
                  setHeadTeacherName(e.target.value);
                }}
                placeholder="Enter Headmaster's Full Name"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-600"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Printed on Dashboard, Smart ID Cards, and Progress Cards.</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Official Designation Title</label>
              <select
                disabled={!isEditingHeadmaster}
                value={principalDesignation}
                onChange={(e) => setPrincipalDesignation(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold bg-white disabled:bg-slate-100 disabled:text-slate-600"
              >
                <option value="Headmaster">Headmaster</option>
                <option value="Principal">Principal</option>
                <option value="Headmistress">Headmistress</option>
                <option value="Officiating Principal">Officiating Principal</option>
                <option value="In-Charge Headmaster">In-Charge Headmaster</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <span>App Developer &amp; Administrator (Locked)</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                  <Lock className="w-3 h-3" />
                  <span>Read-Only</span>
                </span>
              </label>
              <div
                data-testid="settings-locked-administrator-identity"
                className="w-full px-3 py-2 border border-amber-200 rounded-xl bg-amber-50/70 text-slate-900 select-none"
              >
                <div className="font-black text-slate-900">{FIXED_ADMIN_NAME}</div>
                <div className="text-[11px] font-semibold text-slate-600">{FIXED_ADMIN_DESIGNATION}</div>
              </div>
              <span className="text-[10px] text-amber-800 mt-1 block">
                Protected across Android, iOS, Windows &amp; Web. Cannot be renamed, edited, or deleted.
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Qualification</label>
              <input
                type="text"
                disabled={!isEditingHeadmaster}
                value={headmasterQualification}
                onChange={(e) => setHeadmasterQualification(e.target.value)}
                placeholder="e.g. M.Sc., M.Ed."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Headmaster Contact Number</label>
              <input
                type="text"
                disabled={!isEditingHeadmaster}
                value={headmasterContact}
                onChange={(e) => setHeadmasterContact(e.target.value)}
                placeholder="+91 9XXXXXXXXX"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Headmaster Email / Joining Date</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="email"
                  disabled={!isEditingHeadmaster}
                  value={headmasterEmail}
                  onChange={(e) => setHeadmasterEmail(e.target.value)}
                  placeholder="hm@school.edu.in"
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-600"
                />
                <input
                  type="date"
                  disabled={!isEditingHeadmaster}
                  value={headmasterJoiningDate}
                  onChange={(e) => setHeadmasterJoiningDate(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-xl font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-600"
                />
              </div>
            </div>
          </div>

          {/* Image Uploaders for Official Stamp & Headmaster Signature */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Official Stamp Uploader */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Stamp className="w-4 h-4 text-indigo-600" />
                  <span>Official School / Headmaster Stamp</span>
                </h3>
                {officialStampDataUrl && isEditingHeadmaster && (
                  <button
                    type="button"
                    onClick={() => setOfficialStampDataUrl('')}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              <div className="h-32 rounded-xl border-2 border-dashed border-slate-300 bg-white flex items-center justify-center p-3 overflow-hidden">
                {officialStampDataUrl ? (
                  <img
                    src={officialStampDataUrl}
                    alt="Official School Stamp"
                    className="max-h-28 max-w-full object-contain"
                  />
                ) : (
                  <div className="text-center text-slate-400 space-y-1">
                    <ImageIcon className="w-6 h-6 mx-auto opacity-60" />
                    <span className="block text-[11px]">No official stamp uploaded (PNG/JPG recommended)</span>
                  </div>
                )}
              </div>

              {isEditingHeadmaster && (
                <label className="w-full py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{officialStampDataUrl ? 'Change Official Stamp Image' : 'Upload Official Stamp Image'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => handleAdminImageUpload(e, setOfficialStampDataUrl)}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Digital Signature Uploader */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <FileSignature className="w-4 h-4 text-emerald-600" />
                  <span>Headmaster Digital Signature</span>
                </h3>
                {headmasterSignatureDataUrl && isEditingHeadmaster && (
                  <button
                    type="button"
                    onClick={() => setHeadmasterSignatureDataUrl('')}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              <div className="h-32 rounded-xl border-2 border-dashed border-slate-300 bg-white flex items-center justify-center p-3 overflow-hidden">
                {headmasterSignatureDataUrl ? (
                  <img
                    src={headmasterSignatureDataUrl}
                    alt="Headmaster Digital Signature"
                    className="max-h-24 max-w-full object-contain"
                  />
                ) : (
                  <div className="text-center text-slate-400 space-y-1">
                    <FileSignature className="w-6 h-6 mx-auto opacity-60" />
                    <span className="block text-[11px]">No digital signature uploaded (transparent PNG recommended)</span>
                  </div>
                )}
              </div>

              {isEditingHeadmaster && (
                <label className="w-full py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold cursor-pointer flex items-center justify-center gap-2 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{headmasterSignatureDataUrl ? 'Change Signature Image' : 'Upload Digital Signature Image'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => handleAdminImageUpload(e, setHeadmasterSignatureDataUrl)}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Live PDF Footer Preview */}
          <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">
              Live Progress Card PDF Footer Preview
            </span>
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end justify-between gap-6">
              <div className="text-center">
                <div className="h-12 flex items-end justify-center pb-1">
                  <span className="text-[11px] font-serif italic text-slate-500">Class Teacher Sign</span>
                </div>
                <div className="border-t border-slate-400 w-36 pt-1 font-bold text-[11px] text-slate-700">
                  Class Teacher
                </div>
              </div>

              <div className="text-center">
                <div className="h-12 flex items-end justify-center pb-1">
                  {officialStampDataUrl ? (
                    <img src={officialStampDataUrl} alt="Stamp Preview" className="h-12 w-auto object-contain" />
                  ) : (
                    <span className="text-[10px] px-3 py-1 rounded border border-dashed border-slate-300 text-slate-400">
                      Official Seal
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-semibold text-slate-500">Official School Stamp</div>
              </div>

              <div className="text-center">
                <div className="h-12 flex items-end justify-center gap-2 pb-1">
                  {headmasterSignatureDataUrl && (
                    <img src={headmasterSignatureDataUrl} alt="Signature Preview" className="h-10 w-auto object-contain" />
                  )}
                </div>
                <div className="border-t border-slate-600 min-w-[160px] pt-1">
                  <span className="font-bold text-[11px] text-slate-900 block">
                    {headmasterName || 'Headmaster'} ({principalDesignation})
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    App Developer / Administrator: {FIXED_ADMIN_NAME}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {isEditingHeadmaster && (
            <div className="pt-4 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelHeadmasterEdit}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors border border-slate-200"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>Save Headmaster Profile</span>
              </button>
            </div>
          )}
        </form>
      )}

      {/* Tab 2: Grading Scale Rules */}
      {activeTab === 'grading' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Configurable Evaluation Grading Scale (CBSE / State RTE)</h2>
              <p className="text-xs text-slate-500">Threshold percentages and qualitative performance descriptors.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b text-slate-600 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-3">Grade</th>
                  <th className="py-2.5 px-3">Min %</th>
                  <th className="py-2.5 px-3">Max %</th>
                  <th className="py-2.5 px-3">Qualitative Remark</th>
                  <th className="py-2.5 px-3">हिन्दी टिप्पणी</th>
                  <th className="py-2.5 px-3">Grade Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gradingScale.map((b, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-extrabold text-indigo-700">{b.grade}</td>
                    <td className="py-2.5 px-3 font-mono font-bold">{b.minPercentage}%</td>
                    <td className="py-2.5 px-3 font-mono font-bold">{b.maxPercentage}%</td>
                    <td className="py-2.5 px-3 text-slate-700">{b.remark}</td>
                    <td className="py-2.5 px-3 text-slate-700">{b.remarkHi}</td>
                    <td className="py-2.5 px-3 font-mono font-bold">{b.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: School Calendar & Holidays */}
      {activeTab === 'holidays' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Official Gazetted School Holidays (Academic Session {school.academicSession})</h2>
              <p className="text-xs text-slate-500">Days excluded from scheduled working days when computing attendance percentages.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b text-slate-600 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Holiday Name</th>
                  <th className="py-2.5 px-3">अवकाश विवरण (हिन्दी)</th>
                  <th className="py-2.5 px-3">Classification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holidays.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{h.date}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{h.name}</td>
                    <td className="py-2.5 px-3 text-slate-700">{h.nameHi}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 uppercase">
                        {h.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: System Backup & Data Reset */}
      {activeTab === 'backup' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{t.systemBackup}</h2>
            <p className="text-xs text-slate-500 mt-1">
              Export encrypted JSON backup of the complete school database (students, attendance, marks, leaves) for disaster recovery and offline safe-keeping.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Export Backup */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                <Download className="w-4 h-4 text-indigo-600" />
                <span>Export School Database (.json)</span>
              </h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Generates a timestamped JSON snapshot containing all student profiles, attendance audit logs, marks records, and leave applications.
              </p>
              <button
                type="button"
                onClick={async () => {
                  const ok = await guardSensitiveExport('Complete School Database Backup (.json)');
                  if (ok) onExportBackup();
                }}
                className="w-full py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Download Snapshot (.json)
              </button>
            </div>

            {/* Restore Backup */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>Restore Database from File</span>
              </h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Restore previously exported JSON backup. Existing records will be updated safely.
              </p>
              <label className="w-full py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer flex items-center justify-center">
                <span>Select Backup File</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleBackupUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Multi-Platform App Deployment: Android, iOS, Windows */}
          <div className="p-5 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white rounded-3xl border border-indigo-800/80 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-500/30">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold flex items-center gap-2">
                    <span>Multi-Platform App Deployment</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Cross-Platform PWA
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300">
                    Deploy School Master with offline persistence across Android tablets, iPhones, iPads, and Windows laptops.
                  </p>
                </div>
              </div>

              <button
                onClick={() => onOpenMultiPlatformModal?.()}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all flex items-center gap-2 shrink-0 self-start sm:self-auto"
              >
                <Sparkles className="w-4 h-4 text-amber-200" />
                <span>Open Multi-Platform Hub</span>
              </button>
            </div>

            {/* Platform Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
              <button
                onClick={() => onOpenMultiPlatformModal?.('android')}
                className="p-3 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-emerald-500/30 text-left transition-all group flex items-start gap-2.5"
              >
                <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-xs text-white block group-hover:text-emerald-300">
                    Android (APK & PWA)
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Download APK (8.4MB) or instant Chrome WebAPK install.
                  </span>
                </div>
              </button>

              <button
                onClick={() => onOpenMultiPlatformModal?.('ios')}
                className="p-3 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-left transition-all group flex items-start gap-2.5"
              >
                <div className="w-7 h-7 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Apple className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-xs text-white block group-hover:text-indigo-300">
                    iOS (iPhone & iPad)
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Safari "Add to Home Screen" standalone app mode.
                  </span>
                </div>
              </button>

              <button
                onClick={() => onOpenMultiPlatformModal?.('windows')}
                className="p-3 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-blue-500/30 text-left transition-all group flex items-start gap-2.5"
              >
                <div className="w-7 h-7 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Monitor className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-xs text-white block group-hover:text-blue-300">
                    Windows Desktop PC
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Start Menu & Taskbar pinning with Edge / Chrome.
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Reset to Sample Data */}
          <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4" />
                <span>Reset to Factory Sample Data</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Restores standard government school demo roster (Classes 1–8, teachers, October attendance, half-yearly exam).
              </p>
            </div>
            {confirmResetOpen ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    onResetData();
                    setConfirmResetOpen(false);
                    setBackupNotice({ type: 'success', text: 'Factory sample data restored successfully.' });
                    setTimeout(() => setBackupNotice(null), 4000);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                >
                  Confirm Reset
                </button>
                <button
                  onClick={() => setConfirmResetOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmResetOpen(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-300 transition-colors shrink-0"
              >
                {t.resetData}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tab: System Health & Network Diagnostics */}
      {activeTab === 'system-health' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6 text-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600" />
                <span>System Health &amp; Network Diagnostics</span>
              </h2>
              <p className="text-slate-500 mt-0.5">
                Real-time production heartbeat ping, offline storage usage, Service Worker health, and diagnostic log exports.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunDiagnosticPing}
              disabled={isPinging}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold shadow-xs transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isPinging ? 'animate-spin' : ''}`} />
              <span>{isPinging ? 'Running Diagnostic Ping...' : 'Run Diagnostic Ping'}</span>
            </button>
          </div>

          {/* Live Health KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                {isBrowserOnline ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-rose-600" />
                )}
                <span>Live Connectivity</span>
              </span>
              <p className={`text-base font-black ${isBrowserOnline ? 'text-emerald-700' : 'text-rose-700'}`}>
                {isBrowserOnline ? 'Connected' : 'Offline'}
              </p>
              <p className="text-[11px] font-mono text-slate-500">
                Signal: {measureNetworkSignalDbm(!isBrowserOnline) ?? '—'} dBm · {getOrCreateDeviceId()}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Production API Heartbeat
              </span>
              {pingResult ? (
                <>
                  <p className={`text-base font-black font-mono ${pingResult.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {pingResult.ok ? `OK · ${pingResult.latencyMs} ms` : `Failed · HTTP ${pingResult.status}`}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 truncate">
                    HTTP {pingResult.status} · {new Date(pingResult.timestamp).toLocaleTimeString()}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-black text-slate-700">Not Tested</p>
                  <p className="text-[11px] text-slate-500">Click Run Diagnostic Ping above</p>
                </>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
                <span>Local &amp; Cache Storage</span>
              </span>
              <p className="text-base font-black text-slate-900 font-mono">
                {storageStats.localStorageKb} KB local
              </p>
              <p className="text-[11px] font-mono text-slate-500">
                {storageStats.usageMb !== null && storageStats.quotaMb !== null
                  ? `Browser: ${storageStats.usageMb} MB / ${storageStats.quotaMb} MB`
                  : 'IndexedDB & localStorage active'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Service Worker &amp; Routing
              </span>
              <p className="text-xs font-extrabold text-indigo-800 mt-1">{swStatus}</p>
              <p className="text-[11px] text-slate-500">
                SPA Fallback: <code className="font-mono">/index.html</code>
              </p>
            </div>
          </div>

          {pingResult && (
            <div
              className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
                pingResult.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {pingResult.ok ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                )}
                <div>
                  <p className="font-extrabold">
                    {pingResult.ok
                      ? `Production Endpoint Reachable (HTTP ${pingResult.status} in ${pingResult.latencyMs}ms)`
                      : `Production Heartbeat Failed (HTTP ${pingResult.status})`}
                  </p>
                  <p className="text-[11px] font-mono opacity-85">
                    Endpoint: {pingResult.url} {pingResult.errorMessage ? `· ${pingResult.errorMessage}` : ''}
                  </p>
                </div>
              </div>
              {!pingResult.ok && (
                <button
                  type="button"
                  onClick={() => downloadAppErrorsJson()}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px]"
                >
                  Download app_errors.json
                </button>
              )}
            </div>
          )}

          {/* Diagnostic File Exports */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Diagnostic Log Exports (404, QR Scanner, Navigation &amp; Offline Sync)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => downloadQrErrorLogsJson()}
                className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-amber-50 border border-amber-200 text-amber-900 font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-amber-600" />
                <span>Download Error Logs ({loadQrErrorLogs().length})</span>
              </button>
              <button
                type="button"
                onClick={() => downloadNavigationLogsTxt()}
                className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-indigo-600" />
                <span>Export Logs ({loadNavigationLogs().length})</span>
              </button>
              <button
                type="button"
                onClick={() => downloadOfflineSyncQueueJson()}
                className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export offlineSyncQueue ({offlineQueueItems.length})</span>
              </button>
              <button
                type="button"
                onClick={() => downloadAppErrorsJson()}
                className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-900 font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-rose-600" />
                <span>app_errors.json ({loadAppErrorLogs().length})</span>
              </button>
            </div>
          </div>

          {/* Recent Navigation Events Preview */}
          <div className="space-y-2">
            <h3 className="font-bold text-slate-700">Recent Navigation Observer Events</h3>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
                    <th className="py-2 px-3">Time</th>
                    <th className="py-2 px-3">Active Tab</th>
                    <th className="py-2 px-3">Route Transition</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {loadNavigationLogs()
                    .slice(0, 8)
                    .map((ev) => (
                      <tr key={ev.id}>
                        <td className="py-2 px-3 text-slate-500">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-800">{ev.activeTab}</td>
                        <td className="py-2 px-3 text-slate-600">
                          {ev.fromPath} → {ev.toPath}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ev.status === 'RECOVERED_404'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {ev.status === 'RECOVERED_404' ? '404 Recovered' : ev.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Offline Activity & Sync Queue Management */}
      {activeTab === 'offline-activity' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5 text-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Offline Activity &amp; Sync Queue</span>
              </h2>
              <p className="text-slate-500 mt-0.5">
                Inspect queued offline updates in <code className="font-mono">offlineSyncQueue</code>, retry failed items, export JSON diagnostics, or clear completed entries.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => downloadOfflineSyncQueueJson()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-slate-300"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Queue JSON</span>
              </button>
              <button
                type="button"
                onClick={handleClearCompletedOfflineItems}
                disabled={!offlineQueueItems.some((i) => i.status === 'completed')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Completed</span>
              </button>
            </div>
          </div>

          {offlineActionNotice && (
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>{offlineActionNotice}</span>
            </div>
          )}

          {offlineQueueItems.length === 0 ? (
            <div className="py-10 text-center space-y-2 text-slate-500">
              <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto" />
              <p className="font-bold text-slate-800 text-sm">Offline Sync Queue is Empty</p>
              <p>All school records and QR attendance scans are fully synchronized.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-2.5 px-3">Module</th>
                    <th className="py-2.5 px-3">Details</th>
                    <th className="py-2.5 px-3">Created At</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {offlineQueueItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3">
                        <span className="font-extrabold text-slate-900">{item.module}</span>
                        <span className="block font-mono text-[10px] text-slate-500">{item.id}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">{item.summary}</div>
                        {item.errorMessage && (
                          <div className="text-[11px] text-rose-600 font-mono mt-0.5">{item.errorMessage}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                            item.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : item.status === 'failed'
                              ? 'bg-rose-100 text-rose-800 border-rose-200'
                              : 'bg-amber-100 text-amber-800 border-amber-200'
                          }`}
                        >
                          {item.status === 'completed'
                            ? 'Completed'
                            : item.status === 'failed'
                            ? `Failed (${item.retries})`
                            : 'Pending'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {item.status !== 'completed' ? (
                          <button
                            type="button"
                            disabled={retryingItemId === item.id}
                            onClick={() => void handleRetryOfflineQueueItem(item)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-[11px]"
                          >
                            <RefreshCw className={`w-3 h-3 ${retryingItemId === item.id ? 'animate-spin' : ''}`} />
                            <span>Retry</span>
                          </button>
                        ) : (
                          <span className="text-[11px] font-bold text-emerald-600">Synced</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Admin Access Control & Role Inheritance */}
      {activeTab === 'admin-access' && (
        <AdminAccessControl school={school} onOpenDownloadHub={onOpenDownloadHub} />
      )}

      {/* Floating 'Download App / Install' Action Button for Settings View */}
      <div className="fixed bottom-6 right-6 z-30 no-print animate-in fade-in slide-in-from-bottom-4 duration-300">
        <button
          onClick={() => onOpenMultiPlatformModal?.()}
          className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-indigo-600 to-blue-600 text-white font-extrabold text-xs shadow-xl hover:shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all border border-white/20"
          title="Install / Download School Master on Android, iOS or Windows"
        >
          <div className="flex items-center -space-x-1.5 bg-black/20 p-1 rounded-lg">
            <Smartphone className="w-4 h-4 text-emerald-300" />
            <Apple className="w-4 h-4 text-white" />
            <Monitor className="w-4 h-4 text-blue-200" />
          </div>
          <div className="text-left">
            <span className="block leading-none font-bold">Download / Install App</span>
            <span className="block text-[10px] text-slate-200 font-normal leading-tight mt-0.5">
              Android • iOS • Windows
            </span>
          </div>
        </button>
      </div>

    </div>
  );
};
