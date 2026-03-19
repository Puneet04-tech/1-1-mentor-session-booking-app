import { Router, Response } from 'express';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Create session
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, topic, scheduled_at, duration_minutes, language, code_language } =
      req.body;

    const sessionId = uuidv4();
    const now = new Date().toISOString();
    // Use provided scheduled_at or default to now if not provided
    const sessionScheduledAt = scheduled_at || now;

    await query(
      `INSERT INTO sessions (id, mentor_id, title, description, topic, status, scheduled_at, duration_minutes, language, code_language, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, $7, $8, $9, $10, $11)`,
      [
        sessionId,
        req.user?.id,
        title,
        description,
        topic,
        sessionScheduledAt,
        duration_minutes || 60,
        language || 'javascript',
        code_language || 'javascript',
        now,
        now,
      ]
    );

    const newSession = await queryOne('SELECT * FROM sessions WHERE id = $1', [sessionId]);

    res.json({
      success: true,
      data: newSession,
    });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get active sessions (MUST come before /:id)
router.get('/active', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await query(
      'SELECT * FROM sessions WHERE status = $1 AND (mentor_id = $2 OR student_id = $2)',
      ['in_progress', req.user?.id]
    );

    res.json({
      success: true,
      data: sessions,
    });
  } catch (err) {
    console.error('Get active sessions error:', err);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Get user sessions (MUST come before /:id)
router.get('/user', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await query(
      'SELECT * FROM sessions WHERE mentor_id = $1 OR student_id = $1 ORDER BY created_at DESC',
      [req.user?.id]
    );

    res.json({
      success: true,
      data: sessions,
    });
  } catch (err) {
    console.error('Get user sessions error:', err);
    res.status(500).json({ error: 'Failed to get user sessions' });
  }
});

// Get session by ID
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const session = await queryOne('SELECT * FROM sessions WHERE id = $1', [req.params.id]);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Join session
router.post('/:id/join', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date().toISOString();

    const session = await queryOne('SELECT * FROM sessions WHERE id = $1', [req.params.id]);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Update session with student_id and change status
    await query(
      'UPDATE sessions SET student_id = $1, status = $2, started_at = $3, updated_at = $4 WHERE id = $5',
      [req.user?.id, 'in_progress', now, now, req.params.id]
    );

    const updatedSession = await queryOne('SELECT * FROM sessions WHERE id = $1', [req.params.id]);

    res.json({
      success: true,
      data: updatedSession,
    });
  } catch (err) {
    console.error('Join session error:', err);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

// End session
router.post('/:id/end', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date().toISOString();

    await query(
      'UPDATE sessions SET status = $1, ended_at = $2, updated_at = $3 WHERE id = $4',
      ['completed', now, now, req.params.id]
    );

    const updatedSession = await queryOne('SELECT * FROM sessions WHERE id = $1', [req.params.id]);

    res.json({
      success: true,
      data: updatedSession,
    });
  } catch (err) {
    console.error('End session error:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

export default router;
