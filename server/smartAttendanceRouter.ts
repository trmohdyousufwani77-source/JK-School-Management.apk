import type { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';

const SMART_ATT_STORE_PATH = path.resolve(process.cwd(), '.smart-attendance-store.json');

interface SmartAttendanceStore {
  teachers: Array<Record<string, any>>;
  records: Array<Record<string, any>>;
  hierarchicalLeaves: Array<Record<string, any>>;
  securityLogs: Array<Record<string, any>>;
  notifications: Array<Record<string, any>>;
  auditLogs: Array<Record<string, any>>;
  securityPolicy: {
    vpnAllowed: boolean;
    vpnDetection: boolean;
    proxyDetection: boolean;
    suspiciousNetworkReview: boolean;
    updatedBy?: string;
    updatedAt?: string;
  };
}

const DEFAULT_STORE: SmartAttendanceStore = {
  teachers: [],
  records: [],
  hierarchicalLeaves: [],
  securityLogs: [],
  notifications: [],
  auditLogs: [],
  securityPolicy: {
    vpnAllowed: false,
    vpnDetection: true,
    proxyDetection: true,
    suspiciousNetworkReview: true,
    updatedBy: 'System Default Policy',
    updatedAt: new Date().toISOString(),
  },
};

function readSmartAttendanceStore(): SmartAttendanceStore {
  try {
    if (fs.existsSync(SMART_ATT_STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(SMART_ATT_STORE_PATH, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        return {
          teachers: Array.isArray(parsed.teachers) ? parsed.teachers : [],
          records: Array.isArray(parsed.records) ? parsed.records : [],
          hierarchicalLeaves: Array.isArray(parsed.hierarchicalLeaves) ? parsed.hierarchicalLeaves : [],
          securityLogs: Array.isArray(parsed.securityLogs) ? parsed.securityLogs : [],
          notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
          auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
          securityPolicy: {
            vpnAllowed: Boolean(parsed.securityPolicy?.vpnAllowed ?? false),
            vpnDetection: Boolean(parsed.securityPolicy?.vpnDetection ?? true),
            proxyDetection: Boolean(parsed.securityPolicy?.proxyDetection ?? true),
            suspiciousNetworkReview: Boolean(parsed.securityPolicy?.suspiciousNetworkReview ?? true),
            updatedBy: parsed.securityPolicy?.updatedBy || 'System Default Policy',
            updatedAt: parsed.securityPolicy?.updatedAt || new Date().toISOString(),
          },
        };
      }
    }
  } catch {
    // Fallback to clean store
  }
  return { ...DEFAULT_STORE };
}

function writeSmartAttendanceStore(store: SmartAttendanceStore): void {
  try {
    fs.writeFileSync(SMART_ATT_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Unable to persist smart attendance store:', err);
  }
}

// Simple sliding-window rate limiter per IP for sensitive verification endpoints
const rateBucket = new Map<string, number[]>();
function isRateLimited(ip: string, maxRequests = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (rateBucket.get(ip) || []).filter((ts) => now - ts < windowMs);
  if (list.length >= maxRequests) {
    rateBucket.set(ip, list);
    return true;
  }
  list.push(now);
  rateBucket.set(ip, list);
  return false;
}

function extractClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0]).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

function maskAadhaarServerSafe(rawOrMasked: string): string {
  const digits = String(rawOrMasked || '').replace(/\D/g, '');
  if (digits.length >= 4) {
    return `XXXX-XXXX-${digits.slice(-4)}`;
  }
  return 'XXXX-XXXX-****';
}

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function enumerateDatesInclusiveServer(fromDate: string, toDate: string): string[] {
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const out: string[] = [];
  const cur = new Date(start);
  let guard = 0;
  while (cur <= end && guard < 120) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard++;
  }
  return out;
}

const VIRTUAL_CAMERA_PATTERN =
  /obs|manycam|snap\s*camera|droidcam|splitcam|camtwist|virtual|screen\s*capture|fake\s*device|youcam|epoccam|iriun|xsplit|vcam/i;

