import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const existingId = req.header('X-Request-Id');
  const requestId = existingId && existingId.trim().length > 0 ? existingId : uuidv4();
  res.setHeader('X-Request-Id', requestId);
  req.requestId = requestId;
  next();
};
