export type DigitalAttendanceRole =
  | 'Teacher'
  | 'Headmaster / Principal'
  | 'ZEO (Zonal Education Officer)'
  | 'CEO (Chief Education Officer)'
  | 'Super Administrator'
  // Legacy aliases preserved for backward compatibility with stored records
  | 'Headmaster/Principal'
  | 'Attendance Administrator'
  | 'Teaching Staff'
  | 'Non-Teaching Staff';

export type StandardAttendanceCode =
  | 'P'
  | 'A'
  | 'LA'
  | 'ED'
  | 'AL'
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

export type TeacherLeaveType =
  | 'Casual Leave'
  | 'Medical Leave'
  | '1st Half-Day Leave'
  | '2nd Half-Day Leave';

export type HierarchicalLeaveStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Forwarded for Higher Approval'
  | 'Cancelled';

export type ApprovalAuthorityLevel = 'Headmaster' | 'ZEO' | 'CEO';

export interface AttendanceCategoryConfig {
  code: string;
  label: string;
  presentWeight: number; // 1 for P/LA/ED/OD, 0.5 for FH/SH, 0 for A/ML/CL/EL/AL/H/W
  leaveWeight: number; // 1 for ML/CL/EL/AL, 0.5 for FH/SH, 0 otherwise
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

export interface AuthorizedSchoolLocation {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  addressLabel?: string;
}

export interface DigitalEmployeeProfile {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  department: string;
  subject: string;
  mobileNumber: string;
  email?: string;
  schoolName?: string;
  schoolCode?: string;
  zoneName?: string;
  districtName?: string;
  dateOfJoining: string;
  photoDataUrl?: string;
  employmentStatus: 'Active' | 'On Deputation' | 'Inactive';
  accountStatus?: 'Pending_Activation' | 'Active' | 'Suspended';
  activatedBy?: string;
  activatedAt?: string;
  staffCategory: 'Teaching Staff' | 'Non-Teaching Staff';
  accountRole: DigitalAttendanceRole;
  // Aadhaar & Alternative Identity Verification (Strictly masked — NEVER stores full Aadhaar, OTP, or biometrics)
  aadhaarStatus?: 'Verified' | 'Alternative_ID' | 'Pending';
  maskedAadhaar?: string; // e.g., XXXX-XXXX-1234
  aadhaarRefId?: string;
  aadhaarProvider?: 'UIDAI_Offline_XML_QR' | 'Authorized_AUA_Gateway' | 'Alternative_ID';
  aadhaarConsentSignedAt?: string;
  alternativeIdType?: string;
  alternativeIdRef?: string;
  authorizedLocation?: AuthorizedSchoolLocation;
  registeredDeviceId?: string;
  faceTemplate: BiometricFaceTemplate | null;
  alternativePinHash?: string; // Privacy-safe alternative verification PIN hash
  leaveBalances: {
    CL: number;
    EL: number;
    ML: number;
  };
}

export interface FiveStatusAiVerification {
  faceMatchStatus: 'Matched' | 'Mismatch' | 'Unregistered' | 'Manual_Alternative';
  livenessStatus: 'Verified' | 'Failed' | 'Skipped_Alternative';
  cameraAuthenticityStatus: 'Authentic Live Camera' | 'Virtual Camera Detected' | 'Replay / Spoof Suspected' | 'Camera Unavailable';
  locationVerificationStatus: 'Inside School Geofence' | 'Outside School Geofence' | 'Location Unavailable';
  attendanceVerificationStatus: 'Verified' | 'Flagged for Admin Review' | 'Rejected';
  livenessConfidence: number;
  faceSimilarityScore?: number;
  distanceMeters?: number | null;
  serverTimestamp: string;
  transactionId: string;
  deviceId: string;
  failureReason?: string;
  aiNotes?: string;
}

export interface NetworkSecurityAssessment {
  checkedAt: string;
  publicIp: string;
  ispOrOrg: string;
  vpnDetected: boolean;
  proxyDetected: boolean;
  suspiciousIp: boolean;
  rootedOrJailbrokenHint: boolean;
  emulatorDetected: boolean;
  riskLevel: 'Low' | 'Elevated' | 'Blocked_By_Policy';
  signals: string[];
  providerMode: 'Built-in Header & Environment Intelligence' | 'External IP Intelligence API';
  recommendation: string;
}

export interface VpnSecurityPolicy {
  vpnAllowed: boolean; // Default: false
  vpnDetection: boolean; // Default: true
  proxyDetection: boolean; // Default: true
  suspiciousNetworkReview: boolean; // Default: true
  updatedBy?: string;
  updatedAt?: string;
}

export interface AttendanceSecurityLog {
  id: string;
  timestamp: string;
  employeeId: string;
  employeeName: string;
  schoolName: string;
  eventType:
    | 'VPN_DETECTED'
    | 'PROXY_DETECTED'
    | 'EMULATOR_OR_ROOT_FLAG'
    | 'AI_LIVENESS_FAILED'
    | 'VIRTUAL_CAMERA_BLOCKED'
    | 'GEOFENCE_OUTSIDE'
    | 'ATTENDANCE_VERIFIED'
    | 'MANUAL_REVIEW_APPROVED'
    | 'MANUAL_REVIEW_REJECTED';
  publicIp: string;
  networkSummary: string;
  deviceId: string;
  transactionId?: string;
  verificationSummary: string;
  reviewStatus: 'None' | 'Pending_Review' | 'Approved_Exception' | 'Rejected_Exception';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
}

export interface DigitalAttendanceRecord {
  id: string;
  employeeId: string;
  employeeName?: string;
  schoolName?: string;
  schoolCode?: string;
  zoneName?: string;
  date: string; // YYYY-MM-DD
  statusCode: string; // P, A, LA, ED, AL, FH, SH, ML, OD, CL, EL, H, W
  categoryLabel?: string; // Present, Absent, Late Arrival, Early Departure, On Approved Leave, Half-Day Leave
  halfDayMode?: HalfDayMode;
  checkInTime: string;
  checkOutTime?: string;
  serverTimestamp?: string;
  transactionId?: string;
  deviceId?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  distanceFromSchoolMeters?: number | null;
  publicIp?: string;
  verificationMethod:
    | 'face_biometric'
    | 'alternative_pin'
    | 'manual_authorized'
    | 'auto_medical_leave'
    | 'auto_on_duty'
    | 'auto_leave';
  livenessVerified: boolean;
  livenessConfidence?: number;
  aiVerification?: FiveStatusAiVerification;
  networkAssessment?: NetworkSecurityAssessment;
  remarks?: string;
  markedBy: string;
  updatedAt: string;
}

export interface LeaveDecisionHistoryItem {
  timestamp: string;
  actorName: string;
  actorRole: string;
  action: 'Submitted' | 'Approved' | 'Rejected' | 'Forwarded for Higher Approval' | 'Cancelled';
  reason: string;
}

export interface HierarchicalLeaveApplication {
  id: string;
  referenceNumber: string; // e.g., LV-2026-842910
  employeeId: string;
  teacherName: string;
  applicantRole: 'Teacher' | 'Headmaster / Principal';
  schoolName: string;
  schoolCode: string;
  zoneName: string;
  districtName: string;
  leaveCategory: TeacherLeaveType;
  fromDate: string;
  toDate: string;
  numberOfDays: number;
  reason: string;
  supportingDocumentName?: string;
  supportingDocumentDataUrl?: string;
  submissionDate: string; // ISO
  status: HierarchicalLeaveStatus;
  approvalLevel: ApprovalAuthorityLevel;
  assignedAuthorityName?: string;
  decisionReason?: string;
  decidedBy?: string;
  decidedByRole?: string;
  decidedAt?: string;
  decisionHistory: LeaveDecisionHistoryItem[];
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
  leaveCategory: string;
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
    | 'TEACHER_REGISTERED'
    | 'TEACHER_ACTIVATED'
    | 'AADHAAR_VERIFIED'
    | 'FACE_REGISTERED'
    | 'FACE_VERIFIED'
    | 'FACE_FAILED'
    | 'VPN_FLAGGED'
    | 'VPN_POLICY_UPDATED'
    | 'ATTENDANCE_MARKED'
    | 'ATTENDANCE_CHECKOUT'
    | 'ATTENDANCE_CORRECTED'
    | 'MANUAL_REVIEW_DECISION'
    | 'MEDICAL_LEAVE_APPLIED'
    | 'MEDICAL_LEAVE_REVIEWED'
    | 'ON_DUTY_APPLIED'
    | 'ON_DUTY_REVIEWED'
    | 'LEAVE_APPLIED'
    | 'LEAVE_REVIEWED'
    | 'LEAVE_FORWARDED'
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
    | 'vpn_suspicious'
    | 'missing_attendance'
    | 'leave_submitted'
    | 'leave_approved'
    | 'leave_rejected'
    | 'leave_forwarded'
    | 'leave_reviewed'
    | 'pending_reminder'
    | 'od_approved'
    | 'report_generated';
  title: string;
  message: string;
  targetRole?: string;
  targetEmployeeId?: string;
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
  schoolLatitude?: number;
  schoolLongitude?: number;
  geofenceRadiusMeters?: number;
}

export interface DigitalAttendancePersistedState {
  employees: DigitalEmployeeProfile[];
  records: DigitalAttendanceRecord[];
  hierarchicalLeaves: HierarchicalLeaveApplication[];
  medicalLeaves: MedicalLeaveApplication[];
  onDutyApplications: OnDutyApplication[];
  generalLeaves: GeneralLeaveApplication[];
  categories: AttendanceCategoryConfig[];
  auditLogs: DigitalAttendanceAuditLog[];
  securityLogs: AttendanceSecurityLog[];
  securityPolicy: VpnSecurityPolicy;
  monthLocks: MonthLockState[];
  notifications: AttendanceNotification[];
  rules: AttendanceRulesSettings;
  adminRemarksByEmployeeMonth: Record<string, string>;
}

export const DEFAULT_VPN_SECURITY_POLICY: VpnSecurityPolicy = {
  vpnAllowed: false, // Default: VPN NOT allowed for attendance verification
  vpnDetection: true,
  proxyDetection: true,
  suspiciousNetworkReview: true,
};

export const DEFAULT_ATTENDANCE_CATEGORIES: AttendanceCategoryConfig[] = [
  { code: 'P', label: 'Present', presentWeight: 1, leaveWeight: 0, isBuiltIn: true, tone: 'emerald' },
  { code: 'A', label: 'Absent', presentWeight: 0, leaveWeight: 0, isBuiltIn: true, tone: 'rose' },
  { code: 'LA', label: 'Late Arrival', presentWeight: 1, leaveWeight: 0, isBuiltIn: true, tone: 'amber' },
  { code: 'ED', label: 'Early Departure', presentWeight: 1, leaveWeight: 0, isBuiltIn: true, tone: 'amber' },
  { code: 'AL', label: 'On Approved Leave', presentWeight: 0, leaveWeight: 1, isBuiltIn: true, tone: 'sky' },
  { code: 'FH', label: '1st Half-Day Leave', presentWeight: 0.5, leaveWeight: 0.5, isBuiltIn: true, tone: 'amber' },
  { code: 'SH', label: '2nd Half-Day Leave', presentWeight: 0.5, leaveWeight: 0.5, isBuiltIn: true, tone: 'amber' },
  { code: 'ML', label: 'Medical Leave', presentWeight: 0, leaveWeight: 1, isBuiltIn: true, tone: 'sky' },
  { code: 'OD', label: 'On Duty', presentWeight: 1, leaveWeight: 0, isBuiltIn: true, tone: 'indigo' },
  { code: 'CL', label: 'Casual Leave', presentWeight: 0, leaveWeight: 1, isBuiltIn: true, tone: 'amber' },
  { code: 'EL', label: 'Earned Leave', presentWeight: 0, leaveWeight: 1, isBuiltIn: true, tone: 'amber' },
  { code: 'H', label: 'Holiday', presentWeight: 0, leaveWeight: 0, isWorkingDayExcluded: true, isBuiltIn: true, tone: 'slate' },
  { code: 'W', label: 'Weekly Off', presentWeight: 0, leaveWeight: 0, isWorkingDayExcluded: true, isBuiltIn: true, tone: 'slate' },
];
