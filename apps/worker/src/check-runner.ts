import { createDecipheriv, createHash, randomUUID } from 'node:crypto';
import dgram from 'node:dgram';
import net from 'node:net';
import { config } from '@gm/config';
import { getPool } from '@gm/db';
import { createLogger } from '@gm/logger';

type Logger = ReturnType<typeof createLogger>;

type EndpointPurpose = 'GAME' | 'QUERY' | 'HTTP' | 'RCON' | 'OTHER';
type EndpointProtocol = 'TCP' | 'UDP' | 'HTTP' | 'HTTPS';

type RuntimeServerRow = {
  id: string;
  name: string;
  game_label: string | null;
  panel_id: string | null;
  check_profile_id: string;
  normalized_status: 'ONLINE' | 'OFFLINE' | 'TRANSITION' | 'MAINTENANCE';
  last_status_change_at: Date | null;
  ptero_raw_state: string | null;
  last_reason_code: string | null;
  last_reason_meta: string | null;
  last_reason_source: PersistReasonSource | null;
  is_enabled: number;
  maintenance_mode: number;
};

type RuntimeCheckProfileRow = {
  id: string;
  name: string;
  rules: string;
};

type RuntimeGameLabelRow = {
  name: string;
  settings: unknown;
};

type RuntimeEndpointRow = {
  id: string;
  label: string;
  host: string;
  port: number;
  protocol: EndpointProtocol;
  purpose: EndpointPurpose;
  is_primary: number;
};

type EndpointSelector = {
  purpose: EndpointPurpose;
  protocol?: EndpointProtocol;
  primary_only?: boolean;
};

type ProfileCheckRule = {
  adapter_key: string;
  enabled?: boolean;
  timeout_ms: number;
  endpoint_selector: EndpointSelector;
  adapter_config?: Record<string, unknown>;
};

type CheckProfileRules = {
  version: number;
  name?: string;
  checks: ProfileCheckRule[];
  confirmFail: {
    enabled: boolean;
    delayMs: number;
    recheckTimeoutMs?: number;
    applyToPrimaryOnly: boolean;
  };
};

type RuntimeEndpoint = {
  id: string;
  label: string;
  host: string;
  port: number;
  protocol: EndpointProtocol;
  purpose: EndpointPurpose;
  isPrimary: boolean;
};

type AdapterRunInput = {
  endpoint: RuntimeEndpoint;
  timeoutMs: number;
};

type AdapterRunResult = {
  ok: boolean;
  reasonCode: string;
  reasonSource: 'ADAPTER';
  details?: Record<string, unknown>;
};

type PersistReasonSource = 'PTERO' | 'QUERY' | 'ADAPTER' | 'SYSTEM';
type PersistStatus = 'ONLINE' | 'OFFLINE' | 'TRANSITION' | 'MAINTENANCE';

type OpenIncidentRow = {
  id: string;
  started_at: Date;
};

type AlertEventType = 'STATE_CHANGE_OFFLINE' | 'STATE_CHANGE_ONLINE';

type AlertSuppressionReason =
  | 'ALERT_SUPPRESSION_SERVER_DISABLED'
  | 'ALERT_SUPPRESSION_POLICY_DISABLED'
  | 'ALERT_SUPPRESSION_CHANNEL_DISABLED'
  | 'ALERT_SUPPRESSION_STARTUP_GRACE'
  | 'ALERT_SUPPRESSION_MAINTENANCE_MODE'
  | 'ALERT_SUPPRESSION_PLANNED_POWER_ACTION'
  | 'ALERT_SUPPRESSION_PTERO_SERVER_OFFLINE'
  | 'ALERT_SUPPRESSION_POLICY_FILTERED'
  | 'ALERT_SUPPRESSION_COOLDOWN'
  | 'ALERT_SUPPRESSION_DUPLICATE'
  | 'ALERT_SUPPRESSION_DISPATCH_ERROR'
  | 'ALERT_SUPPRESSION_RATE_LIMITED';

type RuntimeAlertPolicyRow = {
  id: string;
  cooldown_seconds: number;
  notify_on: string;
  channel_ids: string;
  is_enabled: number;
};

type RuntimeAlertPolicy = {
  id: string;
  cooldownSeconds: number;
  notifyOn: Record<string, unknown>;
  channelIds: string[];
  isEnabled: boolean;
};

type RuntimeAlertChannelRow = {
  id: string;
  type: 'DISCORD_WEBHOOK' | 'EMAIL_SMTP';
  name: string;
  config_enc: string;
  config_kid: string;
  is_enabled: number;
};

type AlertDispatchResult = {
  wasSent: boolean;
  sentAt: Date | null;
  attemptCount: number;
  suppressedReason: AlertSuppressionReason | null;
  lastErrorCode: string | null;
  lastErrorDetail: string | null;
};

type PendingAlertTransition = {
  server: RuntimeServerRow;
  incidentId: string | null;
  eventType: AlertEventType;
  previousStatus: PersistStatus;
  nextStatus: PersistStatus;
  reasonCode: string;
  reasonSource: PersistReasonSource;
  suppressForPlannedPowerAction: boolean;
};

type TableExistsRow = {
  total: number;
};

type PlannedSuppressionRow = {
  last_reason_source: PersistReasonSource | null;
  last_reason_code: string | null;
  last_reason_meta: string | null;
};

const BUCKET_RETENTION_DAYS = 30;
const DEBUG_SAMPLE_RETENTION_HOURS = 72;
const RETENTION_RUN_INTERVAL_MS = 10 * 60 * 1000;
const DISCORD_DISPATCH_MAX_ATTEMPTS = 3;
const DISCORD_DISPATCH_BASE_BACKOFF_MS = 1_000;
const DISCORD_DISPATCH_MAX_BACKOFF_MS = 10_000;
const ALERT_STARTUP_GRACE_MS = 2 * 60 * 1000;
const PANEL_RESTART_GRACE_MS = Math.max(90_000, config.WORKER_PANEL_SYNC_INTERVAL_MS + config.WORKER_TICK_MS);
const MIN_PANEL_RESTART_GRACE_MS = 10_000;
const MAX_PANEL_RESTART_GRACE_MS = 60 * 60 * 1000;
const WORKER_PROCESS_STARTED_AT_MS = Date.now();

const ALERT_SECRET_PREFIX = 'gmse:v1:';

const parseAlertMasterKeyring = (raw: string): Record<string, string> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, string> = {};
    for (const [kid, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof kid !== 'string' || kid.trim().length === 0) {
        continue;
      }

      if (typeof value !== 'string' || value.trim().length < 16) {
        continue;
      }

      result[kid.trim()] = value;
    }

    return result;
  } catch {
    return {};
  }
};

const alertKeyring = parseAlertMasterKeyring(config.ALERT_CHANNEL_MASTER_KEYS);

const toAesKey = (masterKey: string): Buffer => createHash('sha256').update(masterKey, 'utf8').digest();

