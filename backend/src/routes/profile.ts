import { Router, Response } from 'express';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';

const router = Router();

// Get user profile with skills
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const user = await queryOne(
      `SELECT id, email, name, role, avatar_url, bio, hourly_rate, 
              total_sessions, avg_rating, verified, created_at
       FROM users WHERE id = $1`,
      [req.params.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch user skills
    const skills = await query(
      `SELECT skill_name, proficiency_level, years_experience 
       FROM user_skills WHERE user_id = $1 
       ORDER BY proficiency_level DESC`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: { ...user, skills },
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user profile (authenticated)
router.put('/profile/update', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, bio, avatar_url, hourly_rate, skills } = req.body;
    const userId = req.user?.id;
    const now = new Date().toISOString();

    // Update user profile
    await query(
      `UPDATE users 
       SET name = COALESCE($1, name),
           bio = COALESCE($2, bio),
           avatar_url = COALESCE($3, avatar_url),
           hourly_rate = COALESCE($4, hourly_rate),
           updated_at = $5
       WHERE id = $6`,
      [name || null, bio || null, avatar_url || null, hourly_rate || null, now, userId]
    );

    // Update skills if provided
    if (skills && Array.isArray(skills)) {
      // Delete existing skills
      await query('DELETE FROM user_skills WHERE user_id = $1', [userId]);

      // Insert new skills
      for (const skill of skills) {
        if (skill.skill_name) {
          await query(
            `INSERT INTO user_skills (user_id, skill_name, proficiency_level, years_experience)
             VALUES ($1, $2, $3, $4)`,
            [userId, skill.skill_name, skill.proficiency_level || 'intermediate', skill.years_experience || 0]
          );
        }
      }
    }

    // Fetch updated profile
    const updatedUser = await queryOne(
      `SELECT id, email, name, role, avatar_url, bio, hourly_rate, 
              total_sessions, avg_rating, verified, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    const updatedSkills = await query(
      `SELECT skill_name, proficiency_level, years_experience FROM user_skills WHERE user_id = $1`,
      [userId]
    );

    res.json({
      success: true,
      data: { ...updatedUser, skills: updatedSkills },
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get all mentors with skills
router.get('/mentors/all', async (req: AuthRequest, res: Response) => {
  try {
    const mentors = await query(
      `SELECT u.id, u.email, u.name, u.avatar_url, u.bio, u.hourly_rate,
              u.total_sessions, u.avg_rating, u.verified, u.created_at
       FROM users u
       WHERE u.role = 'mentor'
       ORDER BY u.avg_rating DESC, u.total_sessions DESC
       LIMIT 100`
    );

    // Fetch skills for each mentor
    const mentorsList = await Promise.all(
      mentors.rows.map(async (mentor: any) => {
        const skills = await query(
          `SELECT skill_name, proficiency_level, years_experience FROM user_skills WHERE user_id = $1`,
          [mentor.id]
        );
        return { ...mentor, skills: skills.rows };
      })
    );

    res.json({
      success: true,
      data: mentorsList,
    });
  } catch (err) {
    console.error('Get mentors error:', err);
    res.status(500).json({ error: 'Failed to get mentors' });
  }
});

export default router;
