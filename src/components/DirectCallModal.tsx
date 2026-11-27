import React, { useState } from 'react';
import { Phone, Copy, Check, X, AlertTriangle, ShieldCheck, User } from 'lucide-react';

export interface DirectCallTarget {
  studentName: string;
  admissionNumber?: string;
  classSection?: string;
  parentName: string;
  phoneNumber: string;
}

export interface PhoneValidationResult {
  valid: boolean;
  display: string;
  telHref: string;
  reason?: string;
}

/**
 * Validates Indian and international mobile numbers (supporting country codes like +91).
 */
export function validateAndFormatPhoneNumber(raw: string): PhoneValidationResult {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return { valid: false, display: 'Not registered', telHref: '', reason: 'No mobile number registered for this parent/guardian.' };
  }

  // Strip spaces, dashes, parentheses while preserving a leading '+'
  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return {
      valid: false,
      display: trimmed,
      telHref: '',
      reason: 'Mobile number must contain between 10 and 15 digits (including optional country code).',
    };
  }

  let e164 = '';
  if (hasPlus) {
    e164 = `+${digitsOnly}`;
  } else if (digitsOnly.length === 10) {
    e164 = `+91${digitsOnly}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    e164 = `+91${digitsOnly.slice(1)}`;
  } else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    e164 = `+${digitsOnly}`;
  } else {
    e164 = `+${digitsOnly}`;
  }

  const display =
    e164.startsWith('+91') && e164.length === 13
      ? `+91 ${e164.slice(3, 8)} ${e164.slice(8)}`
      : e164;

  return {
    valid: true,
    display,
    telHref: `tel:${e164}`,
  };
}

interface DirectCallModalProps {
  target: DirectCallTarget | null;
  onClose: () => void;
}

export const DirectCallModal: React.FC<DirectCallModalProps> = ({ target, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!target) return null;

  const validation = validateAndFormatPhoneNumber(target.phoneNumber);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(validation.valid ? validation.display.replace(/\s+/g, '') : target.phoneNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm Parent Mobile Call"
      data-testid="direct-call-modal"
      className="fixed inset-0 z-[90] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-emerald-700 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Phone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold">Confirm Direct Mobile Call</h3>
              <p className="text-[11px] text-emerald-100">Opens device phone dialer (Android ACTION_DIAL / iOS / Desktop)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close call dialog"
            className="p-1.5 rounded-lg text-emerald-100 hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
              <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>{target.studentName}</span>
              {target.classSection && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  · {target.classSection}
                </span>
              )}
            </div>
            <div className="text-slate-600 dark:text-slate-300">
              Parent / Guardian: <strong className="text-slate-900 dark:text-white">{target.parentName || 'Registered Guardian'}</strong>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <div>
                <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Registered Mobile Number</div>
                <div className="text-base font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                  {validation.display}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {!validation.valid ? (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs font-semibold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{validation.reason}</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Your device&apos;s built-in dialer will open with this validated number pre-filled so you remain in full control before placing the call.
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            {validation.valid && (
              <a
                href={validation.telHref}
                data-testid="direct-call-confirm-link"
                onClick={() => window.setTimeout(onClose, 200)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition-colors whitespace-nowrap"
              >
                <Phone className="w-4 h-4" />
                <span>Open Dialer &amp; Call</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
