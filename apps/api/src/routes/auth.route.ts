import { Router, type Router as RouterType } from 'express';
import { authService } from '../services/auth.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getUserProfileByUserId, updateUserProfileByUserId } from '@gm/db';

type LoginRequestBody = {
  username?: string;
  password?: string;
};

type RegisterRequestBody = {
  username?: string;
  email?: string;
  password?: string;
};

export const authRoute: RouterType = Router();

authRoute.post('/auth/login', async (req, res, next) => {
  try {
    const body = req.body as LoginRequestBody;
    const username = body.username ?? '';
    const password = body.password ?? '';

    const loginResponse = await authService.login(username, password);
    res.json(loginResponse);
  } catch (error) {
    next(error);
  }
});

authRoute.post('/auth/register', async (req, res, next) => {
  try {
    const body = req.body as RegisterRequestBody;
    const username = body.username ?? '';
    const email = body.email ?? '';
    const password = body.password ?? '';

    const registerResponse = await authService.register(username, email, password);
    res.status(201).json(registerResponse);
  } catch (error) {
    next(error);
  }
});

authRoute.get('/auth/discord/start', async (req, res, next) => {
  try {
    const remember = req.query.remember === '1' || req.query.remember === 'true';
    const payload = authService.getDiscordAuthorizeUrl({ remember });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

authRoute.get('/auth/discord/callback', async (req, res, next) => {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    if (!code || !state) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Missing OAuth code/state' });
      return;
    }

    const payload = await authService.completeDiscordOAuth(code, state);
    res.redirect(payload.redirect_url);
  } catch (error) {
    next(error);
  }
});

authRoute.get('/auth/me', authMiddleware, (req, res, next) => {
  if (!req.authUser) {
    next({ code: 'API_UNAUTHORIZED', status: 401, message: 'Missing authenticated user' });
    return;
  }

  res.json({
    id: req.authUser.id,
    username: req.authUser.username,
    roles: req.authUser.roles
  });
});

authRoute.get('/auth/profile', authMiddleware, async (req, res, next) => {
  try {
    if (!req.authUser) {
      next({ code: 'API_UNAUTHORIZED', status: 401, message: 'Missing authenticated user' });
      return;
    }

    const data = await getUserProfileByUserId(req.authUser.id);
    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'User not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

authRoute.patch('/auth/profile', authMiddleware, async (req, res, next) => {
  try {
    if (!req.authUser) {
      next({ code: 'API_UNAUTHORIZED', status: 401, message: 'Missing authenticated user' });
      return;
    }

    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid profile payload' });
      return;
    }

    const normalizeOptionalString = (value: unknown): string | null | undefined => {
      if (value === undefined) {
        return undefined;
      }

      if (value === null) {
        return null;
      }

      if (typeof value !== 'string') {
        return undefined;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const settingsRaw = body.settings;
    let settings: Record<string, string | boolean> | undefined;
    if (settingsRaw !== undefined) {
      if (!settingsRaw || typeof settingsRaw !== 'object' || Array.isArray(settingsRaw)) {
        next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid profile settings payload' });
        return;
      }

      settings = {};
      for (const [key, value] of Object.entries(settingsRaw as Record<string, unknown>)) {
        if (typeof value === 'string' || typeof value === 'boolean') {
          settings[key] = value;
        }
      }
    }

    const data = await updateUserProfileByUserId(req.authUser.id, {
      display_name: normalizeOptionalString(body.display_name),
      avatar_url: normalizeOptionalString(body.avatar_url),
      timezone: normalizeOptionalString(body.timezone),
      locale: normalizeOptionalString(body.locale),
      ptero_client_api_key: normalizeOptionalString(body.ptero_client_api_key),
      settings
    });

    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'User not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});