const decryptAlertConfig = (
  configEnc: string,
  configKid: string,
  keyring: Record<string, string>
): Record<string, unknown> | null => {
  const raw = configEnc.trim();
  if (raw.length === 0) {
    return null;
  }

  if (!raw.startsWith(ALERT_SECRET_PREFIX)) {
    if (/^https?:\/\//i.test(raw)) {
      return { webhook_url: raw };
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }

      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  try {
    const encodedEnvelope = raw.slice(ALERT_SECRET_PREFIX.length);
    const envelope = JSON.parse(Buffer.from(encodedEnvelope, 'base64').toString('utf8')) as {
      v: number;
      alg: string;
      kid: string;
      iv: string;
      tag: string;
      data: string;
    };

    if (envelope.v !== 1 || envelope.alg !== 'aes-256-gcm') {
      return null;
    }

    const resolvedKid = typeof envelope.kid === 'string' && envelope.kid.length > 0 ? envelope.kid : configKid;
    const masterKey = keyring[resolvedKid] ?? keyring[configKid];
    if (!masterKey) {
      return null;
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      toAesKey(masterKey),
      Buffer.from(envelope.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final()
    ]);

    const parsed = JSON.parse(plaintext.toString('utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

type AggregationInput = {
  status: PersistStatus;
  reasonCode: string;
  reasonSource: PersistReasonSource;
  details?: Record<string, unknown>;
  endpointId?: string;
  endpointTarget?: string;
  adapterKey?: string;
  profileId?: string;
  profileName?: string;
};

type AdapterRunner = (input: AdapterRunInput) => Promise<AdapterRunResult>;

const tcpConnectAdapter: AdapterRunner = async ({ endpoint, timeoutMs }) => {
  return new Promise<AdapterRunResult>((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: AdapterRunResult): void => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      finish({ ok: true, reasonCode: 'ADAPTER_OK', reasonSource: 'ADAPTER' });
    });

    socket.on('timeout', () => {
      finish({
        ok: false,
        reasonCode: 'ADAPTER_TIMEOUT',
        reasonSource: 'ADAPTER',
        details: { timeout_ms: timeoutMs }
      });
    });

    socket.on('error', (error: NodeJS.ErrnoException) => {
      const code = error.code === 'ECONNREFUSED' ? 'ADAPTER_CONNECTION_REFUSED' : 'ADAPTER_CONNECT_ERROR';
      finish({
        ok: false,
        reasonCode: code,
        reasonSource: 'ADAPTER',
        details: { error: String(error.message) }
      });
    });

    socket.connect(endpoint.port, endpoint.host);
  });
};

const readNullTerminatedString = (buffer: Buffer, startOffset: number): { value: string; nextOffset: number } => {
  const end = buffer.indexOf(0x00, startOffset);
  if (end < 0) {
    return { value: '', nextOffset: startOffset };
  }

  return {
    value: buffer.toString('utf8', startOffset, end),
    nextOffset: end + 1
  };
};

const extractA2sPayload = (buffer: Buffer): Buffer | null => {
  if (buffer.length < 6) {
    return null;
  }

  const prefix = buffer.readInt32LE(0);
  if (prefix === -1) {
    return buffer.subarray(4);
  }

  if (prefix !== -2) {
    return null;
  }

  if (buffer.length < 13) {
    return null;
  }

  const potentialSourcePayload = buffer.subarray(12);
  if (potentialSourcePayload.length > 0 && [0x49, 0x41, 0x6d].includes(potentialSourcePayload.readUInt8(0))) {
    return potentialSourcePayload;
  }

  const potentialGoldSourcePayload = buffer.subarray(9);
  if (potentialGoldSourcePayload.length > 0 && [0x49, 0x41, 0x6d].includes(potentialGoldSourcePayload.readUInt8(0))) {
    return potentialGoldSourcePayload;
  }

  return null;
};

const parseA2sInfoPacket = (buffer: Buffer): AdapterRunResult => {
  const payload = extractA2sPayload(buffer);
  if (!payload || payload.length < 2) {
    return {
      ok: false,
      reasonCode: 'ADAPTER_A2S_INVALID_PACKET',
      reasonSource: 'ADAPTER'
    };
  }

  const headerType = payload.readUInt8(0);

  if (headerType === 0x41) {
    return {
      ok: false,
      reasonCode: 'ADAPTER_A2S_CHALLENGE_REQUIRED',
      reasonSource: 'ADAPTER',
      details: {
        challenge: payload.length >= 5 ? payload.readInt32LE(1) : null
      }
    };
  }

  if (headerType === 0x6d) {
    const name = readNullTerminatedString(payload, 1);
    const map = readNullTerminatedString(payload, name.nextOffset);
    const folder = readNullTerminatedString(payload, map.nextOffset);
    const game = readNullTerminatedString(payload, folder.nextOffset);

    if (game.nextOffset + 3 > payload.length) {
      return {
        ok: false,
        reasonCode: 'ADAPTER_A2S_TRUNCATED',
        reasonSource: 'ADAPTER'
      };
    }

    const players = payload.readUInt8(game.nextOffset + 1);
    const maxPlayers = payload.readUInt8(game.nextOffset + 2);

    return {
      ok: true,
      reasonCode: 'ADAPTER_OK',
      reasonSource: 'ADAPTER',
      details: {
        server_name: name.value,
        map: map.value,
        folder: folder.value,
        game: game.value,
        players,
        max_players: maxPlayers,
        version: null,
        protocol_variant: 'GOLDSOURCE'
      }
    };
  }

  if (headerType !== 0x49) {
    return {
      ok: false,
      reasonCode: 'ADAPTER_A2S_UNSUPPORTED_RESPONSE',
      reasonSource: 'ADAPTER'
    };
  }

  let offset = 2;
  const name = readNullTerminatedString(payload, offset);
  offset = name.nextOffset;
  const map = readNullTerminatedString(payload, offset);
  offset = map.nextOffset;
  const folder = readNullTerminatedString(payload, offset);
  offset = folder.nextOffset;
  const game = readNullTerminatedString(payload, offset);
  offset = game.nextOffset;

  if (offset + 2 > payload.length) {
    return {
      ok: false,
      reasonCode: 'ADAPTER_A2S_TRUNCATED',
      reasonSource: 'ADAPTER'
    };
  }

  offset += 2;

  if (offset + 2 > payload.length) {
    return {
      ok: false,
      reasonCode: 'ADAPTER_A2S_TRUNCATED',
      reasonSource: 'ADAPTER'
    };
  }

  const players = payload.readUInt8(offset);
  const maxPlayers = payload.readUInt8(offset + 1);

  return {
    ok: true,
    reasonCode: 'ADAPTER_OK',
    reasonSource: 'ADAPTER',
    details: {
      server_name: name.value,
      map: map.value,
      folder: folder.value,
      game: game.value,
      players,
      max_players: maxPlayers,
        version: null,
        protocol_variant: 'SOURCE'
    }
  };
};

const a2sInfoAdapter: AdapterRunner = async ({ endpoint, timeoutMs }) => {
  return new Promise<AdapterRunResult>((resolve) => {
    const socket = dgram.createSocket('udp4');
    const startedAt = Date.now();
    const queryPayload = Buffer.concat([
      Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]),
      Buffer.from('Source Engine Query\u0000', 'utf8')
    ]);

    let settled = false;
    let challengeRetrySent = false;

    const setGuardTimeout = (): NodeJS.Timeout =>
      setTimeout(() => {
        finish({
          ok: false,
          reasonCode: 'ADAPTER_A2S_TIMEOUT',
          reasonSource: 'ADAPTER',
          details: {
            timeout_ms: timeoutMs
          }
        });
      }, timeoutMs);

    const finish = (result: AdapterRunResult): void => {
      if (settled) {
        return;
      }

      settled = true;
      socket.close();
      resolve(result);
    };

    let timer = setGuardTimeout();

    socket.on('error', (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        reasonCode: 'ADAPTER_A2S_SOCKET_ERROR',
        reasonSource: 'ADAPTER',
        details: {
          error: String(error.message)
        }
      });
    });

    socket.on('message', (message) => {
      const parsed = parseA2sInfoPacket(message);

      if (
        parsed.reasonCode === 'ADAPTER_A2S_CHALLENGE_REQUIRED' &&
        !challengeRetrySent &&
        typeof parsed.details?.challenge === 'number'
      ) {
        challengeRetrySent = true;
        clearTimeout(timer);

        const challengeToken = Buffer.alloc(4);
        challengeToken.writeInt32LE(parsed.details.challenge as number, 0);
        const retryPayload = Buffer.concat([queryPayload, challengeToken]);

        timer = setGuardTimeout();
        socket.send(retryPayload, endpoint.port, endpoint.host, (error) => {
          if (!error) {
            return;
          }

          clearTimeout(timer);
          finish({
            ok: false,
            reasonCode: 'ADAPTER_A2S_SEND_FAILED',
            reasonSource: 'ADAPTER',
            details: {
              error: String(error.message)
            }
          });
        });
        return;
      }

      clearTimeout(timer);
      const rttMs = Math.max(0, Date.now() - startedAt);
      finish({
        ...parsed,
        details: {
          ...(parsed.details ?? {}),
          rtt_ms: rttMs
        }
      });
    });

    socket.send(queryPayload, endpoint.port, endpoint.host, (error) => {
      if (!error) {
        return;
      }

      clearTimeout(timer);
      finish({
        ok: false,
        reasonCode: 'ADAPTER_A2S_SEND_FAILED',
        reasonSource: 'ADAPTER',
        details: {
          error: String(error.message)
        }
      });
    });
  });
};

