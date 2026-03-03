import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(moduleDir, '..', '..', '..');
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(workspaceRoot, '.env')
];

const loadedPaths = new Set<string>();
for (const envPath of envCandidates) {
  if (loadedPaths.has(envPath)) {
    continue;
  }

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  loadedPaths.add(envPath);
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3307),
  DB_USER: z.string().min(1).default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1).default('gameserver_monitoring'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  WEB_PORT: z.coerce.number().int().positive().default(5173),
  WEB_BASE_URL: z.string().url().default('http://localhost:5173'),
  WORKER_TICK_MS: z.coerce.number().int().positive().default(30000),
  WORKER_PANEL_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(120000),
  PTERO_API_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_CLIENT_SECRET: z.string().default(''),
  DISCORD_REDIRECT_URI: z.string().url().default('http://localhost:3000/api/v1/auth/discord/callback'),
  DISCORD_OAUTH_SCOPE: z.string().default('identify email'),
  JWT_ACCESS_SECRET: z.string().min(16).default('change-me-access-secret-dev-only'),
  JWT_ACCESS_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(3600),
  ALERT_CHANNEL_ACTIVE_KID: z.string().min(1).default('local-dev-v1'),
  ALERT_CHANNEL_MASTER_KEYS: z.string().default('{"local-dev-v1":"change-me-alert-master-key-dev-only"}'),
  DEFAULT_LOCALE: z.enum(['en', 'de']).default('en'),
  FALLBACK_LOCALE: z.enum(['en', 'de']).default('en')
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = envSchema.parse(process.env);
