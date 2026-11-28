import type { NetworkSecurityAssessment, VpnSecurityPolicy } from '../types/digitalAttendance';

export interface ClientNetworkHints {
  webdriver: boolean;
  emulatorHint: boolean;
  rootedHint: boolean;
  timezoneMismatch: boolean;
  timezone: string;
  connectionType: string;
  detectedVpnTunnel: boolean;
}

export interface NetworkMonitorResult {
  assessment: NetworkSecurityAssessment;
  policy: VpnSecurityPolicy;
  hints: ClientNetworkHints;
}

/**
 * Collects privacy-safe browser/device network hints for VPN, proxy, and environment integrity checks.
 */
export function collectClientNetworkHints(simulateVpnTunnel = false): ClientNetworkHints {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const ua = nav?.userAgent || '';
  const tz =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || '' : '';
  const connection = (nav as unknown as { connection?: { effectiveType?: string; type?: string } })
    ?.connection;

  return {
    webdriver: Boolean((nav as unknown as { webdriver?: boolean })?.webdriver),
    emulatorHint: /headless|phantom|selenium|playwright|emulator/i.test(ua),
    rootedHint: /magisk|supersu|cydia/i.test(ua),
    timezoneMismatch: false,
    timezone: tz,
    connectionType: connection?.type || connection?.effectiveType || 'standard',
    detectedVpnTunnel: simulateVpnTunnel,
  };
}

/**
 * Runs server-backed VPN, proxy, and suspicious network inspection.
 */
export async function checkNetworkSecurityStatus(
  simulateVpnTunnel = false
): Promise<NetworkMonitorResult> {
  const hints = collectClientNetworkHints(simulateVpnTunnel);
  const resp = await fetch('/api/smart-attendance/network-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(hints),
  });
  const data = await resp.json();
  if (!resp.ok || !data?.ok) {
    throw new Error(data?.error || 'Network security inspection failed.');
  }
  return {
    assessment: data.assessment as NetworkSecurityAssessment,
    policy: data.policy as VpnSecurityPolicy,
    hints,
  };
}

/**
 * Persists the Administrator VPN/Proxy Override setting on the server.
 */
export async function setVpnAdminOverride(params: {
  vpnAllowed: boolean;
  actorName: string;
  actorRole: string;
}): Promise<VpnSecurityPolicy> {
  const resp = await fetch('/api/smart-attendance/security-policy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vpnAllowed: params.vpnAllowed,
      actorName: params.actorName,
      actorRole: params.actorRole,
    }),
  });
  const data = await resp.json();
  if (!resp.ok || !data?.ok) {
    throw new Error(data?.error || 'Unable to update VPN Admin Override.');
  }
  return data.securityPolicy as VpnSecurityPolicy;
}
