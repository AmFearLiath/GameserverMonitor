import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@gm/config';

type AccessTokenPayload = {
  sub: string;
  username: string;
  roles: string[];
};

const parseBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
};

const isAccessTokenPayload = (payload: unknown): payload is AccessTokenPayload => {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const parsed = payload as Partial<AccessTokenPayload>;
  return (
    typeof parsed.sub === 'string' &&
    typeof parsed.username === 'string' &&
    Array.isArray(parsed.roles) &&
    parsed.roles.every((role) => typeof role === 'string')
  );
};

export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const token = parseBearerToken(req.header('Authorization'));
  if (!token) {
    next({ code: 'API_UNAUTHORIZED', status: 401, message: 'Missing bearer token' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET);
    if (!isAccessTokenPayload(payload)) {
      next({ code: 'API_UNAUTHORIZED', status: 401, message: 'Invalid token payload' });
      return;
    }

    req.authUser = {
      id: payload.sub,
      username: payload.username,
      roles: payload.roles
    };

    next();
  } catch {
    next({ code: 'API_UNAUTHORIZED', status: 401, message: 'Invalid token' });
  }
};
