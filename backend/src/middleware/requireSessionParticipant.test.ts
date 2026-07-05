import { Response } from 'express';
import {
  isSessionParticipant,
  requireSessionParticipant,
  SessionAuthRequest,
} from './requireSessionParticipant';
import { queryOne } from '@/database';

jest.mock('@/database', () => ({
  queryOne: jest.fn(),
}));

const mockedQueryOne = queryOne as jest.MockedFunction<typeof queryOne>;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('isSessionParticipant', () => {
  const session = { mentor_id: 'mentor-1', student_id: 'student-1' };

  it('accepts the session mentor', () => {
    expect(isSessionParticipant(session, 'mentor-1')).toBe(true);
  });

  it('accepts the session student', () => {
    expect(isSessionParticipant(session, 'student-1')).toBe(true);
  });

  it('rejects an unrelated user', () => {
    expect(isSessionParticipant(session, 'attacker-9')).toBe(false);
  });

  it('rejects when the session or user is missing', () => {
    expect(isSessionParticipant(null, 'mentor-1')).toBe(false);
    expect(isSessionParticipant(session, undefined)).toBe(false);
  });
});

describe('requireSessionParticipant middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when there is no authenticated user', async () => {
    const req = { params: { sessionId: 's1' } } as unknown as SessionAuthRequest;
    const res = mockRes();
    const next = jest.fn();

    await requireSessionParticipant()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(mockedQueryOne).not.toHaveBeenCalled();
  });

  it('returns 404 when the session does not exist', async () => {
    mockedQueryOne.mockResolvedValue(null);
    const req = {
      params: { sessionId: 's1' },
      user: { id: 'u1', email: 'a@b.com', role: 'student' },
    } as unknown as SessionAuthRequest;
    const res = mockRes();
    const next = jest.fn();

    await requireSessionParticipant()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is authenticated but not a participant', async () => {
    mockedQueryOne.mockResolvedValue({ id: 's1', mentor_id: 'm1', student_id: 'st1' });
    const req = {
      params: { sessionId: 's1' },
      user: { id: 'attacker', email: 'a@b.com', role: 'student' },
    } as unknown as SessionAuthRequest;
    const res = mockRes();
    const next = jest.fn();

    await requireSessionParticipant()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and attaches the session for a legitimate participant', async () => {
    const session = { id: 's1', mentor_id: 'm1', student_id: 'st1' };
    mockedQueryOne.mockResolvedValue(session);
    const req = {
      params: { sessionId: 's1' },
      user: { id: 'st1', email: 'a@b.com', role: 'student' },
    } as unknown as SessionAuthRequest;
    const res = mockRes();
    const next = jest.fn();

    await requireSessionParticipant()(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.sessionRecord).toEqual(session);
  });

  it('supports a custom route param name', async () => {
    mockedQueryOne.mockResolvedValue({ id: 'x', mentor_id: 'm1', student_id: null });
    const req = {
      params: { id: 'x' },
      user: { id: 'm1', email: 'a@b.com', role: 'mentor' },
    } as unknown as SessionAuthRequest;
    const res = mockRes();
    const next = jest.fn();

    await requireSessionParticipant('id')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockedQueryOne).toHaveBeenCalledWith(expect.any(String), ['x']);
  });
});
