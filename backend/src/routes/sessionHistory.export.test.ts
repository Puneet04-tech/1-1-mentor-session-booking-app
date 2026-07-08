/**
 * Tests for GET /api/session-history/export/csv (issue #160).
 *
 * Verifies auth, correct download headers, CSV escaping of commas/quotes in
 * titles, and that an empty history yields a header-only CSV (no error).
 */
jest.mock('@/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sessionHistoryRouter from './sessionHistory';
import { query } from '@/database';
import { config } from '@/config';

const mockedQuery = query as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/session-history', sessionHistoryRouter);

function tokenFor(id: string, role: 'mentor' | 'student') {
  return jwt.sign({ id, email: `${id}@x.com`, role }, config.JWT_SECRET as string);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/session-history/export/csv', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/session-history/export/csv');
    expect(res.status).toBe(401);
  });

  it('sets CSV download headers and escapes special characters', async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 's1',
          title: 'Intro, "Advanced" TS',
          student_name: 'Alice',
          scheduled_at: '2026-01-10T10:00:00Z',
          status: 'completed',
          duration: 60,
        },
      ],
    });

    const res = await request(app)
      .get('/api/session-history/export/csv')
      .set('Authorization', `Bearer ${tokenFor('mentor-1', 'mentor')}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe('attachment; filename="session-history.csv"');

    const lines = res.text.split('\r\n');
    expect(lines[0]).toBe('Session ID,Title,Student,Scheduled At,Status,Duration (min)');
    // Comma + embedded quotes force quoting; internal quotes are doubled.
    expect(lines[1]).toBe('s1,"Intro, ""Advanced"" TS",Alice,2026-01-10T10:00:00Z,completed,60');
  });

  it('uses a Mentor column for students', async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{ id: 's2', title: 'Lesson', mentor_name: 'Bob', scheduled_at: '2026-02-01T09:00:00Z', status: 'in_progress', duration: 30 }],
    });

    const res = await request(app)
      .get('/api/session-history/export/csv')
      .set('Authorization', `Bearer ${tokenFor('student-1', 'student')}`);

    expect(res.status).toBe(200);
    const lines = res.text.split('\r\n');
    expect(lines[0]).toBe('Session ID,Title,Mentor,Scheduled At,Status,Duration (min)');
    expect(lines[1]).toBe('s2,Lesson,Bob,2026-02-01T09:00:00Z,in_progress,30');
  });

  it('returns a header-only CSV when there is no history', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/session-history/export/csv')
      .set('Authorization', `Bearer ${tokenFor('mentor-1', 'mentor')}`);

    expect(res.status).toBe(200);
    expect(res.text).toBe('Session ID,Title,Student,Scheduled At,Status,Duration (min)');
  });
});
