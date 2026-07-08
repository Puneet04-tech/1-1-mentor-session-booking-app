import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'mentor' | 'student' | 'admin';
  };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;

    // Pending 2FA tokens (issue #138) are only valid at the /2fa/verify step,
    // never as a full session credential — reject them everywhere else.
    if (decoded?.twofa_pending) {
      return res.status(401).json({ error: 'Two-factor verification required' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
};

export default authMiddleware;
