import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  FileSpreadsheet,
  FileText,
  MapPin,
  Search,
  Eye,
  Lock,
  Wifi,
  WifiOff,
  Camera,
  Building2,
  AlertTriangle,
  History,
  Info,
  Clock,
  Check,
  Ban,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { SchoolProfile } from '../types';
import type {
  AttendanceCategoryConfig,
  AttendanceSecurityLog,
  DigitalAttendanceAuditLog,
  DigitalAttendanceRecord,
  DigitalAttendanceRole,
  DigitalEmployeeProfile,
  HierarchicalLeaveApplication,
  TeacherLeaveType,
  VpnSecurityPolicy,
} from '../types/digitalAttendance';
import {
  computeMonthlyEmployeeSummary,
  exportMonthlyAttendanceExcel,
  exportMonthlyAttendancePdf,
  getMonthName,
} from '../utils/digitalAttendanceExports';
import { guardSensitiveExport } from '../utils/biometricProtection';

const LEAVE_TYPES: TeacherLeaveType[] = [
  'Casual Leave',
  'Medical Leave',
  '1st Half-Day Leave',
  '2nd Half-Day Leave',
];

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'Approved':
    case 'Active':
    case 'Verified':
    case 'Approved_Exception':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60';
    case 'Rejected':
    case 'Suspended':
    case 'Rejected_Exception':
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60';
    case 'Forwarded for Higher Approval':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60';
    case 'Cancelled':
      return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60';
  }
}

/* ============================================================================
 * 1. TEACHER REGISTRATION & PRIVACY-COMPLIANT AADHAAR VERIFICATION PANEL
 * ==========================================================================*/
interface TeacherRegistrationPanelProps {
  school: SchoolProfile;
  employees: DigitalEmployeeProfile[];
  activeRole: DigitalAttendanceRole;
  actorName: string;
  onRefreshState: () => Promise<void>;
  onOpenFaceRegister: (emp: DigitalEmployeeProfile) => void;
  onToast: (msg: string, tone?: 'success' | 'error') => void;
}

