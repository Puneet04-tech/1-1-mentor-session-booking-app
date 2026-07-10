/**
 * Tests for the Bookmark / Favorite Mentors API (issue #166).
 *
 * Covers role-based access control (students only), add/remove/list behaviour,
 * and duplicate-prevention via the unique constraint. DB is mocked.
 */
jest.mock('@/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import favoritesRouter from './favorites';
import { query, queryOne } from '@/database';
import { config } from '@/config';

const mockedQuery = query as jest.Mock;
const mockedQueryOne = queryOne as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/favorites', favoritesRouter);

const STUDENT = 'student-1';
const MENTOR = 'mentor-1';

function tokenFor(id: string, role: 'mentor' | 'student' | 'admin' = 'student') {
  return jwt.sign({ id, email: `${id}@x.com`, role }, config.JWT_SECRET as string);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/favorites', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/favorites').send({ mentor_id: MENTOR });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-student (mentor) role', async () => {
    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`)
      .send({ mentor_id: MENTOR });
    expect(res.status).toBe(403);
  });

  it('returns 400 when mentor_id is missing', async () => {
    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when the target is not a mentor', async () => {
    mockedQueryOne.mockResolvedValueOnce({ id: 'x', role: 'student' });
    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`)
      .send({ mentor_id: 'x' });
    expect(res.status).toBe(404);
  });

  it('adds a favorite for a valid mentor', async () => {
    mockedQueryOne.mockResolvedValueOnce({ id: MENTOR, role: 'mentor' });
    mockedQuery.mockResolvedValueOnce({ rows: [] }); // insert
    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`)
      .send({ mentor_id: MENTOR });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mentor_id).toBe(MENTOR);
  });

  it('is idempotent when the mentor is already favorited (unique violation)', async () => {
    mockedQueryOne.mockResolvedValueOnce({ id: MENTOR, role: 'mentor' });
    mockedQuery.mockRejectedValueOnce({ code: '23505' }); // duplicate
    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`)
      .send({ mentor_id: MENTOR });
    expect(res.status).toBe(200);
    expect(res.body.alreadyFavorited).toBe(true);
  });
});

describe('DELETE /api/favorites/:mentor_id', () => {
  it('returns 403 for a non-student', async () => {
    const res = await request(app)
      .delete(`/api/favorites/${MENTOR}`)
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`);
    expect(res.status).toBe(403);
  });

  it('removes an existing favorite', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ id: 'fav-1' }] });
    const res = await request(app)
      .delete(`/api/favorites/${MENTOR}`)
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when the favorite does not exist', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete(`/api/favorites/${MENTOR}`)
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/favorites', () => {
  it('returns 403 for a non-student', async () => {
    const res = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`);
    expect(res.status).toBe(403);
  });

  it("returns only the authenticated student's saved mentors", async () => {
    const rows = [{ id: MENTOR, name: 'Ada', role: 'mentor' }];
    mockedQuery.mockResolvedValueOnce({ rows });
    const res = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(rows);
    // Query must be scoped to the caller's own id.
    expect(mockedQuery.mock.calls[0][1]).toEqual([STUDENT]);
  });
});

describe('GET /api/favorites/ids', () => {
  it('returns the list of favorited mentor ids', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ mentor_id: MENTOR }, { mentor_id: 'mentor-2' }] });
    const res = await request(app)
      .get('/api/favorites/ids')
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([MENTOR, 'mentor-2']);
  });
});
