import { authenticator } from 'otplib';
import {
  generateSecret,
  buildOtpAuthUrl,
  verifyToken,
  generateBackupCodes,
  consumeBackupCode,
  generateSingleBackupCode,
  normalizeBackupCode,
  issuePendingToken,
  verifyPendingToken,
  TOTP_ISSUER,
  BACKUP_CODE_COUNT,
} from './twoFactor';

describe('twoFactor service — TOTP (issue #138)', () => {
  it('generates a usable base32 secret', () => {
    const secret = generateSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);
    // Round-trips through otplib.
    const token = authenticator.generate(secret);
    expect(verifyToken(token, secret)).toBe(true);
  });

  it('builds an otpauth URL carrying the issuer and account', () => {
    const url = buildOtpAuthUrl('user@example.com', generateSecret());
    expect(url.startsWith('otpauth://totp/')).toBe(true);
    expect(url).toContain(encodeURIComponent(TOTP_ISSUER));
    expect(url).toContain(encodeURIComponent('user@example.com'));
  });

  it('rejects malformed / wrong TOTP codes without throwing', () => {
    const secret = generateSecret();
    expect(verifyToken('', secret)).toBe(false);
    expect(verifyToken('abc', secret)).toBe(false);
    expect(verifyToken('12345', secret)).toBe(false); // too short
    expect(verifyToken('000000', '')).toBe(false); // no secret
    // A valid-format but incorrect code.
    const wrong = authenticator.generate(generateSecret());
    // extremely unlikely to collide, but guard anyway
    if (wrong !== authenticator.generate(secret)) {
      expect(verifyToken(wrong, secret)).toBe(false);
    }
  });

  it('accepts a code with surrounding whitespace', () => {
    const secret = generateSecret();
    const token = authenticator.generate(secret);
    expect(verifyToken(` ${token} `, secret)).toBe(true);
  });
});

describe('twoFactor service — backup codes', () => {
  it('generates the configured number of formatted codes', async () => {
    const { plainCodes, hashedCodes } = await generateBackupCodes();
    expect(plainCodes).toHaveLength(BACKUP_CODE_COUNT);
    expect(hashedCodes).toHaveLength(BACKUP_CODE_COUNT);
    for (const code of plainCodes) {
      expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    }
    for (const entry of hashedCodes) {
      expect(entry.used).toBe(false);
      expect(entry.hash).not.toContain(plainCodes[0]); // hashed, not plaintext
    }
  });

  it('single backup code format is XXXX-XXXX', () => {
    expect(generateSingleBackupCode()).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('consumes a valid code once and marks it used (single-use)', async () => {
    const { plainCodes, hashedCodes } = await generateBackupCodes(3);
    const code = plainCodes[1];

    const afterFirst = await consumeBackupCode(code, hashedCodes);
    expect(afterFirst).not.toBeNull();
    expect(afterFirst!.filter((c) => c.used)).toHaveLength(1);

    // Re-using the same code against the updated array must fail.
    const afterSecond = await consumeBackupCode(code, afterFirst!);
    expect(afterSecond).toBeNull();
  });

  it('is case/format insensitive when matching a code', async () => {
    const { plainCodes, hashedCodes } = await generateBackupCodes(2);
    const messy = ` ${plainCodes[0].toLowerCase()} `;
    const result = await consumeBackupCode(messy, hashedCodes);
    expect(result).not.toBeNull();
  });

  it('returns null for an unknown code or empty input', async () => {
    const { hashedCodes } = await generateBackupCodes(2);
    expect(await consumeBackupCode('ZZZZ-ZZZZ', hashedCodes)).toBeNull();
    expect(await consumeBackupCode('', hashedCodes)).toBeNull();
    expect(await consumeBackupCode('AAAA-AAAA', null)).toBeNull();
  });

  it('normalizeBackupCode upper-cases and strips whitespace', () => {
    expect(normalizeBackupCode('  abcd-1234 ')).toBe('ABCD-1234');
  });
});

describe('twoFactor service — pending token', () => {
  it('round-trips a userId through a pending token', () => {
    const token = issuePendingToken('user-123');
    expect(verifyPendingToken(token)).toBe('user-123');
  });

  it('rejects garbage tokens', () => {
    expect(verifyPendingToken('not-a-jwt')).toBeNull();
    expect(verifyPendingToken('')).toBeNull();
  });
});