const adapterRegistry = new Map<string, AdapterRunner>([
  ['tcp_connect', tcpConnectAdapter],
  ['a2s_query', a2sInfoAdapter]
]);

const sleep = async (delayMs: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
};

const parseRules = (rawRules: string): CheckProfileRules | null => {
  try {
    const parsed = JSON.parse(rawRules) as Partial<CheckProfileRules>;
    if (!Array.isArray(parsed.checks)) {
      return null;
    }

    const confirmFailRaw = (parsed as { confirm_fail?: Record<string, unknown> }).confirm_fail;
    const confirmFailEnabled =
      typeof confirmFailRaw?.enabled === 'boolean'
        ? confirmFailRaw.enabled
        : true;
    const confirmFailDelayMs =
      typeof confirmFailRaw?.delay_ms === 'number'
        ? confirmFailRaw.delay_ms
        : 2500;
    const confirmFailRecheckTimeoutMs =
      typeof confirmFailRaw?.recheck_timeout_ms === 'number'
        ? confirmFailRaw.recheck_timeout_ms
        : undefined;
    const confirmFailApplyToPrimaryOnly =
      typeof confirmFailRaw?.apply_to_primary_only === 'boolean'
        ? confirmFailRaw.apply_to_primary_only
        : true;

    return {
      version: Number(parsed.version ?? 1),
      name: parsed.name,
      checks: parsed.checks.filter((entry): entry is ProfileCheckRule => {
        return Boolean(
          entry &&
            typeof entry.adapter_key === 'string' &&
            typeof entry.timeout_ms === 'number' &&
            entry.endpoint_selector &&
            typeof entry.endpoint_selector.purpose === 'string'
        );
      }),
      confirmFail: {
        enabled: confirmFailEnabled,
        delayMs: Math.max(0, confirmFailDelayMs),
        recheckTimeoutMs: confirmFailRecheckTimeoutMs,
        applyToPrimaryOnly: confirmFailApplyToPrimaryOnly
      }
    };
  } catch {
    return null;
  }
};

const selectEndpointCandidates = (
  endpoints: RuntimeEndpoint[],
  selector: EndpointSelector
): RuntimeEndpoint[] => {
  const byPurposeAndProtocol = endpoints
    .filter((endpoint) => endpoint.purpose === selector.purpose)
    .filter((endpoint) => !selector.protocol || endpoint.protocol === selector.protocol)
    .sort((left, right) => left.id.localeCompare(right.id));

  if (!selector.primary_only) {
    return byPurposeAndProtocol;
  }

  const primaryCandidates = byPurposeAndProtocol.filter((endpoint) => endpoint.isPrimary);
  if (primaryCandidates.length > 0) {
    return primaryCandidates;
  }

  return byPurposeAndProtocol;
};

const getRunnableServers = async (): Promise<RuntimeServerRow[]> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT id, name, game_label, panel_id, check_profile_id, normalized_status, last_status_change_at, ptero_raw_state, last_reason_code, last_reason_meta, last_reason_source, is_enabled, maintenance_mode
      FROM servers
      WHERE deleted_at IS NULL
        AND is_enabled = 1
        AND maintenance_mode = 0
        AND check_profile_id IS NOT NULL
      ORDER BY id ASC
    `
  );

  return rows as RuntimeServerRow[];
};

const getPanelRestartGraceMsByGameLabel = async (): Promise<Map<string, number>> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT name, settings
      FROM game_labels
      WHERE is_enabled = 1
      ORDER BY name ASC
    `
  );

  const map = new Map<string, number>();

  for (const row of rows as RuntimeGameLabelRow[]) {
    const label = String(row.name ?? '').trim().toUpperCase();
    if (!label) {
      continue;
    }

    const settings = parseJsonObject(row.settings);
    const rawSeconds = settings.game_restart_grace_sec;
    const parsedSeconds =
      typeof rawSeconds === 'number'
        ? rawSeconds
        : typeof rawSeconds === 'string'
          ? Number(rawSeconds)
          : Number.NaN;

    if (!Number.isFinite(parsedSeconds)) {
      continue;
    }

    const graceMs = Math.round(parsedSeconds * 1000);
    const clamped = Math.max(MIN_PANEL_RESTART_GRACE_MS, Math.min(MAX_PANEL_RESTART_GRACE_MS, graceMs));
    map.set(label, clamped);
  }

  return map;
};

const resolvePanelRestartGraceMs = (server: RuntimeServerRow, byLabel: Map<string, number>): number => {
  const label = String(server.game_label ?? '').trim().toUpperCase();
  if (!label) {
    return PANEL_RESTART_GRACE_MS;
  }

  return byLabel.get(label) ?? PANEL_RESTART_GRACE_MS;
};

const resolvePanelAwareFailureStatus = (server: RuntimeServerRow, restartGraceMs: number): PersistStatus => {
  if (!server.panel_id) {
    return 'OFFLINE';
  }

  const pteroState = String(server.ptero_raw_state ?? '').trim().toLowerCase();
  if (pteroState === 'starting' || pteroState === 'stopping' || pteroState === 'installing' || pteroState === 'offline' || pteroState === 'stopped') {
    return 'TRANSITION';
  }

  if (server.normalized_status === 'ONLINE') {
    return 'TRANSITION';
  }

  if (server.normalized_status === 'TRANSITION') {
    const transitionedAt = server.last_status_change_at ? new Date(server.last_status_change_at).getTime() : Number.NaN;
    if (Number.isFinite(transitionedAt) && Date.now() - transitionedAt < restartGraceMs) {
      return 'TRANSITION';
    }
  }

  return 'OFFLINE';
};

const shouldSuppressForPteroOffline = (server: RuntimeServerRow): boolean => {
  if (!server.panel_id) {
    return false;
  }

  if (server.normalized_status === 'TRANSITION') {
    return true;
  }

  const pteroState = String(server.ptero_raw_state ?? '').trim().toLowerCase();
  if (pteroState === 'offline' || pteroState === 'stopped' || pteroState === 'starting' || pteroState === 'stopping' || pteroState === 'installing') {
    return true;
  }

  if (server.last_reason_source !== 'PTERO') {
    return false;
  }

  return (
    server.last_reason_code === 'STATUS_PTERO_OFFLINE' ||
    server.last_reason_code === 'STATUS_PTERO_TRANSITION' ||
    server.last_reason_code === 'STATUS_PTERO_SUSPENDED' ||
    server.last_reason_code === 'STATUS_PTERO_NOT_RUNNING'
  );
};

