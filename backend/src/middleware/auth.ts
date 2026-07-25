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

const VALID_ROLES = new Set(["mentor", "student", "admin"]);

function isValidJwtPayload(payload: any): boolean {
  return (
    payload &&
    typeof payload.id === "string" &&
    payload.id.trim().length > 0 &&
    typeof payload.email === "string" &&
    payload.email.trim().length > 0 &&
    typeof payload.role === "string" &&
    VALID_ROLES.has(payload.role)
  );
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;

if (decoded?.twofa_pending) {
  return res.status(401).json({ error: "Two-factor verification required" });
}

if (!isValidJwtPayload(decoded)) {
  return res.status(401).json({
    error: "Invalid token payload",
  });
}

req.user = decoded;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
};

export default authMiddleware;
