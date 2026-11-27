import React, { useEffect, useState } from 'react';
import { Fingerprint, ShieldCheck, Lock, X, AlertCircle, KeyRound, CheckCircle2 } from 'lucide-react';
import {
  BIOMETRIC_CREDENTIAL_STORAGE_KEY,
  BIOMETRIC_EXPORT_REQUEST_EVENT,
  BIOMETRIC_FALLBACK_PIN_HASH_KEY,
  BiometricExportRequestDetail,
  hashBiometricPin,
} from '../utils/biometricProtection';

function randomBytes(len: number): Uint8Array {
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface SchoolMasterAndroidBiometricBridge {
  authenticateExport?: (actionLabel: string, callbackName: string) => void;
  authenticateGradeModule?: (moduleTitle: string, callbackName: string) => void;
}

function getAndroidBiometricBridge(): SchoolMasterAndroidBiometricBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SchoolMasterAndroidBiometric?: SchoolMasterAndroidBiometricBridge;
  };
  return w.SchoolMasterAndroidBiometric || null;
}

export const GlobalBiometricExportModal: React.FC<{ actorName?: string }> = ({ actorName = 'Teacher' }) => {
  const [pending, setPending] = useState<BiometricExportRequestDetail | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [showPinFallback, setShowPinFallback] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [hasStoredPin, setHasStoredPin] = useState<boolean>(false);

  useEffect(() => {
    const handler = (ev: Event) => {
      const custom = ev as CustomEvent<BiometricExportRequestDetail>;
      if (!custom.detail) return;
      setPending(custom.detail);
      setStatusMsg(null);
      setErrorMsg(null);
      setPinInput('');
      setNewPinInput('');
      setShowPinFallback(false);
      try {
        setHasStoredPin(Boolean(localStorage.getItem(BIOMETRIC_FALLBACK_PIN_HASH_KEY)));
      } catch {
        setHasStoredPin(false);
      }
    };
    window.addEventListener(BIOMETRIC_EXPORT_REQUEST_EVENT, handler);
    return () => window.removeEventListener(BIOMETRIC_EXPORT_REQUEST_EVENT, handler);
  }, []);

  if (!pending) return null;

  const closeWithResult = (approved: boolean) => {
    const resolver = pending.resolve;
    setPending(null);
    setIsVerifying(false);
    setErrorMsg(null);
    setStatusMsg(null);
    resolver(approved);
  };

  const handleTriggerDeviceBiometric = async () => {
    setErrorMsg(null);
    setIsVerifying(true);

    // 1. Prefer Native Android androidx.biometric:biometric BiometricPrompt bridge when available
    const androidBridge = getAndroidBiometricBridge();
    if (androidBridge && (androidBridge.authenticateExport || androidBridge.authenticateGradeModule)) {
      setStatusMsg('Launching AndroidX BiometricPrompt (androidx.biometric:biometric)...');
      try {
        const nativeResult = await new Promise<{ ok: boolean; detail: string }>((resolve) => {
          const cbName = `smBioExportCb_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
          const winRecord = window as unknown as Record<string, unknown>;
          const timeoutId = window.setTimeout(() => {
            delete winRecord[cbName];
            resolve({ ok: false, detail: 'Android biometric prompt timed out.' });
          }, 45000);

          winRecord[cbName] = (ok: boolean, detail: string) => {
            window.clearTimeout(timeoutId);
            delete winRecord[cbName];
            resolve({ ok: Boolean(ok), detail: String(detail || '') });
          };

          if (androidBridge.authenticateExport) {
            androidBridge.authenticateExport(pending.actionLabel, cbName);
          } else if (androidBridge.authenticateGradeModule) {
            androidBridge.authenticateGradeModule(`Export: ${pending.actionLabel}`, cbName);
          }
        });

        if (nativeResult.ok) {
          setStatusMsg('Android biometric authentication verified. Starting export...');
          window.setTimeout(() => closeWithResult(true), 200);
          return;
        }
        throw new Error(nativeResult.detail || 'Android biometric authentication was cancelled.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Android biometric verification failed.';
        setErrorMsg(`${msg} You may retry device biometrics or use your Authorized Export PIN.`);
        setStatusMsg(null);
        setIsVerifying(false);
        setShowPinFallback(true);
        return;
      }
    }

    // 2. Web / iOS / Windows Hello WebAuthn Platform Authenticator
    setStatusMsg('Prompting device biometric authenticator (Fingerprint / Face ID / Windows Hello)...');

    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) {
        throw new Error('WebAuthn platform authenticator is not supported in this browser context.');
      }

      const storedCredId = localStorage.getItem(BIOMETRIC_CREDENTIAL_STORAGE_KEY);
      if (storedCredId) {
        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge: randomBytes(32) as BufferSource,
            allowCredentials: [
              {
                id: fromBase64Url(storedCredId) as BufferSource,
                type: 'public-key',
                transports: ['internal'],
              },
            ],
            userVerification: 'required',
            timeout: 45000,
          },
        });
        if (!assertion) {
          throw new Error('Biometric verification did not return a valid assertion.');
        }
      } else {
        const created = (await navigator.credentials.create({
          publicKey: {
            challenge: randomBytes(32) as BufferSource,
            rp: { name: 'SchoolMaster AI' },
            user: {
              id: randomBytes(16) as BufferSource,
              name: actorName,
              displayName: actorName,
            },
            pubKeyCredParams: [
              { alg: -7, type: 'public-key' },
              { alg: -257, type: 'public-key' },
            ],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'required',
            },
            timeout: 45000,
          },
        })) as PublicKeyCredential | null;

        if (!created) {
          throw new Error('Biometric registration was cancelled.');
        }
        try {
          localStorage.setItem(BIOMETRIC_CREDENTIAL_STORAGE_KEY, toBase64Url(created.rawId));
        } catch {
          // Non-fatal
        }
      }

      setStatusMsg('Biometric authentication verified. Starting export...');
      window.setTimeout(() => closeWithResult(true), 250);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Device biometric prompt was cancelled or unavailable.';
      setErrorMsg(`${msg} You may retry biometric verification or use your Authorized Export PIN.`);
      setStatusMsg(null);
      setIsVerifying(false);
      setShowPinFallback(true);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!hasStoredPin) {
      if (newPinInput.trim().length < 4) {
        setErrorMsg('Please set an Authorized Export PIN of at least 4 digits.');
        return;
      }
      const hashed = await hashBiometricPin(newPinInput);
      try {
        localStorage.setItem(BIOMETRIC_FALLBACK_PIN_HASH_KEY, hashed);
      } catch {
        // ignore
      }
      setHasStoredPin(true);
      setStatusMsg('Authorized Export PIN enrolled and verified. Proceeding with export...');
      window.setTimeout(() => closeWithResult(true), 250);
      return;
    }

    const stored = localStorage.getItem(BIOMETRIC_FALLBACK_PIN_HASH_KEY) || '';
    const candidate = await hashBiometricPin(pinInput);
    if (candidate !== stored) {
      setErrorMsg('Incorrect Authorized Export PIN. Export remains locked.');
      return;
    }
    setStatusMsg('Authorized Export PIN verified. Starting export...');
    window.setTimeout(() => closeWithResult(true), 250);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Biometric Export Authentication"
      data-testid="biometric-export-modal"
      className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
              <Fingerprint className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold tracking-tight">Biometric Protection Required</h3>
              <p className="text-[11px] text-slate-300">Authenticate before exporting sensitive school data</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => closeWithResult(false)}
            aria-label="Cancel biometric verification"
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
              <Lock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Protected Export Action</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 font-semibold">{pending.actionLabel}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Global Biometric Protection is active in School Settings. Verify your identity with Fingerprint, Face ID, Windows Hello, or your authorized device PIN.
            </p>
          </div>

          {statusMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="button"
            data-testid="biometric-verify-device-btn"
            disabled={isVerifying}
            onClick={() => void handleTriggerDeviceBiometric()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition-colors disabled:opacity-60"
          >
            <Fingerprint className="w-4 h-4" />
            <span>{isVerifying ? 'Verifying Biometrics...' : 'Authenticate with Device Biometrics'}</span>
          </button>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            {!showPinFallback ? (
              <button
                type="button"
                onClick={() => setShowPinFallback(true)}
                className="w-full text-center text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 inline-flex items-center justify-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Use Authorized Export PIN Fallback</span>
              </button>
            ) : (
              <form onSubmit={(e) => void handleVerifyPin(e)} className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  {hasStoredPin ? 'Enter Authorized Export PIN' : 'Set 4+ Digit Authorized Export PIN (One-Time)'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={hasStoredPin ? pinInput : newPinInput}
                    onChange={(e) => (hasStoredPin ? setPinInput(e.target.value) : setNewPinInput(e.target.value))}
                    placeholder={hasStoredPin ? 'Enter PIN...' : 'Create 4–8 digit PIN...'}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 text-white text-xs font-bold whitespace-nowrap"
                  >
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {hasStoredPin ? 'Verify & Export' : 'Save & Export'}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
