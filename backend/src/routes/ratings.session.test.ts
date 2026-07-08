/**
 * Authorization tests for GET /api/ratings/session/:session_id (issue #157).
 *
 * This route reveals whether/how a specific session was rated, so it must be
 * limited to that session's participants. DB is mocked.
 */
jest.mock('@/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));
jest.mock('@/utils/moderation', () => ({ moderateReviewText: () => ({ allowed: true }) }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import ratingsRouter from './ratings';
import { queryOne } from '@/database';
import { config } from '@/config';

const mockedQueryOne = queryOne as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/ratings', ratingsRouter);

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

describe('GET /api/ratings/session/:session_id', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get(`/api/ratings/session/${SESSION}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for a nonexistent session', async () => {
    mockedQueryOne.mockResolvedValueOnce(null); // participant middleware session lookup
    const res = await request(app)
      .get(`/api/ratings/session/${SESSION}`)
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-participant', async () => {
    mockedQueryOne.mockResolvedValueOnce(sessionRow);
    const res = await request(app)
      .get(`/api/ratings/session/${SESSION}`)
      .set('Authorization', `Bearer ${tokenFor('stranger')}`);
    expect(res.status).toBe(403);
  });

  it('returns the rating for a participant', async () => {
    mockedQueryOne
      .mockResolvedValueOnce(sessionRow) // participant middleware
      .mockResolvedValueOnce({ id: 'r-1', session_id: SESSION, rating: 5 }); // rating lookup

    const res = await request(app)
      .get(`/api/ratings/session/${SESSION}`)
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ id: 'r-1', rating: 5 });
  });
});
