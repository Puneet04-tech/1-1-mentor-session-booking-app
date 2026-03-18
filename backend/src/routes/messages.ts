import { Router, Response } from 'express';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';

const router = Router();

// Get messages for session
router.get('/:sessionId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const messages = await query(
      `SELECT m.*, u.name, u.avatar_url FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.session_id = $1
       ORDER BY m.created_at ASC`,
      [req.params.sessionId]
    );

    res.json({
      success: true,
      data: messages,
    });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Send message
router.post('/:sessionId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { content, type = 'text', code_snippet } = req.body;
    const now = new Date().toISOString();

    const result = await queryOne(
      `INSERT INTO messages (session_id, user_id, content, type, code_snippet, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.params.sessionId, req.user?.id, content, type, code_snippet, now]
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