async function evaluateNetworkSecurity(
  req: Request,
  clientHints: Record<string, any>,
  policy: SmartAttendanceStore['securityPolicy']
) {
  const publicIp = extractClientIp(req);
  const xffRaw = String(req.headers['x-forwarded-for'] || '');
  const viaHeader = String(req.headers['via'] || '');
  const forwardedHeader = String(req.headers['forwarded'] || '');
  const proxyConnHeader = String(req.headers['proxy-connection'] || req.headers['x-proxy-id'] || '');
  const hopCount = xffRaw ? xffRaw.split(',').filter((p) => p.trim()).length : 1;

  const signals: string[] = [];
  let vpnDetected = false;
  let proxyDetected = false;
  let suspiciousIp = false;
  let ispOrOrg = 'Standard Broadband / Mobile Carrier';
  let providerMode: 'Built-in Header & Environment Intelligence' | 'External IP Intelligence API' =
    'Built-in Header & Environment Intelligence';

  // Client-side environment & device integrity indicators
  const emulatorDetected = Boolean(clientHints?.webdriver || clientHints?.emulatorHint);
  const rootedOrJailbrokenHint = Boolean(clientHints?.rootedHint);
  const simulateVpnFlag = Boolean(clientHints?.detectedVpnTunnel);
  const timezoneMismatch = Boolean(clientHints?.timezoneMismatch);

  if (policy.proxyDetection && (viaHeader || proxyConnHeader || hopCount > 3)) {
    proxyDetected = true;
    signals.push(
      viaHeader || proxyConnHeader
        ? 'HTTP proxy forwarding header detected on connection.'
        : `Multi-hop proxy chain detected (${hopCount} hops).`
    );
  }
  if (forwardedHeader && /by=.*proxy/i.test(forwardedHeader) && policy.proxyDetection) {
    proxyDetected = true;
    signals.push('Forwarded proxy hop identified.');
  }
  if (policy.vpnDetection && simulateVpnFlag) {
    vpnDetected = true;
    signals.push('Encrypted VPN tunnel interface detected on network connection.');
  }
  if (policy.vpnDetection && timezoneMismatch) {
    suspiciousIp = true;
    signals.push('Client timezone differs significantly from expected school region.');
  }
  if (emulatorDetected) {
    signals.push('Automated WebDriver or virtual emulator environment indicator detected.');
  }
  if (rootedOrJailbrokenHint) {
    signals.push('Modified / rooted device environment indicator detected.');
  }

  // Optional External IP Intelligence Provider (SSRF-safe fixed hostname: ipinfo.io)
  const ipinfoToken = (process.env.IPINFO_TOKEN || '').trim();
  const isPrivateIp =
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd|fe80)/i.test(publicIp);
  if (ipinfoToken && !isPrivateIp && /^[0-9a-fA-F.:]+$/.test(publicIp)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const url = `https://ipinfo.io/${encodeURIComponent(publicIp)}?token=${encodeURIComponent(ipinfoToken)}`;
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) {
        const intel: any = await resp.json();
        providerMode = 'External IP Intelligence API';
        if (intel?.org) ispOrOrg = String(intel.org).slice(0, 120);
        if (intel?.privacy?.vpn && policy.vpnDetection) {
          vpnDetected = true;
          signals.push(`IP intelligence flagged VPN network (${ispOrOrg}).`);
        }
        if ((intel?.privacy?.proxy || intel?.privacy?.tor) && policy.proxyDetection) {
          proxyDetected = true;
          signals.push('IP intelligence flagged anonymous proxy/Tor exit node.');
        }
        if (intel?.privacy?.hosting) {
          suspiciousIp = true;
          signals.push('Connection originates from cloud/datacenter IP range.');
        }
      }
    } catch {
      // Gracefully continue with built-in header/device checks
    }
  }

  const flaggedByNetwork = vpnDetected || proxyDetected || suspiciousIp;
  const blockedByPolicy = flaggedByNetwork && !policy.vpnAllowed;

  let riskLevel: 'Low' | 'Elevated' | 'Blocked_By_Policy' = 'Low';
  if (blockedByPolicy) {
    riskLevel = 'Blocked_By_Policy';
  } else if (flaggedByNetwork || emulatorDetected || rootedOrJailbrokenHint) {
    riskLevel = 'Elevated';
  }

  const recommendation = blockedByPolicy
    ? 'VPN or proxy connection detected while VPN attendance is disabled. Switch to an approved school Wi-Fi or mobile network, or submit for Headmaster/Admin manual review.'
    : flaggedByNetwork
    ? 'Network anomaly noted and logged for audit review (VPN allowed policy is enabled).'
    : 'Network verified with no VPN or proxy anomalies detected.';

  return {
    checkedAt: new Date().toISOString(),
    publicIp,
    ispOrOrg,
    vpnDetected,
    proxyDetected,
    suspiciousIp,
    rootedOrJailbrokenHint,
    emulatorDetected,
    riskLevel,
    signals,
    providerMode,
    recommendation,
  };
}

