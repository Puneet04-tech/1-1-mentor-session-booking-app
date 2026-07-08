/**
 * Route-level tests for GET /api/availability/calendar/:mentorId (issue #156).
 *
 * This endpoint exposes a user's private calendar (session titles, times,
 * status), so it must be authenticated and owner-only. The DB is mocked so
 * these exercise the real handler logic (auth, ownership, existence).
 */
jest.mock('@/database', () => ({
  query: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import availabilityRouter from './availability';
import { query } from '@/database';
import { config } from '@/config';

const mockedQuery = query as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/availability', availabilityRouter);

const MENTOR = 'mentor-1';

function tokenFor(id: string, role: 'mentor' | 'student' = 'mentor') {
  return jwt.sign({ id, email: `${id}@x.com`, role }, config.JWT_SECRET as string);
}

const range = '?startDate=2026-01-01&endDate=2026-01-31';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/availability/calendar/:mentorId', () => {
  it('returns 401 when no token is supplied', async () => {
    const res = await request(app).get(`/api/availability/calendar/${MENTOR}${range}`);
    expect(res.status).toBe(401);
    // No DB access should occur for an unauthenticated request.
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns 403 when the requester is not the calendar owner', async () => {
    const res = await request(app)
      .get(`/api/availability/calendar/${MENTOR}${range}`)
      .set('Authorization', `Bearer ${tokenFor('stranger')}`);
    expect(res.status).toBe(403);
    // Ownership is rejected before any private data is queried.
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns 404 when the (owned) user no longer exists', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] }); // role lookup finds nobody
    const res = await request(app)
      .get(`/api/availability/calendar/${MENTOR}${range}`)
      .set('Authorization', `Bearer ${tokenFor(MENTOR)}`);
    expect(res.status).toBe(404);
  });

  it('returns the calendar for the authenticated owner', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ role: 'mentor' }] }) // role lookup
      .mockResolvedValueOnce({
        rows: [
          { id: 's1', title: 'Intro', scheduled_at: '2026-01-10T10:00:00Z', status: 'scheduled' },
        ],
      }); // sessions

    const res = await request(app)
      .get(`/api/availability/calendar/${MENTOR}${range}`)
      .set('Authorization', `Bearer ${tokenFor(MENTOR)}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0]).toMatchObject({ id: 's1', title: 'Intro', status: 'scheduled', color: 'blue' });
  });
});
