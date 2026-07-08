/**
 * Existence-check tests for POST /api/admin/moderation/flag/:sessionId (issue #159).
 *
 * Flagging a nonexistent session previously returned success (the UPDATE
 * simply matched no rows). It must now return 404. DB is mocked.
 */
jest.mock('@/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import adminRouter from './admin';
import { query, queryOne } from '@/database';
import { config } from '@/config';

const mockedQuery = query as jest.Mock;
const mockedQueryOne = queryOne as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

function tokenFor(id: string, role: 'mentor' | 'student' | 'admin') {
  return jwt.sign({ id, email: `${id}@x.com`, role }, config.JWT_SECRET as string);
}

const SESSION = 'sess-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockedQuery.mockResolvedValue({ rows: [] });
});

describe('POST /api/admin/moderation/flag/:sessionId', () => {
  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .post(`/api/admin/moderation/flag/${SESSION}`)
      .set('Authorization', `Bearer ${tokenFor('mentor-1', 'mentor')}`)
      .send({ reason: 'spam' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent session', async () => {
    mockedQueryOne.mockResolvedValueOnce(null); // existence check
    const res = await request(app)
      .post(`/api/admin/moderation/flag/${SESSION}`)
      .set('Authorization', `Bearer ${tokenFor('admin-1', 'admin')}`)
      .send({ reason: 'spam' });
    expect(res.status).toBe(404);
    // Never issues the UPDATE.
    expect(mockedQuery.mock.calls.some((c: any[]) => /UPDATE sessions/.test(c[0]))).toBe(false);
  });

  it('flags an existing session', async () => {
    mockedQueryOne.mockResolvedValueOnce({ id: SESSION }); // existence check
    const res = await request(app)
      .post(`/api/admin/moderation/flag/${SESSION}`)
      .set('Authorization', `Bearer ${tokenFor('admin-1', 'admin')}`)
      .send({ reason: 'spam' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockedQuery.mock.calls.some((c: any[]) => /UPDATE sessions/.test(c[0]))).toBe(true);
  });
});