export function registerSmartAttendanceRoutes(app: Express): void {
  // 1. Load complete persistent Smart Digital Attendance state
  app.get('/api/smart-attendance/state', (_req: Request, res: Response) => {
    const store = readSmartAttendanceStore();
    return res.json({ ok: true, state: store });
  });

  // 2. Update Admin VPN & Network Security Policy
  app.put('/api/smart-attendance/security-policy', (req: Request, res: Response) => {
    const body = req.body || {};
    const store = readSmartAttendanceStore();
    const actorName = String(body.actorName || 'Super Administrator').trim().slice(0, 120);
    const actorRole = String(body.actorRole || 'Super Administrator').trim().slice(0, 60);

    const updatedPolicy = {
      vpnAllowed: typeof body.vpnAllowed === 'boolean' ? body.vpnAllowed : store.securityPolicy.vpnAllowed,
      vpnDetection: typeof body.vpnDetection === 'boolean' ? body.vpnDetection : store.securityPolicy.vpnDetection,
      proxyDetection: typeof body.proxyDetection === 'boolean' ? body.proxyDetection : store.securityPolicy.proxyDetection,
      suspiciousNetworkReview:
        typeof body.suspiciousNetworkReview === 'boolean'
          ? body.suspiciousNetworkReview
          : store.securityPolicy.suspiciousNetworkReview,
      updatedBy: actorName,
      updatedAt: new Date().toISOString(),
    };

    store.securityPolicy = updatedPolicy;
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: updatedPolicy.updatedAt,
      actorName,
      actorRole,
      action: 'VPN_POLICY_UPDATED',
      newValue: `VPN Allowed: ${updatedPolicy.vpnAllowed ? 'ON' : 'OFF'}, VPN Detection: ${updatedPolicy.vpnDetection ? 'ON' : 'OFF'}, Proxy Detection: ${updatedPolicy.proxyDetection ? 'ON' : 'OFF'}`,
      reason: 'Administrator updated VPN & network security verification policy.',
    });
    store.auditLogs = store.auditLogs.slice(0, 200);
    writeSmartAttendanceStore(store);

    return res.json({ ok: true, securityPolicy: updatedPolicy });
  });

  // 3. Teacher Registration with Privacy-Compliant Masked Aadhaar Verification
  app.post('/api/smart-attendance/register-teacher', (req: Request, res: Response) => {
    const body = req.body || {};
    const name = String(body.name || '').trim().slice(0, 140);
    const employeeId = String(body.employeeId || '').trim().slice(0, 60);
    const schoolName = String(body.schoolName || '').trim().slice(0, 180);
    const schoolCode = String(body.schoolCode || '').trim().slice(0, 40);
    const designation = String(body.designation || 'Teacher').trim().slice(0, 100);
    const department = String(body.department || 'Academics').trim().slice(0, 100);
    const mobileNumber = String(body.mobileNumber || '').trim().slice(0, 24);
    const email = String(body.email || '').trim().slice(0, 140);
    const consentConfirmed = Boolean(body.consentConfirmed);

    if (!name || !employeeId || !schoolName || !mobileNumber) {
      return res.status(400).json({
        ok: false,
        error: 'Teacher Full Name, Employee ID, School Name, and Registered Mobile Number are required.',
      });
    }
    if (!consentConfirmed) {
      return res.status(400).json({
        ok: false,
        error: 'Explicit user consent is mandatory before identity verification and teacher registration.',
      });
    }

    // Strictly enforce Aadhaar privacy: NEVER persist raw 12-digit Aadhaar, OTPs, or biometrics
    const verificationMode = body.verificationMode === 'alternative' ? 'alternative' : 'aadhaar_offline';
    let aadhaarStatus: 'Verified' | 'Alternative_ID' | 'Pending' = 'Pending';
    let maskedAadhaar: string | undefined;
    let aadhaarRefId: string | undefined;
    let alternativeIdType: string | undefined;
    let alternativeIdRef: string | undefined;

    if (verificationMode === 'aadhaar_offline') {
      const digitsOnly = String(body.aadhaarDigitsForMasking || '').replace(/\D/g, '');
      if (digitsOnly.length !== 12) {
        return res.status(400).json({
          ok: false,
          error: 'Enter a valid 12-digit Aadhaar number for offline verification (only the last 4 digits are masked and stored).',
        });
      }
      maskedAadhaar = maskAadhaarServerSafe(digitsOnly);
      aadhaarRefId =
        String(body.aadhaarRefId || '').trim().slice(0, 64) ||
        `UIDAI-OFF-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      aadhaarStatus = 'Verified';
    } else {
      alternativeIdType = String(body.alternativeIdType || 'Employee Service ID / CPIS').trim().slice(0, 80);
      alternativeIdRef = String(body.alternativeIdRef || '').trim().slice(0, 64);
      if (!alternativeIdRef) {
        return res.status(400).json({
          ok: false,
          error: 'Please enter the Alternative Authorized ID reference number.',
        });
      }
      aadhaarStatus = 'Alternative_ID';
    }

    const store = readSmartAttendanceStore();
    const now = new Date().toISOString();
    const id = `tch-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    const radiusMeters = Math.min(2000, Math.max(50, Number(body.radiusMeters) || 250));

    const teacherRecord = {
      id,
      employeeId,
      name,
      designation,
      department,
      subject: String(body.subject || department || 'General').trim().slice(0, 80),
      mobileNumber,
      email,
      schoolName,
      schoolCode,
      zoneName: String(body.zoneName || 'Zone Srinagar Central').trim().slice(0, 100),
      districtName: String(body.districtName || 'Srinagar').trim().slice(0, 100),
      dateOfJoining: String(body.dateOfJoining || now.slice(0, 10)).slice(0, 20),
      photoDataUrl:
        typeof body.photoDataUrl === 'string' && body.photoDataUrl.startsWith('data:image/')
          ? body.photoDataUrl.slice(0, 400_000)
          : undefined,
      employmentStatus: 'Active',
      accountStatus: 'Pending_Activation',
      staffCategory: 'Teaching Staff',
      accountRole:
        /head|principal/i.test(designation) ? 'Headmaster / Principal' : 'Teacher',
      aadhaarStatus,
      maskedAadhaar,
      aadhaarRefId,
      aadhaarProvider:
        verificationMode === 'aadhaar_offline' ? 'UIDAI_Offline_XML_QR' : 'Alternative_ID',
      aadhaarConsentSignedAt: now,
      alternativeIdType,
      alternativeIdRef,
      authorizedLocation:
        Number.isFinite(lat) && Number.isFinite(lng)
          ? {
              latitude: lat,
              longitude: lng,
              radiusMeters,
              addressLabel: String(body.locationLabel || schoolName).trim().slice(0, 180),
            }
          : {
              latitude: 34.0837,
              longitude: 74.7973,
              radiusMeters,
              addressLabel: schoolName,
            },
      faceTemplate: null,
      leaveBalances: { CL: 12, EL: 15, ML: 10 },
      createdAt: now,
    };

    store.teachers.unshift(teacherRecord);
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: now,
      actorName: name,
      actorRole: teacherRecord.accountRole,
      action: 'TEACHER_REGISTERED',
      targetEmployeeId: employeeId,
      newValue:
        aadhaarStatus === 'Verified'
          ? `Registered with masked Aadhaar ${maskedAadhaar} (Ref: ${aadhaarRefId}) — Pending Admin Activation`
          : `Registered with alternative ID (${alternativeIdType}) — Pending Admin Activation`,
      reason: 'Self/Admin teacher onboarding with explicit privacy consent.',
    });
    store.notifications.unshift({
      id: `ntf-${Date.now()}`,
      kind: 'pending_reminder',
      title: 'New Teacher Registration Pending Activation',
      message: `${name} (${employeeId}, ${schoolName}) registered with ${aadhaarStatus === 'Verified' ? `masked Aadhaar ${maskedAadhaar}` : alternativeIdType}. Administrator activation required.`,
      targetRole: 'Super Administrator',
      timestamp: now,
      read: false,
    });
    writeSmartAttendanceStore(store);

    return res.status(201).json({ ok: true, teacher: teacherRecord });
  });

  // 4. Administrator Teacher Account Activation
  app.post('/api/smart-attendance/activate-teacher/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid teacher identifier.' });
    }
    const body = req.body || {};
    const status = body.accountStatus === 'Suspended' ? 'Suspended' : 'Active';
    const actorName = String(body.actorName || 'Super Administrator').trim().slice(0, 120);
    const actorRole = String(body.actorRole || 'Super Administrator').trim().slice(0, 60);

    const store = readSmartAttendanceStore();
    const idx = store.teachers.findIndex((t) => t.id === id || t.employeeId === id);
    const now = new Date().toISOString();
    if (idx >= 0) {
      store.teachers[idx] = {
        ...store.teachers[idx],
        accountStatus: status,
        activatedBy: actorName,
        activatedAt: now,
      };
    }
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: now,
      actorName,
      actorRole,
      action: 'TEACHER_ACTIVATED',
      targetEmployeeId: idx >= 0 ? store.teachers[idx].employeeId : id,
      newValue: status,
      reason: `Administrator updated teacher account activation status to ${status}.`,
    });
    writeSmartAttendanceStore(store);
    return res.json({ ok: true, teacher: idx >= 0 ? store.teachers[idx] : null, accountStatus: status });
  });

  // 5. Real-Time VPN, Proxy & Network Anomaly Check
  app.post('/api/smart-attendance/network-check', async (req: Request, res: Response) => {
    const clientIp = extractClientIp(req);
    if (isRateLimited(`net:${clientIp}`, 40, 60_000)) {
      return res.status(429).json({ ok: false, error: 'Too many network verification requests. Please wait a moment.' });
    }
    const store = readSmartAttendanceStore();
    const assessment = await evaluateNetworkSecurity(req, req.body || {}, store.securityPolicy);
    return res.json({
      ok: true,
      assessment,
      policy: store.securityPolicy,
    });
  });

  // 6. AI Live Camera Attendance Verification (5-Status Result + Geofence + VPN + Gemini Anti-Replay)
  app.post('/api/smart-attendance/verify-camera', async (req: Request, res: Response) => {
    const clientIp = extractClientIp(req);
    if (isRateLimited(`cam:${clientIp}`, 25, 60_000)) {
      return res.status(429).json({ ok: false, error: 'Too many attendance verification attempts. Please wait a minute.' });
    }

    const body = req.body || {};
    const employeeId = String(body.employeeId || '').trim().slice(0, 64);
    const employeeName = String(body.employeeName || 'Teacher').trim().slice(0, 140);
    const schoolName = String(body.schoolName || 'School').trim().slice(0, 180);
    const schoolCode = String(body.schoolCode || '').trim().slice(0, 40);
    const zoneName = String(body.zoneName || 'Zone Srinagar Central').trim().slice(0, 100);
    const deviceId = String(body.deviceId || `DEV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`).slice(0, 80);
    const cameraLabel = String(body.cameraLabel || '').trim().slice(0, 160);
    const clientFaceSimilarity = Number(body.faceSimilarity ?? 0);
    const clientMotionDelta = Number(body.motionDelta ?? 0);
    const clientFrameSelfSimilarity = Number(body.frameSelfSimilarity ?? 0);
    const hasRegisteredTemplate = Boolean(body.hasRegisteredTemplate);
    const liveFrameBase64 = typeof body.liveFrameBase64 === 'string' ? body.liveFrameBase64 : '';

    const gpsLat = body.latitude !== undefined && body.latitude !== null ? Number(body.latitude) : null;
    const gpsLng = body.longitude !== undefined && body.longitude !== null ? Number(body.longitude) : null;
    const schoolLat = Number(body.schoolLatitude ?? 34.0837);
    const schoolLng = Number(body.schoolLongitude ?? 74.7973);
    const geofenceRadius = Math.min(2000, Math.max(50, Number(body.geofenceRadiusMeters) || 250));

    if (!employeeId) {
      return res.status(400).json({ ok: false, error: 'Employee ID is required for attendance verification.' });
    }

    const store = readSmartAttendanceStore();
    const serverTimestamp = new Date().toISOString();
    const todayDate = serverTimestamp.slice(0, 10);
    const transactionId = `ATT-TXN-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    // A. Network & VPN Security Evaluation
    const networkAssessment = await evaluateNetworkSecurity(
      req,
      body.networkHints || {},
      store.securityPolicy
    );

    // B. Camera Authenticity Check (Virtual Camera + Motion Anti-Replay)
    let cameraAuthenticityStatus:
      | 'Authentic Live Camera'
      | 'Virtual Camera Detected'
      | 'Replay / Spoof Suspected' = 'Authentic Live Camera';
    let livenessStatus: 'Verified' | 'Failed' = 'Verified';
    let aiNotes = 'Multi-frame passive liveness and camera feed authenticity checks completed.';

    if (cameraLabel && VIRTUAL_CAMERA_PATTERN.test(cameraLabel)) {
      cameraAuthenticityStatus = 'Virtual Camera Detected';
      livenessStatus = 'Failed';
      aiNotes = `Blocked virtual/software camera feed: "${cameraLabel}". Switch to the device hardware camera.`;
    } else if (clientMotionDelta < 0.0012 || clientFrameSelfSimilarity < 0.72) {
      cameraAuthenticityStatus = 'Replay / Spoof Suspected';
      livenessStatus = 'Failed';
      aiNotes = 'Static image, frozen feed, or excessive movement detected during passive liveness check.';
    }

    // C. Optional Server-Side Gemini Vision Passive Liveness & Anti-Replay Check (Frame is NEVER saved)
    const apiKey = process.env.GEMINI_API_KEY;
    if (
      apiKey &&
      cameraAuthenticityStatus === 'Authentic Live Camera' &&
      liveFrameBase64 &&
      liveFrameBase64.length > 500 &&
      liveFrameBase64.length < 1_500_000
    ) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const cleanBase64 = liveFrameBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
        const visionResp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
              {
                text: 'Analyze this single live camera attendance frame strictly for passive anti-spoofing: Is there a real live human face directly in front of the camera, or does it clearly show a printed photograph, phone/monitor screen bezel replay, heavy beauty filter distortion, or no human face? Return concise JSON.',
              },
            ],
          },
          config: {
            systemInstruction:
              'You are a strict passive liveness & camera authenticity detector. Do not identify any person by name. Only assess live presence vs photo/screen replay or absent face.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                realHumanPresent: { type: Type.BOOLEAN },
                suspectedPhotoOrScreenReplay: { type: Type.BOOLEAN },
                reason: { type: Type.STRING },
              },
              required: ['realHumanPresent', 'suspectedPhotoOrScreenReplay', 'reason'],
            },
          },
        });
        const parsedVision = JSON.parse((visionResp.text || '{}').trim());
        if (parsedVision.suspectedPhotoOrScreenReplay) {
          cameraAuthenticityStatus = 'Replay / Spoof Suspected';
          livenessStatus = 'Failed';
          aiNotes = String(parsedVision.reason || 'AI detected a printed photograph or screen replay.');
        } else if (!parsedVision.realHumanPresent) {
          livenessStatus = 'Failed';
          aiNotes = String(parsedVision.reason || 'No live human face clearly visible in camera frame.');
        } else if (parsedVision.reason) {
          aiNotes = String(parsedVision.reason).slice(0, 220);
        }
      } catch {
        // Continue with deterministic multi-frame passive liveness checks
      }
    }

    // D. Face Match Evaluation against Consented Reference Template
    let faceMatchStatus: 'Matched' | 'Mismatch' | 'Unregistered' = 'Unregistered';
    if (!hasRegisteredTemplate) {
      faceMatchStatus = 'Unregistered';
    } else if (clientFaceSimilarity >= 0.86) {
      faceMatchStatus = 'Matched';
    } else {
      faceMatchStatus = 'Mismatch';
    }

    // E. GPS Location & School Geofence Verification
    let distanceMeters: number | null = null;
    let locationVerificationStatus:
      | 'Inside School Geofence'
      | 'Outside School Geofence'
      | 'Location Unavailable' = 'Location Unavailable';

    if (gpsLat !== null && gpsLng !== null && Number.isFinite(gpsLat) && Number.isFinite(gpsLng)) {
      distanceMeters = haversineDistanceMeters(gpsLat, gpsLng, schoolLat, schoolLng);
      locationVerificationStatus =
        distanceMeters <= geofenceRadius ? 'Inside School Geofence' : 'Outside School Geofence';
    }

    // F. Combine into Final Attendance Verification Status (NEVER auto-approve on failure or blocked VPN)
    let attendanceVerificationStatus: 'Verified' | 'Flagged for Admin Review' | 'Rejected' = 'Verified';
    let failureReason: string | undefined;

    if (cameraAuthenticityStatus !== 'Authentic Live Camera' || livenessStatus === 'Failed') {
      attendanceVerificationStatus = 'Rejected';
      failureReason = aiNotes;
    } else if (faceMatchStatus !== 'Matched') {
      attendanceVerificationStatus = 'Rejected';
      failureReason =
        faceMatchStatus === 'Unregistered'
          ? 'No consented face reference template is registered for this teacher yet. Register face first or request authorized manual verification.'
          : `Face template similarity (${Math.round(clientFaceSimilarity * 100)}%) is below the required verification threshold. Retry in clear light or use authorized manual verification.`;
    } else if (networkAssessment.riskLevel === 'Blocked_By_Policy') {
      attendanceVerificationStatus = 'Flagged for Admin Review';
      failureReason = networkAssessment.recommendation;
    } else if (locationVerificationStatus === 'Outside School Geofence') {
      attendanceVerificationStatus = 'Flagged for Admin Review';
      failureReason = `Teacher GPS location is ${distanceMeters}m from registered school geofence (allowed: ${geofenceRadius}m). Flagged for Headmaster/Admin review.`;
    }

    const livenessConfidence = Math.min(
      99,
      Math.max(40, Math.round((clientFrameSelfSimilarity || 0.85) * 100))
    );

    const verificationResult = {
      faceMatchStatus,
      livenessStatus,
      cameraAuthenticityStatus,
      locationVerificationStatus,
      attendanceVerificationStatus,
      livenessConfidence,
      faceSimilarityScore: Math.round(clientFaceSimilarity * 100),
      distanceMeters,
      serverTimestamp,
      transactionId,
      deviceId,
      failureReason,
      aiNotes,
    };

    // Always record security log for VPN, AI failure, virtual camera, geofence outside, or verified check-in
    const secEventType =
      cameraAuthenticityStatus === 'Virtual Camera Detected'
        ? 'VIRTUAL_CAMERA_BLOCKED'
        : livenessStatus === 'Failed' || faceMatchStatus !== 'Matched'
        ? 'AI_LIVENESS_FAILED'
        : networkAssessment.vpnDetected
        ? 'VPN_DETECTED'
        : networkAssessment.proxyDetected
        ? 'PROXY_DETECTED'
        : locationVerificationStatus === 'Outside School Geofence'
        ? 'GEOFENCE_OUTSIDE'
        : networkAssessment.emulatorDetected || networkAssessment.rootedOrJailbrokenHint
        ? 'EMULATOR_OR_ROOT_FLAG'
        : 'ATTENDANCE_VERIFIED';

    const secLog = {
      id: `sec-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      timestamp: serverTimestamp,
      employeeId,
      employeeName,
      schoolName,
      eventType: secEventType,
      publicIp: networkAssessment.publicIp,
      networkSummary: `${networkAssessment.ispOrOrg}${networkAssessment.signals.length ? ` · ${networkAssessment.signals[0]}` : ''}`,
      deviceId,
      transactionId,
      verificationSummary:
        failureReason ||
        `Verified live attendance (${faceMatchStatus}, ${livenessStatus}, ${locationVerificationStatus}).`,
      reviewStatus: attendanceVerificationStatus === 'Verified' ? 'None' : 'Pending_Review',
    };
    store.securityLogs.unshift(secLog);
    store.securityLogs = store.securityLogs.slice(0, 300);

    // Determine Late Arrival vs Present using schoolStartTime (default 09:30)
    let savedRecord: Record<string, any> | null = null;
    if (attendanceVerificationStatus === 'Verified') {
      const startTime = String(body.schoolStartTime || '09:30');
      const [sh, sm] = startTime.split(':').map((n: string) => Number(n) || 0);
      const nowLocal = new Date();
      const isLate =
        nowLocal.getHours() > sh || (nowLocal.getHours() === sh && nowLocal.getMinutes() > sm + 10);
      const statusCode = isLate ? 'LA' : 'P';
      const categoryLabel = isLate ? 'Late Arrival' : 'Present';
      const checkInTime = nowLocal.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const recId = `att-${employeeId}-${todayDate}`;
      savedRecord = {
        id: recId,
        employeeId,
        employeeName,
        schoolName,
        schoolCode,
        zoneName,
        date: todayDate,
        statusCode,
        categoryLabel,
        halfDayMode: 'full_present',
        checkInTime,
        serverTimestamp,
        transactionId,
        deviceId,
        gpsLatitude: gpsLat ?? undefined,
        gpsLongitude: gpsLng ?? undefined,
        distanceFromSchoolMeters: distanceMeters,
        publicIp: networkAssessment.publicIp,
        verificationMethod: 'face_biometric',
        livenessVerified: true,
        livenessConfidence,
        aiVerification: verificationResult,
        networkAssessment,
        markedBy: employeeName,
        updatedAt: serverTimestamp,
      };
      const rIdx = store.records.findIndex((r) => r.employeeId === employeeId && r.date === todayDate);
      if (rIdx >= 0) store.records[rIdx] = savedRecord;
      else store.records.unshift(savedRecord);

      store.notifications.unshift({
        id: `ntf-${Date.now()}`,
        kind: 'attendance_marked',
        title: `Attendance Confirmed (${categoryLabel})`,
        message: `${employeeName} checked in at ${checkInTime} · Txn ${transactionId} · ${locationVerificationStatus}.`,
        targetEmployeeId: employeeId,
        timestamp: serverTimestamp,
        read: false,
      });
    } else {
      store.notifications.unshift({
        id: `ntf-${Date.now()}`,
        kind: networkAssessment.vpnDetected || networkAssessment.proxyDetected ? 'vpn_suspicious' : 'face_failed',
        title:
          networkAssessment.vpnDetected || networkAssessment.proxyDetected
            ? 'Suspicious Network / VPN Attendance Flagged'
            : 'AI Attendance Verification Failed',
        message: `${employeeName} (${schoolName}): ${failureReason || 'Verification requires authorized human review.'}`,
        targetRole: 'Headmaster / Principal',
        targetEmployeeId: employeeId,
        timestamp: serverTimestamp,
        read: false,
      });
    }

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: serverTimestamp,
      actorName: employeeName,
      actorRole: 'Teacher',
      action:
        attendanceVerificationStatus === 'Verified'
          ? 'FACE_VERIFIED'
          : networkAssessment.vpnDetected || networkAssessment.proxyDetected
          ? 'VPN_FLAGGED'
          : 'FACE_FAILED',
      targetEmployeeId: employeeId,
      targetDate: todayDate,
      newValue: `${attendanceVerificationStatus} (${transactionId})`,
      reason: failureReason || 'Live AI camera attendance verified with geofence and network checks.',
    });
    store.auditLogs = store.auditLogs.slice(0, 300);
    store.notifications = store.notifications.slice(0, 200);
    writeSmartAttendanceStore(store);

    return res.json({
      ok: true,
      verification: verificationResult,
      networkAssessment,
      securityLog: secLog,
      record: savedRecord,
    });
  });

  // 7. Teacher Check-Out with Server Timestamp & Early Departure Detection
  app.post('/api/smart-attendance/attendance/checkout', (req: Request, res: Response) => {
    const body = req.body || {};
    const employeeId = String(body.employeeId || '').trim().slice(0, 64);
    const employeeName = String(body.employeeName || 'Teacher').trim().slice(0, 140);
    const date = String(body.date || new Date().toISOString().slice(0, 10)).slice(0, 20);
    const schoolEndTime = String(body.schoolEndTime || '15:30');
    if (!employeeId) {
      return res.status(400).json({ ok: false, error: 'Employee ID is required for check-out.' });
    }

    const store = readSmartAttendanceStore();
    const now = new Date();
    const nowIso = now.toISOString();
    const checkOutTime = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const [eh, em] = schoolEndTime.split(':').map((n: string) => Number(n) || 0);
    const isEarly = now.getHours() < eh || (now.getHours() === eh && now.getMinutes() < em - 15);

    const idx = store.records.findIndex((r) => r.employeeId === employeeId && r.date === date);
    if (idx < 0) {
      return res.status(400).json({
        ok: false,
        error: 'No check-in record found for today. Complete live Check-In before Check-Out.',
      });
    }

    const updated = {
      ...store.records[idx],
      checkOutTime,
      statusCode: isEarly && store.records[idx].statusCode === 'P' ? 'ED' : store.records[idx].statusCode,
      categoryLabel:
        isEarly && store.records[idx].statusCode === 'P'
          ? 'Early Departure'
          : store.records[idx].categoryLabel || 'Present',
      updatedAt: nowIso,
    };
    store.records[idx] = updated;
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: nowIso,
      actorName: employeeName,
      actorRole: 'Teacher',
      action: 'ATTENDANCE_CHECKOUT',
      targetEmployeeId: employeeId,
      targetDate: date,
      newValue: `Check-out ${checkOutTime}${isEarly ? ' (Early Departure)' : ''}`,
      reason: 'Teacher recorded daily check-out timestamp.',
    });
    writeSmartAttendanceStore(store);

    return res.json({ ok: true, record: updated });
  });

  // 8. Authorized Manual Human Review for Flagged VPN / Failed AI Attendance Attempts
  app.post('/api/smart-attendance/attendance/manual-review', (req: Request, res: Response) => {
    const body = req.body || {};
    const logId = String(body.logId || '').trim().slice(0, 128);
    const decision = body.decision === 'approve' ? 'approve' : 'reject';
    const reason = String(body.reason || '').trim().slice(0, 600);
    const reviewerName = String(body.reviewerName || 'Headmaster').trim().slice(0, 120);
    const reviewerRole = String(body.reviewerRole || 'Headmaster / Principal').trim().slice(0, 80);

    if (!logId || !reason) {
      return res.status(400).json({
        ok: false,
        error: 'A mandatory review reason is required to approve or reject a flagged attendance attempt.',
      });
    }

    const store = readSmartAttendanceStore();
    const idx = store.securityLogs.findIndex((l) => l.id === logId);
    if (idx < 0) {
      return res.status(404).json({ ok: false, error: 'Security review record not found.' });
    }

    const nowIso = new Date().toISOString();
    const log = store.securityLogs[idx];
    const updatedLog = {
      ...log,
      reviewStatus: decision === 'approve' ? 'Approved_Exception' : 'Rejected_Exception',
      reviewedBy: reviewerName,
      reviewedAt: nowIso,
      reviewReason: reason,
    };
    store.securityLogs[idx] = updatedLog;

    let createdRecord: Record<string, any> | null = null;
    if (decision === 'approve') {
      const targetDate = String(log.timestamp || nowIso).slice(0, 10);
      const recId = `att-${log.employeeId}-${targetDate}`;
      createdRecord = {
        id: recId,
        employeeId: log.employeeId,
        employeeName: log.employeeName,
        schoolName: log.schoolName,
        date: targetDate,
        statusCode: 'P',
        categoryLabel: 'Present',
        halfDayMode: 'full_present',
        checkInTime: new Date(log.timestamp || nowIso).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        serverTimestamp: nowIso,
        transactionId: log.transactionId || `MAN-${Date.now().toString(36).toUpperCase()}`,
        deviceId: log.deviceId,
        publicIp: log.publicIp,
        verificationMethod: 'manual_authorized',
        livenessVerified: false,
        remarks: `Manual exception approved by ${reviewerName} (${reviewerRole}): ${reason}`,
        markedBy: reviewerName,
        updatedAt: nowIso,
      };
      const rIdx = store.records.findIndex(
        (r) => r.employeeId === log.employeeId && r.date === targetDate
      );
      if (rIdx >= 0) store.records[rIdx] = createdRecord;
      else store.records.unshift(createdRecord);
    }

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: nowIso,
      actorName: reviewerName,
      actorRole: reviewerRole,
      action: 'MANUAL_REVIEW_DECISION',
      targetEmployeeId: log.employeeId,
      newValue: updatedLog.reviewStatus,
      reason,
    });
    store.notifications.unshift({
      id: `ntf-${Date.now()}`,
      kind: 'attendance_marked',
      title:
        decision === 'approve'
          ? 'Manual Attendance Review Approved'
          : 'Manual Attendance Review Rejected',
      message: `${reviewerName} (${reviewerRole}): ${reason}`,
      targetEmployeeId: log.employeeId,
      timestamp: nowIso,
      read: false,
    });
    writeSmartAttendanceStore(store);

    return res.json({ ok: true, securityLog: updatedLog, record: createdRecord });
  });

  // 9. Submit Hierarchical Leave Application (Teacher -> Headmaster | Headmaster -> ZEO/CEO)
  app.post('/api/smart-attendance/leaves', (req: Request, res: Response) => {
    const body = req.body || {};
    const employeeId = String(body.employeeId || '').trim().slice(0, 64);
    const teacherName = String(body.teacherName || '').trim().slice(0, 140);
    const applicantRole =
      body.applicantRole === 'Headmaster / Principal' ? 'Headmaster / Principal' : 'Teacher';
    const schoolName = String(body.schoolName || '').trim().slice(0, 180);
    const schoolCode = String(body.schoolCode || '').trim().slice(0, 40);
    const zoneName = String(body.zoneName || 'Zone Srinagar Central').trim().slice(0, 100);
    const districtName = String(body.districtName || 'Srinagar').trim().slice(0, 100);
    const leaveCategory = String(body.leaveCategory || '').trim();
    const fromDate = String(body.fromDate || '').trim().slice(0, 20);
    const toDate = String(body.toDate || fromDate).trim().slice(0, 20);
    const reason = String(body.reason || '').trim().slice(0, 1000);

    const allowedLeaveTypes = [
      'Casual Leave',
      'Medical Leave',
      '1st Half-Day Leave',
      '2nd Half-Day Leave',
    ];
    if (!employeeId || !teacherName || !allowedLeaveTypes.includes(leaveCategory)) {
      return res.status(400).json({
        ok: false,
        error: 'Valid teacher identity and leave type (Casual, Medical, 1st Half-Day, or 2nd Half-Day) are required.',
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return res.status(400).json({ ok: false, error: 'Valid From Date and To Date (YYYY-MM-DD) are required.' });
    }
    if (!reason || reason.length < 4) {
      return res.status(400).json({ ok: false, error: 'Reason for leave is mandatory.' });
    }

    const isHalfDay =
      leaveCategory === '1st Half-Day Leave' || leaveCategory === '2nd Half-Day Leave';
    const effectiveToDate = isHalfDay ? fromDate : toDate;
    const dates = enumerateDatesInclusiveServer(fromDate, effectiveToDate);
    if (dates.length === 0) {
      return res.status(400).json({ ok: false, error: 'To Date must be on or after From Date.' });
    }

    const numberOfDays = isHalfDay ? 0.5 : dates.length;
    const nowIso = new Date().toISOString();
    const year = nowIso.slice(0, 4);
    const referenceNumber = `LV-${year}-${Math.floor(100000 + Math.random() * 900000)}`;
    const approvalLevel =
      applicantRole === 'Headmaster / Principal'
        ? body.targetAuthority === 'CEO'
          ? 'CEO'
          : 'ZEO'
        : 'Headmaster';

    const application = {
      id: `hlv-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      referenceNumber,
      employeeId,
      teacherName,
      applicantRole,
      schoolName,
      schoolCode,
      zoneName,
      districtName,
      leaveCategory,
      fromDate,
      toDate: effectiveToDate,
      numberOfDays,
      reason,
      supportingDocumentName: body.supportingDocumentName
        ? String(body.supportingDocumentName).trim().slice(0, 180)
        : undefined,
      supportingDocumentDataUrl:
        typeof body.supportingDocumentDataUrl === 'string' &&
        (body.supportingDocumentDataUrl.startsWith('data:image/') ||
          body.supportingDocumentDataUrl.startsWith('data:application/pdf'))
          ? body.supportingDocumentDataUrl.slice(0, 2_000_000)
          : undefined,
      submissionDate: nowIso,
      status: 'Pending',
      approvalLevel,
      decisionHistory: [
        {
          timestamp: nowIso,
          actorName: teacherName,
          actorRole: applicantRole,
          action: 'Submitted',
          reason: `Submitted ${leaveCategory} (${fromDate}${effectiveToDate !== fromDate ? ` to ${effectiveToDate}` : ''}) routed to ${approvalLevel}.`,
        },
      ],
    };

    const store = readSmartAttendanceStore();
    store.hierarchicalLeaves.unshift(application);
    store.notifications.unshift({
      id: `ntf-${Date.now()}-1`,
      kind: 'leave_submitted',
      title: `Leave Application Submitted (${referenceNumber})`,
      message: `${teacherName} submitted ${leaveCategory} (${numberOfDays} day${numberOfDays === 1 ? '' : 's'}) routed to ${approvalLevel}.`,
      targetRole:
        approvalLevel === 'Headmaster'
          ? 'Headmaster / Principal'
          : approvalLevel === 'ZEO'
          ? 'ZEO (Zonal Education Officer)'
          : 'CEO (Chief Education Officer)',
      targetEmployeeId: employeeId,
      timestamp: nowIso,
      read: false,
    });
    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: nowIso,
      actorName: teacherName,
      actorRole: applicantRole,
      action: 'LEAVE_APPLIED',
      targetEmployeeId: employeeId,
      targetDate: fromDate,
      newValue: `${referenceNumber} · ${leaveCategory} · Routed to ${approvalLevel}`,
      reason,
    });
    writeSmartAttendanceStore(store);

    return res.status(201).json({ ok: true, application });
  });

  // 10. Hierarchical Leave Decision (Approve / Reject / Forward / Cancel — MANDATORY REASON ENFORCED)
  app.post('/api/smart-attendance/leaves/:id/decision', (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid leave application ID.' });
    }

    const body = req.body || {};
    const decision = String(body.decision || '').trim();
    const reason = String(body.reason || '').trim().slice(0, 1000);
    const actorName = String(body.actorName || 'Authority').trim().slice(0, 120);
    const actorRole = String(body.actorRole || 'Headmaster / Principal').trim().slice(0, 80);
    const forwardTo = body.forwardTo === 'CEO' ? 'CEO' : 'ZEO';

    const allowedDecisions = [
      'Approved',
      'Rejected',
      'Forwarded for Higher Approval',
      'Cancelled',
    ];
    if (!allowedDecisions.includes(decision)) {
      return res.status(400).json({ ok: false, error: 'Invalid leave decision action.' });
    }
    if (!reason || reason.length < 3) {
      return res.status(400).json({
        ok: false,
        error: 'Mandatory: You must enter a clear reason before processing any approval, rejection, or forwarding decision.',
      });
    }

    const store = readSmartAttendanceStore();
    const idx = store.hierarchicalLeaves.findIndex((l) => l.id === id);
    if (idx < 0) {
      return res.status(404).json({ ok: false, error: 'Leave application not found.' });
    }

    const existing = store.hierarchicalLeaves[idx];
    const nowIso = new Date().toISOString();
    const nextApprovalLevel =
      decision === 'Forwarded for Higher Approval' ? forwardTo : existing.approvalLevel;

    const updated = {
      ...existing,
      status: decision,
      approvalLevel: nextApprovalLevel,
      decisionReason: reason,
      decidedBy: actorName,
      decidedByRole: actorRole,
      decidedAt: nowIso,
      decisionHistory: [
        ...(Array.isArray(existing.decisionHistory) ? existing.decisionHistory : []),
        {
          timestamp: nowIso,
          actorName,
          actorRole,
          action: decision,
          reason:
            decision === 'Forwarded for Higher Approval'
              ? `Forwarded to ${forwardTo}: ${reason}`
              : reason,
        },
      ],
    };
    store.hierarchicalLeaves[idx] = updated;

    // Auto-update Teacher/Headmaster Attendance Records on Approval!
    const autoMarkedRecords: Array<Record<string, any>> = [];
    if (decision === 'Approved') {
      const dates = enumerateDatesInclusiveServer(existing.fromDate, existing.toDate);
      const code =
        existing.leaveCategory === 'Medical Leave'
          ? 'ML'
          : existing.leaveCategory === '1st Half-Day Leave'
          ? 'FH'
          : existing.leaveCategory === '2nd Half-Day Leave'
          ? 'SH'
          : 'AL';
      const label =
        existing.leaveCategory === '1st Half-Day Leave' ||
        existing.leaveCategory === '2nd Half-Day Leave'
          ? 'Half-Day Leave'
          : 'On Approved Leave';

      for (const dt of dates) {
        const recId = `att-${existing.employeeId}-${dt}`;
        const rec = {
          id: recId,
          employeeId: existing.employeeId,
          employeeName: existing.teacherName,
          schoolName: existing.schoolName,
          schoolCode: existing.schoolCode,
          zoneName: existing.zoneName,
          date: dt,
          statusCode: code,
          categoryLabel: label,
          checkInTime: '-',
          serverTimestamp: nowIso,
          verificationMethod:
            existing.leaveCategory === 'Medical Leave' ? 'auto_medical_leave' : 'auto_leave',
          livenessVerified: false,
          remarks: `Auto-marked via Approved ${existing.leaveCategory} (${existing.referenceNumber}) by ${actorName} (${actorRole}): ${reason}`,
          markedBy: actorName,
          updatedAt: nowIso,
        };
        const rIdx = store.records.findIndex(
          (r) => r.employeeId === existing.employeeId && r.date === dt
        );
        if (rIdx >= 0) store.records[rIdx] = rec;
        else store.records.unshift(rec);
        autoMarkedRecords.push(rec);
      }
    }

    store.notifications.unshift({
      id: `ntf-${Date.now()}`,
      kind:
        decision === 'Approved'
          ? 'leave_approved'
          : decision === 'Rejected'
          ? 'leave_rejected'
          : 'leave_forwarded',
      title: `Leave ${decision} (${existing.referenceNumber})`,
      message: `${existing.teacherName}'s ${existing.leaveCategory} (${existing.fromDate}–${existing.toDate}) was ${decision.toLowerCase()} by ${actorName} (${actorRole}). Reason: ${reason}`,
      targetEmployeeId: existing.employeeId,
      targetRole:
        decision === 'Forwarded for Higher Approval'
          ? forwardTo === 'CEO'
            ? 'CEO (Chief Education Officer)'
            : 'ZEO (Zonal Education Officer)'
          : existing.applicantRole,
      timestamp: nowIso,
      read: false,
    });

    store.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: nowIso,
      actorName,
      actorRole,
      action: decision === 'Forwarded for Higher Approval' ? 'LEAVE_FORWARDED' : 'LEAVE_REVIEWED',
      targetEmployeeId: existing.employeeId,
      targetDate: existing.fromDate,
      previousValue: existing.status,
      newValue: `${decision} (${existing.referenceNumber})`,
      reason,
    });
    writeSmartAttendanceStore(store);

    return res.json({
      ok: true,
      application: updated,
      autoMarkedRecords,
    });
  });
}
