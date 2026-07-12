import { Router, Response } from 'express';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import {
  requireSessionParticipant,
  isSessionParticipant,
  SessionRecord,
} from '@/middleware/requireSessionParticipant';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * Fetch a user's completed/in-progress session history. Mentors get the
 * sessions they mentored (with student details); everyone else gets the
 * sessions they attended as a student (with mentor details). Shared by the
 * JSON history handler and the CSV export.
 */
const fetchSessionHistory = (userId: string | undefined, role: string | undefined) => {
  if (role === 'mentor') {
    return query(
      `SELECT s.*, u.name as student_name, u.avatar_url as student_avatar
       FROM sessions s
       LEFT JOIN users u ON s.student_id = u.id
       WHERE s.mentor_id = $1 AND (s.status = 'completed' OR s.status = 'in_progress')
       ORDER BY s.updated_at DESC`,
      [userId]
    );
  }
  return query(
    `SELECT s.*, u.name as mentor_name, u.avatar_url as mentor_avatar, u.avg_rating
     FROM sessions s
     LEFT JOIN users u ON s.mentor_id = u.id
     WHERE s.student_id = $1 AND (s.status = 'completed' OR s.status = 'in_progress')
     ORDER BY s.updated_at DESC`,
    [userId]
  );
};

/** RFC-4180 CSV field escaping: quote and double any embedded quotes when the
 * value contains a comma, quote, or newline. */
const csvEscape = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Render session rows as a CSV string (header row always present). */
const sessionsToCsv = (rows: any[], role: string | undefined): string => {
  const counterpartyHeader = role === 'mentor' ? 'Student' : 'Mentor';
  const headers = ['Session ID', 'Title', counterpartyHeader, 'Scheduled At', 'Status', 'Duration (min)'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const counterparty = role === 'mentor' ? r.student_name : r.mentor_name;
    lines.push(
      [r.id, r.title, counterparty, r.scheduled_at, r.status, r.duration].map(csvEscape).join(',')
    );
  }
  return lines.join('\r\n');
};

// Shared user history handler
const userHistoryHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;

    const sessions = await fetchSessionHistory(userId, role);

    // Fetch ratings and feedback for each session
    const sessionsWithDetails = await Promise.all(
      sessions.rows.map(async (session: any) => {
        const [rating, feedback] = await Promise.all([
          queryOne('SELECT * FROM ratings WHERE session_id = $1', [session.id]),
          queryOne('SELECT * FROM session_feedback WHERE session_id = $1 AND user_id = $2', [session.id, userId]),
        ]);
        return { ...session, rating, feedback };
      })
    );

    res.json({
      success: true,
      data: sessionsWithDetails,
    });
  } catch (err) {
    console.error('Get session history error:', err);
    res.status(500).json({ error: 'Failed to get session history' });
  }
};

// Get session history for user (completed sessions)
router.get('/user/history', authMiddleware, userHistoryHandler);
router.get('/', authMiddleware, userHistoryHandler);

// Export the authenticated user's session history as a downloadable CSV.
router.get('/export/csv', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;

    const sessions = await fetchSessionHistory(userId, role);
    const csv = sessionsToCsv(sessions.rows, role);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="session-history.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Export session history CSV error:', err);
    res.status(500).json({ error: 'Failed to export session history' });
  }
});

// Get public session history for a specific mentor
router.get('/mentor/:mentorId', async (req: AuthRequest, res: Response) => {
  try {
    const { mentorId } = req.params;
    const sessions = await query(
      `SELECT s.id, s.title, s.scheduled_at, s.status, s.duration,
              u.name as student_name, u.avatar_url as student_avatar
       FROM sessions s
       LEFT JOIN users u ON s.student_id = u.id
       WHERE s.mentor_id = $1 AND s.status = 'completed'
       ORDER BY s.scheduled_at DESC
       LIMIT 50`,
      [mentorId]
    );

    // Fetch ratings for each session
    const sessionsWithDetails = await Promise.all(
      sessions.rows.map(async (session: any) => {
        const rating = await queryOne('SELECT * FROM ratings WHERE session_id = $1', [session.id]);
        return { ...session, rating };
      })
    );

    res.json({
      success: true,
      data: sessionsWithDetails,
    });
  } catch (err) {
    console.error('Get mentor session history error:', err);
    res.status(500).json({ error: 'Failed to get mentor session history' });
  }
});

// Complete session
router.patch('/:session_id/complete', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { session_id } = req.params;
    const userId = req.user?.id;

    // Verify session exists and user is part of it
    const session = await queryOne(
      'SELECT * FROM sessions WHERE id = $1 AND (mentor_id = $2 OR student_id = $2)',
      [session_id, userId]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found or unauthorized' });
    }

    const now = new Date().toISOString();
    await query(
      'UPDATE sessions SET status = $1, ended_at = $2, updated_at = $3 WHERE id = $4',
      ['completed', now, now, session_id]
    );

    const updatedSession = await queryOne('SELECT * FROM sessions WHERE id = $1', [session_id]);

    res.json({
      success: true,
      data: updatedSession,
    });
  } catch (err) {
    console.error('Complete session error:', err);
    res.status(500).json({ error: 'Failed to complete session' });
  }
});

// Submit session feedback
router.post('/feedback', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { session_id, feedback, difficulty_level, would_recommend } = req.body;
    const userId = req.user?.id;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    // Only participants of an existing session may leave feedback on it.
    const session = await queryOne<SessionRecord>(
      'SELECT id, mentor_id, student_id FROM sessions WHERE id = $1',
      [session_id]
    );
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (!isSessionParticipant(session, userId)) {
      return res.status(403).json({ error: 'You are not a participant in this session' });
    }

    // Prevent duplicate feedback submissions
    const existingFeedback = await queryOne(
      `SELECT id
   FROM session_feedback
   WHERE session_id = $1
     AND user_id = $2`,
      [session_id, userId]
    );

    if (existingFeedback) {
      return res.status(409).json({
        error: 'Feedback has already been submitted for this session',
      });
    }

    const feedbackId = uuidv4();
    const now = new Date().toISOString();

    await query(
      `INSERT INTO session_feedback (id, session_id, user_id, feedback, difficulty_level, would_recommend, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [feedbackId, session_id, userId, feedback || null, difficulty_level || null, would_recommend || null, now]
    );

    const newFeedback = await queryOne(
      'SELECT * FROM session_feedback WHERE id = $1',
      [feedbackId]
    );

    res.json({
      success: true,
      data: newFeedback,
    });
  } catch (err) {
    console.error('Submit feedback error:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// Get feedback for a session
router.get('/:session_id/feedback', authMiddleware, requireSessionParticipant('session_id'), async (req: AuthRequest, res: Response) => {
  try {
    const feedback = await query(
      `SELECT f.*, u.name, u.avatar_url
       FROM session_feedback f
       JOIN users u ON f.user_id = u.id
       WHERE f.session_id = $1
       ORDER BY f.created_at DESC`,
      [req.params.session_id]
    );

    res.json({
      success: true,
      data: feedback.rows,
    });
  } catch (err) {
    console.error('Get feedback error:', err);
    res.status(500).json({ error: 'Failed to get feedback' });
  }
});

// Get completed sessions count for user
router.get('/user/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const stats = await queryOne(
      `SELECT 
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as active_sessions,
        COUNT(*) as total_sessions
       FROM sessions 
       WHERE mentor_id = $1 OR student_id = $1`,
      [userId]
    );

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
