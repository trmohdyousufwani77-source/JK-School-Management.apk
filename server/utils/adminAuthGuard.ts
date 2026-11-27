import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Fixed, immutable App Developer & Administrator identity enforced across
 * Android, iOS, Windows, and Web. May only be updated through authorized
 * source-code or secure backend configuration changes.
 */
export const FIXED_ADMINISTRATOR_IDENTITY = Object.freeze({
  id: 'dev-admin-1',
  name: 'Mohd Yousuf Wani',
  developerName: 'Mohd Yousuf Wani',
  designation: 'App Developer / Administrator',
  isProtected: true,
  readOnly: true,
});

export interface AdminPrivilegeCheckResult {
  authorized: boolean;
  level: 'system_admin' | 'none';
  reason?: string;
}

export interface AdminGuardOptions {
  /**
   * When true, even system-level HTTP mutations are blocked (e.g., immutable
   * Administrator Identity & App Information records).
   */
  immutableOverHttp?: boolean;
  /**
   * When true (default), DELETE operations are unconditionally forbidden.
   */
  forbidDelete?: boolean;
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Constant-time verification of server-side system administration credentials.
 * Never trusts client-supplied role or email headers (e.g., x-user-role, x-developer-email).
 */
export function isAuthorizedSystemAdmin(req: Request): boolean {
  const configuredToken = (process.env.SYSTEM_ADMIN_TOKEN || '').trim();
  if (!configuredToken || configuredToken.length < 16) {
    return false;
  }

  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }

  const providedToken = authHeader.slice('Bearer '.length).trim();
  if (!providedToken) {
    return false;
  }

  const expectedBuf = Buffer.from(configuredToken, 'utf8');
  const providedBuf = Buffer.from(providedToken, 'utf8');
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Centralized validation utility that checks administrative privileges before
 * allowing write or delete operations on protected school configuration records.
 */
export function validateAdminPrivilege(
  req: Request,
  options: AdminGuardOptions = {}
): AdminPrivilegeCheckResult {
  const { immutableOverHttp = false, forbidDelete = true } = options;
  const method = req.method.toUpperCase();

  if (!WRITE_METHODS.has(method)) {
    return { authorized: true, level: 'system_admin' };
  }

  if (method === 'DELETE' && forbidDelete) {
    return {
      authorized: false,
      level: 'none',
      reason: 'Delete operations on protected school configuration records are permanently forbidden.',
    };
  }

  if (immutableOverHttp) {
    return {
      authorized: false,
      level: 'none',
      reason:
        'This protected record is strictly read-only and may only be changed through authorized source-code or secure server configuration.',
    };
  }

  if (!isAuthorizedSystemAdmin(req)) {
    return {
      authorized: false,
      level: 'none',
      reason:
        'Insufficient administrative privileges. Valid system-level administrator authorization is required.',
    };
  }

  return { authorized: true, level: 'system_admin' };
}

/**
 * Standardized 403 Forbidden response for unauthorized write/delete attempts.
 */
export function denyUnauthorizedRequest(
  res: Response,
  resourceLabel: string,
  reason?: string,
  isDelete = false
) {
  return res.status(403).json({
    ok: false,
    status: 403,
    readOnly: true,
    error:
      reason ||
      (isDelete
        ? `Forbidden: ${resourceLabel} is permanently protected and cannot be deleted.`
        : `Forbidden: ${resourceLabel} is protected. Administrative privileges are required for modifications.`),
  });
}

/**
 * Express middleware enforcing centralized admin privilege validation on
 * protected school configuration routes. Non-write methods (GET/HEAD/OPTIONS)
 * pass through cleanly; unauthorized write/delete attempts receive HTTP 403.
 */
export function requireAdminPrivilege(
  resourceLabel: string,
  options: AdminGuardOptions = {}
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const method = req.method.toUpperCase();
    if (!WRITE_METHODS.has(method)) {
      return next();
    }

    const check = validateAdminPrivilege(req, options);
    if (!check.authorized) {
      return denyUnauthorizedRequest(res, resourceLabel, check.reason, method === 'DELETE');
    }

    return next();
  };
}
