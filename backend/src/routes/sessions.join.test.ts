/**
 * Tests for the student focus note on session join (issue #168).
 * Verifies the optional `note` is validated and stored, and that joining
 * without a note still works (backward compatibility). DB, email, and
 * notification side-effects are mocked.
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
import { query, transaction } from '@/database';
import { config } from '@/config';

const mockedQuery = query as jest.Mock;
const mockedTransaction = transaction as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/sessions', sessionsRouter);

const MENTOR = 'mentor-1';
const STUDENT = 'student-1';
const SESSION = 'sess-1';

function tokenFor(id: string, role: 'mentor' | 'student') {
  return jwt.sign({ id, email: `${id}@x.com`, role }, config.JWT_SECRET as string);
}

// Captures the note value passed to the UPDATE so tests can assert on it.
let capturedNote: unknown;

function wireTransaction() {
  capturedNote = undefined;
  const session = {
    id: SESSION,
    mentor_id: MENTOR,
    student_id: null,
    status: 'scheduled',
    title: 'Intro to TS',
    topic: 'TypeScript',
    scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
    recurring_series_id: null,
  };

  const client = {
    query: jest.fn(async (text: string, params?: any[]) => {
      if (/FOR UPDATE/.test(text)) return { rows: [session] };
      if (/UPDATE sessions SET student_id/.test(text)) {
        capturedNote = params?.[4]; // student_note param
        return { rows: [] };
      }
      if (/SELECT \* FROM sessions WHERE id = \$1/.test(text)) {
        return {
          rows: [{ ...session, student_id: STUDENT, status: 'in_progress', student_note: capturedNote ?? null }],
        };
      }
      return { rows: [] };
    }),
  };

  mockedTransaction.mockImplementation(async (cb: any) => cb(client));

  // Post-booking: participants lookup for confirmation emails.
  mockedQuery.mockImplementation(async (text: string) => {
    if (/FROM users WHERE id = ANY/.test(text)) {
      return {
        rows: [
          { id: MENTOR, name: 'Mentor', email: 'm@x.com', email_notifications_enabled: false, timezone: 'UTC' },
          { id: STUDENT, name: 'Student', email: 's@x.com', email_notifications_enabled: false, timezone: 'UTC' },
        ],
      };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/sessions/:id/join — student focus note', () => {
  it('stores the note when the student joins with one', async () => {
    wireTransaction();
    const note = 'I want to review async error handling.';

    const res = await request(app)
      .post(`/api/sessions/${SESSION}/join`)
      .set('Authorization', `Bearer ${tokenFor(STUDENT, 'student')}`)
      .send({ note });

    expect(res.status).toBe(200);
    expect(capturedNote).toBe(note);
    expect(res.body.data.student_note).toBe(note);
  });

  it('joins successfully with no note (backward compatible)', async () => {
    wireTransaction();

    const res = await request(app)
      .post(`/api/sessions/${SESSION}/join`)
      .set('Authorization', `Bearer ${tokenFor(STUDENT, 'student')}`)
      .send({});

    expect(res.status).toBe(200);
    expect(capturedNote).toBeNull();
    expect(res.body.data.student_note).toBeNull();
  });

  it('trims whitespace-only notes down to null', async () => {
    wireTransaction();

    const res = await request(app)
      .post(`/api/sessions/${SESSION}/join`)
      .set('Authorization', `Bearer ${tokenFor(STUDENT, 'student')}`)
      .send({ note: '   ' });

    expect(res.status).toBe(200);
    expect(capturedNote).toBeNull();
  });

  it('rejects a note longer than 500 characters', async () => {
    wireTransaction();

    const res = await request(app)
      .post(`/api/sessions/${SESSION}/join`)
      .set('Authorization', `Bearer ${tokenFor(STUDENT, 'student')}`)
      .send({ note: 'x'.repeat(501) });

    expect(res.status).toBe(400);
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it('rejects a non-string note', async () => {
    wireTransaction();

    const res = await request(app)
      .post(`/api/sessions/${SESSION}/join`)
      .set('Authorization', `Bearer ${tokenFor(STUDENT, 'student')}`)
      .send({ note: { evil: true } });

    expect(res.status).toBe(400);
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it('returns 403 when a mentor tries to join', async () => {
    wireTransaction();

    const res = await request(app)
      .post(`/api/sessions/${SESSION}/join`)
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`)
      .send({ note: 'hi' });

    expect(res.status).toBe(403);
  });
});
