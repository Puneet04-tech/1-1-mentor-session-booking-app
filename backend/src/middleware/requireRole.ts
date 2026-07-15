import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

type Role = "mentor" | "student" | "admin";

export const requireRole = (...roles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: This action requires one of the following roles: ${roles.join(", ")}`,
      });
    }

    next();
  };
};

export default requireRole;
