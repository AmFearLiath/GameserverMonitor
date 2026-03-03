import { Router, type Router as RouterType } from 'express';
import WebSocket from 'ws';
import {
  createExternalServer,
  deleteServerSoft,
  findServerById,
  getUserPterodactylClientApiKeyByUserId,
  getPool,
  listServers,
  setServerMaintenanceMode,
  updateServerMetadata
} from '@gm/db';
import type { ServerStatus, UpdateServerMetadataInput } from '@gm/shared';
import { config } from '@gm/config';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export const serversRoute: RouterType = Router();

const VALID_STATUSES: ServerStatus[] = ['ONLINE', 'OFFLINE', 'TRANSITION', 'MAINTENANCE'];
const VALID_HOSTERS = new Set(['GENERIC', 'GPORTAL', 'NITRADO', 'SHOCKBYTE', 'APEX', 'BISECT', 'HOSTHAVOC', 'SURVIVAL_SERVERS']);
const VALID_POWER_ACTIONS = new Set(['start', 'stop', 'restart']);
const VALID_SOURCE_KINDS = new Set(['PTERODACTYL_PANEL', 'EXTERNAL_HOSTER']);

type ServerPowerRow = {
  id: string;
  panel_id: string | null;
  ptero_server_id: string | null;
  identifier: string | null;
  base_url: string | null;
  api_key_enc: string | null;
  panel_enabled: number | null;
};

const POWER_ACTION_ALERT_SUPPRESSION_MS = 10 * 60 * 1000;

const parseSingleQueryParam = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
};

const normalizePanelBaseUrl = (value: string): string => value.trim().replace(/\/+$/, '');