const shouldSuppressForPlannedPowerAction = (server: RuntimeServerRow): boolean => {
  if (server.last_reason_source !== 'SYSTEM' || server.last_reason_code !== 'STATUS_POWER_ACTION_PENDING') {
    return false;
  }

  let meta: Record<string, unknown> = {};
  if (typeof server.last_reason_meta === 'string' && server.last_reason_meta.trim().length > 0) {
    try {
      const parsed = JSON.parse(server.last_reason_meta) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        meta = parsed as Record<string, unknown>;
      }
    } catch {
      return false;
    }
  }

  const rawUntil = typeof meta.suppress_alerts_until === 'string' ? meta.suppress_alerts_until.trim() : '';
  if (!rawUntil) {
    return false;
  }

  const untilMs = Date.parse(rawUntil);
  if (!Number.isFinite(untilMs)) {
    return false;
  }

  return Date.now() < untilMs;
};

const shouldSuppressForPlannedPowerActionByServerId = async (serverId: string): Promise<boolean> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT last_reason_source, last_reason_code, last_reason_meta
      FROM servers
      WHERE id = ?
      LIMIT 1
    `,
    [serverId]
  );

  const row = (rows as PlannedSuppressionRow[])[0];
  if (!row) {
    return false;
  }

  return shouldSuppressForPlannedPowerAction({
    id: serverId,
    name: '',
    game_label: null,
    panel_id: null,
    check_profile_id: '',
    normalized_status: 'TRANSITION',
    last_status_change_at: null,
    ptero_raw_state: null,
    last_reason_code: row.last_reason_code,
    last_reason_meta: row.last_reason_meta,
    last_reason_source: row.last_reason_source,
    is_enabled: 1,
    maintenance_mode: 0
  });
};

const parseJsonObject = (raw: unknown): Record<string, unknown> => {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }

      return {};
    } catch {
      return {};
    }
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  return {};
};

const parseJsonStringArray = (raw: unknown): string[] => {
  if (typeof raw !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
};

const resolveStateChangeAlertEventType = (
  previousStatus: PersistStatus,
  nextStatus: PersistStatus
): AlertEventType | null => {
  if (nextStatus === 'OFFLINE' && previousStatus !== 'OFFLINE') {
    return 'STATE_CHANGE_OFFLINE';
  }

  if (previousStatus === 'OFFLINE' && nextStatus !== 'OFFLINE') {
    return 'STATE_CHANGE_ONLINE';
  }

  return null;
};

const getEnabledAlertPolicies = async (): Promise<RuntimeAlertPolicy[]> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT id, cooldown_seconds, notify_on, channel_ids, is_enabled
      FROM alert_policies
      ORDER BY id ASC
    `
  );

  return (rows as RuntimeAlertPolicyRow[]).map((row) => ({
    id: row.id,
    cooldownSeconds: Math.max(0, Number(row.cooldown_seconds) || 0),
    notifyOn: parseJsonObject(row.notify_on),
    channelIds: parseJsonStringArray(row.channel_ids),
    isEnabled: row.is_enabled === 1
  }));
};

const getAlertChannelsMap = async (channelIds: string[]): Promise<Map<string, RuntimeAlertChannelRow>> => {
  if (channelIds.length === 0) {
    return new Map<string, RuntimeAlertChannelRow>();
  }

  const pool = getPool();
  const placeholders = channelIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `
      SELECT id, type, name, config_enc, config_kid, is_enabled
      FROM alert_channels
      WHERE id IN (${placeholders})
    `,
    channelIds
  );

  return new Map((rows as RuntimeAlertChannelRow[]).map((row) => [row.id, row]));
};

const parseDiscordWebhookUrl = (channel: RuntimeAlertChannelRow): string | null => {
  const decrypted = decryptAlertConfig(channel.config_enc ?? '', channel.config_kid ?? '', alertKeyring);
  if (!decrypted) {
    return null;
  }

  const candidate =
    (typeof decrypted.webhook_url === 'string' && decrypted.webhook_url) ||
    (typeof decrypted.url === 'string' && decrypted.url) ||
    (typeof decrypted.webhookUrl === 'string' && decrypted.webhookUrl) ||
    null;

  if (candidate && /^https?:\/\//i.test(candidate.trim())) {
    return candidate.trim();
  }

  return null;
};

const buildDiscordStatusBlock = (eventType: AlertEventType): string => {
  if (eventType === 'STATE_CHANGE_OFFLINE') {
    return ['```diff', '- Offline', '```'].join('\n');
  }

  return ['```diff', '+ Online', '```'].join('\n');
};

const buildDiscordMessage = (input: {
  eventType: AlertEventType;
  transitions: PendingAlertTransition[];
}): string => {
  const statusBlock = buildDiscordStatusBlock(input.eventType);

  return input.transitions
    .map((transition) => {
      return [
        `# ${transition.server.name}`,
        statusBlock,
        `"${transition.reasonCode} (${transition.reasonSource})"`
      ].join('\n');
    })
    .join('\n\n');
};

const dispatchDiscordWebhook = async (input: {
  webhookUrl: string;
  message: string;
}): Promise<AlertDispatchResult> => {
  let attemptCount = 0;
  let lastErrorCode: string | null = null;
  let lastErrorDetail: string | null = null;
  let rateLimited = false;

  for (let attempt = 1; attempt <= DISCORD_DISPATCH_MAX_ATTEMPTS; attempt += 1) {
    attemptCount = attempt;

    try {
      const response = await fetch(input.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: input.message })
      });

      if (response.ok) {
        return {
          wasSent: true,
          sentAt: new Date(),
          attemptCount,
          suppressedReason: null,
          lastErrorCode: null,
          lastErrorDetail: null
        };
      }

      const responseBody = await response.text();
      lastErrorCode = `DISCORD_HTTP_${response.status}`;
      lastErrorDetail = responseBody.slice(0, 500) || response.statusText;

      if (response.status === 429) {
        rateLimited = true;
      }

      if (attempt < DISCORD_DISPATCH_MAX_ATTEMPTS) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1_000 : 0;
        const backoffMs = Math.min(
          DISCORD_DISPATCH_MAX_BACKOFF_MS,
          DISCORD_DISPATCH_BASE_BACKOFF_MS * 2 ** (attempt - 1)
        );
        await sleep(Math.max(backoffMs, retryAfterMs));
      }
    } catch (error) {
      lastErrorCode = 'DISCORD_REQUEST_FAILED';
      lastErrorDetail = error instanceof Error ? error.message : 'unknown dispatch error';

      if (attempt < DISCORD_DISPATCH_MAX_ATTEMPTS) {
        const backoffMs = Math.min(
          DISCORD_DISPATCH_MAX_BACKOFF_MS,
          DISCORD_DISPATCH_BASE_BACKOFF_MS * 2 ** (attempt - 1)
        );
        await sleep(backoffMs);
      }
    }
  }

  return {
    wasSent: false,
    sentAt: null,
    attemptCount,
    suppressedReason: rateLimited ? 'ALERT_SUPPRESSION_RATE_LIMITED' : 'ALERT_SUPPRESSION_DISPATCH_ERROR',
    lastErrorCode,
    lastErrorDetail
  };
};

const dispatchAlertForChannel = async (input: {
  channel: RuntimeAlertChannelRow;
  eventType: AlertEventType;
  transitions: PendingAlertTransition[];
}): Promise<AlertDispatchResult> => {
  if (input.channel.type !== 'DISCORD_WEBHOOK') {
    return {
      wasSent: false,
      sentAt: null,
      attemptCount: 1,
      suppressedReason: 'ALERT_SUPPRESSION_DISPATCH_ERROR',
      lastErrorCode: 'SYSTEM_ALERT_CHANNEL_TYPE_UNSUPPORTED',
      lastErrorDetail: `Unsupported channel type: ${input.channel.type}`
    };
  }

  const webhookUrl = parseDiscordWebhookUrl(input.channel);
  if (!webhookUrl) {
    return {
      wasSent: false,
      sentAt: null,
      attemptCount: 1,
      suppressedReason: 'ALERT_SUPPRESSION_DISPATCH_ERROR',
      lastErrorCode: 'SYSTEM_ALERT_DISCORD_CONFIG_INVALID',
      lastErrorDetail: `Channel ${input.channel.id} has no valid webhook URL in config_enc.`
    };
  }

  const message = buildDiscordMessage({
    eventType: input.eventType,
    transitions: input.transitions
  });

  return dispatchDiscordWebhook({ webhookUrl, message });
};