export const TeacherRegistrationPanel: React.FC<TeacherRegistrationPanelProps> = ({
  school,
  employees,
  activeRole,
  actorName,
  onRefreshState,
  onOpenFaceRegister,
  onToast,
}) => {
  const canActivateAccounts =
    activeRole === 'Super Administrator' ||
    activeRole === 'Headmaster / Principal' ||
    activeRole === 'ZEO (Zonal Education Officer)' ||
    activeRole === 'CEO (Chief Education Officer)';

  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [schoolName, setSchoolName] = useState(school.name || '');
  const [schoolCode, setSchoolCode] = useState(school.code || 'JK-UDISE-0101');
  const [designation, setDesignation] = useState('Teacher');
  const [department, setDepartment] = useState('Academics');
  const [zoneName, setZoneName] = useState('Zone Srinagar Central');
  const [districtName, setDistrictName] = useState(school.district || 'Srinagar');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [latitude, setLatitude] = useState('34.0837');
  const [longitude, setLongitude] = useState('74.7973');
  const [radiusMeters, setRadiusMeters] = useState('250');
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [verificationMode, setVerificationMode] = useState<'aadhaar_offline' | 'alternative'>(
    'aadhaar_offline'
  );
  const [aadhaarInput, setAadhaarInput] = useState('');
  const [aadhaarRefId, setAadhaarRefId] = useState('');
  const [alternativeIdType, setAlternativeIdType] = useState('Employee Service ID / CPIS');
  const [alternativeIdRef, setAlternativeIdRef] = useState('');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      onToast('Geolocation is not supported in this browser.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        onToast('Authorized school GPS coordinates captured.');
      },
      () => onToast('Unable to fetch GPS location. Enter school coordinates manually.', 'error')
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 350_000) {
      onToast('Profile photo must be under 350 KB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhotoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentConfirmed) {
      onToast('Explicit privacy consent is mandatory before identity verification.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const resp = await fetch('/api/smart-attendance/register-teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          employeeId,
          schoolName,
          schoolCode,
          designation,
          department,
          zoneName,
          districtName,
          mobileNumber,
          email,
          latitude: Number(latitude),
          longitude: Number(longitude),
          radiusMeters: Number(radiusMeters) || 250,
          photoDataUrl: photoDataUrl || undefined,
          verificationMode,
          aadhaarDigitsForMasking:
            verificationMode === 'aadhaar_offline' ? aadhaarInput.replace(/\D/g, '') : undefined,
          aadhaarRefId: verificationMode === 'aadhaar_offline' ? aadhaarRefId : undefined,
          alternativeIdType: verificationMode === 'alternative' ? alternativeIdType : undefined,
          alternativeIdRef: verificationMode === 'alternative' ? alternativeIdRef : undefined,
          consentConfirmed,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || 'Teacher registration failed.');
      }
      // Immediately clear raw Aadhaar input from memory
      setAadhaarInput('');
      setAadhaarRefId('');
      setName('');
      setEmployeeId('');
      setMobileNumber('');
      setEmail('');
      setAlternativeIdRef('');
      setPhotoDataUrl('');
      setConsentConfirmed(false);
      await onRefreshState();
      onToast(
        `Teacher registered (${data.teacher.maskedAadhaar || data.teacher.alternativeIdType}). Account is Pending Administrator Activation.`
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to register teacher.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivationToggle = async (emp: DigitalEmployeeProfile, nextStatus: 'Active' | 'Suspended') => {
    try {
      const resp = await fetch(
        `/api/smart-attendance/activate-teacher/${encodeURIComponent(emp.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountStatus: nextStatus,
            actorName,
            actorRole: activeRole,
          }),
        }
      );
      const data = await resp.json();
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Status update failed.');
      await onRefreshState();
      onToast(`${emp.name}'s account status updated to ${nextStatus}.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update status.', 'error');
    }
  };

  const filteredEmployees = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.employeeId.toLowerCase().includes(q) ||
        (e.schoolName || '').toLowerCase().includes(q) ||
        e.designation.toLowerCase().includes(q)
    );
  }, [employees, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Registration Form */}
        <form
          onSubmit={handleRegisterSubmit}
          className="xl:col-span-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-teal-600" />
                Teacher Registration & Identity Verification
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Exclusively for government & private school teachers. Raw Aadhaar numbers, OTPs, and
                biometric photos are never stored.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Teacher Full Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Farooq Ahmad Lone"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Employee ID *
              </label>
              <input
                type="text"
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g., TCH-2026-104"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                School Name *
              </label>
              <input
                type="text"
                required
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                School Code / UDISE *
              </label>
              <input
                type="text"
                required
                value={schoolCode}
                onChange={(e) => setSchoolCode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Designation
              </label>
              <select
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              >
                <option value="Teacher">Teacher</option>
                <option value="Senior Teacher">Senior Teacher</option>
                <option value="Master">Master</option>
                <option value="Lecturer">Lecturer</option>
                <option value="Headmaster / Principal">Headmaster / Principal</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Department
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Science / Mathematics / Languages"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Registered Mobile Number *
              </label>
              <input
                type="tel"
                required
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@school.edu.in"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Education Zone (ZEO)
              </label>
              <input
                type="text"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                District (CEO)
              </label>
              <input
                type="text"
                value={districtName}
                onChange={(e) => setDistrictName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Authorized School Location (GPS Geofence) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-teal-600" />
                Authorized School Location (GPS Geofence)
              </span>
              <button
                type="button"
                onClick={handleUseCurrentGps}
                className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
              >
                Use Current GPS
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="Latitude"
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="Longitude"
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white"
              />
              <input
                type="number"
                min={50}
                max={2000}
                value={radiusMeters}
                onChange={(e) => setRadiusMeters(e.target.value)}
                placeholder="Radius (m)"
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Privacy-Compliant Aadhaar / Alternative ID Verification */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-teal-600" />
                Identity Verification Method
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setVerificationMode('aadhaar_offline')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    verificationMode === 'aadhaar_offline'
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Aadhaar Offline XML / QR
                </button>
                <button
                  type="button"
                  onClick={() => setVerificationMode('alternative')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    verificationMode === 'alternative'
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Alternative Authorized ID
                </button>
              </div>
            </div>

            {verificationMode === 'aadhaar_offline' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    12-Digit Aadhaar (Masked to XXXX-XXXX-1234 only) *
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={14}
                    value={aadhaarInput}
                    onChange={(e) => setAadhaarInput(e.target.value)}
                    placeholder="Enter 12 digits (never stored raw)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Offline XML / Secure QR Reference ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={aadhaarRefId}
                    onChange={(e) => setAadhaarRefId(e.target.value)}
                    placeholder="UIDAI-OFF-XXXXXX"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Authorized ID Type
                  </label>
                  <select
                    value={alternativeIdType}
                    onChange={(e) => setAlternativeIdType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="Employee Service ID / CPIS">Employee Service ID / CPIS</option>
                    <option value="Departmental Appointment Order">Departmental Appointment Order</option>
                    <option value="PAN Card">PAN Card</option>
                    <option value="Voter ID">Voter ID</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    ID Reference Number *
                  </label>
                  <input
                    type="text"
                    value={alternativeIdRef}
                    onChange={(e) => setAlternativeIdRef(e.target.value)}
                    placeholder="e.g., CPIS-JK-88412"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Profile Photo (Optional):
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200"
              />
            </div>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(e) => setConsentConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-teal-600"
            />
            <span>
              <strong>Explicit Teacher Consent:</strong> I verify that only masked Aadhaar
              (XXXX-XXXX-1234) or an authorized alternative ID reference is recorded. No raw Aadhaar
              numbers, OTPs, or Aadhaar biometric images are stored, and account activation requires
              Administrator approval.
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {submitting ? 'Registering Teacher...' : 'Register Teacher & Submit for Admin Activation'}
          </button>
        </form>

        {/* Registered Teachers Directory & Account Activation */}
        <div className="xl:col-span-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Registered Teachers & Account Activation
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {employees.length} teaching staff · Masked Aadhaar & encrypted face templates
              </p>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search teacher or ID..."
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-2.5 overflow-y-auto max-h-[640px] pr-1">
            {filteredEmployees.map((emp) => {
              const acctStatus = emp.accountStatus || 'Active';
              return (
                <div
                  key={emp.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {emp.name}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {emp.employeeId}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${statusBadgeClass(
                          acctStatus
                        )}`}
                      >
                        {acctStatus.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      {emp.designation} · {emp.schoolName || school.name} ({emp.schoolCode || school.code || 'UDISE'})
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        ID:{' '}
                        <strong className="font-mono text-slate-700 dark:text-slate-300">
                          {emp.maskedAadhaar || emp.alternativeIdRef || 'Authorized Staff ID'}
                        </strong>
                      </span>
                      <span>
                        Face Template:{' '}
                        <strong
                          className={
                            emp.faceTemplate
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {emp.faceTemplate ? 'Registered (SHA-256)' : 'Not Registered'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenFaceRegister(emp)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {emp.faceTemplate ? 'Update Face' : 'Register Face'}
                    </button>
                    {canActivateAccounts && acctStatus !== 'Active' && (
                      <button
                        type="button"
                        onClick={() => handleActivationToggle(emp, 'Active')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Activate
                      </button>
                    )}
                    {canActivateAccounts && acctStatus === 'Active' && (
                      <button
                        type="button"
                        onClick={() => handleActivationToggle(emp, 'Suspended')}
                        className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Suspend
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. HIERARCHICAL LEAVE APPROVAL QUEUE (Headmaster / ZEO / CEO)
 * ==========================================================================*/
interface LeaveApprovalQueuePanelProps {
  title: string;
  subtitle: string;
  leaves: HierarchicalLeaveApplication[];
  activeRole: DigitalAttendanceRole;
  actorName: string;
  allowForwarding: boolean;
  onRefreshState: () => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error') => void;
}

export const LeaveApprovalQueuePanel: React.FC<LeaveApprovalQueuePanelProps> = ({
  title,
  subtitle,
  leaves,
  activeRole,
  actorName,
  allowForwarding,
  onRefreshState,
  onToast,
}) => {
  const [filterTeacher, setFilterTeacher] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [reasonByLeaveId, setReasonByLeaveId] = useState<Record<string, string>>({});
  const [forwardTargetByLeaveId, setForwardTargetByLeaveId] = useState<Record<string, 'ZEO' | 'CEO'>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; dataUrl: string } | null>(null);

  const filteredLeaves = useMemo(() => {
    return leaves.filter((lv) => {
      if (
        filterTeacher.trim() &&
        !lv.teacherName.toLowerCase().includes(filterTeacher.trim().toLowerCase()) &&
        !lv.employeeId.toLowerCase().includes(filterTeacher.trim().toLowerCase()) &&
        !lv.referenceNumber.toLowerCase().includes(filterTeacher.trim().toLowerCase())
      ) {
        return false;
      }
      if (filterDate && lv.fromDate !== filterDate && lv.toDate !== filterDate) return false;
      if (filterType !== 'ALL' && lv.leaveCategory !== filterType) return false;
      if (filterStatus !== 'ALL' && lv.status !== filterStatus) return false;
      return true;
    });
  }, [leaves, filterTeacher, filterDate, filterType, filterStatus]);

  const handleDecision = async (
    lv: HierarchicalLeaveApplication,
    decision: 'Approved' | 'Rejected' | 'Forwarded for Higher Approval'
  ) => {
    const reason = (reasonByLeaveId[lv.id] || '').trim();
    if (reason.length < 3) {
      onToast(
        'Mandatory Reason Required: Enter a clear reason before approving, rejecting, or forwarding.',
        'error'
      );
      return;
    }
    setBusyId(lv.id);
    try {
      const resp = await fetch(`/api/smart-attendance/leaves/${encodeURIComponent(lv.id)}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          reason,
          actorName,
          actorRole: activeRole,
          forwardTo: forwardTargetByLeaveId[lv.id] || 'ZEO',
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Unable to process leave decision.');
      setReasonByLeaveId((prev) => ({ ...prev, [lv.id]: '' }));
      await onRefreshState();
      onToast(
        decision === 'Approved'
          ? `${lv.referenceNumber} approved and teacher attendance automatically updated.`
          : `${lv.referenceNumber} marked as ${decision}.`
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Decision failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={filterTeacher}
            onChange={(e) => setFilterTeacher(e.target.value)}
            placeholder="Filter teacher / ID / ref..."
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
          />
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
          >
            <option value="ALL">All Leave Types</option>
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
          >
            <option value="ALL">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Forwarded for Higher Approval">Forwarded</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {filteredLeaves.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
          No leave applications match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLeaves.map((lv) => {
            const isActionable =
              lv.status === 'Pending' || lv.status === 'Forwarded for Higher Approval';
            return (
              <div
                key={lv.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {lv.teacherName}
                      </span>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {lv.employeeId}
                      </span>
                      <span className="text-xs font-mono font-semibold text-teal-700 dark:text-teal-400">
                        {lv.referenceNumber}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${statusBadgeClass(
                          lv.status
                        )}`}
                      >
                        {lv.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      {lv.applicantRole} · {lv.schoolName} ({lv.zoneName}) ·{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {lv.leaveCategory}
                      </strong>{' '}
                      ({lv.fromDate}
                      {lv.toDate !== lv.fromDate ? ` to ${lv.toDate}` : ''} · {lv.numberOfDays}{' '}
                      day{lv.numberOfDays === 1 ? '' : 's'})
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                    <div>Approval Level: {lv.approvalLevel}</div>
                    <div>Submitted: {new Date(lv.submissionDate).toLocaleString()}</div>
                  </div>
                </div>

                <div className="text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 rounded-lg p-2.5 border border-slate-200/80 dark:border-slate-800">
                  <span className="font-semibold">Applicant Reason:</span> {lv.reason}
                  {lv.supportingDocumentName && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-slate-500">Attachment: {lv.supportingDocumentName}</span>
                      {lv.supportingDocumentDataUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewDoc({
                              name: lv.supportingDocumentName || 'Supporting Document',
                              dataUrl: lv.supportingDocumentDataUrl!,
                            })
                          }
                          className="text-teal-700 dark:text-teal-400 font-semibold hover:underline flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Document
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Mandatory Decision Reason & Action Buttons */}
                {isActionable && (
                  <div className="space-y-2 pt-1">
                    <input
                      type="text"
                      value={reasonByLeaveId[lv.id] || ''}
                      onChange={(e) =>
                        setReasonByLeaveId((prev) => ({ ...prev, [lv.id]: e.target.value }))
                      }
                      placeholder="Mandatory: Enter approval, rejection, or forwarding reason before taking action..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busyId === lv.id}
                        onClick={() => handleDecision(lv, 'Approved')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve Leave
                      </button>
                      <button
                        type="button"
                        disabled={busyId === lv.id}
                        onClick={() => handleDecision(lv, 'Rejected')}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject Leave
                      </button>
                      {allowForwarding && (
                        <div className="flex items-center gap-1.5">
                          <select
                            value={forwardTargetByLeaveId[lv.id] || 'ZEO'}
                            onChange={(e) =>
                              setForwardTargetByLeaveId((prev) => ({
                                ...prev,
                                [lv.id]: e.target.value as 'ZEO' | 'CEO',
                              }))
                            }
                            className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                          >
                            <option value="ZEO">Forward to ZEO</option>
                            <option value="CEO">Forward to CEO</option>
                          </select>
                          <button
                            type="button"
                            disabled={busyId === lv.id}
                            onClick={() => handleDecision(lv, 'Forwarded for Higher Approval')}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            Forward
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Complete Decision History Timeline */}
                {lv.decisionHistory && lv.decisionHistory.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 space-y-1">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <History className="w-3 h-3" />
                      Decision Audit History
                    </div>
                    {lv.decisionHistory.map((item, idx) => (
                      <div
                        key={`${lv.id}-hist-${idx}`}
                        className="text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-2"
                      >
                        <span className="font-mono text-slate-400">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.action}
                        </span>
                        <span>
                          by {item.actorName} ({item.actorRole})
                        </span>
                        <span className="italic">— {item.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {previewDoc.name}
              </span>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                Close
              </button>
            </div>
            {previewDoc.dataUrl.startsWith('data:image/') ? (
              <img
                src={previewDoc.dataUrl}
                alt={previewDoc.name}
                className="max-h-[70vh] mx-auto rounded-lg border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <iframe
                src={previewDoc.dataUrl}
                title={previewDoc.name}
                className="w-full h-[65vh] rounded-lg border border-slate-200 dark:border-slate-700"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 3. CENTRALIZED ADMINISTRATOR DASHBOARD, VPN CONTROLS, REPORTS & EXPORTS
 * ==========================================================================*/
interface AdminSecurityAndReportsPanelProps {
  school: SchoolProfile;
  employees: DigitalEmployeeProfile[];
  records: DigitalAttendanceRecord[];
  hierarchicalLeaves: HierarchicalLeaveApplication[];
  securityLogs: AttendanceSecurityLog[];
  auditLogs: DigitalAttendanceAuditLog[];
  securityPolicy: VpnSecurityPolicy;
  categories: AttendanceCategoryConfig[];
  activeRole: DigitalAttendanceRole;
  actorName: string;
  monthKey: string;
  onChangeMonthKey: (mk: string) => void;
  onRefreshState: () => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error') => void;
}

export const AdminSecurityAndReportsPanel: React.FC<AdminSecurityAndReportsPanelProps> = ({
  school,
  employees,
  records,
  hierarchicalLeaves,
  securityLogs,
  auditLogs,
  securityPolicy,
  categories,
  activeRole,
  actorName,
  monthKey,
  onChangeMonthKey,
  onRefreshState,
  onToast,
}) => {
  const [policySaving, setPolicySaving] = useState(false);
  const [reviewReasonByLogId, setReviewReasonByLogId] = useState<Record<string, string>>({});
  const [busyLogId, setBusyLogId] = useState<string | null>(null);
  const [reportScope, setReportScope] = useState<'school' | 'zeo' | 'ceo'>('school');

  const todayIso = new Date().toISOString().slice(0, 10);

  const metrics = useMemo(() => {
    const todayRecords = records.filter((r) => r.date === todayIso);
    const presentToday = todayRecords.filter((r) => ['P', 'OD', 'ED'].includes(r.statusCode)).length;
    const lateToday = todayRecords.filter((r) => r.statusCode === 'LA').length;
    const onLeaveToday = todayRecords.filter((r) =>
      ['AL', 'CL', 'ML', 'EL', 'FH', 'SH'].includes(r.statusCode)
    ).length;
    const absentToday = Math.max(
      0,
      employees.length - (presentToday + lateToday + onLeaveToday)
    );
    const schoolsCount = new Set(employees.map((e) => e.schoolName || school.name)).size || 1;
    const pendingLeaves = hierarchicalLeaves.filter(
      (l) => l.status === 'Pending' || l.status === 'Forwarded for Higher Approval'
    ).length;
    const approvedLeaves = hierarchicalLeaves.filter((l) => l.status === 'Approved').length;
    const rejectedLeaves = hierarchicalLeaves.filter((l) => l.status === 'Rejected').length;
    const aiFailures = securityLogs.filter(
      (s) => s.eventType === 'AI_LIVENESS_FAILED' || s.eventType === 'VIRTUAL_CAMERA_BLOCKED'
    ).length;
    const vpnSuspicious = securityLogs.filter(
      (s) =>
        s.eventType === 'VPN_DETECTED' ||
        s.eventType === 'PROXY_DETECTED' ||
        s.eventType === 'EMULATOR_OR_ROOT_FLAG'
    ).length;

    return {
      totalTeachers: employees.length,
      schoolsCount,
      presentToday,
      lateToday,
      onLeaveToday,
      absentToday,
      pendingLeaves,
      approvedLeaves,
      rejectedLeaves,
      aiFailures,
      vpnSuspicious,
    };
  }, [employees, records, hierarchicalLeaves, securityLogs, todayIso, school.name]);

  const chartData = [
    { name: 'Present', count: metrics.presentToday },
    { name: 'Late Arrival', count: metrics.lateToday },
    { name: 'On Leave', count: metrics.onLeaveToday },
    { name: 'Absent', count: metrics.absentToday },
    { name: 'AI Failures', count: metrics.aiFailures },
    { name: 'VPN / Proxy', count: metrics.vpnSuspicious },
  ];

  const groupedSummary = useMemo(() => {
    const map = new Map<
      string,
      { label: string; teachers: number; present: number; late: number; leave: number; pendingLeaves: number }
    >();
    employees.forEach((emp) => {
      const key =
        reportScope === 'school'
          ? emp.schoolName || school.name || 'Primary School'
          : reportScope === 'zeo'
          ? emp.zoneName || 'Zone Srinagar Central'
          : emp.districtName || school.district || 'Srinagar';
      const entry = map.get(key) || {
        label: key,
        teachers: 0,
        present: 0,
        late: 0,
        leave: 0,
        pendingLeaves: 0,
      };
      entry.teachers += 1;
      const rec = records.find((r) => r.employeeId === emp.employeeId && r.date === todayIso);
      if (rec) {
        if (['P', 'OD', 'ED'].includes(rec.statusCode)) entry.present += 1;
        else if (rec.statusCode === 'LA') entry.late += 1;
        else if (['AL', 'CL', 'ML', 'EL', 'FH', 'SH'].includes(rec.statusCode)) entry.leave += 1;
      }
      entry.pendingLeaves += hierarchicalLeaves.filter(
        (l) =>
          l.employeeId === emp.employeeId &&
          (l.status === 'Pending' || l.status === 'Forwarded for Higher Approval')
      ).length;
      map.set(key, entry);
    });
    return Array.from(map.values());
  }, [employees, records, hierarchicalLeaves, reportScope, todayIso, school.name, school.district]);

  const toggleSecurityPolicy = async (field: keyof VpnSecurityPolicy) => {
    setPolicySaving(true);
    try {
      const resp = await fetch('/api/smart-attendance/security-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [field]: !securityPolicy[field],
          actorName,
          actorRole: activeRole,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Policy update failed.');
      await onRefreshState();
      onToast(`Security policy updated (${field}).`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update policy.', 'error');
    } finally {
      setPolicySaving(false);
    }
  };

  const handleManualReviewDecision = async (
    log: AttendanceSecurityLog,
    decision: 'approve' | 'reject'
  ) => {
    const reason = (reviewReasonByLogId[log.id] || '').trim();
    if (reason.length < 3) {
      onToast('Mandatory review reason is required for manual attendance exception review.', 'error');
      return;
    }
    setBusyLogId(log.id);
    try {
      const resp = await fetch('/api/smart-attendance/attendance/manual-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logId: log.id,
          decision,
          reason,
          reviewerName: actorName,
          reviewerRole: activeRole,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Manual review failed.');
      setReviewReasonByLogId((prev) => ({ ...prev, [log.id]: '' }));
      await onRefreshState();
      onToast(
        decision === 'approve'
          ? `Approved attendance exception for ${log.employeeName}.`
          : `Rejected flagged attempt for ${log.employeeName}.`
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Review decision failed.', 'error');
    } finally {
      setBusyLogId(null);
    }
  };

  const handleExportExcel = async () => {
    const ok = await guardSensitiveExport('Export Teacher Monthly Attendance Register (Excel)');
    if (!ok) return;
    exportMonthlyAttendanceExcel({
      school,
      academicSession: '2026-27',
      monthKeys: [monthKey],
      employees,
      records,
      categories,
      weeklyOffDay: 0,
      adminRemarksByEmployeeMonth: {},
    });
    onToast('Monthly Attendance Register (.xlsx) exported.');
  };

  const handleExportPdf = async () => {
    const ok = await guardSensitiveExport('Export Teacher Monthly Attendance Register (PDF)');
    if (!ok) return;
    const summaries = employees.map((emp) =>
      computeMonthlyEmployeeSummary({
        employee: emp,
        monthKey,
        records,
        categories,
        weeklyOffDay: 0,
      })
    );
    exportMonthlyAttendancePdf({
      school,
      academicSession: '2026-27',
      monthKey,
      summaries,
      orientation: 'landscape',
    });
    onToast('Monthly Attendance Register (.pdf) exported.');
  };

  const pendingSecurityLogs = securityLogs.filter((l) => l.reviewStatus === 'Pending_Review');
  const [yrStr, moStr] = monthKey.split('-');
  const monthLabel = `${getMonthName(Math.max(0, Number(moStr) - 1))} ${yrStr}`;

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: 'Registered Teachers', value: metrics.totalTeachers, sub: `${metrics.schoolsCount} school(s)` },
          { label: 'Present / Late Today', value: `${metrics.presentToday} / ${metrics.lateToday}`, sub: `Absent: ${metrics.absentToday}` },
          { label: 'On Approved Leave', value: metrics.onLeaveToday, sub: `Approved total: ${metrics.approvedLeaves}` },
          { label: 'Pending Leaves', value: metrics.pendingLeaves, sub: `Rejected: ${metrics.rejectedLeaves}` },
          { label: 'AI Verification Flags', value: metrics.aiFailures, sub: 'Liveness / Virtual Cam' },
          { label: 'VPN / Proxy Alerts', value: metrics.vpnSuspicious, sub: securityPolicy.vpnAllowed ? 'VPN Allowed: ON' : 'VPN Allowed: OFF' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4"
          >
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {kpi.label}
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
              {kpi.value}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Chart + VPN & Network Security Controls */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Daily Attendance & Verification Telemetry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real-time breakdown for {todayIso}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={monthKey}
                onChange={(e) => onChangeMonthKey(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                PDF
              </button>
            </div>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0d9488" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* VPN & Network Security Admin Controls */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {securityPolicy.vpnAllowed ? (
                  <Wifi className="w-4 h-4 text-amber-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-teal-600" />
                )}
                VPN & Network Security Policy
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Server-enforced network verification rules (VPN Allowed defaults to OFF)
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {[
              {
                key: 'vpnAllowed' as const,
                title: 'VPN Allowed for Attendance',
                desc: 'Default OFF. When disabled, VPN connections are warned, logged, and held for authorized manual review.',
              },
              {
                key: 'vpnDetection' as const,
                title: 'VPN Detection Engine',
                desc: 'Detects encrypted VPN tunnels, datacenter IPs, and optional IP Intelligence signals.',
              },
              {
                key: 'proxyDetection' as const,
                title: 'Proxy & Multi-Hop Detection',
                desc: 'Inspects forwarding proxy headers and anonymous relay chains on server check-in.',
              },
              {
                key: 'suspiciousNetworkReview' as const,
                title: 'Suspicious Network Human Review',
                desc: 'Routes flagged attempts to Headmaster / Administrator queue instead of silent auto-approval.',
              },
            ].map((item) => {
              const enabled = Boolean(securityPolicy[item.key]);
              return (
                <div
                  key={item.key}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      {item.desc}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={policySaving}
                    onClick={() => toggleSecurityPolicy(item.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors ${
                      enabled
                        ? item.key === 'vpnAllowed'
                          ? 'bg-amber-600 text-white'
                          : 'bg-teal-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {enabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Flagged VPN / AI Attendance Manual Review Queue */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              Flagged VPN & AI Attendance Manual Review Queue ({pendingSecurityLogs.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              VPN or AI alerts are never treated as automatic proof of misconduct. Authorized
              officers must review exceptional cases with a documented reason.
            </p>
          </div>
        </div>

        {pendingSecurityLogs.length === 0 ? (
          <div className="p-5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 text-center">
            No pending VPN or AI verification exceptions awaiting manual review.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingSecurityLogs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-bold text-slate-900 dark:text-white">
                    {log.employeeName} ({log.employeeId}) · {log.schoolName}
                  </div>
                  <span className="font-mono text-[11px] text-amber-800 dark:text-amber-300">
                    {log.eventType} · IP {log.publicIp} · {log.transactionId || log.deviceId}
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {log.verificationSummary} ({log.networkSummary})
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={reviewReasonByLogId[log.id] || ''}
                    onChange={(e) =>
                      setReviewReasonByLogId((prev) => ({ ...prev, [log.id]: e.target.value }))
                    }
                    placeholder="Mandatory: Enter review verification reason..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={busyLogId === log.id}
                    onClick={() => handleManualReviewDecision(log, 'approve')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                  >
                    Approve Exception
                  </button>
                  <button
                    type="button"
                    disabled={busyLogId === log.id}
                    onClick={() => handleManualReviewDecision(log, 'reject')}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
                  >
                    Reject Attempt
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* School-wise / ZEO-wise / CEO-level Summary Report */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-600" />
              Hierarchical Attendance Summary ({monthLabel})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Switch between School-wise, ZEO-wise, and CEO District-level reports
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'school', label: 'School-wise' },
                { id: 'zeo', label: 'ZEO-wise' },
                { id: 'ceo', label: 'CEO-level' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setReportScope(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  reportScope === tab.id
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-3 font-semibold">Jurisdiction / Unit</th>
                <th className="py-2 px-3 font-semibold text-right">Teachers</th>
                <th className="py-2 px-3 font-semibold text-right">Present</th>
                <th className="py-2 px-3 font-semibold text-right">Late</th>
                <th className="py-2 px-3 font-semibold text-right">On Leave</th>
                <th className="py-2 pl-3 font-semibold text-right">Pending Leaves</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {groupedSummary.map((row) => (
                <tr key={row.label} className="text-slate-800 dark:text-slate-200">
                  <td className="py-2.5 pr-3 font-semibold">{row.label}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{row.teachers}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                    {row.present}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-amber-600 dark:text-amber-400">
                    {row.late}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-sky-600 dark:text-sky-400">
                    {row.leave}
                  </td>
                  <td className="py-2.5 pl-3 text-right tabular-nums">{row.pendingLeaves}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Logs & Audit Trail */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            Network, VPN & AI Verification Security Logs
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {securityLogs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No security events logged yet.</p>
            ) : (
              securityLogs.slice(0, 20).map((s) => (
                <div
                  key={s.id}
                  className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {s.employeeName} · {s.eventType}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {new Date(s.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    IP: {s.publicIp} · Device: {s.deviceId} · Status: {s.reviewStatus}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-600" />
            Immutable Attendance & Leave Audit Trail
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No audit entries yet.</p>
            ) : (
              auditLogs.slice(0, 20).map((a) => (
                <div
                  key={a.id}
                  className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {a.action} · {a.actorName} ({a.actorRole})
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {new Date(a.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {a.newValue ? `${a.newValue} — ` : ''}
                    {a.reason}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Explicit Production External Integrations Disclosure */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300">
        <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-slate-900 dark:text-white">
            External Services Requiring Authorized API / Government Onboarding Before Production Deployment
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>
              <strong>UIDAI AUA / KUA e-KYC Gateway:</strong> Live OTP/e-KYC verification requires
              licensed government AUA/KUA onboarding (currently running compliant Offline XML/QR
              masking & Alternative Authorized ID verification).
            </li>
            <li>
              <strong>IP / VPN Intelligence API:</strong> Configure server-side{' '}
              <code className="font-mono">IPINFO_TOKEN</code> in environment variables for
              commercial ASN/VPN/Tor feed enrichment alongside built-in proxy & header checks.
            </li>
            <li>
              <strong>Mobile Push & Hardware Attestation:</strong> Production native mobile/desktop
              releases require Firebase Cloud Messaging (FCM) / APNs keys and Android Play Integrity
              / iOS App Attest / Windows Hello credentials.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
