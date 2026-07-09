/**
 * Authorization tests for the session-feedback endpoints (issue #157).
 *
 * Both the POST /feedback and GET /:session_id/feedback routes expose or
 * accept data tied to a specific session, so they must be restricted to the
 * session's participants. DB is mocked so these exercise the real handler
 * and middleware logic.
 */
jest.mock('@/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sessionHistoryRouter from './sessionHistory';
import { query, queryOne } from '@/database';
import { config } from '@/config';

const mockedQuery = query as jest.Mock;
const mockedQueryOne = queryOne as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/session-history', sessionHistoryRouter);

const MENTOR = 'mentor-1';
const STUDENT = 'student-1';
const SESSION = 'sess-1';

function tokenFor(id: string, role: 'mentor' | 'student' = 'student') {
  return jwt.sign({ id, email: `${id}@x.com`, role }, config.JWT_SECRET as string);
}

const sessionRow = { id: SESSION, mentor_id: MENTOR, student_id: STUDENT };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/session-history/feedback', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/session-history/feedback').send({ session_id: SESSION });
    expect(res.status).toBe(401);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent session', async () => {
    mockedQueryOne.mockResolvedValueOnce(null); // session lookup
    const res = await request(app)
      .post('/api/session-history/feedback')
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`)
      .send({ session_id: SESSION, feedback: 'hi' });
    expect(res.status).toBe(404);
    // Never reaches the INSERT.
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a participant', async () => {
    mockedQueryOne.mockResolvedValueOnce(sessionRow); // session lookup
    const res = await request(app)
      .post('/api/session-history/feedback')
      .set('Authorization', `Bearer ${tokenFor('stranger')}`)
      .send({ session_id: SESSION, feedback: 'hi' });
    expect(res.status).toBe(403);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('accepts feedback from a participant', async () => {
    mockedQueryOne
      .mockResolvedValueOnce(sessionRow) // session lookup
      .mockResolvedValueOnce({ id: 'fb-1', session_id: SESSION, user_id: STUDENT }); // select new feedback
    mockedQuery.mockResolvedValueOnce({ rows: [] }); // INSERT

    const res = await request(app)
      .post('/api/session-history/feedback')
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`)
      .send({ session_id: SESSION, feedback: 'great session', would_recommend: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const insertCall = mockedQuery.mock.calls.find((c: any[]) => /INSERT INTO session_feedback/.test(c[0]));
    expect(insertCall).toBeTruthy();
  });
});

describe('GET /api/session-history/:session_id/feedback', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get(`/api/session-history/${SESSION}/feedback`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for a nonexistent session', async () => {
    mockedQueryOne.mockResolvedValueOnce(null); // participant middleware session lookup
    const res = await request(app)
      .get(`/api/session-history/${SESSION}/feedback`)
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-participant', async () => {
    mockedQueryOne.mockResolvedValueOnce(sessionRow);
    const res = await request(app)
      .get(`/api/session-history/${SESSION}/feedback`)
      .set('Authorization', `Bearer ${tokenFor('stranger')}`);
    expect(res.status).toBe(403);
  });

  it('returns feedback for a participant', async () => {
    mockedQueryOne.mockResolvedValueOnce(sessionRow); // participant middleware
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: 'fb-1', feedback: 'nice' }] }); // feedback query

    const res = await request(app)
      .get(`/api/session-history/${SESSION}/feedback`)
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
