import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '@gm/config';
import {
  createLocalUser,
  findUserByUsername,
  resolveDiscordUser,
  type AuthUserRecord
} from '@gm/db';
import { randomUUID } from 'node:crypto';

export type LoginResponse = {
  access_token: string;
  refresh_token: null;
  expires_in: number;
  user: {
    id: string;
    username: string;
    roles: string[];
  };
};

type AuthServiceDeps = {
  findByUsername: (username: string) => Promise<AuthUserRecord | null>;
  createUser: (input: { username: string; email: string; password_hash: string }) => Promise<AuthUserRecord>;
  resolveDiscordUser: (input: {
    provider_user_id: string;
    preferred_username: string;
    email: string | null;
    password_hash: string;
  }) => Promise<AuthUserRecord>;
  comparePassword: (plainPassword: string, passwordHash: string) => Promise<boolean>;
  hashPassword: (plainPassword: string) => Promise<string>;
  signToken: (payload: { sub: string; username: string; roles: string[] }) => string;
  accessTokenExpiresInSeconds: number;
  webBaseUrl: string;
  discordClientId: string;
  discordClientSecret: string;
  discordRedirectUri: string;
  discordOAuthScope: string;
};

type LoginError = {
  code: 'API_UNAUTHORIZED' | 'API_VALIDATION_ERROR' | 'API_CONFLICT' | 'API_SERVICE_UNAVAILABLE';
  status: 401 | 400 | 409 | 503;
  message: string;
};

type RegisterResponse = LoginResponse;

type DiscordStartResponse = {
  authorize_url: string;
};

type DiscordStartOptions = {
  remember: boolean;
};

type DiscordCallbackResponse = {
  redirect_url: string;
};

type DiscordTokenResponse = {
  access_token?: string;
};

type DiscordUserResponse = {
  id?: string;
  username?: string;
  global_name?: string | null;
  email?: string | null;
};

const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_ME_URL = 'https://discord.com/api/users/@me';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStateStore = new Map<string, { expiresAt: number; remember: boolean }>();

const buildLoginError = (code: LoginError['code'], status: LoginError['status'], message: string): LoginError => ({
  code,
  status,
  message
});