const stripAnsi = (line: string): string => line.replace(/\u001b\[[0-9;]*m/g, '');

const classifyPterodactylHttpError = (
  status: number,
  operation: 'power' | 'console-websocket'
): { code: string; status: number; message: string } => {
  if (status === 401) {
    return {
      code: 'API_UPSTREAM_UNAUTHORIZED',
      status,
      message: `${operation} failed (HTTP_401)`
    };
  }

  if (status === 403) {
    return {
      code: 'API_UPSTREAM_FORBIDDEN',
      status,
      message: `${operation} failed (HTTP_403)`
    };
  }

  return {
    code: 'API_PRECONDITION_FAILED',
    status,
    message: `${operation} failed (HTTP_${status})`
  };
};

const loadServerPowerRow = async (serverId: string): Promise<ServerPowerRow> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT
        s.id,
        s.panel_id,
        s.ptero_server_id,
        s.identifier,
        p.base_url,
        p.api_key_enc,
        p.is_enabled AS panel_enabled
      FROM servers s
      LEFT JOIN panels p ON p.id = s.panel_id
      WHERE s.id = ?
        AND s.deleted_at IS NULL
      LIMIT 1
    `,
    [serverId]
  );

  const row = (rows as ServerPowerRow[])[0];
  if (!row) {
    throw { code: 'API_NOT_FOUND', status: 404, message: 'Server not found' };
  }

  if (!row.panel_id || !row.base_url || !row.api_key_enc || row.panel_enabled !== 1) {
    throw { code: 'API_PRECONDITION_FAILED', status: 412, message: 'Server is not connected to an enabled Pterodactyl panel' };
  }

  return row;
};

const resolvePteroServerIdentifier = (row: ServerPowerRow): string => {
  const identifier = typeof row.identifier === 'string' ? row.identifier.trim() : '';
  if (identifier.length > 0) {
    return identifier;
  }

  const fallback = typeof row.ptero_server_id === 'string' ? row.ptero_server_id.trim() : '';
  if (fallback.length > 0) {
    return fallback;
  }

  throw { code: 'API_PRECONDITION_FAILED', status: 412, message: 'Missing Pterodactyl server identifier' };
};

const setPlannedPowerAlertSuppression = async (serverId: string, action: 'start' | 'stop' | 'restart'): Promise<void> => {
  const pool = getPool();
  const now = new Date();
  const suppressUntil = new Date(now.getTime() + POWER_ACTION_ALERT_SUPPRESSION_MS);
  const meta = JSON.stringify({
    power_action: action,
    suppress_alerts_until: suppressUntil.toISOString(),
    planned_at: now.toISOString()
  });

  await pool.query(
    `
      UPDATE servers
      SET
        last_reason_code = 'STATUS_POWER_ACTION_PENDING',
        last_reason_source = 'SYSTEM',
        last_reason_meta = ?,
        updated_at = ?
      WHERE id = ?
        AND deleted_at IS NULL
    `,
    [meta, now, serverId]
  );
};

const clearPlannedPowerAlertSuppression = async (serverId: string): Promise<void> => {
  const pool = getPool();
  const now = new Date();
  await pool.query(
    `
      UPDATE servers
      SET
        last_reason_meta = NULL,
        updated_at = ?
      WHERE id = ?
        AND deleted_at IS NULL
        AND last_reason_source = 'SYSTEM'
        AND last_reason_code = 'STATUS_POWER_ACTION_PENDING'
    `,
    [now, serverId]
  );
};

const dispatchPterodactylPowerAction = async (
  serverId: string,
  action: 'start' | 'stop' | 'restart',
  authUserId?: string
): Promise<void> => {
  const row = await loadServerPowerRow(serverId);
  const identifier = resolvePteroServerIdentifier(row);
  const panelBaseUrl = row.base_url;
  const userClientApiKey = authUserId ? await getUserPterodactylClientApiKeyByUserId(authUserId) : null;
  const authToken = userClientApiKey ?? row.api_key_enc;

  if (!panelBaseUrl || !authToken) {
    throw { code: 'API_PRECONDITION_FAILED', status: 412, message: 'Server is not connected to an enabled Pterodactyl panel' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.PTERO_API_TIMEOUT_MS);

  try {
    await setPlannedPowerAlertSuppression(serverId, action);

    const response = await fetch(
      `${normalizePanelBaseUrl(panelBaseUrl)}/api/client/servers/${encodeURIComponent(identifier)}/power`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ signal: action }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      await clearPlannedPowerAlertSuppression(serverId);
      throw classifyPterodactylHttpError(response.status, 'power');
    }
  } catch (error) {
    await clearPlannedPowerAlertSuppression(serverId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw { code: 'API_UPSTREAM_TIMEOUT', status: 504, message: 'Power action timeout' };
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchPterodactylConsoleLogs = async (serverId: string, limit: number, authUserId?: string): Promise<string[]> => {
  const row = await loadServerPowerRow(serverId);
  const identifier = resolvePteroServerIdentifier(row);
  const panelBaseUrl = row.base_url;
  const userClientApiKey = authUserId ? await getUserPterodactylClientApiKeyByUserId(authUserId) : null;
  const authToken = userClientApiKey ?? row.api_key_enc;

  if (!panelBaseUrl || !authToken) {
    throw { code: 'API_PRECONDITION_FAILED', status: 412, message: 'Server is not connected to an enabled Pterodactyl panel' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.PTERO_API_TIMEOUT_MS);

  let websocketUrl = '';
  let websocketToken = '';

  try {
    const response = await fetch(
      `${normalizePanelBaseUrl(panelBaseUrl)}/api/client/servers/${encodeURIComponent(identifier)}/websocket`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json'
        },
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw classifyPterodactylHttpError(response.status, 'console-websocket');
    }

    const payload = (await response.json()) as {
      data?: {
        socket?: string;
        token?: string;
      };
    };

    websocketUrl = typeof payload.data?.socket === 'string' ? payload.data.socket.trim() : '';
    websocketToken = typeof payload.data?.token === 'string' ? payload.data.token.trim() : '';
  } finally {
    clearTimeout(timeoutId);
  }

  if (!websocketUrl || !websocketToken) {
    throw { code: 'API_PRECONDITION_FAILED', status: 412, message: 'Missing websocket credentials from Pterodactyl' };
  }

  return await new Promise<string[]>((resolve, reject) => {
    const ws = new WebSocket(websocketUrl);
    const chunks: string[] = [];
    let closed = false;
    let completionTimer: NodeJS.Timeout | null = null;

    const cleanup = (): void => {
      if (completionTimer) {
        clearTimeout(completionTimer);
        completionTimer = null;
      }
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    const finishSuccess = (): void => {
      if (closed) {
        return;
      }
      closed = true;
      cleanup();

      const lines = chunks
        .flatMap((entry) => entry.split(/\r?\n/))
        .map((line) => stripAnsi(line).trimEnd())
        .filter((line) => line.trim().length > 0);

      resolve(lines.slice(Math.max(0, lines.length - limit)));
    };

    const finishError = (error: unknown): void => {
      if (closed) {
        return;
      }
      closed = true;
      cleanup();
      reject(error);
    };

    ws.once('open', () => {
      ws.send(JSON.stringify({ event: 'auth', args: [websocketToken] }));
      completionTimer = setTimeout(() => {
        finishSuccess();
      }, Math.max(1500, config.PTERO_API_TIMEOUT_MS));
    });

    ws.on('message', (raw) => {
      try {
        const text = typeof raw === 'string' ? raw : raw.toString('utf8');
        const payload = JSON.parse(text) as { event?: string; args?: unknown[] };
        const event = typeof payload.event === 'string' ? payload.event : '';
        const firstArg = Array.isArray(payload.args) && typeof payload.args[0] === 'string' ? payload.args[0] : '';

        if (event === 'auth success') {
          ws.send(JSON.stringify({ event: 'send logs', args: [null] }));
          return;
        }

        if (event === 'console output' && firstArg.length > 0) {
          chunks.push(firstArg);
          if (completionTimer) {
            clearTimeout(completionTimer);
          }
          completionTimer = setTimeout(() => {
            finishSuccess();
          }, 400);
        }
      } catch {
      }
    });

    ws.once('error', (error) => {
      finishError({ code: 'API_UPSTREAM_UNREACHABLE', status: 412, message: `Console websocket failed: ${String(error)}` });
    });

    ws.once('close', () => {
      finishSuccess();
    });
  });
};

serversRoute.get('/servers', async (req, res, next) => {
  try {
    const q = parseSingleQueryParam(req.query.q);
    const tag = parseSingleQueryParam(req.query.tag);
    const rawStatus = parseSingleQueryParam(req.query.status);

    let status: ServerStatus | undefined;
    if (rawStatus) {
      if (!VALID_STATUSES.includes(rawStatus as ServerStatus)) {
        next({
          code: 'API_VALIDATION_ERROR',
          status: 400,
          message: 'Invalid status filter',
          details: { field: 'status', allowed: VALID_STATUSES }
        });
        return;
      }

      status = rawStatus as ServerStatus;
    }

    const servers = await listServers({ q, status, tag });
    res.json({ data: servers });
  } catch (error) {
    next(error);
  }
});

serversRoute.get('/servers/:serverId', async (req, res, next) => {
  try {
    const server = await findServerById(req.params.serverId);
    if (!server) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Server not found' });
      return;
    }

    res.json({ data: server });
  } catch (error) {
    next(error);
  }
});

serversRoute.get('/servers/:serverId/logs', authMiddleware, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const limitRaw = Number(parseSingleQueryParam(req.query.limit) ?? 120);
    const limit = Number.isFinite(limitRaw) ? Math.max(10, Math.min(500, Math.floor(limitRaw))) : 120;
    const lines = await fetchPterodactylConsoleLogs(req.params.serverId, limit, req.authUser?.id);

    res.json({ data: { server_id: req.params.serverId, lines } });
  } catch (error) {
    next(error);
  }
});

serversRoute.patch('/servers/:serverId', authMiddleware, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = req.body as UpdateServerMetadataInput | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid server payload' });
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

    const hosterRaw = normalizeOptionalString(body.hoster);
    const hosterNormalized = hosterRaw ? hosterRaw.toUpperCase() : hosterRaw;
    const hoster =
      hosterNormalized === null
        ? null
        : typeof hosterNormalized === 'string' && VALID_HOSTERS.has(hosterNormalized)
          ? (hosterNormalized as UpdateServerMetadataInput['hoster'])
          : undefined;
    const sourceKindRaw = normalizeOptionalString(body.source_kind);
    const sourceKindNormalized = sourceKindRaw ? sourceKindRaw.toUpperCase() : sourceKindRaw;
    const sourceKind =
      sourceKindNormalized === null
        ? null
        : typeof sourceKindNormalized === 'string' && VALID_SOURCE_KINDS.has(sourceKindNormalized)
          ? (sourceKindNormalized as UpdateServerMetadataInput['source_kind'])
          : undefined;

    const input: UpdateServerMetadataInput = {
      name: normalizeOptionalString(body.name),
      game_label: normalizeOptionalString(body.game_label),
      game_icon_url: normalizeOptionalString(body.game_icon_url),
      hoster,
      source_kind: sourceKind
    };

    const hasInvalidName = body.name !== undefined && input.name === undefined;
    const hasInvalidGameLabel = body.game_label !== undefined && input.game_label === undefined;
    const hasInvalidGameIconUrl = body.game_icon_url !== undefined && input.game_icon_url === undefined;
    const hasInvalidHoster = body.hoster !== undefined && input.hoster === undefined;
    const hasInvalidSourceKind = body.source_kind !== undefined && input.source_kind === undefined;

    if (hasInvalidName || hasInvalidGameLabel || hasInvalidGameIconUrl || hasInvalidHoster || hasInvalidSourceKind || input.name === null) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid server metadata values' });
      return;
    }

    const existing = await findServerById(req.params.serverId);
    if (!existing) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Server not found' });
      return;
    }

    if (existing.panel_id) {
      delete input.hoster;
      delete input.source_kind;
    }

    const server = await updateServerMetadata(req.params.serverId, input);
    if (!server) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Server not found' });
      return;
    }

    res.json({ data: server });
  } catch (error) {
    next(error);
  }
});

serversRoute.post('/servers/:serverId/power', authMiddleware, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown> | null;
    const actionRaw = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';
    if (!VALID_POWER_ACTIONS.has(actionRaw)) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid power action' });
      return;
    }

    const action = actionRaw as 'start' | 'stop' | 'restart';
    await dispatchPterodactylPowerAction(req.params.serverId, action, req.authUser?.id);
    res.json({ data: { server_id: req.params.serverId, action, accepted: true } });
  } catch (error) {
    next(error);
  }
});

serversRoute.post('/servers/external', authMiddleware, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid external-server payload' });
      return;
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const host = typeof body.host === 'string' ? body.host.trim() : '';
    const gamePort = typeof body.game_port === 'number' ? body.game_port : Number(body.game_port ?? NaN);
    const queryPortRaw =
      body.query_port === undefined || body.query_port === null || body.query_port === ''
        ? undefined
        : typeof body.query_port === 'number'
          ? body.query_port
          : Number(body.query_port);
    const hosterRaw = typeof body.hoster === 'string' ? body.hoster.trim().toUpperCase() : 'GENERIC';
    const hoster =
      hosterRaw === 'GPORTAL' ||
      hosterRaw === 'NITRADO' ||
      hosterRaw === 'SHOCKBYTE' ||
      hosterRaw === 'APEX' ||
      hosterRaw === 'BISECT' ||
      hosterRaw === 'HOSTHAVOC' ||
      hosterRaw === 'SURVIVAL_SERVERS' ||
      hosterRaw === 'GENERIC'
        ? hosterRaw
        : 'GENERIC';

    const protocolBase = body.protocol === 'TCP' ? 'TCP' : body.protocol === 'UDP' ? 'UDP' : 'UDP';
    const protocol = hoster === 'GPORTAL' || hoster === 'NITRADO' ? 'UDP' : protocolBase;
    const queryPort =
      hoster === 'GPORTAL' || hoster === 'NITRADO'
        ? queryPortRaw ?? gamePort
        : queryPortRaw ?? (protocol === 'UDP' ? gamePort : undefined);
    const gameLabel = typeof body.game_label === 'string' ? body.game_label.trim() || null : null;

    const isValidPort = Number.isInteger(gamePort) && gamePort >= 1 && gamePort <= 65535;
    const isValidQueryPort = queryPort === undefined || (Number.isInteger(queryPort) && queryPort >= 1 && queryPort <= 65535);

    if (!name || !host || !isValidPort || !isValidQueryPort) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid external-server payload' });
      return;
    }

    const data = await createExternalServer({
      name,
      host,
      game_port: gamePort,
      query_port: queryPort,
      protocol,
      hoster,
      game_label: gameLabel
    });

    res.status(201).json({ data });
  } catch (error) {
    const dbError = error as { code?: string; message?: string };
    if (dbError.code === 'ER_DUP_ENTRY' || dbError.message?.includes('Duplicate entry')) {
      next({ code: 'API_CONFLICT', status: 409, message: 'External server already exists' });
      return;
    }

    next(error);
  }
});

serversRoute.post('/servers/:serverId/pause', authMiddleware, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown> | null;
    const paused = body?.paused === false ? false : true;
    const data = await setServerMaintenanceMode(req.params.serverId, paused);

    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Server not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

serversRoute.delete('/servers/:serverId', authMiddleware, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const deleted = await deleteServerSoft(req.params.serverId);
    if (!deleted) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Server not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