const isCooldownActive = async (
  serverId: string,
  policyId: string,
  channelId: string,
  eventType: AlertEventType,
  cooldownSeconds: number,
  now: Date
): Promise<boolean> => {
  if (cooldownSeconds <= 0) {
    return false;
  }

  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT id
      FROM alert_events
      WHERE server_id = ?
        AND policy_id = ?
        AND channel_id = ?
        AND event_type = ?
        AND was_sent = 1
        AND sent_at IS NOT NULL
        AND sent_at >= DATE_SUB(?, INTERVAL ? SECOND)
      LIMIT 1
    `,
    [serverId, policyId, channelId, eventType, now, cooldownSeconds]
  );

  return (rows as Array<{ id: string }>).length > 0;
};

const isDuplicateRecentEvent = async (
  serverId: string,
  policyId: string,
  channelId: string,
  incidentId: string | null,
  eventType: AlertEventType,
  statusFrom: PersistStatus,
  statusTo: PersistStatus,
  reasonCode: string,
  now: Date
): Promise<boolean> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT id
      FROM alert_events
      WHERE server_id = ?
        AND policy_id = ?
        AND channel_id = ?
        AND incident_id <=> ?
        AND event_type = ?
        AND status_from = ?
        AND status_to = ?
        AND reason_code = ?
        AND created_at >= DATE_SUB(?, INTERVAL 15 MINUTE)
      LIMIT 1
    `,
    [serverId, policyId, channelId, incidentId, eventType, statusFrom, statusTo, reasonCode, now]
  );

  return (rows as Array<{ id: string }>).length > 0;
};

