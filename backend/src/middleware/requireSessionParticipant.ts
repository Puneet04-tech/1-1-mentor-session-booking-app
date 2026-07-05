import { Response, NextFunction } from 'express';
import { queryOne } from '@/database';
import { AuthRequest } from './auth';

export interface SessionRecord {
  id: string;
  mentor_id: string;
  student_id: string | null;
}

export interface SessionAuthRequest extends AuthRequest {
  sessionRecord?: SessionRecord;
}

/**
 * Pure authorization check: is `userId` a participant (mentor or student) of the
 * given session? Kept separate from the DB/HTTP layer so it can be unit-tested.
 */
export function isSessionParticipant(
  session: Pick<SessionRecord, 'mentor_id' | 'student_id'> | null | undefined,
  userId: string | undefined
): boolean {
  if (!session || !userId) {
    return false;
  }
  return session.mentor_id === userId || session.student_id === userId;
}

/**
 * Express middleware that rejects any request whose authenticated user is not a
 * participant of the session identified by a route param (default `sessionId`).
 *
 * Fixes broken access control (issue #141): endpoints such as
 * `GET/POST /api/messages/:sessionId` and `GET/POST /api/code/:sessionId`
 * previously trusted the resource id alone, letting any authenticated user read
 * or write session data they had no part in. Responds `404` when the session
 * does not exist and `403` when the user is authenticated but not a participant.
 *
 * On success, attaches the session to `req.sessionRecord` for downstream use.
 */
export function requireSessionParticipant(paramName: string = 'sessionId') {
  return async (req: SessionAuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const sessionId = req.params[paramName];
      if (!sessionId) {
        return res.status(400).json({ error: 'Session id is required' });
      }

      const session = await queryOne<SessionRecord>(
        'SELECT id, mentor_id, student_id FROM sessions WHERE id = $1',
        [sessionId]
      );

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (!isSessionParticipant(session, userId)) {
        return res.status(403).json({ error: 'You are not a participant in this session' });
      }

      req.sessionRecord = session;
      next();
    } catch (err) {
      console.error('Session participant check error:', err);
      res.status(500).json({ error: 'Failed to verify session access' });
    }
  };
}

export default requireSessionParticipant;
