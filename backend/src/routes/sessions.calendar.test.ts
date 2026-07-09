/**
 * Tests for GET /api/sessions/:id/calendar.ics (issue #167).
 *
 * The endpoint returns an .ics export of a booked session and must be limited
 * to that session's participants. DB is mocked.
 */
jest.mock('@/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  transaction: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sessionsRouter from './sessions';
import { queryOne } from '@/database';
import { config } from '@/config';

const mockedQueryOne = queryOne as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/sessions', sessionsRouter);

const MENTOR = 'mentor-1';
const STUDENT = 'student-1';
const SESSION = 'sess-1';

function tokenFor(id: string, role: 'mentor' | 'student' = 'student') {
  return jwt.sign({ id, email: `${id}@x.com`, role }, config.JWT_SECRET as string);
}

const participantRow = { id: SESSION, mentor_id: MENTOR, student_id: STUDENT };
const fullSession = {
  ...participantRow,
  title: 'Intro to React',
  description: 'Hooks',
  topic: 'React',
  scheduled_at: '2026-08-01T14:00:00.000Z',
  duration_minutes: 60,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/sessions/:id/calendar.ics', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get(`/api/sessions/${SESSION}/calendar.ics`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for a nonexistent session', async () => {
    mockedQueryOne.mockResolvedValueOnce(null); // participant middleware lookup
    const res = await request(app)
      .get(`/api/sessions/${SESSION}/calendar.ics`)
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-participant', async () => {
    mockedQueryOne.mockResolvedValueOnce(participantRow);
    const res = await request(app)
      .get(`/api/sessions/${SESSION}/calendar.ics`)
      .set('Authorization', `Bearer ${tokenFor('stranger')}`);
    expect(res.status).toBe(403);
  });

  it('returns an .ics file for a participant', async () => {
    mockedQueryOne
      .mockResolvedValueOnce(participantRow) // participant middleware
      .mockResolvedValueOnce(fullSession); // handler full-session lookup

    const res = await request(app)
      .get(`/api/sessions/${SESSION}/calendar.ics`)
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.headers['content-disposition']).toContain('.ics');
    expect(res.text).toContain('BEGIN:VCALENDAR');
    expect(res.text).toContain('DTSTART:20260801T140000Z');
    expect(res.text).toContain('SUMMARY:Intro to React');
  });

  it('lets the mentor export their own session too', async () => {
    mockedQueryOne
      .mockResolvedValueOnce(participantRow)
      .mockResolvedValueOnce(fullSession);

    const res = await request(app)
      .get(`/api/sessions/${SESSION}/calendar.ics`)
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('BEGIN:VEVENT');
  });

  it('returns 400 when the session has no scheduled time', async () => {
    mockedQueryOne
      .mockResolvedValueOnce(participantRow)
      .mockResolvedValueOnce({ ...fullSession, scheduled_at: null });

    const res = await request(app)
      .get(`/api/sessions/${SESSION}/calendar.ics`)
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`);

    expect(res.status).toBe(400);
  });
});
