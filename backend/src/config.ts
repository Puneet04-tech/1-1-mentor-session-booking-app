import dotenv from 'dotenv';

dotenv.config();

/** Minimum acceptable length for a JWT signing secret. */
export const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Validate the JWT signing secret and return it, or throw with actionable
 * guidance. There is intentionally NO hardcoded fallback (issue #143): a
 * publicly known default secret lets anyone forge tokens for any user,
 * including admins, bypassing authentication entirely.
 *
 * In the automated test environment a deterministic placeholder is allowed so
 * unit tests can run without provisioning real secrets — it is never used by a
 * running server.
 */
export function resolveJwtSecret(
  secret: string | undefined,
  nodeEnv: string | undefined
): string {
  if (nodeEnv === 'test') {
    return secret && secret.length >= MIN_JWT_SECRET_LENGTH
      ? secret
      : 'test-only-insecure-jwt-secret-not-for-production-0123456789';
  }

  if (!secret || secret.trim().length === 0) {
    throw new Error(
      'FATAL: JWT_SECRET is not set. Refusing to start without a signing secret ' +
        '(a default would let anyone forge authentication tokens). Set JWT_SECRET ' +
        `(min ${MIN_JWT_SECRET_LENGTH} characters). Generate one with: openssl rand -base64 48`
    );
  }

  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `FATAL: JWT_SECRET is too short (${secret.length} chars); it must be at least ` +
        `${MIN_JWT_SECRET_LENGTH} characters. Generate a strong secret with: openssl rand -base64 48`
    );
  }

  return secret;
}

export const config = {
  // Server
  PORT: process.env.PORT || 5001,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database (Neon PostgreSQL)
  DATABASE_URL: process.env.DATABASE_URL,
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '5432'),
  DB_NAME: process.env.DB_NAME || 'mentor_db',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || 'password',
  DB_SSL: process.env.DB_SSL ? process.env.DB_SSL === 'true' : !(process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1'))),

  // JWT — no insecure default; startup fails if unset/too short (see resolveJwtSecret)
  JWT_SECRET: resolveJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV),
  JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',

  // Bcrypt
  BCRYPT_SALT_ROUNDS: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,

  // CORS
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',
  CLIENT_URLS: (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map((url) => url.trim()),

  // WebRTC
  STUN_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],

  // Features
  ENABLE_SCREEN_SHARING: process.env.ENABLE_SCREEN_SHARING !== 'false',
  ENABLE_RECORDING: process.env.ENABLE_RECORDING === 'true',
  MAX_SESSION_DURATION: parseInt(process.env.MAX_SESSION_DURATION || '3600000'), // 1 hour

  // Email (Gmail SMTP)
  EMAIL_HOST: process.env.EMAIL_HOST || 'smtp.gmail.com',
  EMAIL_PORT: parseInt(process.env.EMAIL_PORT || '587'),
  EMAIL_USER: process.env.EMAIL_USER || '',          // your Gmail address
  EMAIL_PASS: process.env.EMAIL_PASS || '',          // Gmail App Password
  EMAIL_FROM: process.env.EMAIL_FROM || '',          // optional display address
};

export type Config = typeof config;
