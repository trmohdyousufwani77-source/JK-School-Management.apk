import { apiFetch } from "../utils/apiConfig";
import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  X,
  KeyRound,
  RefreshCw,
  UserCheck,
  MapPin,
  Wifi,
  WifiOff,
  Clock,
  Fingerprint,
  ShieldAlert,
} from 'lucide-react';
import type {
  AttendanceSecurityLog,
  BiometricFaceTemplate,
  DigitalAttendanceRecord,
  DigitalEmployeeProfile,
  FiveStatusAiVerification,
  HalfDayMode,
  NetworkSecurityAssessment,
  VpnSecurityPolicy,
} from '../types/digitalAttendance';
import {
  buildBiometricTemplateHash,
  sha256Hex,
} from '../utils/biometricFaceEngine';
import {
  PassiveLivenessDetection,
  type PassiveLivenessReport,
} from '../utils/passiveLivenessDetection';
import { checkNetworkSecurityStatus } from '../utils/networkMonitor';

interface FaceAttendanceVerificationModalProps {
  mode: 'register' | 'verify';
  employee: DigitalEmployeeProfile;
  actorName: string;
  schoolContext?: {
    schoolName: string;
    schoolCode?: string;
    zoneName?: string;
    schoolLatitude?: number;
    schoolLongitude?: number;
    geofenceRadiusMeters?: number;
    schoolStartTime?: string;
  };
  onClose: () => void;
  onRegistered?: (employeeId: string, template: BiometricFaceTemplate) => void;
  onVerifiedSuccess?: (payload: {
    employeeId: string;
    halfDayMode: HalfDayMode;
    verificationMethod: 'face_biometric' | 'alternative_pin';
    livenessScore: number;
    remarks?: string;
    verification?: FiveStatusAiVerification;
    networkAssessment?: NetworkSecurityAssessment;
    record?: DigitalAttendanceRecord | null;
    securityLog?: AttendanceSecurityLog | null;
  }) => void;
  onVerificationFailed?: (
    employeeId: string,
    reason: string,
    extra?: {
      verification?: FiveStatusAiVerification;
      networkAssessment?: NetworkSecurityAssessment;
      securityLog?: AttendanceSecurityLog | null;
    }
  ) => void;
}

const HALF_DAY_OPTIONS: Array<{ value: HalfDayMode; label: string; codeHint: string }> = [
  { value: 'full_present', label: 'Present Full Day', codeHint: 'P (1.0)' },
  {
    value: 'first_half_present_second_half_leave',
    label: 'First Half Present / Second Half Leave',
    codeHint: 'SH (0.5)',
  },
  {
    value: 'first_half_leave_second_half_present',
    label: 'First Half Leave / Second Half Present',
    codeHint: 'FH (0.5)',
  },
];