const persistAlertAuditEvent = async (input: {
  serverId: string;
  incidentId: string | null;
  policyId: string;
  channelId: string;
  eventType: AlertEventType;
  statusFrom: PersistStatus;
  statusTo: PersistStatus;
  reasonCode: string;
  reasonSource: PersistReasonSource;
  suppressedReason: AlertSuppressionReason | null;
  payloadSummary: Record<string, unknown>;
  attemptCount?: number;
  lastErrorCode?: string | null;
  lastErrorDetail?: string | null;
  wasSent: boolean;
  sentAt: Date | null;
  createdAt: Date;
}): Promise<boolean> => {
  const pool = getPool();
  const id = randomUUID();
  const idempotencyRaw = [
    input.serverId,
    input.incidentId ?? 'NO_INCIDENT',
    input.policyId,
    input.channelId,
    input.eventType,
    input.statusFrom,
    input.statusTo,
    input.reasonCode
  ].join(':');
  const idempotencyKey = `alert:${createHash('sha256').update(idempotencyRaw).digest('hex')}`;

  try {
    await pool.query(
      `
        INSERT INTO alert_events (
          id,
          idempotency_key,
          server_id,
          incident_id,
          policy_id,
          channel_id,
          event_type,
          status_from,
          status_to,
          reason_code,
          reason_source,
          suppressed_reason,
          payload_summary,
          attempt_count,
          last_error_code,
          last_error_detail,
          was_sent,
          sent_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        idempotencyKey,
        input.serverId,
        input.incidentId,
        input.policyId,
        input.channelId,
        input.eventType,
        input.statusFrom,
        input.statusTo,
        input.reasonCode,
        input.reasonSource,
        input.suppressedReason,
        JSON.stringify(input.payloadSummary),
        input.attemptCount ?? 0,
        input.lastErrorCode ?? null,
        input.lastErrorDetail ?? null,
        input.wasSent ? 1 : 0,
        input.sentAt,
        input.createdAt
      ]
    );

    return true;
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code === 'ER_DUP_ENTRY') {
      return false;
    }

    throw error;
  }
};

const emitAlertAuditEventsForTransitions = async (transitions: PendingAlertTransition[]): Promise<void> => {
  if (transitions.length === 0) {
    return;
  }

  const policies = await getEnabledAlertPolicies();
  if (policies.length === 0) {
    return;
  }

  const channelIds = Array.from(new Set(policies.flatMap((policy) => policy.channelIds)));
  const channelsById = await getAlertChannelsMap(channelIds);

  const now = new Date();

  const startupGraceActive = Date.now() - WORKER_PROCESS_STARTED_AT_MS < ALERT_STARTUP_GRACE_MS;

  type DispatchCandidate = {
    transition: PendingAlertTransition;
    policy: RuntimeAlertPolicy;
    channelId: string;
    channel: RuntimeAlertChannelRow;
  };

  const dispatchCandidatesByBatchKey = new Map<string, DispatchCandidate[]>();

  for (const transition of transitions) {
    for (const policy of policies) {
      for (const channelId of policy.channelIds) {
        const channel = channelsById.get(channelId);
        const notifyOnEvent = policy.notifyOn[transition.eventType] === true;

        let suppressedReason: AlertSuppressionReason | null = null;

        if (startupGraceActive) {
          suppressedReason = 'ALERT_SUPPRESSION_STARTUP_GRACE';
        } else if (transition.server.is_enabled !== 1) {
          suppressedReason = 'ALERT_SUPPRESSION_SERVER_DISABLED';
        } else if (transition.server.maintenance_mode === 1) {
          suppressedReason = 'ALERT_SUPPRESSION_MAINTENANCE_MODE';
        } else if (
          transition.suppressForPlannedPowerAction ||
          (await shouldSuppressForPlannedPowerActionByServerId(transition.server.id))
        ) {
          suppressedReason = 'ALERT_SUPPRESSION_PLANNED_POWER_ACTION';
        } else if (shouldSuppressForPteroOffline(transition.server)) {
          suppressedReason = 'ALERT_SUPPRESSION_PTERO_SERVER_OFFLINE';
        } else if (!policy.isEnabled) {
          suppressedReason = 'ALERT_SUPPRESSION_POLICY_DISABLED';
        } else if (!channel || channel.is_enabled !== 1) {
          suppressedReason = 'ALERT_SUPPRESSION_CHANNEL_DISABLED';
        } else if (!notifyOnEvent) {
          suppressedReason = 'ALERT_SUPPRESSION_POLICY_FILTERED';
        } else if (
          await isCooldownActive(
            transition.server.id,
            policy.id,
            channelId,
            transition.eventType,
            policy.cooldownSeconds,
            now
          )
        ) {
          suppressedReason = 'ALERT_SUPPRESSION_COOLDOWN';
        } else if (
          await isDuplicateRecentEvent(
            transition.server.id,
            policy.id,
            channelId,
            transition.incidentId,
            transition.eventType,
            transition.previousStatus,
            transition.nextStatus,
            transition.reasonCode,
            now
          )
        ) {
          suppressedReason = 'ALERT_SUPPRESSION_DUPLICATE';
        }

        if (suppressedReason) {
          await persistAlertAuditEvent({
            serverId: transition.server.id,
            incidentId: transition.incidentId,
            policyId: policy.id,
            channelId,
            eventType: transition.eventType,
            statusFrom: transition.previousStatus,
            statusTo: transition.nextStatus,
            reasonCode: transition.reasonCode,
            reasonSource: transition.reasonSource,
            suppressedReason,
            payloadSummary: {
              server_name: transition.server.name,
              event_type: transition.eventType,
              status_from: transition.previousStatus,
              status_to: transition.nextStatus,
              reason_code: transition.reasonCode,
              reason_source: transition.reasonSource,
              policy_id: policy.id,
              policy_notify_on: policy.notifyOn,
              channel_id: channelId,
              channel_type: channel?.type ?? null,
              channel_name: channel?.name ?? null
            },
            wasSent: false,
            sentAt: null,
            createdAt: now
          });
          continue;
        }

        if (!channel) {
          continue;
        }

        const batchKey = [policy.id, channelId, transition.eventType].join(':');
        const batch = dispatchCandidatesByBatchKey.get(batchKey) ?? [];
        batch.push({ transition, policy, channelId, channel });
        dispatchCandidatesByBatchKey.set(batchKey, batch);
      }
    }
  }

  for (const batch of dispatchCandidatesByBatchKey.values()) {
    if (batch.length === 0) {
      continue;
    }

    const first = batch[0];
    const dispatchResult = await dispatchAlertForChannel({
      channel: first.channel,
      eventType: first.transition.eventType,
      transitions: batch.map((entry) => entry.transition)
    });
    const createdAt = dispatchResult.sentAt ?? now;

    for (const entry of batch) {
      await persistAlertAuditEvent({
        serverId: entry.transition.server.id,
        incidentId: entry.transition.incidentId,
        policyId: entry.policy.id,
        channelId: entry.channelId,
        eventType: entry.transition.eventType,
        statusFrom: entry.transition.previousStatus,
        statusTo: entry.transition.nextStatus,
        reasonCode: entry.transition.reasonCode,
        reasonSource: entry.transition.reasonSource,
        suppressedReason: dispatchResult.suppressedReason,
        payloadSummary: {
          server_name: entry.transition.server.name,
          event_type: entry.transition.eventType,
          status_from: entry.transition.previousStatus,
          status_to: entry.transition.nextStatus,
          reason_code: entry.transition.reasonCode,
          reason_source: entry.transition.reasonSource,
          policy_id: entry.policy.id,
          policy_notify_on: entry.policy.notifyOn,
          channel_id: entry.channelId,
          channel_type: first.channel.type,
          channel_name: first.channel.name,
          batch_size: batch.length
        },
        attemptCount: dispatchResult.attemptCount,
        lastErrorCode: dispatchResult.lastErrorCode,
        lastErrorDetail: dispatchResult.lastErrorDetail,
        wasSent: dispatchResult.wasSent,
        sentAt: dispatchResult.sentAt,
        createdAt
      });
    }
  }
};

const getCheckProfile = async (profileId: string): Promise<RuntimeCheckProfileRow | null> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT id, name, rules
      FROM check_profiles
      WHERE id = ?
      LIMIT 1
    `,
    [profileId]
  );

  const first = (rows as RuntimeCheckProfileRow[])[0];
  return first ?? null;
};

const getServerEndpoints = async (serverId: string): Promise<RuntimeEndpoint[]> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT id, label, host, port, protocol, purpose, is_primary
      FROM endpoints
      WHERE server_id = ?
        AND is_enabled = 1
      ORDER BY is_primary DESC, id ASC
    `,
    [serverId]
  );

  return (rows as RuntimeEndpointRow[]).map((row) => ({
    id: row.id,
    label: row.label,
    host: row.host,
    port: row.port,
    protocol: row.protocol,
    purpose: row.purpose,
    isPrimary: row.is_primary === 1
  }));
};

const persistServerRuntimeState = async (
  server: RuntimeServerRow,
  nextStatus: PersistStatus,
  reasonCode: string,
  reasonSource: PersistReasonSource
): Promise<void> => {
  const pool = getPool();
  const now = new Date();

  await pool.query(
    `
      UPDATE servers
      SET
        last_check_at = ?,
        normalized_status = ?,
        last_reason_code = ?,
        last_reason_source = ?,
        last_status_change_at = CASE
          WHEN ? <> ? THEN ?
          ELSE last_status_change_at
        END,
        updated_at = ?
      WHERE id = ?
    `,
    [
      now,
      nextStatus,
      reasonCode,
      reasonSource,
      server.normalized_status,
      nextStatus,
      now,
      now,
      server.id
    ]
  );

  server.normalized_status = nextStatus;
};

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
};

const getBucketStart = (date: Date): Date => {
  const bucket = new Date(date);
  bucket.setSeconds(0, 0);
  return bucket;
};

const persistCheckBucketAggregation = async (server: RuntimeServerRow, input: AggregationInput): Promise<void> => {
  const pool = getPool();
  const now = new Date();
  const bucketStart = getBucketStart(now);

  const rttSample = asFiniteNumber(input.details?.rtt_ms);
  const playersSample = asFiniteNumber(input.details?.players);
  const maxPlayersSample = asFiniteNumber(input.details?.max_players);
  const versionSample = typeof input.details?.version === 'string' ? input.details.version : null;
  const serverNameSample = typeof input.details?.server_name === 'string' ? input.details.server_name : server.name;

  const metaLast = JSON.stringify({
    status: input.status,
    reason_code: input.reasonCode,
    reason_source: input.reasonSource,
    endpoint_id: input.endpointId ?? null,
    endpoint_target: input.endpointTarget ?? null,
    adapter_key: input.adapterKey ?? null,
    profile_id: input.profileId ?? null,
    profile_name: input.profileName ?? null
  });

  const okChecks = input.status === 'ONLINE' ? 1 : 0;
  const failChecks = okChecks === 1 ? 0 : 1;

  await pool.query(
    `
      INSERT INTO server_checks_1m (
        id,
        server_id,
        bucket_start,
        total_checks,
        ok_checks,
        fail_checks,
        uptime_ratio,
        rtt_avg_ms,
        rtt_max_ms,
        players_avg,
        players_max,
        max_players_last,
        version_last,
        server_name_last,
        meta_last,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_checks = total_checks + VALUES(total_checks),
        ok_checks = ok_checks + VALUES(ok_checks),
        fail_checks = fail_checks + VALUES(fail_checks),
        uptime_ratio = ROUND((ok_checks + VALUES(ok_checks)) / NULLIF(total_checks + VALUES(total_checks), 0), 4),
        rtt_avg_ms = CASE
          WHEN VALUES(rtt_avg_ms) IS NULL THEN rtt_avg_ms
          WHEN rtt_avg_ms IS NULL THEN VALUES(rtt_avg_ms)
          ELSE ROUND(((rtt_avg_ms * total_checks) + VALUES(rtt_avg_ms)) / (total_checks + VALUES(total_checks)), 0)
        END,
        rtt_max_ms = CASE
          WHEN VALUES(rtt_max_ms) IS NULL THEN rtt_max_ms
          WHEN rtt_max_ms IS NULL THEN VALUES(rtt_max_ms)
          ELSE GREATEST(rtt_max_ms, VALUES(rtt_max_ms))
        END,
        players_avg = CASE
          WHEN VALUES(players_avg) IS NULL THEN players_avg
          WHEN players_avg IS NULL THEN VALUES(players_avg)
          ELSE ROUND(((players_avg * total_checks) + VALUES(players_avg)) / (total_checks + VALUES(total_checks)), 2)
        END,
        players_max = CASE
          WHEN VALUES(players_max) IS NULL THEN players_max
          WHEN players_max IS NULL THEN VALUES(players_max)
          ELSE GREATEST(players_max, VALUES(players_max))
        END,
        max_players_last = COALESCE(VALUES(max_players_last), max_players_last),
        version_last = COALESCE(VALUES(version_last), version_last),
        server_name_last = COALESCE(VALUES(server_name_last), server_name_last),
        meta_last = COALESCE(VALUES(meta_last), meta_last)
    `,
    [
      randomUUID(),
      server.id,
      bucketStart,
      1,
      okChecks,
      failChecks,
      okChecks === 1 ? 1 : 0,
      rttSample,
      rttSample,
      playersSample,
      playersSample,
      maxPlayersSample,
      versionSample,
      serverNameSample,
      metaLast,
      now
    ]
  );
};

const tableExists = async (tableName: string): Promise<boolean> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?
    `,
    [tableName]
  );

  const total = Number((rows as TableExistsRow[])[0]?.total ?? 0);
  return total > 0;
};

