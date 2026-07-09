/**
 * Authorization tests for POST /api/code/execute (issue #158).
 *
 * When a `sessionId` is supplied, the execution result is broadcast to that
 * session's Socket.io room, so only participants may target a session. DB and
 * the external code runner are mocked; a fake Socket.io server lets us assert
 * that non-participants never trigger a broadcast.
 */
jest.mock('@/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));
jest.mock('@/utils/codeExecution', () => ({
  GLOT_LANGUAGE_MAP: { javascript: 'node' },
  normalizeLanguage: (l: string) => l,
  executeCode: jest.fn().mockResolvedValue('hello\n'),
  executeViaGlot: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import codeRouter, { setSocketIO } from './code';
import { queryOne } from '@/database';
import { executeCode } from '@/utils/codeExecution';
import { config } from '@/config';

const mockedQueryOne = queryOne as jest.Mock;
const mockedExecuteCode = executeCode as jest.Mock;

// Fake Socket.io: to() returns an object whose emit we can spy on.
const emit = jest.fn();
const to = jest.fn(() => ({ emit }));
setSocketIO({ to } as any);

const app = express();
app.use(express.json());
app.use('/api/code', codeRouter);

const MENTOR = 'mentor-1';
const STUDENT = 'student-1';
const SESSION = 'sess-1';

function tokenFor(id: string, role: 'mentor' | 'student' = 'student') {
  return jwt.sign({ id, email: `${id}@x.com`, role }, config.JWT_SECRET as string);
}

const sessionRow = { id: SESSION, mentor_id: MENTOR, student_id: STUDENT };
const body = { code: 'print("hi")', language: 'javascript', sessionId: SESSION };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/code/execute', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/code/execute').send(body);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the target session does not exist', async () => {
    mockedQueryOne.mockResolvedValueOnce(null); // session lookup
    const res = await request(app)
      .post('/api/code/execute')
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`)
      .send(body);
    expect(res.status).toBe(404);
    // Neither executed nor broadcast.
    expect(mockedExecuteCode).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('returns 403 and does not broadcast for a non-participant', async () => {
    mockedQueryOne.mockResolvedValueOnce(sessionRow);
    const res = await request(app)
      .post('/api/code/execute')
      .set('Authorization', `Bearer ${tokenFor('stranger')}`)
      .send(body);
    expect(res.status).toBe(403);
    expect(mockedExecuteCode).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('executes and broadcasts for a participant', async () => {
    mockedQueryOne.mockResolvedValueOnce(sessionRow);
    const res = await request(app)
      .post('/api/code/execute')
      .set('Authorization', `Bearer ${tokenFor(MENTOR, 'mentor')}`)
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockedExecuteCode).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith(`session:${SESSION}`);
    expect(emit).toHaveBeenCalledWith('code:execution:result', expect.objectContaining({ status: 'Success' }));
  });

  it('executes without a session and never checks participation', async () => {
    const res = await request(app)
      .post('/api/code/execute')
      .set('Authorization', `Bearer ${tokenFor(STUDENT)}`)
      .send({ code: 'print("hi")', language: 'javascript' }); // no sessionId
    expect(res.status).toBe(200);
    expect(mockedQueryOne).not.toHaveBeenCalled();
    expect(mockedExecuteCode).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();
  });
});
