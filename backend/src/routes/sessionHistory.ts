import { Router, Response } from 'express';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Get session history for user (completed sessions)
router.get('/user/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;

    let sessions;
    if (role === 'mentor') {
      // Mentors see their own sessions where they were mentor
      sessions = await query(
        `SELECT s.*, u.name as student_name, u.avatar_url as student_avatar
         FROM sessions s
         LEFT JOIN users u ON s.student_id = u.id
         WHERE s.mentor_id = $1 AND (s.status = 'completed' OR s.status = 'in_progress')
         ORDER BY s.updated_at DESC`,
        [userId]
      );
    } else {
      // Students see sessions they joined
      sessions = await query(
        `SELECT s.*, u.name as mentor_name, u.avatar_url as mentor_avatar, u.avg_rating
         FROM sessions s
         LEFT JOIN users u ON s.mentor_id = u.id
         WHERE s.student_id = $1 AND (s.status = 'completed' OR s.status = 'in_progress')
         ORDER BY s.updated_at DESC`,
        [userId]
      );
    }

    // Fetch ratings and feedback for each session
    const sessionsWithDetails = await Promise.all(
      sessions.map(async (session: any) => {
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
});

// Submit session feedback
router.post('/feedback', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { session_id, feedback, difficulty_level, would_recommend } = req.body;
    const userId = req.user?.id;

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
router.get('/:session_id/feedback', async (req: AuthRequest, res: Response) => {
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
      data: feedback,
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
