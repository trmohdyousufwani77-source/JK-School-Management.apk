export type DigitalAttendanceRole =
  | 'Super Administrator'
  | 'Headmaster/Principal'
  | 'Attendance Administrator'
  | 'Teaching Staff'
  | 'Non-Teaching Staff';

export type StandardAttendanceCode =
  | 'P'
  | 'A'
  | 'FH'
  | 'SH'
  | 'ML'
  | 'OD'
  | 'CL'
  | 'EL'
  | 'H'
  | 'W';

export type HalfDayMode =
  | 'full_present'
  | 'first_half_present_second_half_leave'
  | 'first_half_leave_second_half_present'
  | 'full_leave'
  | 'full_absent';

export interface AttendanceCategoryConfig {
  code: string;
  label: string;
  presentWeight: number; // 1 for P/OD, 0.5 for FH/SH, 0 for A/ML/CL/EL/H/W
  leaveWeight: number; // 1 for ML/CL/EL, 0.5 for FH/SH, 0 otherwise
  isWorkingDayExcluded?: boolean; // true for H / W
  isBuiltIn?: boolean;
  tone: 'emerald' | 'rose' | 'amber' | 'sky' | 'indigo' | 'slate';
}

export interface BiometricFaceTemplate {
  templateHash: string; // SHA-256 hex digest of normalized descriptor (privacy-preserving)
  descriptorVector: number[]; // Compact 16-bin normalized luminance signature
  consentSignedAt: string;
  registeredAt: string;
  registeredBy: string;
}

export interface DigitalEmployeeProfile {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  department: string;
  subject: string;
  mobileNumber: string;
  dateOfJoining: string;
  photoDataUrl?: string;
  employmentStatus: 'Active' | 'On Deputation' | 'Inactive';
  staffCategory: 'Teaching Staff' | 'Non-Teaching Staff';
  accountRole: DigitalAttendanceRole;
  faceTemplate: BiometricFaceTemplate | null;
  alternativePinHash?: string; // Privacy-safe alternative verification PIN hash
  leaveBalances: {
    CL: number;
    EL: number;
    ML: number;
  };
}

export interface DigitalAttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  statusCode: string; // P, A, FH, SH, ML, OD, CL, EL, H, W, or custom
  halfDayMode?: HalfDayMode;
  checkInTime: string;
  checkOutTime?: string;
  verificationMethod:
    | 'face_biometric'
    | 'alternative_pin'
    | 'manual_authorized'
    | 'auto_medical_leave'
    | 'auto_on_duty'
    | 'auto_leave';
  livenessVerified: boolean;
  livenessConfidence?: number;
  remarks?: string;
  markedBy: string;
  updatedAt: string;
}

export interface MedicalLeaveApplication {
  id: string;
  employeeId: string;
  employeeName: string;
  fromDate: string;
  toDate: string;
  numberOfDays: number;
  reason: string;
  certificateName?: string;
  certificateDataUrl?: string;
  applicationDate: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  headmasterRemarks?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface OnDutyApplication {
  id: string;
  employeeId: string;
  employeeName: string;
  dateOfDuty: string;
  dutyLocation: string;
  dutyPurpose: string;
  orderNumber: string;
  orderDate: string;
  issuingAuthority: string;
  orderDocumentName?: string;
  orderDocumentDataUrl?: string;
  fromDate: string;
  toDate: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  headmasterRemarks?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface GeneralLeaveApplication {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveCategory: string; // CL, EL, FH, SH, or custom
  fromDate: string;
  toDate: string;
  numberOfDays: number;
  reason: string;
  documentName?: string;
  documentDataUrl?: string;
  applicationDate: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  headmasterRemarks?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface DigitalAttendanceAuditLog {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: DigitalAttendanceRole;
  action:
    | 'FACE_REGISTERED'
    | 'FACE_VERIFIED'
    | 'FACE_FAILED'
    | 'ATTENDANCE_MARKED'
    | 'ATTENDANCE_CORRECTED'
    | 'MEDICAL_LEAVE_APPLIED'
    | 'MEDICAL_LEAVE_REVIEWED'
    | 'ON_DUTY_APPLIED'
    | 'ON_DUTY_REVIEWED'
    | 'LEAVE_APPLIED'
    | 'LEAVE_REVIEWED'
    | 'MONTH_LOCKED'
    | 'MONTH_REOPENED'
    | 'CATEGORY_ADDED'
    | 'EMPLOYEE_UPDATED';
  targetEmployeeId?: string;
  targetDate?: string;
  previousValue?: string;
  newValue?: string;
  reason: string;
}

export interface MonthLockState {
  monthKey: string; // YYYY-MM
  academicSession: string;
  locked: boolean;
  lockedBy?: string;
  lockedAt?: string;
  reopenedBy?: string;
  reopenedAt?: string;
  reopenReason?: string;
}

export interface AttendanceNotification {
  id: string;
  kind:
    | 'attendance_marked'
    | 'face_failed'
    | 'missing_attendance'
    | 'leave_submitted'
    | 'leave_reviewed'
    | 'od_approved'
    | 'report_generated';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface AttendanceRulesSettings {
  schoolStartTime: string;
  schoolEndTime: string;
  firstHalfCutoff: string;
  weeklyOffDay: number; // 0 = Sunday
  dataRetentionDays: number;
  academicSession: string;
}

export interface DigitalAttendancePersistedState {
  employees: DigitalEmployeeProfile[];
  records: DigitalAttendanceRecord[];
  medicalLeaves: MedicalLeaveApplication[];
  onDutyApplications: OnDutyApplication[];
  generalLeaves: GeneralLeaveApplication[];
  categories: AttendanceCategoryConfig[];
  auditLogs: DigitalAttendanceAuditLog[];
  monthLocks: MonthLockState[];
  notifications: AttendanceNotification[];
  rules: AttendanceRulesSettings;
  adminRemarksByEmployeeMonth: Record<string, string>;
}

export const DEFAULT_ATTENDANCE_CATEGORIES: AttendanceCategoryConfig[] = [
  { code: 'P', label: 'Present', presentWeight: 1, leaveWeight: 0, isBuiltIn: true, tone: 'emerald' },
  { code: 'A', label: 'Absent', presentWeight: 0, leaveWeight: 0, isBuiltIn: true, tone: 'rose' },
  { code: 'FH', label: 'First Half Leave', presentWeight: 0.5, leaveWeight: 0.5, isBuiltIn: true, tone: 'amber' },
  { code: 'SH', label: 'Second Half Leave', presentWeight: 0.5, leaveWeight: 0.5, isBuiltIn: true, tone: 'amber' },
  { code: 'ML', label: 'Medical Leave', presentWeight: 0, leaveWeight: 1, isBuiltIn: true, tone: 'sky' },
  { code: 'OD', label: 'On Duty', presentWeight: 1, leaveWeight: 0, isBuiltIn: true, tone: 'indigo' },
  { code: 'CL', label: 'Casual Leave', presentWeight: 0, leaveWeight: 1, isBuiltIn: true, tone: 'amber' },
  { code: 'EL', label: 'Earned Leave', presentWeight: 0, leaveWeight: 1, isBuiltIn: true, tone: 'amber' },
  { code: 'H', label: 'Holiday', presentWeight: 0, leaveWeight: 0, isWorkingDayExcluded: true, isBuiltIn: true, tone: 'slate' },
  { code: 'W', label: 'Weekly Off', presentWeight: 0, leaveWeight: 0, isWorkingDayExcluded: true, isBuiltIn: true, tone: 'slate' },
];
