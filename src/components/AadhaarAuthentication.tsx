import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  RotateCcw,
  FileCheck2,
} from 'lucide-react';
import type { DigitalEmployeeProfile } from '../types/digitalAttendance';

export interface AadhaarAuthResult {
  employeeId: string;
  maskedAadhaar: string;
  verificationRefId: string;
  consentGranted: boolean;
  consentTimestamp: string;
  providerMode: 'Mock_UIDAI_Sandbox_OTP' | 'Offline_XML_QR_Masked';
}

interface AadhaarAuthenticationProps {
  employee: DigitalEmployeeProfile;
  onVerified?: (result: AadhaarAuthResult) => void;
  onConsentRevoked?: (employeeId: string) => void;
  onToast?: (msg: string, tone?: 'success' | 'error') => void;
}

/**
 * Strictly masks any 12-digit Aadhaar string into XXXX-XXXX-1234.
 * Raw 12-digit numbers and OTPs are NEVER persisted to storage or backend logs.
 */
export function maskAadhaarNumber(input: string): string {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length < 4) return 'XXXX-XXXX-****';
  return `XXXX-XXXX-${digits.slice(-4)}`;
}

const CONSENT_STORAGE_KEY = 'sm_aadhaar_consent_records_v1';

function loadConsentRecord(employeeId: string): AadhaarAuthResult | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, AadhaarAuthResult>;
    return map[employeeId] || null;
  } catch {
    return null;
  }
}

function saveConsentRecord(result: AadhaarAuthResult): void {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, AadhaarAuthResult>) : {};
    map[result.employeeId] = result;
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

function deleteConsentRecord(employeeId: string): void {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, AadhaarAuthResult>;
    delete map[employeeId];
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export const AadhaarAuthentication: React.FC<AadhaarAuthenticationProps> = ({
  employee,
  onVerified,
  onConsentRevoked,
  onToast,
}) => {
  const [savedRecord, setSavedRecord] = useState<AadhaarAuthResult | null>(() =>
    loadConsentRecord(employee.employeeId)
  );
  const [rawAadhaar, setRawAadhaar] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [step, setStep] = useState<'input' | 'otp' | 'verified'>(() =>
    loadConsentRecord(employee.employeeId) ? 'verified' : 'input'
  );
  const [otpInput, setOtpInput] = useState('');
  const [pendingMasked, setPendingMasked] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync when teacher selection changes
  React.useEffect(() => {
    const existing = loadConsentRecord(employee.employeeId);
    setSavedRecord(existing);
    setStep(existing ? 'verified' : 'input');
    setRawAadhaar('');
    setOtpInput('');
    setErrorMsg(null);
  }, [employee.employeeId]);

  const handleRequestMockOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const digits = rawAadhaar.replace(/\D/g, '');
    if (digits.length !== 12) {
      setErrorMsg('Enter a valid 12-digit Aadhaar number to initiate masked verification.');
      return;
    }
    if (!consentChecked) {
      setErrorMsg('Explicit teacher consent is required before initiating Aadhaar verification.');
      return;
    }

    // Mask immediately and purge raw 12-digit input from memory
    const masked = maskAadhaarNumber(digits);
    setPendingMasked(masked);
    setRawAadhaar('');
    setStep('otp');
    onToast?.(
      `Sandbox OTP dispatched for ${masked}. Enter mock verification code 123456 to complete.`
    );
  };

  const handleConfirmMockOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (otpInput.trim() !== '123456') {
      setErrorMsg('Invalid sandbox OTP. Use mock code 123456 for testing verification.');
      return;
    }

    const nowIso = new Date().toISOString();
    const refId = `UIDAI-MOCK-${Math.floor(100000 + Math.random() * 900000)}`;
    const result: AadhaarAuthResult = {
      employeeId: employee.employeeId,
      maskedAadhaar: pendingMasked || employee.maskedAadhaar || 'XXXX-XXXX-0000',
      verificationRefId: refId,
      consentGranted: true,
      consentTimestamp: nowIso,
      providerMode: 'Mock_UIDAI_Sandbox_OTP',
    };

    // Purge OTP immediately — never stored
    setOtpInput('');
    saveConsentRecord(result);
    setSavedRecord(result);
    setStep('verified');
    onVerified?.(result);
    onToast?.(`Aadhaar identity verified (${result.maskedAadhaar}) with recorded consent.`);
  };

  const handleRevokeConsent = () => {
    deleteConsentRecord(employee.employeeId);
    setSavedRecord(null);
    setConsentChecked(false);
    setStep('input');
    onConsentRevoked?.(employee.employeeId);
    onToast?.('Aadhaar verification consent revoked and masked token cleared.');
  };

  const displayMasked = savedRecord?.maskedAadhaar || employee.maskedAadhaar || 'Not Verified';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-teal-600" />
            Aadhaar Authentication & Consent Management
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Sandbox / Mock UIDAI integration with strict masking (XXXX-XXXX-1234). Raw Aadhaar
            digits and OTPs are immediately discarded and never stored.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-600 dark:text-slate-300">
          {employee.name} · {displayMasked}
        </div>
      </div>

      {step === 'verified' && savedRecord ? (
        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/25 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-sm font-bold">
              <CheckCircle2 className="w-4 h-4" />
              Identity Verified & Consent Active
            </div>
            <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
              {savedRecord.maskedAadhaar} · Ref {savedRecord.verificationRefId}
            </span>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1">
              <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
              Consent Recorded: {new Date(savedRecord.consentTimestamp).toLocaleString()}
            </span>
            <span>Mode: Sandbox Mock Verification (Zero Raw Aadhaar Stored)</span>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleRevokeConsent}
              className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Revoke Consent & Clear Token
            </button>
          </div>
        </div>
      ) : step === 'otp' ? (
        <form onSubmit={handleConfirmMockOtp} className="space-y-3">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200">
            <strong>Sandbox Verification Step:</strong> Masked Aadhaar{' '}
            <span className="font-mono font-bold">{pendingMasked}</span> prepared. Enter mock OTP{' '}
            <code className="font-mono font-bold">123456</code> to simulate authorized UIDAI AUA
            verification.
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                placeholder="Enter 6-digit sandbox OTP (123456)"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
            >
              Verify OTP
            </button>
            <button
              type="button"
              onClick={() => {
                setOtpInput('');
                setStep('input');
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
            >
              Back
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleRequestMockOtp} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-7">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                12-Digit Aadhaar Number (Instantly Masked)
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={14}
                value={rawAadhaar}
                onChange={(e) => setRawAadhaar(e.target.value)}
                placeholder="Enter 12 digits — stored only as XXXX-XXXX-1234"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>
            <div className="sm:col-span-5 text-xs text-slate-500 dark:text-slate-400 py-2">
              Live Masked Preview:{' '}
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {rawAadhaar.replace(/\D/g, '').length >= 4
                  ? maskAadhaarNumber(rawAadhaar)
                  : 'XXXX-XXXX-****'}
              </span>
            </div>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-teal-600"
            />
            <span>
              <strong>Informed User Consent:</strong> I authorize masked Aadhaar verification solely
              for school teacher attendance identity confirmation. I understand I may revoke this
              consent at any time, and full Aadhaar numbers or OTPs are never stored.
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
              Production requires licensed UIDAI AUA/KUA gateway credentials.
            </span>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
            >
              Send Sandbox Verification OTP
            </button>
          </div>
        </form>
      )}

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
