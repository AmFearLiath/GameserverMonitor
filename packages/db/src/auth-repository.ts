import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { getPool } from './client.js';

export type AuthUserRecord = {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  is_enabled: boolean;
  roles: string[];
};

type AuthUserRow = RowDataPacket & {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  is_enabled: number;
};

type RoleIdRow = RowDataPacket & {
  id: string;
};

type CountRow = RowDataPacket & {
  total: number;
};

type ExistingUserRow = RowDataPacket & {
  id: string;
};

type OAuthIdentityUserRow = RowDataPacket & {
  id: string;
};

type CreateLocalUserInput = {
  username: string;
  email: string;
  password_hash: string;
};

type ResolveDiscordUserInput = {
  provider_user_id: string;
  preferred_username: string;
  email: string | null;
  password_hash: string;
};

type RoleRow = RowDataPacket & {
  role_key: string;
};

type UserProfileRow = RowDataPacket & {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  locale: string | null;
  ptero_client_api_key: string | null;
  settings_json: string | null;
};

type UserProfileUserRow = RowDataPacket & {
  id: string;
  username: string;
  email: string;
};

type AppSettingRow = RowDataPacket & {
  setting_value_json: string;
};

export type UserProfileRecord = {
  user_id: string;
  username: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  locale: string | null;
  settings: Record<string, string | boolean>;
  has_client_api_key: boolean;
  client_api_key_hint: string | null;
};

export const findUserByUsername = async (username: string): Promise<AuthUserRecord | null> => {
  const pool = getPool();

  const [users] = await pool.query<AuthUserRow[]>(
    `
      SELECT id, username, email, password_hash, is_enabled
      FROM users
      WHERE username = ?
      LIMIT 1
    `,
    [username]
  );

  const user = users[0];
  if (!user) {
    return null;
  }

  const [roles] = await pool.query<RoleRow[]>(
    `
      SELECT r.\`key\` AS role_key
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
      ORDER BY r.\`key\` ASC
    `,
    [user.id]
  );

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    password_hash: user.password_hash,
    is_enabled: user.is_enabled === 1,
    roles: roles.map((role) => role.role_key)
  };
};

const findUserById = async (userId: string): Promise<AuthUserRecord | null> => {
  const pool = getPool();
  const [users] = await pool.query<AuthUserRow[]>(
    `
      SELECT id, username, email, password_hash, is_enabled
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  const user = users[0];
  if (!user) {
    return null;
  }

  const [roles] = await pool.query<RoleRow[]>(
    `
      SELECT r.\`key\` AS role_key
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
      ORDER BY r.\`key\` ASC
    `,
    [user.id]
  );

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    password_hash: user.password_hash,
    is_enabled: user.is_enabled === 1,
    roles: roles.map((role) => role.role_key)
  };
};

export const findUserByIdForAuth = findUserById;

const normalizeUsernameForFallback = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  return normalized.length > 0 ? normalized : 'user';
};

const ensureUniqueUsername = async (baseUsername: string): Promise<string> => {
  const pool = getPool();
  const base = normalizeUsernameForFallback(baseUsername);

  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index}`.slice(0, 40);
    const [rows] = await pool.query<ExistingUserRow[]>(
      `
        SELECT id
        FROM users
        WHERE username = ?
        LIMIT 1
      `,
      [candidate]
    );

    if (rows.length === 0) {
      return candidate;
    }
  }

  return `${base}-${Date.now()}`.slice(0, 50);
};

const ensureUniqueEmail = async (preferredEmail: string): Promise<string> => {
  const pool = getPool();
  const normalized = preferredEmail.trim().toLowerCase();
  if (!normalized) {
    return `${randomUUID()}@local.invalid`;
  }

  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? normalized : normalized.replace('@', `+${index}@`);
    const [rows] = await pool.query<ExistingUserRow[]>(
      `
        SELECT id
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [candidate]
    );

    if (rows.length === 0) {
      return candidate;
    }
  }

  return `${randomUUID()}@local.invalid`;
};

