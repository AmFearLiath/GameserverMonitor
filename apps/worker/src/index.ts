import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '@gm/config';
import { getAppSettingsByScope, upsertAppSettingsByScope } from '@gm/db';
import { createLogger } from '@gm/logger';
import { SchedulerLock } from './scheduler-lock.js';
import { CheckRunner } from './check-runner.js';
import { PanelSyncRunner } from './panel-sync-runner.js';

const logger = createLogger('worker');
const jobId = randomUUID();
const schedulerLock = new SchedulerLock('gm:scheduler:v1', logger, jobId);
const checkRunner = new CheckRunner(logger, jobId);
const panelSyncRunner = new PanelSyncRunner(logger, jobId);

let isLeader = false;
let isCheckRunInProgress = false;
let isPanelSyncRunInProgress = false;
let lastCheckRunAtMs = 0;

type WorkerRuntimeSettings = {
  checkIntervalMs: number;
  checkConcurrency: number;
  autoUpdateEnabled: boolean;
};

let settingsCache: { expiresAt: number; value: WorkerRuntimeSettings } | null = null;

const SETTINGS_CACHE_MS = 10_000;
const AUTO_UPDATE_REPOSITORY = 'https://github.com/AmFearLiath/GameserverMonitor';
const AUTO_UPDATE_RELEASE_API = 'https://api.github.com/repos/AmFearLiath/GameserverMonitor/releases/latest';
const AUTO_UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

let lastUpdateCheckAtMs = 0;
let isUpdateCheckInProgress = false;
let lastAutoUpdateEnabledState: boolean | null = null;

const packageVersion = (() => {
  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.resolve(moduleDir, '..', '..', '..', 'package.json');
    const payload = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };
    return typeof payload.version === 'string' && payload.version.trim().length > 0 ? payload.version.trim() : '0.1.0';
  } catch {
    return '0.1.0';
  }
})();

const parsePositiveInt = (value: string | boolean | undefined): number | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const parseBooleanSetting = (value: string | boolean | undefined, fallback = false): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
};

const parseSemverParts = (version: string): [number, number, number] | null => {
  const cleaned = version.trim().replace(/^v/i, '').split('-')[0];
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(cleaned);
  if (!match) {
    return null;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }

  return [major, minor, patch];
};

const isVersionNewer = (latest: string, current: string): boolean => {
  const latestParts = parseSemverParts(latest);
  const currentParts = parseSemverParts(current);

  if (!latestParts || !currentParts) {
    return false;
  }

  for (let index = 0; index < 3; index += 1) {
    if (latestParts[index] > currentParts[index]) {
      return true;
    }

    if (latestParts[index] < currentParts[index]) {
      return false;
    }
  }

  return false;
};

