import type { BiometricFaceTemplate } from '../types/digitalAttendance';
import {
  computeCosineSimilarity,
  computeVectorMotionDelta,
  sampleVideoFaceDescriptor,
  type CapturedFaceFrameSample,
} from './biometricFaceEngine';

const VIRTUAL_CAMERA_SIGNATURES =
  /obs|manycam|snap\s*camera|droidcam|splitcam|camtwist|virtual|screen\s*capture|fake\s*device|youcam|epoccam|iriun|xsplit|vcam|ndi/i;

export interface PassiveLivenessReport {
  isLive: boolean;
  cameraAuthentic: boolean;
  antiReplayPassed: boolean;
  antiScreenshotPassed: boolean;
  faceMatched: boolean;
  hasStoredTemplate: boolean;
  motionDelta: number;
  frameSelfSimilarity: number;
  faceSimilarity: number;
  contrastScore: number;
  livenessConfidence: number;
  issues: string[];
  summary: string;
}

/**
 * PassiveLivenessDetection utility for SmartDigitalAttendanceSystem.
 * Validates live camera feeds for:
 *  1. Hardware vs Virtual camera authenticity
 *  2. Anti-replay (temporal micro-motion between live frames)
 *  3. Anti-screenshot (flat luminance/contrast & frozen pixel entropy checks)
 *  4. Face-matching consistency against the stored SHA-256 reference template
 */
export class PassiveLivenessDetection {
  static readonly MIN_CONTRAST = 0.035;
  static readonly MIN_BRIGHTNESS = 0.08;
  static readonly MAX_BRIGHTNESS = 0.94;
  static readonly MIN_MOTION_DELTA = 0.0012;
  static readonly MAX_MOTION_DELTA = 0.32;
  static readonly MIN_SELF_SIMILARITY = 0.72;
  static readonly FACE_MATCH_THRESHOLD = 0.86;

  static isVirtualCameraLabel(trackLabel: string): boolean {
    if (!trackLabel) return false;
    return VIRTUAL_CAMERA_SIGNATURES.test(trackLabel);
  }

  static sampleFrame(video: HTMLVideoElement): CapturedFaceFrameSample | null {
    return sampleVideoFaceDescriptor(video);
  }

  static evaluateFrames(params: {
    frame1: CapturedFaceFrameSample;
    frame2: CapturedFaceFrameSample;
    cameraLabel?: string;
    storedTemplate?: BiometricFaceTemplate | null;
  }): PassiveLivenessReport {
    const { frame1, frame2, cameraLabel = '', storedTemplate } = params;
    const issues: string[] = [];

    // 1. Virtual Camera Authenticity
    const cameraAuthentic = !PassiveLivenessDetection.isVirtualCameraLabel(cameraLabel);
    if (!cameraAuthentic) {
      issues.push(
        `Virtual or software camera feed detected ("${cameraLabel}"). Use the device hardware camera.`
      );
    }

    // 2. Anti-Screenshot & Lighting Quality Check
    const avgContrast = Number(((frame1.contrastScore + frame2.contrastScore) / 2).toFixed(4));
    const avgBrightness = Number(((frame1.meanBrightness + frame2.meanBrightness) / 2).toFixed(4));
    const motionDelta = computeVectorMotionDelta(frame1.descriptorVector, frame2.descriptorVector);
    const frameSelfSimilarity = computeCosineSimilarity(
      frame1.descriptorVector,
      frame2.descriptorVector
    );

    let antiScreenshotPassed = true;
    if (avgContrast < PassiveLivenessDetection.MIN_CONTRAST) {
      antiScreenshotPassed = false;
      issues.push(
        'Low texture variance detected (possible covered lens, dark frame, or flat screen glare).'
      );
    }
    if (
      avgBrightness < PassiveLivenessDetection.MIN_BRIGHTNESS ||
      avgBrightness > PassiveLivenessDetection.MAX_BRIGHTNESS
    ) {
      antiScreenshotPassed = false;
      issues.push('Unnatural exposure or screen washout detected. Face clear ambient light.');
    }
    if (motionDelta < 0.0005) {
      antiScreenshotPassed = false;
      issues.push('Completely frozen frame detected (possible static screenshot or printed photo).');
    }

    // 3. Anti-Replay Check (Natural human micro-motion & temporal face consistency)
    let antiReplayPassed = true;
    if (motionDelta < PassiveLivenessDetection.MIN_MOTION_DELTA) {
      antiReplayPassed = false;
      issues.push(
        'Insufficient natural facial micro-movement detected during passive liveness check.'
      );
    } else if (
      motionDelta > PassiveLivenessDetection.MAX_MOTION_DELTA ||
      frameSelfSimilarity < PassiveLivenessDetection.MIN_SELF_SIMILARITY
    ) {
      antiReplayPassed = false;
      issues.push(
        'Abrupt frame jump or inconsistent subject detected (possible video replay or camera switch).'
      );
    }

    // 4. Face-Matching Consistency against Stored Reference Template
    const hasStoredTemplate = Boolean(storedTemplate?.descriptorVector?.length);
    let faceSimilarity = 0;
    let faceMatched = false;
    if (hasStoredTemplate && storedTemplate) {
      const sim1 = computeCosineSimilarity(
        frame1.descriptorVector,
        storedTemplate.descriptorVector
      );
      const sim2 = computeCosineSimilarity(
        frame2.descriptorVector,
        storedTemplate.descriptorVector
      );
      const averaged = frame1.descriptorVector.map((v, i) => (v + frame2.descriptorVector[i]) / 2);
      const simAvg = computeCosineSimilarity(averaged, storedTemplate.descriptorVector);
      const consistencySpread = Math.abs(sim1 - sim2);

      faceSimilarity = Number(simAvg.toFixed(4));
      faceMatched =
        simAvg >= PassiveLivenessDetection.FACE_MATCH_THRESHOLD && consistencySpread <= 0.14;

      if (!faceMatched) {
        issues.push(
          `Face consistency check (${Math.round(simAvg * 100)}%) fell below verification threshold against stored template.`
        );
      }
    } else {
      issues.push('No stored face reference template found for this teacher yet.');
    }

    const isLive = cameraAuthentic && antiReplayPassed && antiScreenshotPassed;
    const confidenceRaw = isLive
      ? Math.min(99, Math.max(60, Math.round(frameSelfSimilarity * 100)))
      : Math.min(55, Math.round(frameSelfSimilarity * 50));

    const summary =
      isLive && faceMatched
        ? `Passive liveness & face consistency verified (${Math.round(faceSimilarity * 100)}% match, ${confidenceRaw}% liveness confidence).`
        : issues[0] || 'Passive liveness validation did not pass.';

    return {
      isLive,
      cameraAuthentic,
      antiReplayPassed,
      antiScreenshotPassed,
      faceMatched,
      hasStoredTemplate,
      motionDelta,
      frameSelfSimilarity,
      faceSimilarity,
      contrastScore: avgContrast,
      livenessConfidence: confidenceRaw,
      issues,
      summary,
    };
  }
}
