/**
 * Role + validation tests for POST /api/availability/mentor/slots (issue #159).
 *
 * Only mentors may set their availability, and a malformed payload must be a
 * 400 rather than a partial write + 500. DB is mocked.
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

function tokenFor(id: string, role: 'mentor' | 'student' | 'admin') {
  return jwt.sign({ id, email: `${id}@x.com`, role }, config.JWT_SECRET as string);
}

const validSlots = [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }];

beforeEach(() => {
  jest.clearAllMocks();
  mockedQuery.mockResolvedValue({ rows: [] });
});

describe('POST /api/availability/mentor/slots', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/availability/mentor/slots').send({ slots: validSlots });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a student (non-mentor)', async () => {
    const res = await request(app)
      .post('/api/availability/mentor/slots')
      .set('Authorization', `Bearer ${tokenFor('student-1', 'student')}`)
      .send({ slots: validSlots });
    expect(res.status).toBe(403);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns 400 when slots is not an array', async () => {
    const res = await request(app)
      .post('/api/availability/mentor/slots')
      .set('Authorization', `Bearer ${tokenFor('mentor-1', 'mentor')}`)
      .send({ slots: 'nope' });
    expect(res.status).toBe(400);
    // Nothing was deleted/inserted.
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns 400 for an out-of-range dayOfWeek', async () => {
    const res = await request(app)
      .post('/api/availability/mentor/slots')
      .set('Authorization', `Bearer ${tokenFor('mentor-1', 'mentor')}`)
      .send({ slots: [{ dayOfWeek: 9, startTime: '09:00', endTime: '17:00' }] });
    expect(res.status).toBe(400);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns 400 when startTime is not before endTime', async () => {
    const res = await request(app)
      .post('/api/availability/mentor/slots')
      .set('Authorization', `Bearer ${tokenFor('mentor-1', 'mentor')}`)
      .send({ slots: [{ dayOfWeek: 1, startTime: '17:00', endTime: '09:00' }] });
    expect(res.status).toBe(400);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed time string', async () => {
    const res = await request(app)
      .post('/api/availability/mentor/slots')
      .set('Authorization', `Bearer ${tokenFor('mentor-1', 'mentor')}`)
      .send({ slots: [{ dayOfWeek: 1, startTime: '9am', endTime: '5pm' }] });
    expect(res.status).toBe(400);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('accepts a valid payload from a mentor', async () => {
    const res = await request(app)
      .post('/api/availability/mentor/slots')
      .set('Authorization', `Bearer ${tokenFor('mentor-1', 'mentor')}`)
      .send({ slots: validSlots });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // One DELETE + one INSERT.
    expect(mockedQuery.mock.calls.some((c: any[]) => /DELETE FROM mentor_availability/.test(c[0]))).toBe(true);
    expect(mockedQuery.mock.calls.some((c: any[]) => /INSERT INTO mentor_availability/.test(c[0]))).toBe(true);
  });

  it('accepts an empty slots array (clears availability)', async () => {
    const res = await request(app)
      .post('/api/availability/mentor/slots')
      .set('Authorization', `Bearer ${tokenFor('mentor-1', 'mentor')}`)
      .send({ slots: [] });
    expect(res.status).toBe(200);
    expect(mockedQuery.mock.calls.some((c: any[]) => /DELETE FROM mentor_availability/.test(c[0]))).toBe(true);
    expect(mockedQuery.mock.calls.some((c: any[]) => /INSERT INTO mentor_availability/.test(c[0]))).toBe(false);
  });
});