const runAutoUpdateCheckIfDue = async (settings: WorkerRuntimeSettings): Promise<void> => {
  if (!settings.autoUpdateEnabled) {
    if (lastAutoUpdateEnabledState !== false) {
      await upsertAppSettingsByScope('updates', {
        auto_update_enabled: false,
        repository_url: AUTO_UPDATE_REPOSITORY,
        current_version: packageVersion,
        last_check_at: new Date().toISOString(),
        update_available: false
      });
      lastAutoUpdateEnabledState = false;
    }
    return;
  }

  if (isUpdateCheckInProgress) {
    return;
  }

  const now = Date.now();
  if (now - lastUpdateCheckAtMs < AUTO_UPDATE_CHECK_INTERVAL_MS) {
    return;
  }

  isUpdateCheckInProgress = true;
  lastAutoUpdateEnabledState = true;
  try {
    const response = await fetch(AUTO_UPDATE_RELEASE_API, {
      headers: {
        'User-Agent': 'GameserverMonitor/auto-update-check'
      }
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      await upsertAppSettingsByScope('updates', {
        auto_update_enabled: true,
        repository_url: AUTO_UPDATE_REPOSITORY,
        current_version: packageVersion,
        last_check_at: new Date().toISOString(),
        last_error: `HTTP_${response.status}${detail ? `:${detail}` : ''}`
      });
      return;
    }

    const payload = (await response.json()) as { tag_name?: unknown; html_url?: unknown };
    const latestVersionRaw = typeof payload.tag_name === 'string' ? payload.tag_name.trim() : '';
    const latestVersion = latestVersionRaw.replace(/^v/i, '');
    const releaseUrl = typeof payload.html_url === 'string' ? payload.html_url : AUTO_UPDATE_REPOSITORY;
    const updateAvailable = latestVersion.length > 0 ? isVersionNewer(latestVersion, packageVersion) : false;

    await upsertAppSettingsByScope('updates', {
      auto_update_enabled: true,
      repository_url: AUTO_UPDATE_REPOSITORY,
      current_version: packageVersion,
      latest_version: latestVersion || '-',
      release_url: releaseUrl,
      update_available: updateAvailable,
      last_check_at: new Date().toISOString(),
      last_error: ''
    });

    if (updateAvailable) {
      logger.info('auto-update check detected newer release', { job_id: jobId }, {
        current_version: packageVersion,
        latest_version: latestVersion,
        release_url: releaseUrl
      });
    }
  } catch (error) {
    await upsertAppSettingsByScope('updates', {
      auto_update_enabled: true,
      repository_url: AUTO_UPDATE_REPOSITORY,
      current_version: packageVersion,
      last_check_at: new Date().toISOString(),
      last_error: String(error)
    });
  } finally {
    lastUpdateCheckAtMs = Date.now();
    isUpdateCheckInProgress = false;
  }
};

const getRuntimeSettings = async (): Promise<WorkerRuntimeSettings> => {
  const now = Date.now();
  if (settingsCache && settingsCache.expiresAt > now) {
    return settingsCache.value;
  }

  const appSettings = await getAppSettingsByScope('settings');
  const intervalSec = parsePositiveInt(appSettings.worker_check_interval_sec) ?? Math.max(1, Math.floor(config.WORKER_TICK_MS / 1000));
  const concurrency = parsePositiveInt(appSettings.worker_check_concurrency) ?? 4;
  const autoUpdateEnabled = parseBooleanSetting(appSettings.auto_update_enabled, false);

  const value: WorkerRuntimeSettings = {
    checkIntervalMs: intervalSec * 1000,
    checkConcurrency: Math.max(1, Math.min(concurrency, 64)),
    autoUpdateEnabled
  };

  settingsCache = {
    value,
    expiresAt: now + SETTINGS_CACHE_MS
  };

  return value;
};

logger.info('worker started', { job_id: jobId }, { tick_ms: config.WORKER_TICK_MS });

const tick = async (): Promise<void> => {
  try {
    if (!isLeader) {
      isLeader = await schedulerLock.tryAcquire();
    }

    if (isLeader && !isCheckRunInProgress) {
      const runtimeSettings = await getRuntimeSettings();
      await runAutoUpdateCheckIfDue(runtimeSettings);
      const now = Date.now();
      const shouldRunCheck = now - lastCheckRunAtMs >= runtimeSettings.checkIntervalMs;

      if (!shouldRunCheck) {
        logger.info('worker heartbeat', { job_id: jobId }, {
          status: 'leader',
          check_skipped: true,
          next_check_in_ms: runtimeSettings.checkIntervalMs - (now - lastCheckRunAtMs)
        });
      }

      if (shouldRunCheck) {
      isCheckRunInProgress = true;
      try {
        await checkRunner.runOnce({ concurrency: runtimeSettings.checkConcurrency });
        lastCheckRunAtMs = Date.now();
      } finally {
        isCheckRunInProgress = false;
      }
      }
    }

    if (isLeader && !isPanelSyncRunInProgress) {
      isPanelSyncRunInProgress = true;
      try {
        await panelSyncRunner.runIfDue();
      } finally {
        isPanelSyncRunInProgress = false;
      }
    }

    logger.info('worker heartbeat', { job_id: jobId }, { status: isLeader ? 'leader' : 'idle' });
  } catch (error) {
    logger.error('worker tick failed', { job_id: jobId }, { error: String(error) });
  }
};

void tick();
const interval = setInterval(() => {
  void tick();
}, config.WORKER_TICK_MS);

const shutdown = async (signal: string): Promise<void> => {
  clearInterval(interval);
  logger.info('worker shutdown requested', { job_id: jobId }, { signal });
  await schedulerLock.release();
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});