export const createAuthService = (deps: AuthServiceDeps) => {
  const issueTokens = (user: AuthUserRecord): LoginResponse => {
    const accessToken = deps.signToken({
      sub: user.id,
      username: user.username,
      roles: user.roles
    });

    return {
      access_token: accessToken,
      refresh_token: null,
      expires_in: deps.accessTokenExpiresInSeconds,
      user: {
        id: user.id,
        username: user.username,
        roles: user.roles
      }
    };
  };

  const login = async (username: string, password: string): Promise<LoginResponse> => {
    if (username.trim().length === 0 || password.trim().length === 0) {
      throw buildLoginError('API_VALIDATION_ERROR', 400, 'Missing username or password');
    }

    const user = await deps.findByUsername(username);
    if (!user || !user.is_enabled) {
      throw buildLoginError('API_UNAUTHORIZED', 401, 'Invalid credentials');
    }

    const isValidPassword = await deps.comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      throw buildLoginError('API_UNAUTHORIZED', 401, 'Invalid credentials');
    }

    return issueTokens(user);
  };

  const register = async (username: string, email: string, password: string): Promise<RegisterResponse> => {
    if (username.trim().length < 3 || password.trim().length < 8 || email.trim().length < 3 || !email.includes('@')) {
      throw buildLoginError('API_VALIDATION_ERROR', 400, 'Invalid registration payload');
    }

    const existing = await deps.findByUsername(username.trim());
    if (existing) {
      throw buildLoginError('API_CONFLICT', 409, 'Username already exists');
    }

    const passwordHash = await deps.hashPassword(password);

    try {
      const user = await deps.createUser({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password_hash: passwordHash
      });

      return issueTokens(user);
    } catch (error) {
      const text = String(error);
      if (text.includes('Duplicate entry') || text.includes('ER_DUP_ENTRY')) {
        throw buildLoginError('API_CONFLICT', 409, 'User already exists');
      }

      throw error;
    }
  };

  const getDiscordAuthorizeUrl = (options: DiscordStartOptions = { remember: true }): DiscordStartResponse => {
    if (!deps.discordClientId || !deps.discordClientSecret) {
      throw buildLoginError('API_SERVICE_UNAVAILABLE', 503, 'Discord OAuth not configured');
    }

    const state = randomUUID();
    oauthStateStore.set(state, { expiresAt: Date.now() + OAUTH_STATE_TTL_MS, remember: options.remember });

    const params = new URLSearchParams({
      client_id: deps.discordClientId,
      response_type: 'code',
      redirect_uri: deps.discordRedirectUri,
      scope: deps.discordOAuthScope,
      state,
      prompt: 'consent'
    });

    return {
      authorize_url: `https://discord.com/oauth2/authorize?${params.toString()}`
    };
  };

  const completeDiscordOAuth = async (code: string, state: string): Promise<DiscordCallbackResponse> => {
    const stateEntry = oauthStateStore.get(state);
    oauthStateStore.delete(state);

    if (!stateEntry || stateEntry.expiresAt < Date.now()) {
      throw buildLoginError('API_UNAUTHORIZED', 401, 'Invalid OAuth state');
    }

    const tokenBody = new URLSearchParams({
      client_id: deps.discordClientId,
      client_secret: deps.discordClientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: deps.discordRedirectUri
    });

    const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenBody.toString()
    });

    if (!tokenResponse.ok) {
      throw buildLoginError('API_UNAUTHORIZED', 401, 'Discord token exchange failed');
    }

    const tokenPayload = (await tokenResponse.json()) as DiscordTokenResponse;
    const accessToken = tokenPayload.access_token;
    if (!accessToken) {
      throw buildLoginError('API_UNAUTHORIZED', 401, 'Discord access token missing');
    }

    const meResponse = await fetch(DISCORD_ME_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!meResponse.ok) {
      throw buildLoginError('API_UNAUTHORIZED', 401, 'Discord user fetch failed');
    }

    const discordUser = (await meResponse.json()) as DiscordUserResponse;
    if (!discordUser.id || !discordUser.username) {
      throw buildLoginError('API_UNAUTHORIZED', 401, 'Discord user payload invalid');
    }

    const generatedPasswordHash = await deps.hashPassword(randomUUID());
    const user = await deps.resolveDiscordUser({
      provider_user_id: discordUser.id,
      preferred_username: discordUser.global_name ?? discordUser.username,
      email: discordUser.email ?? null,
      password_hash: generatedPasswordHash
    });

    const loginResponse = issueTokens(user);
    const redirectUrl = new URL(deps.webBaseUrl);
    redirectUrl.searchParams.set('discord_token', loginResponse.access_token);
    redirectUrl.searchParams.set('discord_remember', stateEntry.remember ? '1' : '0');

    return {
      redirect_url: redirectUrl.toString()
    };
  };

  return {
    login,
    register,
    getDiscordAuthorizeUrl,
    completeDiscordOAuth
  };
};

export const authService = createAuthService({
  findByUsername: findUserByUsername,
  createUser: createLocalUser,
  resolveDiscordUser,
  comparePassword: async (plainPassword: string, passwordHash: string) => bcrypt.compare(plainPassword, passwordHash),
  hashPassword: async (plainPassword: string) => bcrypt.hash(plainPassword, 10),
  signToken: (payload) =>
    jwt.sign(payload, config.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      expiresIn: `${config.JWT_ACCESS_EXPIRES_IN_SECONDS}s`
    }),
  accessTokenExpiresInSeconds: config.JWT_ACCESS_EXPIRES_IN_SECONDS,
  webBaseUrl: config.WEB_BASE_URL,
  discordClientId: config.DISCORD_CLIENT_ID,
  discordClientSecret: config.DISCORD_CLIENT_SECRET,
  discordRedirectUri: config.DISCORD_REDIRECT_URI,
  discordOAuthScope: config.DISCORD_OAUTH_SCOPE
});
