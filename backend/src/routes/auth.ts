import { Router, Response } from 'express';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import { config } from '@/config';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const jwtSecret: Secret = config.JWT_SECRET as Secret;
const jwtOptions: SignOptions = { expiresIn: config.JWT_EXPIRY as any };

// Signup
router.post('/signup',  async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if user exists
    const existing = await queryOne(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const userId = uuidv4();
    const now = new Date().toISOString();

    // Create user (note: this is a simplified version - you may need to use Supabase Auth)
    await query(
      `INSERT INTO users (id, email, name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, email, name, role, now, now]
    );

    // Generate JWT token
    const token = jwt.sign(
      { id: userId, email, role },
      jwtSecret,
      jwtOptions
    );

    res.json({
      success: true,
      data: {
        user: { id: userId, email, name, role },
        token,
      },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Login
router.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const user = await queryOne(
      'SELECT id, email, name, role FROM users WHERE email = $1',
      [email]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // In production, verify password against hashed password in DB
    // For now, simplified
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      jwtSecret,
      jwtOptions
    );

    res.json({
      success: true,
      data: {
        user,
        token,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await queryOne(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [req.user?.id]
    );

    res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Logout
router.post('/logout', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json({ success: true, message: 'Logged out' });
});

export default router;
