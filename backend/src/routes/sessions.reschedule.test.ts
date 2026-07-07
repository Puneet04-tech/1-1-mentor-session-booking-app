/**
 * Route-level tests for the session reschedule flow (issue #145).
 * DB, email, and notification side-effects are mocked so these exercise the
 * real handler logic (validation, 409 conflicts, success + notifications).
 */
jest.mock('@/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  transaction: jest.fn(),
}));
jest.mock('@/services/emailService', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/routes/notifications', () => ({
  __esModule: true,
  default: require('express').Router(),
  createNotification: jest.fn().mockResolvedValue('notif-id'),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sessionsRouter from './sessions';
import { query, queryOne } from '@/database';
import { sendEmail } from '@/services/emailService';
import { createNotification } from '@/routes/notifications';
import { config } from '@/config';

const mockedQuery = query as jest.Mock;
const mockedQueryOne = queryOne as jest.Mock;
const mockedSendEmail = sendEmail as jest.Mock;
const mockedCreateNotification = createNotification as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/sessions', sessionsRouter);

const HOUR = 60 * 60 * 1000;
const MENTOR = 'mentor-1';
const STUDENT = 'student-1';

function tokenFor(id: string, role: 'mentor' | 'student') {
  return jwt.sign({ id, email: `${id}@x.com`, role }, config.JWT_SECRET as string);
}

function baseSession(overrides: Record<string, any> = {}) {
  return {
    id: 'sess-1',
    mentor_id: MENTOR,
    student_id: STUDENT,
    status: 'scheduled',
    scheduled_at: new Date(Date.now() + 48 * HOUR).toISOString(),
    title: 'Intro to TS',
    topic: 'TypeScript',
    duration_minutes: 60,
    original_scheduled_at: null,
    reschedule_count: 0,
    ...overrides,
  };
}

/** Wire up the query/queryOne mocks for a happy-path reschedule. */
function mockHappyPath(session = baseSession(), otherSessions: any[] = []) {
  mockedQueryOne.mockImplementation(async (text: string) => {
    if (/FROM sessions WHERE id = \$1/.test(text) && /reschedule_count/.test(text)) return session;
    if (/SELECT \* FROM sessions WHERE id = \$1/.test(text)) {
      return { ...session, reschedule_count: (session.reschedule_count ?? 0) + 1 };
    }
    return null;
  });
  mockedQuery.mockImplementation(async (text: string) => {
    if (/mentor_id = \$1 AND id <> \$2/.test(text)) return { rows: otherSessions };
    if (/FROM users WHERE id = ANY/.test(text)) {
      return {
        rows: [
          { id: MENTOR, name: 'Mentor', email: 'm@x.com', email_notifications_enabled: true, timezone: 'UTC' },
          { id: STUDENT, name: 'Student', email: 's@x.com', email_notifications_enabled: true, timezone: 'UTC' },
        ],
      };
    }
    return { rows: [] }; // UPDATE
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/sessions/:id/reschedule', () => {
  const newTime = new Date(Date.now() + 72 * HOUR).toISOString();

  it('reschedules successfully and notifies both participants', async () => {
    mockHappyPath();

    const res = await request(app)
      .post('/api/sessions/sess-1/reschedule')
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`)
      .send({ newScheduledAt: newTime });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // UPDATE was issued with the new time + incremented count.
    const updateCall = mockedQuery.mock.calls.find((c: any[]) => /UPDATE sessions/.test(c[0]));
    expect(updateCall).toBeTruthy();
    expect(updateCall![1][0]).toBe(newTime); // scheduled_at param

    // Both participants notified (email + in-app).
    expect(mockedCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockedSendEmail).toHaveBeenCalledTimes(2);
  });

  it('returns 404 for a missing session', async () => {
    mockedQueryOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/sessions/missing/reschedule')
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`)
      .send({ newScheduledAt: newTime });
    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-participant', async () => {
    mockHappyPath();
    const res = await request(app)
      .post('/api/sessions/sess-1/reschedule')
      .set('Authorization', `Bearer ${tokenFor('stranger', 'student')}`)
      .send({ newScheduledAt: newTime });
    expect(res.status).toBe(403);
  });

  it('returns 400 when the new time violates the notice window', async () => {
    mockHappyPath();
    const res = await request(app)
      .post('/api/sessions/sess-1/reschedule')
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`)
      .send({ newScheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() }); // 30 min out
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-scheduled session', async () => {
    mockHappyPath(baseSession({ status: 'completed' }));
    const res = await request(app)
      .post('/api/sessions/sess-1/reschedule')
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`)
      .send({ newScheduledAt: newTime });
    expect(res.status).toBe(400);
  });

  it('returns 409 when the mentor has an overlapping session', async () => {
    // Another session starting 30 min into the requested 60-min slot.
    const overlapping = [{ scheduled_at: new Date(new Date(newTime).getTime() + 30 * 60 * 1000).toISOString(), duration_minutes: 60 }];
    mockHappyPath(baseSession(), overlapping);

    const res = await request(app)
      .post('/api/sessions/sess-1/reschedule')
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`)
      .send({ newScheduledAt: newTime });

    expect(res.status).toBe(409);
    // No write should have happened on conflict.
    const updateCall = mockedQuery.mock.calls.find((c: any[]) => /UPDATE sessions/.test(c[0]));
    expect(updateCall).toBeFalsy();
  });

  it('returns 400 when no new time is supplied', async () => {
    mockHappyPath();
    const res = await request(app)
      .post('/api/sessions/sess-1/reschedule')
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