function getOrCreateDeviceId(): string {
  try {
    const key = 'sm_teacher_device_id_v1';
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const generated = `DEV-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    localStorage.setItem(key, generated);
    return generated;
  } catch {
    return `DEV-${Date.now().toString(36).toUpperCase()}`;
  }
}

function captureTransientJpegFrame(video: HTMLVideoElement): string {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return '';
  const canvas = document.createElement('canvas');
  const maxW = 480;
  const scale = Math.min(1, maxW / vw);
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

export const FaceAttendanceVerificationModal: React.FC<FaceAttendanceVerificationModalProps> = ({
  mode,
  employee,
  actorName,
  schoolContext,
  onClose,
  onRegistered,
  onVerifiedSuccess,
  onVerificationFailed,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraLabel, setCameraLabel] = useState<string>('');
  const [virtualCameraBlocked, setVirtualCameraBlocked] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [halfDayMode, setHalfDayMode] = useState<HalfDayMode>('full_present');

  // GPS Location state
  const [gpsStatus, setGpsStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);

  // Network & VPN Pre-check state
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkAssessment, setNetworkAssessment] = useState<NetworkSecurityAssessment | null>(null);
  const [securityPolicy, setSecurityPolicy] = useState<VpnSecurityPolicy | null>(null);

  // Liveness & 5-status verification result
  const [phase, setPhase] = useState<'idle' | 'liveness' | 'success' | 'flagged' | 'failed'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>(
    mode === 'register'
      ? 'Position your face inside the frame, confirm explicit privacy consent, and capture your encrypted face template.'
      : 'Live camera only (no gallery upload or filters). Blink or gently move your head when verification starts.'
  );
  const [livenessPrompt, setLivenessPrompt] = useState<string>(
    'Look directly at the camera, then blink or tilt your head slightly'
  );
  const [fiveStatusResult, setFiveStatusResult] = useState<FiveStatusAiVerification | null>(null);
  const [livenessReport, setLivenessReport] = useState<PassiveLivenessReport | null>(null);

  // Alternative documented attendance verification
  const [useAlternative, setUseAlternative] = useState(false);
  const [altPin, setAltPin] = useState('');
  const [altReason, setAltReason] = useState(
    'Camera unavailable / Authorized alternative verification requested'
  );
  const [altError, setAltError] = useState<string | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Run GPS + VPN/Network Pre-Check on mount via NetworkMonitor utility
  const runNetworkCheck = async () => {
    setNetworkLoading(true);
    try {
      const result = await checkNetworkSecurityStatus(false);
      setNetworkAssessment(result.assessment);
      setSecurityPolicy(result.policy);
    } catch {
      // Non-fatal fallback
    } finally {
      setNetworkLoading(false);
    }
  };

  useEffect(() => {
    runNetworkCheck();

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsCoords({
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Math.round(pos.coords.accuracy || 0),
          });
          setGpsStatus('ready');
        },
        () => {
          setGpsStatus('unavailable');
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
      );
    } else {
      setGpsStatus('unavailable');
    }
  }, []);

  // Open device live camera directly (no gallery/upload allowed)
  useEffect(() => {
    if (useAlternative) {
      stopCamera();
      return;
    }
    let cancelled = false;
    setCameraError(null);
    setCameraReady(false);
    setVirtualCameraBlocked(false);

    const openCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'Live device camera is unavailable on this browser. Use the Authorized Alternative Verification option below.'
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0];
        const trackLabel = videoTrack?.label || 'Hardware Front Camera';
        setCameraLabel(trackLabel);
        if (PassiveLivenessDetection.isVirtualCameraLabel(trackLabel)) {
          setVirtualCameraBlocked(true);
          setCameraError(
            `Virtual or software camera blocked ("${trackLabel}"). Switch to your device hardware camera.`
          );
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraReady(true);
      } catch {
        if (!cancelled) {
          setCameraError(
            'Camera permission denied or hardware camera not found. Grant camera access or use Alternative Verification.'
          );
        }
      }
    };

    openCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [useAlternative]);

  const handleCaptureAndProcess = async () => {
    if (virtualCameraBlocked) {
      setPhase('failed');
      setStatusMessage('Virtual camera software is blocked. Use a physical device camera.');
      return;
    }
    if (!videoRef.current || !cameraReady) {
      setStatusMessage('Live camera feed is not ready yet. Please wait a moment.');
      return;
    }
    if (mode === 'register' && !consentChecked) {
      setStatusMessage('Please confirm explicit privacy consent before registering your face template.');
      return;
    }

    setPhase('liveness');
    setFiveStatusResult(null);
    setLivenessReport(null);
    setStatusMessage('Capturing Frame 1/2 — hold steady inside the oval frame...');
    setLivenessPrompt('Hold steady looking at the camera...');

    const sample1 = PassiveLivenessDetection.sampleFrame(videoRef.current);
    if (!sample1 || sample1.contrastScore < PassiveLivenessDetection.MIN_CONTRAST || sample1.meanBrightness < PassiveLivenessDetection.MIN_BRIGHTNESS) {
      setPhase('failed');
      const reason =
        'Low lighting or obscured lens detected. Ensure clear lighting on your face and retry.';
      setStatusMessage(reason);
      onVerificationFailed?.(employee.employeeId, reason);
      return;
    }

    setStatusMessage('Passive Liveness Check — blink naturally or gently turn your head...');
    setLivenessPrompt('Blink or slightly tilt your head now (Frame 2/2)...');
    await new Promise((resolve) => setTimeout(resolve, 950));

    if (!videoRef.current) return;
    const sample2 = PassiveLivenessDetection.sampleFrame(videoRef.current);
    if (!sample2 || sample2.contrastScore < PassiveLivenessDetection.MIN_CONTRAST) {
      setPhase('failed');
      const reason = 'Live camera frame interrupted during passive liveness capture.';
      setStatusMessage(reason);
      onVerificationFailed?.(employee.employeeId, reason);
      return;
    }

    const passiveReport = PassiveLivenessDetection.evaluateFrames({
      frame1: sample1,
      frame2: sample2,
      cameraLabel,
      storedTemplate: employee.faceTemplate,
    });
    setLivenessReport(passiveReport);

    const motionDelta = passiveReport.motionDelta;
    const frameSelfSimilarity = passiveReport.frameSelfSimilarity;

    if (mode === 'register') {
      if (!passiveReport.isLive) {
        setPhase('failed');
        setStatusMessage(
          passiveReport.summary ||
            'Anti-spoofing liveness check failed. Please use a live camera with natural movement (no static photos).'
        );
        return;
      }

      const averaged = sample1.descriptorVector.map((v, i) =>
        Number(((v + sample2.descriptorVector[i]) / 2).toFixed(5))
      );
      const norm = Math.sqrt(averaged.reduce((acc, v) => acc + v * v, 0)) || 1;
      const normalized = averaged.map((v) => Number((v / norm).toFixed(5)));
      const templateHash = await buildBiometricTemplateHash(employee.employeeId, normalized);
      const now = new Date().toISOString();

      const template: BiometricFaceTemplate = {
        templateHash,
        descriptorVector: normalized,
        consentSignedAt: now,
        registeredAt: now,
        registeredBy: actorName,
      };

      setPhase('success');
      setStatusMessage(
        'Encrypted SHA-256 face reference template registered. Raw camera photographs are never stored.'
      );
      onRegistered?.(employee.employeeId, template);
      setTimeout(() => {
        stopCamera();
        onClose();
      }, 1100);
      return;
    }

    // VERIFY MODE — Send transient frame + PassiveLivenessDetection results + GPS + network hints to backend AI verification
    setStatusMessage('Verifying live camera authenticity, face match, geofence, and network security...');
    const hasRegisteredTemplate = passiveReport.hasStoredTemplate;
    const faceSimilarity = passiveReport.faceSimilarity;
    const liveFrameBase64 = captureTransientJpegFrame(videoRef.current);

    try {
      const resp = await apiFetch('/api/smart-attendance/verify-camera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employee.employeeId,
          employeeName: employee.name,
          schoolName: schoolContext?.schoolName || employee.schoolName || 'School',
          schoolCode: schoolContext?.schoolCode || employee.schoolCode || '',
          zoneName: schoolContext?.zoneName || employee.zoneName || 'Zone Srinagar Central',
          deviceId,
          cameraLabel,
          faceSimilarity,
          motionDelta,
          frameSelfSimilarity,
          hasRegisteredTemplate,
          liveFrameBase64,
          latitude: gpsCoords?.latitude ?? null,
          longitude: gpsCoords?.longitude ?? null,
          schoolLatitude:
            employee.authorizedLocation?.latitude ?? schoolContext?.schoolLatitude ?? 34.0837,
          schoolLongitude:
            employee.authorizedLocation?.longitude ?? schoolContext?.schoolLongitude ?? 74.7973,
          geofenceRadiusMeters:
            employee.authorizedLocation?.radiusMeters ?? schoolContext?.geofenceRadiusMeters ?? 250,
          schoolStartTime: schoolContext?.schoolStartTime || '09:30',
          networkHints: {
            webdriver: Boolean((navigator as unknown as { webdriver?: boolean }).webdriver),
            emulatorHint: /headless|phantom|selenium|playwright|emulator/i.test(navigator.userAgent || ''),
            rootedHint: false,
            timezoneMismatch: false,
          },
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || 'Server verification request failed.');
      }

      const verification: FiveStatusAiVerification = data.verification;
      const netAssessment: NetworkSecurityAssessment = data.networkAssessment;
      const record: DigitalAttendanceRecord | null = data.record || null;
      const securityLog: AttendanceSecurityLog | null = data.securityLog || null;

      setFiveStatusResult(verification);
      setNetworkAssessment(netAssessment);

      if (verification.attendanceVerificationStatus === 'Verified') {
        setPhase('success');
        setStatusMessage(
          `Attendance Verified (${verification.transactionId}). Server timestamp recorded.`
        );
        onVerifiedSuccess?.({
          employeeId: employee.employeeId,
          halfDayMode,
          verificationMethod: 'face_biometric',
          livenessScore: verification.livenessConfidence,
          verification,
          networkAssessment: netAssessment,
          record,
          securityLog,
        });
      } else if (verification.attendanceVerificationStatus === 'Flagged for Admin Review') {
        setPhase('flagged');
        setStatusMessage(
          verification.failureReason ||
            'Attempt flagged for Headmaster / Administrator manual review. Attendance was NOT auto-marked.'
        );
        onVerificationFailed?.(
          employee.employeeId,
          verification.failureReason || 'Flagged for manual review',
          { verification, networkAssessment: netAssessment, securityLog }
        );
      } else {
        setPhase('failed');
        setStatusMessage(
          verification.failureReason ||
            'AI live camera verification failed. Attendance was NOT marked. Retry or request manual verification.'
        );
        onVerificationFailed?.(
          employee.employeeId,
          verification.failureReason || 'Verification failed',
          { verification, networkAssessment: netAssessment, securityLog }
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to reach verification server. Please retry or use authorized alternative verification.';
      setPhase('failed');
      setStatusMessage(msg);
      onVerificationFailed?.(employee.employeeId, msg);
    }
  };

  const handleAlternativeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAltError(null);
    const cleanedPin = altPin.trim();
    if (cleanedPin.length < 4) {
      setAltError('Enter your 4-digit Employee PIN or authorized verification code.');
      return;
    }
    if (!altReason.trim()) {
      setAltError('Provide a documented reason for using alternative attendance verification.');
      return;
    }
    if (employee.alternativePinHash) {
      const enteredHash = await sha256Hex(`${employee.employeeId}::${cleanedPin}`);
      if (enteredHash !== employee.alternativePinHash) {
        setAltError('Alternative verification PIN does not match.');
        return;
      }
    }

    onVerifiedSuccess?.({
      employeeId: employee.employeeId,
      halfDayMode,
      verificationMethod: 'alternative_pin',
      livenessScore: 0,
      remarks: `Documented Alternative Verification: ${altReason.trim()}`,
    });
    stopCamera();
    onClose();
  };

  const statusTone = (ok: boolean, warn?: boolean) =>
    ok
      ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60'
      : warn
      ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60'
      : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {mode === 'register'
                  ? 'Register Encrypted Face Reference Template'
                  : 'AI Live Camera Attendance Verification'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {employee.name} · {employee.employeeId} · Device {deviceId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close verification modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Live Environment Bar: GPS + Network/VPN Policy Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-start gap-2.5">
              <MapPin
                className={`w-4 h-4 mt-0.5 shrink-0 ${
                  gpsStatus === 'ready'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              />
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  School Geofence GPS
                </div>
                <div className="text-slate-500 dark:text-slate-400 font-mono truncate">
                  {gpsStatus === 'loading'
                    ? 'Acquiring GPS coordinates...'
                    : gpsCoords
                    ? `${gpsCoords.latitude}, ${gpsCoords.longitude} (±${gpsCoords.accuracy}m)`
                    : 'GPS unavailable — will flag if required'}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                {networkAssessment?.riskLevel === 'Blocked_By_Policy' ? (
                  <WifiOff className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
                ) : (
                  <Wifi className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    Network & VPN Security
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 truncate">
                    {networkLoading
                      ? 'Checking network integrity...'
                      : networkAssessment
                      ? `${networkAssessment.riskLevel === 'Blocked_By_Policy' ? 'VPN/Proxy Blocked' : 'Verified Network'} · ${networkAssessment.publicIp}`
                      : 'Standard network check ready'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={runNetworkCheck}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 p-1"
                title="Re-check network"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${networkLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* VPN Blocked Policy Warning Banner */}
          {networkAssessment?.riskLevel === 'Blocked_By_Policy' && (
            <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
              <div className="space-y-1">
                <p className="font-semibold">
                  VPN / Proxy Connection Detected (Admin Policy: VPN Allowed ={' '}
                  {securityPolicy?.vpnAllowed ? 'ON' : 'OFF'})
                </p>
                <p>{networkAssessment.recommendation}</p>
              </div>
            </div>
          )}

          {/* Mode Toggle: Live Camera vs Documented Alternative Verification */}
          {mode === 'verify' && (
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUseAlternative(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    !useAlternative
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Live AI Camera Only
                </button>
                <button
                  type="button"
                  onClick={() => setUseAlternative(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    useAlternative
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Alternative Verification
                </button>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Gallery upload disabled
              </span>
            </div>
          )}

          {!useAlternative ? (
            <>
              {/* Live Video Frame — No file upload, no filters */}
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-[16/10] border border-slate-800 flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover"
                />
                {/* Face Alignment Oval */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div
                    className={`w-44 h-56 sm:w-48 sm:h-60 rounded-[50%] border-2 transition-colors ${
                      phase === 'liveness'
                        ? 'border-amber-400'
                        : phase === 'success'
                        ? 'border-emerald-400'
                        : phase === 'failed' || phase === 'flagged'
                        ? 'border-rose-400'
                        : 'border-white/75'
                    }`}
                  />
                </div>

                {/* Camera Feed Caption */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[11px] font-medium text-white">
                  <span className="px-2.5 py-1 rounded-md bg-slate-950/75 backdrop-blur-xs truncate max-w-[70%]">
                    {cameraLabel ? `Live Feed: ${cameraLabel}` : 'Initializing Hardware Camera...'}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-slate-950/75 backdrop-blur-xs">
                    Raw Feed · No Filters
                  </span>
                </div>

                {phase === 'liveness' && (
                  <div className="absolute bottom-3 left-3 right-3 px-3 py-2 rounded-lg bg-amber-500/95 text-slate-950 text-xs font-semibold text-center">
                    {livenessPrompt}
                  </div>
                )}

                {cameraError && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center text-white">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                    <p className="text-sm font-semibold mb-1">Camera Feed Unavailable</p>
                    <p className="text-xs text-slate-300 max-w-md">{cameraError}</p>
                  </div>
                )}
              </div>

              {/* Status Banner */}
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  phase === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : phase === 'flagged'
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                    : phase === 'failed'
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {phase === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                ) : phase === 'failed' || phase === 'flagged' ? (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                ) : (
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-teal-600" />
                )}
                <span>{statusMessage}</span>
              </div>

              {/* PassiveLivenessDetection Client Check Strip */}
              {livenessReport && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Passive Liveness Diagnostics:
                  </span>
                  <span>
                    Anti-Replay:{' '}
                    <strong className={livenessReport.antiReplayPassed ? 'text-emerald-600' : 'text-rose-600'}>
                      {livenessReport.antiReplayPassed ? 'Pass' : 'Flagged'}
                    </strong>
                  </span>
                  <span>
                    Anti-Screenshot:{' '}
                    <strong className={livenessReport.antiScreenshotPassed ? 'text-emerald-600' : 'text-rose-600'}>
                      {livenessReport.antiScreenshotPassed ? 'Pass' : 'Flagged'}
                    </strong>
                  </span>
                  <span>
                    Template Consistency:{' '}
                    <strong className={livenessReport.faceMatched ? 'text-emerald-600' : 'text-amber-600'}>
                      {Math.round(livenessReport.faceSimilarity * 100)}%
                    </strong>
                  </span>
                </div>
              )}

              {/* Mandatory 5-Status AI Verification Result Panel */}
              {fiveStatusResult && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/70 dark:bg-slate-900/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      5-Point Attendance Verification Result
                    </h4>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      TXN: {fiveStatusResult.transactionId}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div
                      className={`px-3 py-2 rounded-lg border flex items-center justify-between gap-2 ${statusTone(
                        fiveStatusResult.faceMatchStatus === 'Matched'
                      )}`}
                    >
                      <span className="font-medium">1. Face Match</span>
                      <span className="font-bold">
                        {fiveStatusResult.faceMatchStatus}
                        {fiveStatusResult.faceSimilarityScore !== undefined
                          ? ` (${fiveStatusResult.faceSimilarityScore}%)`
                          : ''}
                      </span>
                    </div>

                    <div
                      className={`px-3 py-2 rounded-lg border flex items-center justify-between gap-2 ${statusTone(
                        fiveStatusResult.livenessStatus === 'Verified'
                      )}`}
                    >
                      <span className="font-medium">2. Liveness Check</span>
                      <span className="font-bold">
                        {fiveStatusResult.livenessStatus} ({fiveStatusResult.livenessConfidence}%)
                      </span>
                    </div>

                    <div
                      className={`px-3 py-2 rounded-lg border flex items-center justify-between gap-2 ${statusTone(
                        fiveStatusResult.cameraAuthenticityStatus === 'Authentic Live Camera'
                      )}`}
                    >
                      <span className="font-medium">3. Camera Authenticity</span>
                      <span className="font-bold">{fiveStatusResult.cameraAuthenticityStatus}</span>
                    </div>

                    <div
                      className={`px-3 py-2 rounded-lg border flex items-center justify-between gap-2 ${statusTone(
                        fiveStatusResult.locationVerificationStatus === 'Inside School Geofence',
                        fiveStatusResult.locationVerificationStatus === 'Location Unavailable'
                      )}`}
                    >
                      <span className="font-medium">4. Location Geofence</span>
                      <span className="font-bold">
                        {fiveStatusResult.locationVerificationStatus}
                        {fiveStatusResult.distanceMeters !== null &&
                        fiveStatusResult.distanceMeters !== undefined
                          ? ` (${fiveStatusResult.distanceMeters}m)`
                          : ''}
                      </span>
                    </div>

                    <div
                      className={`sm:col-span-2 px-3 py-2.5 rounded-lg border flex items-center justify-between gap-2 ${statusTone(
                        fiveStatusResult.attendanceVerificationStatus === 'Verified',
                        fiveStatusResult.attendanceVerificationStatus === 'Flagged for Admin Review'
                      )}`}
                    >
                      <span className="font-semibold">5. Attendance Verification Status</span>
                      <span className="font-bold">
                        {fiveStatusResult.attendanceVerificationStatus}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Server Time: {new Date(fiveStatusResult.serverTimestamp).toLocaleString()}
                    </span>
                    <span className="font-mono">Device: {fiveStatusResult.deviceId}</span>
                  </div>
                </div>
              )}

              {/* Registration Privacy Consent */}
              {mode === 'register' && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>
                    <strong>Explicit Privacy Consent:</strong> I consent to generating a one-way
                    encrypted SHA-256 face descriptor template strictly for teacher attendance
                    verification. No raw face photographs or Aadhaar biometric images are stored.
                  </span>
                </label>
              )}

              {/* Attendance Shift Mode Selector (Verify Mode) */}
              {mode === 'verify' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Attendance Duty Mode
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {HALF_DAY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setHalfDayMode(opt.value)}
                        className={`p-2.5 rounded-xl border text-left transition-colors ${
                          halfDayMode === opt.value
                            ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200'
                            : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="text-xs font-semibold">{opt.codeHint}</div>
                        <div className="text-[11px] opacity-80 leading-snug">{opt.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                {phase === 'success' ? (
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      onClose();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
                  >
                    Done
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        onClose();
                      }}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!cameraReady || phase === 'liveness' || virtualCameraBlocked}
                      onClick={handleCaptureAndProcess}
                      className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 transition-colors"
                    >
                      {mode === 'register' ? (
                        <>
                          <Fingerprint className="w-4 h-4" />
                          {phase === 'liveness' ? 'Capturing Template...' : 'Capture Face Template'}
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-4 h-4" />
                          {phase === 'liveness'
                            ? 'Verifying Live Camera...'
                            : 'Verify & Mark Attendance'}
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            /* Documented Alternative Verification Workflow */
            <form onSubmit={handleAlternativeSubmit} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                <strong>Accessible Alternative Verification:</strong> Facial recognition and VPN
                alerts are never treated as sole proof of misconduct. If a camera fails or a
                medical/accessibility exception applies, teachers may submit documented alternative
                verification for Headmaster/Administrator review.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Employee Verification PIN (4+ digits)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    value={altPin}
                    onChange={(e) => setAltPin(e.target.value)}
                    placeholder="Enter 4-digit PIN"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mandatory Reason for Alternative Verification
                </label>
                <textarea
                  rows={2}
                  value={altReason}
                  onChange={(e) => setAltReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              {altError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {altError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold"
                >
                  Submit Alternative Verification
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
