import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

type Role = "mentor" | "student" | "admin";

function validateRoles(roles: Role[]): Role[] {
  if (roles.length === 0) {
    throw new Error("requireRole() must be configured with at least one role");
  }

  return roles;
}

export const requireRole = (...roles: Role[]) => {
  const allowedRoles = validateRoles(roles);
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: This action requires one of the following roles: ${allowedRoles.join(", ")}`,
      });
    }

    next();
  };
};

export default requireRole;
