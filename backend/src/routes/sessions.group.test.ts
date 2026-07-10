/**
 * Tests for Group Sessions (multi-participant MVP) — issue #169.
 * Covers max_participants validation on create, capacity-limited joins (incl.
 * 409 when full), backward-compatible single-participant behaviour, and the
 * participant list on GET /:id. DB / email / notifications are mocked.
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
import { query, queryOne, transaction } from '@/database';
import { config } from '@/config';

const mockedQuery = query as jest.Mock;
const mockedQueryOne = queryOne as jest.Mock;
const mockedTransaction = transaction as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/sessions', sessionsRouter);

const MENTOR = 'mentor-1';
const SESSION = 'sess-1';

function tokenFor(id: string, role: 'mentor' | 'student') {
  return jwt.sign({ id, email: `${id}@x.com`, role }, config.JWT_SECRET as string);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/sessions — max_participants', () => {
  it('stores a valid max_participants on create', async () => {
    let insertParams: any[] = [];
    mockedQuery.mockImplementation(async (text: string, params?: any[]) => {
      if (/INSERT INTO sessions/.test(text)) {
        insertParams = params || [];
      }
      return { rows: [] };
    });
    mockedQueryOne.mockResolvedValue({ id: SESSION, max_participants: 5 });

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`)
      .send({ title: 'Workshop', scheduled_at: new Date(Date.now() + 3600_000).toISOString(), max_participants: 5 });

    expect(res.status).toBe(200);
    expect(insertParams).toContain(5); // max_participants passed through
  });

  it('rejects max_participants below 1', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`)
      .send({ title: 'Workshop', scheduled_at: new Date(Date.now() + 3600_000).toISOString(), max_participants: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects max_participants above 50', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`)
      .send({ title: 'Workshop', scheduled_at: new Date(Date.now() + 3600_000).toISOString(), max_participants: 51 });
    expect(res.status).toBe(400);
  });

  it('defaults to single-participant when max_participants is omitted', async () => {
    let insertParams: any[] = [];
    mockedQuery.mockImplementation(async (text: string, params?: any[]) => {
      if (/INSERT INTO sessions/.test(text)) insertParams = params || [];
      return { rows: [] };
    });
    mockedQueryOne.mockResolvedValue({ id: SESSION, max_participants: 1 });

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`)
      .send({ title: 'One-on-one', scheduled_at: new Date(Date.now() + 3600_000).toISOString() });

    expect(res.status).toBe(200);
    expect(insertParams).toContain(1);
  });
});

/**
 * Build a fake transaction client for a join against `session`, with the given
 * current participant count.
 */
function wireJoin(session: any, participantCount: number, isMember = false) {
  const client = {
    query: jest.fn(async (text: string) => {
      if (/FOR UPDATE/.test(text)) return { rows: [session] };
      if (/COUNT\(\*\)/.test(text)) return { rows: [{ count: participantCount, is_member: isMember }] };
      if (/SELECT \* FROM sessions WHERE id = \$1/.test(text)) return { rows: [session] };
      return { rows: [] }; // INSERT / UPDATE
    }),
  };
  mockedTransaction.mockImplementation(async (cb: any) => cb(client));
  // Post-join user lookup (only hit on first join).
  mockedQuery.mockImplementation(async (text: string) => {
    if (/FROM users WHERE id = ANY/.test(text)) {
      return { rows: [{ id: MENTOR, name: 'M', email: 'm@x.com', email_notifications_enabled: false }] };
    }
    return { rows: [] };
  });
  return client;
}

describe('POST /api/sessions/:id/join — group capacity', () => {
  const groupSession = {
    id: SESSION,
    mentor_id: MENTOR,
    student_id: 'first-student',
    status: 'in_progress',
    max_participants: 3,
    recurring_series_id: null,
  };

  it('lets a second student join a group session with capacity left', async () => {
    const client = wireJoin(groupSession, 1);

    const res = await request(app)
      .post(`/api/sessions/${SESSION}/join`)
      .set('Authorization', `Bearer ${tokenFor('student-2', 'student')}`)
      .send({});

    expect(res.status).toBe(200);
    // A participant row was inserted.
    const insertCall = client.query.mock.calls.find((c: any[]) => /INSERT INTO session_participants/.test(c[0]));
    expect(insertCall).toBeTruthy();
  });

  it('returns 409 when the group session is full', async () => {
    wireJoin(groupSession, 3);

    const res = await request(app)
      .post(`/api/sessions/${SESSION}/join`)
      .set('Authorization', `Bearer ${tokenFor('student-9', 'student')}`)
      .send({});

    expect(res.status).toBe(409);
  });

  it('treats an already-joined student as a no-op (idempotent)', async () => {
    wireJoin(groupSession, 2, true);

    const res = await request(app)
      .post(`/api/sessions/${SESSION}/join`)
      .set('Authorization', `Bearer ${tokenFor('student-2', 'student')}`)
      .send({});

    expect(res.status).toBe(200);
  });

  it('keeps single-participant sessions unchanged: 409 for a second student', async () => {
    const singleSession = {
      id: SESSION,
      mentor_id: MENTOR,
      student_id: 'other-student',
      status: 'in_progress',
      max_participants: 1,
      recurring_series_id: null,
    };
    wireJoin(singleSession, 1);

    const res = await request(app)
      .post(`/api/sessions/${SESSION}/join`)
      .set('Authorization', `Bearer ${tokenFor('student-2', 'student')}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already been joined/);
  });
});

describe('GET /api/sessions/:id — participant list', () => {
  it('returns the participants array to the mentor', async () => {
    mockedQueryOne.mockResolvedValue({
      id: SESSION,
      mentor_id: MENTOR,
      student_id: 'student-2',
      max_participants: 3,
    });
    mockedQuery.mockResolvedValue({
      rows: [
        { student_id: 'student-2', name: 'Ann', avatar_url: null, joined_at: '2026-07-10T00:00:00Z' },
        { student_id: 'student-3', name: 'Bob', avatar_url: null, joined_at: '2026-07-10T00:05:00Z' },
      ],
    });

    const res = await request(app)
      .get(`/api/sessions/${SESSION}`)
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.participants).toHaveLength(2);
    expect(res.body.data.participants[0].student_id).toBe('student-2');
  });
});
