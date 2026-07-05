import { resolveJwtSecret, MIN_JWT_SECRET_LENGTH } from './config';

const STRONG_SECRET = 'a'.repeat(MIN_JWT_SECRET_LENGTH); // exactly 32 chars

describe('resolveJwtSecret', () => {
  describe('production / development (no test fallback)', () => {
    it('throws when the secret is missing', () => {
      expect(() => resolveJwtSecret(undefined, 'production')).toThrow(/JWT_SECRET is not set/);
    });

    it('throws when the secret is blank', () => {
      expect(() => resolveJwtSecret('   ', 'production')).toThrow(/JWT_SECRET is not set/);
    });

    it('throws when the secret is shorter than the minimum', () => {
      expect(() => resolveJwtSecret('short', 'development')).toThrow(/too short/);
    });

    it('never returns the old hardcoded default', () => {
      expect(() => resolveJwtSecret('your-secret-key', 'production')).toThrow(/too short/);
    });

    it('accepts and returns a sufficiently long secret', () => {
      expect(resolveJwtSecret(STRONG_SECRET, 'production')).toBe(STRONG_SECRET);
    });

    it('includes generation guidance in the error message', () => {
      expect(() => resolveJwtSecret(undefined, 'production')).toThrow(/openssl rand -base64 48/);
    });
  });

  describe('test environment', () => {
    it('falls back to a deterministic secret so unit tests can run', () => {
      const secret = resolveJwtSecret(undefined, 'test');
      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThanOrEqual(MIN_JWT_SECRET_LENGTH);
    });

    it('still prefers a real secret when one is provided', () => {
      expect(resolveJwtSecret(STRONG_SECRET, 'test')).toBe(STRONG_SECRET);
    });
  });
});