const getRoleIdByKey = async (roleKey: string): Promise<string> => {
  const pool = getPool();
  const normalizedRoleKey = roleKey.trim().toUpperCase();
  const [rows] = await pool.query<RoleIdRow[]>(
    `
      SELECT id
      FROM roles
      WHERE \`key\` = ?
      LIMIT 1
    `,
    [normalizedRoleKey]
  );

  const roleId = rows[0]?.id;
  if (!roleId) {
    throw new Error(`AUTH_ROLE_MISSING_${normalizedRoleKey}`);
  }

  return roleId;
};

const getConfiguredDefaultRoleKey = async (): Promise<string | null> => {
  const pool = getPool();
  const [rows] = await pool.query<AppSettingRow[]>(
    `
      SELECT setting_value_json
      FROM app_settings
      WHERE scope = 'roles'
        AND setting_key = 'default_new_user_role'
      LIMIT 1
    `
  );

  const raw = rows[0]?.setting_value_json;
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'string') {
      return null;
    }

    const normalized = parsed.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
};

const parseSettingsJson = (value: string | null): Record<string, string | boolean> => {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const out: Record<string, string | boolean> = {};
    for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof entry === 'string' || typeof entry === 'boolean') {
        out[key] = entry;
      }
    }

    return out;
  } catch {
    return {};
  }
};

const toApiKeyHint = (apiKey: string | null): string | null => {
  if (!apiKey) {
    return null;
  }

  const trimmed = apiKey.trim();
  if (trimmed.length < 8) {
    return '••••';
  }

  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
};