const cleanupRetentionData = async (): Promise<{ bucketDeleted: number; debugDeleted: number }> => {
  const pool = getPool();
  const now = new Date();

  const [bucketResult] = await pool.query(
    `
      DELETE FROM server_checks_1m
      WHERE bucket_start < DATE_SUB(?, INTERVAL ? DAY)
    `,
    [now, BUCKET_RETENTION_DAYS]
  );

  let debugDeleted = 0;

  if (await tableExists('server_check_samples')) {
    const [debugResult] = await pool.query(
      `
        DELETE FROM server_check_samples
        WHERE checked_at < DATE_SUB(?, INTERVAL ? HOUR)
      `,
      [now, DEBUG_SAMPLE_RETENTION_HOURS]
    );

    debugDeleted = Number((debugResult as { affectedRows?: number }).affectedRows ?? 0);
  }

  return {
    bucketDeleted: Number((bucketResult as { affectedRows?: number }).affectedRows ?? 0),
    debugDeleted
  };
};

const getOpenIncident = async (serverId: string): Promise<OpenIncidentRow | null> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT id, started_at
      FROM incidents
      WHERE server_id = ?
        AND ended_at IS NULL
      LIMIT 1
    `,
    [serverId]
  );

  const first = (rows as OpenIncidentRow[])[0];
  return first ?? null;
};

const createIncident = async (
  serverId: string,
  status: PersistStatus,
  reasonCode: string,
  reasonSource: PersistReasonSource
): Promise<string> => {
  const pool = getPool();
  const now = new Date();
  const incidentId = randomUUID();

  await pool.query(
    `
      INSERT INTO incidents (
        id,
        server_id,
        started_at,
        ended_at,
        duration_seconds,
        start_status,
        end_status,
        reason_code,
        reason_source,
        reason_meta,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, NULL, NULL, ?, NULL, ?, ?, NULL, ?, ?)
    `,
    [incidentId, serverId, now, status, reasonCode, reasonSource, now, now]
  );

  return incidentId;
};

const closeIncident = async (
  incident: OpenIncidentRow,
  endStatus: PersistStatus
): Promise<void> => {
  const pool = getPool();
  const now = new Date();
  const durationSeconds = Math.max(0, Math.floor((now.getTime() - incident.started_at.getTime()) / 1000));

  await pool.query(
    `
      UPDATE incidents
      SET
        ended_at = ?,
        duration_seconds = ?,
        end_status = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [now, durationSeconds, endStatus, now, incident.id]
  );
};

const syncIncidentLifecycle = async (
  server: RuntimeServerRow,
  previousStatus: PersistStatus,
  nextStatus: PersistStatus,
  reasonCode: string,
  reasonSource: PersistReasonSource
): Promise<string | null> => {
  const statusChanged = previousStatus !== nextStatus;
  if (!statusChanged) {
    return null;
  }

  const openIncident = await getOpenIncident(server.id);

  if (nextStatus === 'OFFLINE') {
    if (openIncident) {
      return openIncident.id;
    }

    return createIncident(server.id, nextStatus, reasonCode, reasonSource);
  }

  if (openIncident) {
    await closeIncident(openIncident, nextStatus);
    return openIncident.id;
  }

  return null;
};

const persistServerOutcome = async (
  server: RuntimeServerRow,
  nextStatus: PersistStatus,
  reasonCode: string,
  reasonSource: PersistReasonSource,
  aggregation?: Omit<AggregationInput, 'status' | 'reasonCode' | 'reasonSource'>
): Promise<PendingAlertTransition | null> => {
  const previousStatus = server.normalized_status;
  const eventType = resolveStateChangeAlertEventType(previousStatus, nextStatus);
  const suppressForPlannedPowerAction = shouldSuppressForPlannedPowerAction(server);

  await persistServerRuntimeState(server, nextStatus, reasonCode, reasonSource);
  const incidentId = await syncIncidentLifecycle(server, previousStatus, server.normalized_status, reasonCode, reasonSource);

  await persistCheckBucketAggregation(server, {
    status: nextStatus,
    reasonCode,
    reasonSource,
    details: aggregation?.details,
    endpointId: aggregation?.endpointId,
    endpointTarget: aggregation?.endpointTarget,
    adapterKey: aggregation?.adapterKey,
    profileId: aggregation?.profileId,
    profileName: aggregation?.profileName
  });

  if (!eventType) {
    return null;
  }

  return {
    server,
    incidentId,
    eventType,
    previousStatus,
    nextStatus: server.normalized_status,
    reasonCode,
    reasonSource,
    suppressForPlannedPowerAction
  };
};

export class CheckRunner {
  private readonly logger: Logger;
  private lastRetentionRunAt = 0;
  private pendingAlertTransitions: PendingAlertTransition[] = [];

  public constructor(
    private readonly workerLogger: Logger,
    private readonly jobId: string
  ) {
    this.logger = createLogger('worker.check-runner');
  }

  public async runOnce(options?: { concurrency?: number }): Promise<void> {
    const runId = randomUUID();
    this.pendingAlertTransitions = [];
    const [servers, panelRestartGraceMsByLabel] = await Promise.all([
      getRunnableServers(),
      getPanelRestartGraceMsByGameLabel()
    ]);
    const requestedConcurrency = options?.concurrency ?? 1;
    const concurrency = Math.max(1, Math.min(requestedConcurrency, servers.length || 1));

    this.logger.info('check run started', { job_id: this.jobId }, { run_id: runId, server_count: servers.length, concurrency });

    if (servers.length > 0) {
      const queue = [...servers];
      const workers = Array.from({ length: concurrency }, async () => {
        while (true) {
          const server = queue.shift();
          if (!server) {
            return;
          }

          await this.runServerCheck(runId, server, panelRestartGraceMsByLabel);
        }
      });

      await Promise.all(workers);
    }

    await emitAlertAuditEventsForTransitions(this.pendingAlertTransitions);

    await this.runRetentionIfDue(runId);

    this.logger.info('check run finished', { job_id: this.jobId }, { run_id: runId, server_count: servers.length, concurrency });
  }

  private async runRetentionIfDue(runId: string): Promise<void> {
    const nowMs = Date.now();
    if (nowMs - this.lastRetentionRunAt < RETENTION_RUN_INTERVAL_MS) {
      return;
    }

    this.lastRetentionRunAt = nowMs;

    try {
      const result = await cleanupRetentionData();
      this.workerLogger.info(
        'retention cleanup executed',
        { job_id: this.jobId },
        {
          run_id: runId,
          bucket_retention_days: BUCKET_RETENTION_DAYS,
          debug_retention_hours: DEBUG_SAMPLE_RETENTION_HOURS,
          bucket_deleted: result.bucketDeleted,
          debug_deleted: result.debugDeleted
        }
      );
    } catch (error) {
      this.workerLogger.warn(
        'retention cleanup failed',
        { job_id: this.jobId },
        { run_id: runId, error: String(error) }
      );
    }
  }

