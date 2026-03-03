import type { NextFunction, Request, Response } from 'express';

export const requireRole = (role: string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      next({ code: 'API_UNAUTHORIZED', status: 401, message: 'Missing authenticated user' });
      return;
    }

    if (!req.authUser.roles.includes(role)) {
      next({ code: 'API_FORBIDDEN', status: 403, message: 'Missing role' });
      return;
    }

    next();
  };
};