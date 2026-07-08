/**
 * Route-level tests for the two-factor authentication flow (issue #138).
 * The database layer is mocked so these exercise the real handler logic
 * (login → pending token → verify, enable, disable) without a live DB.
 */
jest.mock('@/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import jwt from 'jsonwebtoken';
import authRouter from './auth';
import { query, queryOne } from '@/database';
import { config } from '@/config';
import { generateBackupCodes } from '@/services/twoFactor';

/** Sign a normal full-access session token the way the app does. */
function sessionToken(payload: object): string {
  return jwt.sign(payload, config.JWT_SECRET as string);
}

const mockedQueryOne = queryOne as jest.Mock;
const mockedQuery = query as jest.Mock;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

const app = makeApp();

beforeEach(() => {
  jest.clearAllMocks();
  mockedQuery.mockResolvedValue({ rows: [] });
});

describe('POST /api/auth/login with 2FA enabled', () => {
  it('returns a pending token (not a full session) when 2FA is on', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 10);
    mockedQueryOne
      // user lookup
      .mockResolvedValueOnce({
        id: 'u1',
        email: 'a@b.com',
        name: 'A',
        role: 'student',
        timezone: 'UTC',
        is_suspended: false,
        two_factor_enabled: true,
      })
      // password lookup
      .mockResolvedValueOnce({ password_hash: passwordHash });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'correct-horse' });

    expect(res.status).toBe(200);
    expect(res.body.data.twoFactorRequired).toBe(true);
    expect(typeof res.body.data.pendingToken).toBe('string');
    expect(res.body.data.token).toBeUndefined();
  });

  it('returns a full token when 2FA is off', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 10);
    mockedQueryOne
      .mockResolvedValueOnce({
        id: 'u1',
        email: 'a@b.com',
        name: 'A',
        role: 'student',
        timezone: 'UTC',
        is_suspended: false,
        two_factor_enabled: false,
      })
      .mockResolvedValueOnce({ password_hash: passwordHash });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'correct-horse' });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.twoFactorRequired).toBeUndefined();
    // Internal flags are not leaked back to the client.
    expect(res.body.data.user.two_factor_enabled).toBeUndefined();
  });
});

describe('POST /api/auth/2fa/verify', () => {
  async function loginForPendingToken(secret: string) {
    const passwordHash = await bcrypt.hash('pw12345678', 10);
    mockedQueryOne
      .mockResolvedValueOnce({
        id: 'u1',
        email: 'a@b.com',
        name: 'A',
        role: 'student',
        timezone: 'UTC',
        is_suspended: false,
        two_factor_enabled: true,
      })
      .mockResolvedValueOnce({ password_hash: passwordHash });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'pw12345678' });
    return login.body.data.pendingToken as string;
  }

  it('exchanges a valid TOTP for a full session token', async () => {
    const secret = authenticator.generateSecret();
    const pendingToken = await loginForPendingToken(secret);

    // verify handler user lookup
    mockedQueryOne.mockResolvedValueOnce({
      id: 'u1',
      email: 'a@b.com',
      name: 'A',
      role: 'student',
      timezone: 'UTC',
      is_suspended: false,
      two_factor_enabled: true,
      two_factor_secret: secret,
      two_factor_backup_codes: null,
    });

    const code = authenticator.generate(secret);
    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ pendingToken, token: code });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user.id).toBe('u1');
  });

  it('rejects an invalid TOTP', async () => {
    const secret = authenticator.generateSecret();
    const pendingToken = await loginForPendingToken(secret);
    mockedQueryOne.mockResolvedValueOnce({
      id: 'u1',
      email: 'a@b.com',
      name: 'A',
      role: 'student',
      timezone: 'UTC',
      is_suspended: false,
      two_factor_enabled: true,
      two_factor_secret: secret,
      two_factor_backup_codes: null,
    });

    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ pendingToken, token: '000000' });

    expect(res.status).toBe(401);
  });

  it('accepts a single-use backup code and persists it as consumed', async () => {
    const secret = authenticator.generateSecret();
    const { plainCodes, hashedCodes } = await generateBackupCodes(3);
    const pendingToken = await loginForPendingToken(secret);

    mockedQueryOne.mockResolvedValueOnce({
      id: 'u1',
      email: 'a@b.com',
      name: 'A',
      role: 'student',
      timezone: 'UTC',
      is_suspended: false,
      two_factor_enabled: true,
      two_factor_secret: secret,
      two_factor_backup_codes: hashedCodes,
    });

    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ pendingToken, backupCode: plainCodes[0] });

    expect(res.status).toBe(200);
    // The consumed code must be written back to the DB.
    const updateCall = mockedQuery.mock.calls.find((c: any[]) =>
      String(c[0]).includes('two_factor_backup_codes')
    );
    expect(updateCall).toBeTruthy();
  });

  it('rejects a bad/expired pending token', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ pendingToken: 'garbage', token: '123456' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/2fa/disable', () => {
  it('requires both password and a valid 2FA code', async () => {
    const token = sessionToken({ id: 'u1', email: 'a@b.com', role: 'student' });
    const secret = authenticator.generateSecret();
    const passwordHash = await bcrypt.hash('pw12345678', 10);

    mockedQueryOne
      // user 2fa row
      .mockResolvedValueOnce({
        two_factor_enabled: true,
        two_factor_secret: secret,
        two_factor_backup_codes: null,
      })
      // password row
      .mockResolvedValueOnce({ password_hash: passwordHash });

    const res = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'pw12345678', token: authenticator.generate(secret) });

    expect(res.status).toBe(200);
    const disableCall = mockedQuery.mock.calls.find((c: any[]) =>
      String(c[0]).includes('two_factor_enabled = FALSE')
    );
    expect(disableCall).toBeTruthy();
  });

  it('rejects disable with a wrong password', async () => {
    const token = sessionToken({ id: 'u1', email: 'a@b.com', role: 'student' });
    const secret = authenticator.generateSecret();
    const passwordHash = await bcrypt.hash('right-password', 10);

    mockedQueryOne
      .mockResolvedValueOnce({
        two_factor_enabled: true,
        two_factor_secret: secret,
        two_factor_backup_codes: null,
      })
      .mockResolvedValueOnce({ password_hash: passwordHash });

    const res = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'wrong-password', token: authenticator.generate(secret) });

    expect(res.status).toBe(401);
  });
});
