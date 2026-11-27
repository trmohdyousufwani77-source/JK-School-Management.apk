export const BIOMETRIC_PROTECTION_STORAGE_KEY = 'sm_global_biometric_protection_v1';
export const BIOMETRIC_CREDENTIAL_STORAGE_KEY = 'sm_global_biometric_cred_v1';
export const BIOMETRIC_FALLBACK_PIN_HASH_KEY = 'sm_global_biometric_pin_hash_v1';
export const BIOMETRIC_EXPORT_REQUEST_EVENT = 'sm:biometric-export-request';

export interface BiometricExportRequestDetail {
  actionLabel: string;
  resolve: (approved: boolean) => void;
}

export function isBiometricProtectionEnabled(): boolean {
  try {
    return localStorage.getItem(BIOMETRIC_PROTECTION_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setBiometricProtectionEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(BIOMETRIC_PROTECTION_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage quota errors
  }
}

export async function hashBiometricPin(pin: string): Promise<string> {
  const normalized = `SM_BIO_PIN_V1::${pin.trim()}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * Guards any report or sensitive student data export when Global Biometric Protection
 * is enabled in School Settings. Returns true if allowed/verified, false if cancelled.
 */
export function guardSensitiveExport(actionLabel: string): Promise<boolean> {
  if (!isBiometricProtectionEnabled()) {
    return Promise.resolve(true);
  }
  if (typeof window === 'undefined') {
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve) => {
    const event = new CustomEvent<BiometricExportRequestDetail>(BIOMETRIC_EXPORT_REQUEST_EVENT, {
      detail: { actionLabel, resolve },
    });
    window.dispatchEvent(event);
  });
}