const upsertUserProfile = async (
  userId: string,
  input: {
    display_name?: string | null;
    avatar_url?: string | null;
    timezone?: string | null;
    locale?: string | null;
    ptero_client_api_key?: string | null;
    settings?: Record<string, string | boolean>;
  }
): Promise<void> => {
  const pool = getPool();
  const now = new Date();

  const [rows] = await pool.query<UserProfileRow[]>(
    `
      SELECT user_id, display_name, avatar_url, timezone, locale, ptero_client_api_key, settings_json
      FROM user_profiles
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId]
  );

  const existing = rows[0];
  const nextSettings = input.settings ?? (existing ? parseSettingsJson(existing.settings_json) : {});

  const resolved = {
    display_name: input.display_name === undefined ? (existing?.display_name ?? null) : input.display_name,
    avatar_url: input.avatar_url === undefined ? (existing?.avatar_url ?? null) : input.avatar_url,
    timezone: input.timezone === undefined ? (existing?.timezone ?? null) : input.timezone,
    locale: input.locale === undefined ? (existing?.locale ?? null) : input.locale,
    ptero_client_api_key:
      input.ptero_client_api_key === undefined ? (existing?.ptero_client_api_key ?? null) : input.ptero_client_api_key,
    settings_json: JSON.stringify(nextSettings)
  };

  await pool.query(
    `
      INSERT INTO user_profiles (
        user_id,
        display_name,
        avatar_url,
        timezone,
        locale,
        ptero_client_api_key,
        settings_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        display_name = VALUES(display_name),
        avatar_url = VALUES(avatar_url),
        timezone = VALUES(timezone),
        locale = VALUES(locale),
        ptero_client_api_key = VALUES(ptero_client_api_key),
        settings_json = VALUES(settings_json),
        updated_at = VALUES(updated_at)
    `,
    [
      userId,
      resolved.display_name,
      resolved.avatar_url,
      resolved.timezone,
      resolved.locale,
      resolved.ptero_client_api_key,
      resolved.settings_json,
      now,
      now
    ]
  );
};

export const getUserProfileByUserId = async (userId: string): Promise<UserProfileRecord | null> => {
  const pool = getPool();
  const [userRows] = await pool.query<UserProfileUserRow[]>(
    `
      SELECT id, username, email
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  const user = userRows[0];
  if (!user) {
    return null;
  }

  const [profileRows] = await pool.query<UserProfileRow[]>(
    `
      SELECT user_id, display_name, avatar_url, timezone, locale, ptero_client_api_key, settings_json
      FROM user_profiles
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId]
  );

  const profile = profileRows[0];
  const settings = parseSettingsJson(profile?.settings_json ?? null);
  const apiKey = profile?.ptero_client_api_key ?? null;

  return {
    user_id: user.id,
    username: user.username,
    email: user.email,
    display_name: profile?.display_name ?? null,
    avatar_url: profile?.avatar_url ?? null,
    timezone: profile?.timezone ?? null,
    locale: profile?.locale ?? null,
    settings,
    has_client_api_key: typeof apiKey === 'string' && apiKey.trim().length > 0,
    client_api_key_hint: toApiKeyHint(apiKey)
  };
};

export const updateUserProfileByUserId = async (
  userId: string,
  input: {
    display_name?: string | null;
    avatar_url?: string | null;
    timezone?: string | null;
    locale?: string | null;
    ptero_client_api_key?: string | null;
    settings?: Record<string, string | boolean>;
  }
): Promise<UserProfileRecord | null> => {
  await upsertUserProfile(userId, input);
  return getUserProfileByUserId(userId);
};

export const getUserPterodactylClientApiKeyByUserId = async (userId: string): Promise<string | null> => {
  const pool = getPool();
  const [rows] = await pool.query<UserProfileRow[]>(
    `
      SELECT user_id, display_name, avatar_url, timezone, locale, ptero_client_api_key, settings_json
      FROM user_profiles
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId]
  );

  const key = rows[0]?.ptero_client_api_key;
  if (typeof key !== 'string') {
    return null;
  }

  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const assignRoleByUserCount = async (userId: string): Promise<void> => {
  const pool = getPool();
  const [rows] = await pool.query<CountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE r.\`key\` = 'ADMIN'
    `
  );

  const adminCount = Number(rows[0]?.total ?? 0);
  const roleKey = adminCount === 0 ? 'ADMIN' : (await getConfiguredDefaultRoleKey()) ?? 'USER';

  let roleId: string;
  try {
    roleId = await getRoleIdByKey(roleKey);
  } catch {
    roleId = await getRoleIdByKey('USER');
  }

  await pool.query(
    `
      INSERT IGNORE INTO user_roles (user_id, role_id)
      VALUES (?, ?)
    `,
    [userId, roleId]
  );
};

export const createLocalUser = async (input: CreateLocalUserInput): Promise<AuthUserRecord> => {
  const pool = getPool();
  const now = new Date();
  const userId = randomUUID();

  await pool.query(
    `
      INSERT INTO users (
        id,
        username,
        email,
        password_hash,
        is_enabled,
        last_login_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 1, NULL, ?, ?)
    `,
    [userId, input.username, input.email, input.password_hash, now, now]
  );

  await assignRoleByUserCount(userId);

  const created = await findUserById(userId);
  if (!created) {
    throw new Error('AUTH_CREATE_USER_FAILED');
  }

  return created;
};

export const resolveDiscordUser = async (input: ResolveDiscordUserInput): Promise<AuthUserRecord> => {
  const pool = getPool();

  const [existingIdentityRows] = await pool.query<OAuthIdentityUserRow[]>(
    `
      SELECT u.id
      FROM user_oauth_identities oi
      INNER JOIN users u ON u.id = oi.user_id
      WHERE oi.provider = 'DISCORD'
        AND oi.provider_user_id = ?
      LIMIT 1
    `,
    [input.provider_user_id]
  );

  const existingUserId = existingIdentityRows[0]?.id;
  if (existingUserId) {
    const existingUser = await findUserById(existingUserId);
    if (!existingUser) {
      throw new Error('AUTH_DISCORD_USER_MISSING');
    }

    return existingUser;
  }

  const username = await ensureUniqueUsername(input.preferred_username);
  const fallbackEmail = `discord-${input.provider_user_id}@local.invalid`;
  const email = await ensureUniqueEmail(input.email ?? fallbackEmail);
  const userId = randomUUID();
  const now = new Date();

  await pool.query(
    `
      INSERT INTO users (
        id,
        username,
        email,
        password_hash,
        is_enabled,
        last_login_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 1, NULL, ?, ?)
    `,
    [userId, username, email, input.password_hash, now, now]
  );

  await pool.query(
    `
      INSERT INTO user_oauth_identities (
        id,
        user_id,
        provider,
        provider_user_id,
        username_snapshot,
        created_at,
        updated_at
      ) VALUES (?, ?, 'DISCORD', ?, ?, ?, ?)
    `,
    [randomUUID(), userId, input.provider_user_id, input.preferred_username, now, now]
  );

  await assignRoleByUserCount(userId);

  const created = await findUserById(userId);
  if (!created) {
    throw new Error('AUTH_DISCORD_CREATE_FAILED');
  }

  return created;
};