  private async runServerCheck(
    runId: string,
    server: RuntimeServerRow,
    panelRestartGraceMsByLabel: Map<string, number>
  ): Promise<void> {
    const profile = await getCheckProfile(server.check_profile_id);
    if (!profile) {
      this.workerLogger.warn('check profile missing for server', { job_id: this.jobId, server_id: server.id }, { run_id: runId });
      const transition = await persistServerOutcome(server, 'TRANSITION', 'STATUS_PROFILE_MISSING', 'SYSTEM');
      if (transition) {
        this.pendingAlertTransitions.push(transition);
      }
      return;
    }

    const rules = parseRules(profile.rules);
    if (!rules) {
      this.workerLogger.warn(
        'check profile rules invalid',
        { job_id: this.jobId, server_id: server.id },
        { run_id: runId, profile_id: profile.id, profile_name: profile.name }
      );
      const transition = await persistServerOutcome(server, 'TRANSITION', 'STATUS_ADAPTER_CONFIG_INVALID', 'SYSTEM', {
        profileId: profile.id,
        profileName: profile.name
      });
      if (transition) {
        this.pendingAlertTransitions.push(transition);
      }
      return;
    }

    const enabledChecks = rules.checks.filter((check) => check.enabled !== false);
    const primaryCheck = enabledChecks[0];
    if (!primaryCheck) {
      this.workerLogger.warn(
        'check profile has no enabled checks',
        { job_id: this.jobId, server_id: server.id },
        { run_id: runId, profile_id: profile.id, profile_name: profile.name }
      );
      const transition = await persistServerOutcome(server, 'TRANSITION', 'STATUS_PROFILE_NO_ENABLED_CHECK', 'SYSTEM', {
        profileId: profile.id,
        profileName: profile.name
      });
      if (transition) {
        this.pendingAlertTransitions.push(transition);
      }
      return;
    }

    const endpoints = await getServerEndpoints(server.id);
    const endpointCandidates = selectEndpointCandidates(endpoints, primaryCheck.endpoint_selector);
    if (endpointCandidates.length === 0) {
      this.workerLogger.warn(
        'no endpoint matches check selector',
        { job_id: this.jobId, server_id: server.id },
        {
          run_id: runId,
          profile_id: profile.id,
          adapter_key: primaryCheck.adapter_key,
          selector: primaryCheck.endpoint_selector,
          reason_code: 'ADAPTER_MISSING_ENDPOINT'
        }
      );
      const transition = await persistServerOutcome(server, 'OFFLINE', 'ADAPTER_MISSING_ENDPOINT', 'ADAPTER', {
        adapterKey: primaryCheck.adapter_key,
        profileId: profile.id,
        profileName: profile.name
      });
      if (transition) {
        this.pendingAlertTransitions.push(transition);
      }
      return;
    }

    const adapter = adapterRegistry.get(primaryCheck.adapter_key);
    if (!adapter) {
      this.workerLogger.warn(
        'adapter not registered',
        { job_id: this.jobId, server_id: server.id },
        { run_id: runId, adapter_key: primaryCheck.adapter_key }
      );
      const transition = await persistServerOutcome(server, 'TRANSITION', 'STATUS_ADAPTER_NOT_REGISTERED', 'SYSTEM', {
        adapterKey: primaryCheck.adapter_key,
        profileId: profile.id,
        profileName: profile.name
      });
      if (transition) {
        this.pendingAlertTransitions.push(transition);
      }
      return;
    }

    let endpoint = endpointCandidates[0] as RuntimeEndpoint;
    let firstResult: AdapterRunResult = {
      ok: false,
      reasonCode: 'ADAPTER_TIMEOUT',
      reasonSource: 'ADAPTER'
    };
    let finalResult = firstResult;
    let recheckResult: AdapterRunResult | null = null;
    let confirmFailApplied = false;
    let confirmedFail = false;

    for (const candidate of endpointCandidates) {
      endpoint = candidate;
      firstResult = await adapter({ endpoint, timeoutMs: primaryCheck.timeout_ms });
      finalResult = firstResult;
      recheckResult = null;
      confirmFailApplied = false;
      confirmedFail = false;

      if (!firstResult.ok && rules.confirmFail.enabled) {
        confirmFailApplied = true;

        if (!rules.confirmFail.applyToPrimaryOnly) {
          this.workerLogger.warn(
            'confirm-fail apply_to_primary_only=false in v1 profile',
            { job_id: this.jobId, server_id: server.id },
            { run_id: runId, profile_id: profile.id }
          );
        }

        await sleep(rules.confirmFail.delayMs);
        const recheckTimeout = rules.confirmFail.recheckTimeoutMs ?? primaryCheck.timeout_ms;
        recheckResult = await adapter({ endpoint, timeoutMs: recheckTimeout });
        finalResult = recheckResult;
        confirmedFail = !recheckResult.ok;
      }

      if (finalResult.ok) {
        break;
      }
    }

    if (!finalResult.ok && primaryCheck.adapter_key === 'a2s_query') {
      const tcpFallbackAdapter = adapterRegistry.get('tcp_connect');
      if (tcpFallbackAdapter) {
        const tcpFallbackCandidates = selectEndpointCandidates(endpoints, {
          purpose: 'GAME',
          protocol: 'TCP'
        });

        for (const fallbackEndpoint of tcpFallbackCandidates) {
          const fallbackResult = await tcpFallbackAdapter({
            endpoint: fallbackEndpoint,
            timeoutMs: primaryCheck.timeout_ms
          });

          if (fallbackResult.ok) {
            endpoint = fallbackEndpoint;
            finalResult = {
              ok: true,
              reasonCode: 'ADAPTER_OK_TCP_FALLBACK',
              reasonSource: 'ADAPTER',
              details: {
                fallback_from: 'a2s_query',
                fallback_to: 'tcp_connect'
              }
            };
            break;
          }
        }
      }
    }

    const restartGraceMs = resolvePanelRestartGraceMs(server, panelRestartGraceMsByLabel);
    const failureStatus = finalResult.ok ? 'ONLINE' : resolvePanelAwareFailureStatus(server, restartGraceMs);
    const failureReasonCode = !finalResult.ok && failureStatus === 'TRANSITION' ? 'STATUS_PANEL_RESTART_GRACE' : finalResult.reasonCode;
    const failureReasonSource = !finalResult.ok && failureStatus === 'TRANSITION' ? 'SYSTEM' : finalResult.reasonSource;

    const transition = await persistServerOutcome(
      server,
      failureStatus,
      failureReasonCode,
      failureReasonSource,
      {
        details: finalResult.details,
        endpointId: endpoint.id,
        endpointTarget: `${endpoint.host}:${endpoint.port}`,
        adapterKey: primaryCheck.adapter_key,
        profileId: profile.id,
        profileName: profile.name
      }
    );
    if (transition) {
      this.pendingAlertTransitions.push(transition);
    }

    this.workerLogger.info(
      'primary check executed',
      { job_id: this.jobId, server_id: server.id },
      {
        run_id: runId,
        profile_id: profile.id,
        profile_name: profile.name,
        adapter_key: primaryCheck.adapter_key,
        endpoint_id: endpoint.id,
        endpoint_target: `${endpoint.host}:${endpoint.port}`,
        endpoint_candidates: endpointCandidates.map((entry) => `${entry.host}:${entry.port}/${entry.protocol}/${entry.purpose}`),
        ok: finalResult.ok,
        reason_code: finalResult.reasonCode,
        reason_source: finalResult.reasonSource,
        details: finalResult.details,
        confirm_fail_applied: confirmFailApplied,
        confirm_fail_confirmed: confirmFailApplied ? confirmedFail : null,
        first_check: {
          ok: firstResult.ok,
          reason_code: firstResult.reasonCode
        },
        recheck: recheckResult
          ? {
              ok: recheckResult.ok,
              reason_code: recheckResult.reasonCode
            }
          : null
      }
    );
  }
}