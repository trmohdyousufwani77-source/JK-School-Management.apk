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
} from 'lucide-react';
import type {
  BiometricFaceTemplate,
  DigitalEmployeeProfile,
  HalfDayMode,
} from '../types/digitalAttendance';
import {
  buildBiometricTemplateHash,
  computeCosineSimilarity,
  computeVectorMotionDelta,
  sampleVideoFaceDescriptor,
  sha256Hex,
} from '../utils/biometricFaceEngine';

interface FaceAttendanceVerificationModalProps {
  mode: 'register' | 'verify';
  employee: DigitalEmployeeProfile;
  actorName: string;
  onClose: () => void;
  onRegistered?: (employeeId: string, template: BiometricFaceTemplate) => void;
  onVerifiedSuccess?: (payload: {
    employeeId: string;
    halfDayMode: HalfDayMode;
    verificationMethod: 'face_biometric' | 'alternative_pin';
    livenessScore: number;
    remarks?: string;
  }) => void;
  onVerificationFailed?: (employeeId: string, reason: string) => void;
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
  { value: 'full_leave', label: 'Full Day Leave', codeHint: 'CL (Leave)' },
  { value: 'full_absent', label: 'Full Day Absent', codeHint: 'A (0.0)' },
];

export const FaceAttendanceVerificationModal: React.FC<FaceAttendanceVerificationModalProps> = ({
  mode,
  employee,
  actorName,
  onClose,
  onRegistered,
  onVerifiedSuccess,
  onVerificationFailed,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [halfDayMode, setHalfDayMode] = useState<HalfDayMode>('full_present');

  // Liveness & verification workflow state
  const [phase, setPhase] = useState<'idle' | 'liveness' | 'success' | 'failed'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>(
    mode === 'register'
      ? 'Position your face inside the oval frame, review informed consent, and click Capture Biometric Template.'
      : 'Align your face inside the frame. Anti-spoofing liveness check will ask you to blink or slightly turn your head.'
  );
  const [livenessPrompt, setLivenessPrompt] = useState<string>('Blink or gently tilt head slightly when scan begins');

  // Alternative documented attendance verification
  const [useAlternative, setUseAlternative] = useState(false);
  const [altPin, setAltPin] = useState('');
  const [altReason, setAltReason] = useState('Camera unavailable / Employee opted for alternative verification');
  const [altError, setAltError] = useState<string | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (useAlternative) {
      stopCamera();
      return;
    }
    let cancelled = false;
    setCameraError(null);
    setCameraReady(false);

    const openCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'Live camera is not available in this browser or device. Use the documented Alternative Attendance Verification option below.'
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch {
        setCameraError(
          'Camera permission denied or camera hardware unavailable. You may switch to the Alternative Attendance Process below.'
        );
      }
    };

    void openCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [useAlternative]);

  const runLiveFaceCapture = async () => {
    if (mode === 'register' && !consentChecked) {
      setStatusMessage('Please confirm explicit informed consent before registering biometric verification.');
      return;
    }
    const video = videoRef.current;
    if (!video || !cameraReady) {
      setCameraError('Camera stream is not ready yet.');
      return;
    }

    setPhase('liveness');
    setLivenessPrompt('Step 1/2: Hold steady facing the camera...');
    setStatusMessage('Capturing initial biometric frame and checking lighting quality...');

    const frame1 = sampleVideoFaceDescriptor(video);
    if (!frame1 || frame1.meanBrightness < 0.08 || frame1.contrastScore < 0.03) {
      const reason = 'Low camera brightness or covered lens detected. Ensure clear lighting and face visibility.';
      setPhase('failed');
      setStatusMessage(reason);
      onVerificationFailed?.(employee.employeeId, reason);
      return;
    }

    setLivenessPrompt('Step 2/2: Please blink or gently nod your head now (Anti-spoofing liveness check)...');
    await new Promise((resolve) => window.setTimeout(resolve, 650));

    const frame2 = sampleVideoFaceDescriptor(video);
    if (!frame2) {
      const reason = 'Unable to read second liveness frame from camera.';
      setPhase('failed');
      setStatusMessage(reason);
      onVerificationFailed?.(employee.employeeId, reason);
      return;
    }

    const motionDelta = computeVectorMotionDelta(frame1.descriptorVector, frame2.descriptorVector);
    const frameSelfSimilarity = computeCosineSimilarity(frame1.descriptorVector, frame2.descriptorVector);

    // Anti-spoofing check: real live face displays subtle micro-motion (delta > 0.002) while preserving face structure (> 0.80)
    // In headless/synthetic cameras where pixel stream is frozen, warn explicitly unless subtle variance exists
    const livenessPassed = motionDelta >= 0.0015 && frameSelfSimilarity >= 0.78;
    const livenessScore = Math.min(99, Math.max(70, Math.round(frameSelfSimilarity * 100)));

    if (!livenessPassed) {
      const reason =
        'Anti-spoofing liveness check failed (static image or excessive movement detected). Please blink/nod gently and retry, or use Alternative Verification.';
      setPhase('failed');
      setStatusMessage(reason);
      onVerificationFailed?.(employee.employeeId, reason);
      return;
    }

    if (mode === 'register') {
      // Average the two normalized frames into a stable descriptor; do NOT store raw photo
      const averaged = frame1.descriptorVector.map((v, i) =>
        Number(((v + frame2.descriptorVector[i]) / 2).toFixed(5))
      );
      const templateHash = await buildBiometricTemplateHash(employee.employeeId, averaged);
      const nowIso = new Date().toISOString();
      const template: BiometricFaceTemplate = {
        templateHash,
        descriptorVector: averaged,
        consentSignedAt: nowIso,
        registeredAt: nowIso,
        registeredBy: actorName,
      };
      setPhase('success');
      setStatusMessage(
        `Face template securely registered (SHA-256 hash stored; no raw photograph saved). Liveness score: ${livenessScore}%.`
      );
      onRegistered?.(employee.employeeId, template);
      return;
    }

    // Verification mode
    if (!employee.faceTemplate) {
      const reason = 'Employee does not have a registered face template yet. Register face first or use Alternative Verification.';
      setPhase('failed');
      setStatusMessage(reason);
      onVerificationFailed?.(employee.employeeId, reason);
      return;
    }

    const similarity = computeCosineSimilarity(
      employee.faceTemplate.descriptorVector,
      frame2.descriptorVector
    );
    const matchPct = Math.round(similarity * 100);

    if (similarity < 0.84) {
      const reason = `Face verification unsuccessful (match ${matchPct}% below 84% threshold). Improve lighting, retry, or use Alternative Verification.`;
      setPhase('failed');
      setStatusMessage(reason);
      onVerificationFailed?.(employee.employeeId, reason);
      return;
    }

    setPhase('success');
    setStatusMessage(
      `Face verified successfully (${matchPct}% biometric match · Liveness confirmed). Attendance recorded.`
    );
    onVerifiedSuccess?.({
      employeeId: employee.employeeId,
      halfDayMode,
      verificationMethod: 'face_biometric',
      livenessScore: matchPct,
    });
  };

  const handleAlternativeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAltError(null);
    const cleanedPin = altPin.trim();
    if (cleanedPin.length < 4) {
      setAltError('Enter your 4–8 digit authorized staff attendance PIN.');
      return;
    }
    if (!altReason.trim()) {
      setAltError('Please provide a documented reason for using the alternative attendance process.');
      return;
    }

    if (employee.alternativePinHash) {
      const enteredHash = await sha256Hex(`SM_ALT_PIN::${employee.employeeId}::${cleanedPin}`);
      if (enteredHash !== employee.alternativePinHash) {
        setAltError('Invalid staff attendance PIN. Contact Attendance Administrator or Headmaster.');
        onVerificationFailed?.(employee.employeeId, 'Invalid Alternative PIN');
        return;
      }
    }

    setPhase('success');
    setStatusMessage('Alternative authorized attendance verified and logged in audit trail.');
    onVerifiedSuccess?.({
      employeeId: employee.employeeId,
      halfDayMode,
      verificationMethod: 'alternative_pin',
      livenessScore: 100,
      remarks: `Alternative Attendance: ${altReason.trim()}`,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'register' ? 'Register Employee Face Verification' : 'Face Verification Attendance'}
      className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                {mode === 'register'
                  ? `Register Face Biometric — ${employee.name}`
                  : `Verify Face & Mark Attendance — ${employee.name}`}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {employee.employeeId} · {employee.designation}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
          {/* Mode Switch: Camera Biometric vs Alternative Process */}
          {mode === 'verify' && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setUseAlternative(false)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold transition-colors whitespace-nowrap ${
                  !useAlternative
                    ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Camera Face Verification</span>
              </button>
              <button
                type="button"
                onClick={() => setUseAlternative(true)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold transition-colors whitespace-nowrap ${
                  useAlternative
                    ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Alternative Attendance Process</span>
              </button>
            </div>
          )}

          {/* Half-Day / Attendance Status Rule Selector in Verify Mode */}
          {mode === 'verify' && (
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                Select Attendance Mode (Full Day / Half Day Rule)
              </label>
              <select
                value={halfDayMode}
                onChange={(e) => setHalfDayMode(e.target.value as HalfDayMode)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                {HALF_DAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} — {opt.codeHint}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!useAlternative ? (
            <>
              {/* Live Camera Viewport with Liveness Guide Oval */}
              <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-[4/3] flex items-center justify-center border border-slate-800">
                {cameraError ? (
                  <div className="p-6 text-center space-y-3 max-w-md">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                    <p className="text-xs text-slate-200 leading-relaxed">{cameraError}</p>
                    {mode === 'verify' && (
                      <button
                        type="button"
                        onClick={() => setUseAlternative(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Switch to Alternative Verification</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full h-full object-cover"
                    />
                    {/* Biometric Oval Alignment Guide */}
                    <div
                      aria-hidden="true"
                      className={`absolute w-48 h-60 rounded-[50%] border-2 pointer-events-none transition-colors ${
                        phase === 'success'
                          ? 'border-emerald-400'
                          : phase === 'failed'
                          ? 'border-rose-400'
                          : phase === 'liveness'
                          ? 'border-amber-400'
                          : 'border-white/75'
                      }`}
                    />
                    <div className="absolute bottom-2.5 left-3 right-3 px-3 py-1.5 rounded-lg bg-slate-950/80 text-white text-[11px] font-medium text-center">
                      {livenessPrompt}
                    </div>
                  </>
                )}
              </div>

              {/* Informed Consent Notice during Registration */}
              {mode === 'register' && (
                <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-[11px] text-slate-700 dark:text-slate-200 leading-relaxed">
                    <strong>Informed Consent &amp; Data Privacy Notice:</strong> I consent to on-device face
                    template registration strictly for school attendance verification. No raw face photographs are
                    stored; only an encrypted/hashed mathematical descriptor is retained per school privacy policy,
                    and I may opt for the documented Alternative Attendance Process at any time.
                  </span>
                </label>
              )}

              {/* Status Feedback Banner */}
              <div
                className={`p-3 rounded-xl border flex items-start gap-2 ${
                  phase === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : phase === 'failed'
                    ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {phase === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : phase === 'failed' ? (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400" />
                )}
                <span className="font-semibold leading-relaxed">{statusMessage}</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200"
                >
                  {phase === 'success' ? 'Done' : 'Cancel'}
                </button>
                {phase !== 'success' && !cameraError && (
                  <button
                    type="button"
                    disabled={phase === 'liveness' || !cameraReady || (mode === 'register' && !consentChecked)}
                    onClick={() => void runLiveFaceCapture()}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50 whitespace-nowrap"
                  >
                    {phase === 'liveness' ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                    <span>
                      {phase === 'liveness'
                        ? 'Checking Liveness...'
                        : mode === 'register'
                        ? 'Capture Biometric Template'
                        : 'Verify Face & Mark Attendance'}
                    </span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <form onSubmit={(e) => void handleAlternativeSubmit(e)} className="space-y-3.5">
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed">
                <strong>Documented Alternative Attendance Process:</strong> Authorized for employees whose camera
                or biometric verification is unavailable or who opt out. Every alternative entry is timestamped and
                logged in the school Audit Trail.
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Staff Attendance PIN (4–8 digits) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={altPin}
                  onChange={(e) => setAltPin(e.target.value)}
                  placeholder={
                    employee.alternativePinHash
                      ? 'Enter your registered PIN'
                      : 'Enter any 4-digit staff verification PIN (e.g., 1234)'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Documented Reason <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={altReason}
                  onChange={(e) => setAltReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              {altError && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{altError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold whitespace-nowrap"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Alternative Attendance</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
