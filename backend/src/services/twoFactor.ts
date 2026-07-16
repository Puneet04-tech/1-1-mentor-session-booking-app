import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import jwt, { Secret } from 'jsonwebtoken';
import { config } from '@/config';

/**
 * Two-Factor Authentication (TOTP) service — issue #138.
 *
 * Pure, side-effect-free helpers for generating/verifying TOTP secrets and
 * single-use backup codes, plus the short-lived "pending" token used to bridge
 * the two-step login flow. Keeping these free of DB access makes them directly
 * unit-testable (see twoFactor.test.ts).
 */

// Human-readable issuer shown in the authenticator app.
export const TOTP_ISSUER = 'Mentor Sessions';

// Number of single-use recovery codes generated when 2FA is enabled.
export const BACKUP_CODE_COUNT = 10;

// Pending tokens are only good long enough to type in a TOTP code.
export const PENDING_TOKEN_EXPIRY = '5m';

// Allow one time-step (±30s) of clock drift between server and authenticator.
authenticator.options = { window: 1 };

export interface BackupCode {
  hash: string;
  used: boolean;
}

/** Generate a fresh base32 TOTP secret. */
export function generateSecret(): string {
  return authenticator.generateSecret();
}

/** Build the otpauth:// URI an authenticator app scans. */
export function buildOtpAuthUrl(accountName: string, secret: string): string {
  return authenticator.keyuri(accountName, TOTP_ISSUER, secret);
}

/** Render an otpauth URI to a data-URL PNG QR code. */
export async function generateQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return qrcode.toDataURL(otpauthUrl);
}

/**
 * Verify a 6-digit TOTP code against a secret. Returns false (never throws) for
 * malformed input so callers can treat all failures uniformly.
 */
export function verifyToken(token: string, secret: string): boolean {
  if (!token || !secret) return false;
  const normalized = String(token).replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  try {
    return authenticator.verify({ token: normalized, secret });
  } catch {
    return false;
  }
}

/**
 * Generate `count` plaintext backup codes and their bcrypt-hashed records.
 * The plaintext is returned ONCE (shown to the user); only the hashes are
 * persisted.
 */
export async function generateBackupCodes(
  count: number = BACKUP_CODE_COUNT
): Promise<{ plainCodes: string[]; hashedCodes: BackupCode[] }> {

  if (!Number.isInteger(count) || count <= 0 || count > 100) {
    throw new Error("Invalid backup code count");
  }

  const plainCodes: string[] = [];
  const hashedCodes: BackupCode[] = [];

  for (let i = 0; i < count; i++) {
    const code = generateSingleBackupCode();
    plainCodes.push(code);
    const hash = await bcrypt.hash(code, config.BCRYPT_SALT_ROUNDS);
    hashedCodes.push({ hash, used: false });
  }

  return { plainCodes, hashedCodes };
}

/** Format: XXXX-XXXX (8 hex chars, uppercase) — easy to read/type. */
export function generateSingleBackupCode(): string {
  const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

/** Normalise user-entered backup codes so formatting/casing doesn't matter. */
export function normalizeBackupCode(code: string): string {
  return String(code || '').trim().toUpperCase().replace(/\s/g, '');
}

/**
 * Try to consume a backup code. On success returns the updated codes array with
 * the matched entry marked used (single-use). Returns null when no unused code
 * matches. Does not mutate the input array.
 */
export async function consumeBackupCode(
  code: string,
  codes: BackupCode[] | null | undefined
): Promise<BackupCode[] | null> {
  if (!code || !Array.isArray(codes)) return null;
  const candidate = normalizeBackupCode(code);
  if (!candidate) return null;

  for (let i = 0; i < codes.length; i++) {
    const entry = codes[i];
    if (!entry || entry.used) continue;
    // eslint-disable-next-line no-await-in-loop
    const matches = await bcrypt.compare(candidate, entry.hash);
    if (matches) {
      const updated = codes.map((c) => ({ ...c }));
      updated[i].used = true;
      return updated;
    }
  }
  return null;
}

const jwtSecret: Secret = config.JWT_SECRET as Secret;

/**
 * Short-lived token issued after password (but not yet TOTP) verification. It
 * carries `twofa_pending: true` so it can ONLY be exchanged at the 2FA verify
 * endpoint — authMiddleware rejects it everywhere else.
 */
export function issuePendingToken(userId: string): string {
  return jwt.sign({ id: userId, twofa_pending: true }, jwtSecret, {
    expiresIn: PENDING_TOKEN_EXPIRY,
  });
}

/** Verify a pending token and return the userId, or null if invalid/expired. */
export function verifyPendingToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, jwtSecret) as any;
    if (!decoded || decoded.twofa_pending !== true || !decoded.id) return null;
    return decoded.id as string;
  } catch {
    return null;
  }
}
