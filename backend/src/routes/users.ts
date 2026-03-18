import { Router, Response } from 'express';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';

const router = Router();

// Get user profile
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const user = await queryOne('SELECT id, email, name, role, avatar_url, bio, verified FROM users WHERE id = $1', [
      req.params.id,
    ]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update profile
router.put('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, bio, avatar_url } = req.body;
    const now = new Date().toISOString();

    await query(
      'UPDATE users SET name = $1, bio = $2, avatar_url = $3, updated_at = $4 WHERE id = $5',
      [name, bio, avatar_url, now, req.user?.id]
    );

    const updatedUser = await queryOne('SELECT * FROM users WHERE id = $1', [req.user?.id]);

    res.json({
      success: true,
      data: updatedUser,
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get all mentors
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const mentors = await query(
      'SELECT id, email, name, avatar_url, bio FROM users WHERE role = $1 LIMIT 50',
      ['mentor']
    );

    res.json({
      success: true,
      data: mentors,
    });
  } catch (err) {
    console.error('Get mentors error:', err);
    res.status(500).json({ error: 'Failed to get mentors' });
  }
});

export default router;
