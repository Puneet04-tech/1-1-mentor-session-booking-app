import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config';
import { queryOne } from '@/database';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'mentor' | 'student' | 'admin';
    tokenVersion?: number;
  };
  file?: {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
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

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;

    const currentUser = await queryOne(
      "SELECT token_version FROM users WHERE id = $1",
      [decoded.id]
    );

    if (
      !currentUser ||
      decoded.tokenVersion !== currentUser.token_version
    ) {
      return res.status(401).json({
        error: "Session has expired. Please log in again.",
      });
    }

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
