import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { getPool } from './client.js';

type PanelRow = RowDataPacket & {
  id: string;
  name: string;
  base_url: string;
  is_enabled: number;
  import_mode: 'ALL' | 'WHITELIST';
  import_filter: string | null;
  last_sync_at: Date | null;
  sync_status: 'OK' | 'DEGRADED' | 'ERROR';
  sync_error_code: string | null;
  sync_error_detail: string | null;
  created_at: Date;
  updated_at: Date;
};

type NodeRow = RowDataPacket & {
  id: string;
  panel_id: string;
  ptero_node_id: string;
  name: string;
  fqdn_or_ip: string | null;
  location: string | null;
  is_enabled: number;
  last_seen_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type EndpointRow = RowDataPacket & {
  id: string;
  server_id: string;
  source: 'PTERO_ALLOCATION' | 'MANUAL';
  label: string;
  host: string;
  port: number;
  protocol: 'TCP' | 'UDP' | 'HTTP' | 'HTTPS';
  purpose: 'GAME' | 'QUERY' | 'HTTP' | 'RCON' | 'OTHER';
  is_primary: number;
  is_enabled: number;
  meta: string | null;
  created_at: Date;
  updated_at: Date;
};

type HistoryRow = RowDataPacket & {
  id: string;
  server_id: string;
  bucket_start: Date;
  total_checks: number;
  ok_checks: number;
  fail_checks: number;
  uptime_ratio: string | number;
  rtt_avg_ms: number | null;
  rtt_max_ms: number | null;
  players_avg: string | number | null;
  players_max: number | null;
  max_players_last: number | null;
  version_last: string | null;
  server_name_last: string | null;
  meta_last: string | null;
  created_at: Date;
};

type IncidentRow = RowDataPacket & {
  id: string;
  server_id: string;
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number | null;
  start_status: 'ONLINE' | 'OFFLINE' | 'TRANSITION' | 'MAINTENANCE';
  end_status: 'ONLINE' | 'OFFLINE' | 'TRANSITION' | 'MAINTENANCE' | null;
  reason_code: string;
  reason_source: 'PTERO' | 'QUERY' | 'ADAPTER' | 'SYSTEM' | null;
  reason_meta: string | null;
  created_at: Date;
  updated_at: Date;
};

type AdapterRow = RowDataPacket & {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: 'PORT' | 'HTTP' | 'GAMEQUERY' | 'CUSTOM';
  capabilities: string;
  endpoint_requirements: string;
  config_schema: string | null;
  is_enabled: number;
  created_at: Date;
  updated_at: Date;
};

type CheckProfileRow = RowDataPacket & {
  id: string;
  name: string;
  description: string | null;
  rules: string;
  created_at: Date;
  updated_at: Date;
};

type AlertChannelRow = RowDataPacket & {
  id: string;
  type: 'DISCORD_WEBHOOK' | 'EMAIL_SMTP';
  name: string;
  config_kid: string;
  is_enabled: number;
  created_at: Date;
  updated_at: Date;
};

type AlertPolicyRow = RowDataPacket & {
  id: string;
  name: string;
  cooldown_seconds: number;
  notify_on: string;
  roles_to_notify: string | null;
  channel_ids: string;
  is_enabled: number;
  created_at: Date;
  updated_at: Date;
};

type AlertEventRow = RowDataPacket & {
  id: string;
  idempotency_key: string;
  server_id: string;
  incident_id: string | null;
  policy_id: string;
  channel_id: string;
  event_type: 'STATE_CHANGE_OFFLINE' | 'STATE_CHANGE_ONLINE';
  status_from: 'ONLINE' | 'OFFLINE' | 'TRANSITION' | 'MAINTENANCE' | null;
  status_to: 'ONLINE' | 'OFFLINE' | 'TRANSITION' | 'MAINTENANCE' | null;
  reason_code: string | null;
  reason_source: 'PTERO' | 'QUERY' | 'ADAPTER' | 'SYSTEM' | null;
  suppressed_reason: string | null;
  payload_summary: string;
  attempt_count: number;
  last_error_code: string | null;
  last_error_detail: string | null;
  was_sent: number;
  sent_at: Date | null;
  created_at: Date;
};

type UserRow = RowDataPacket & {
  id: string;
  username: string;
  email: string;
  is_enabled: number;
  last_login_at: Date | null;
  updated_at: Date;
};

type UserRoleRow = RowDataPacket & {
  user_id: string;
  role_key: string;
};

type RoleRow = RowDataPacket & {
  id: string;
  key: string;
  name: string;
};

type GameLabelRow = RowDataPacket & {
  id: string;
  name: string;
  is_enabled: number;
  settings: string | null;
  created_at: Date;
  updated_at: Date;
};

type AppSettingRow = RowDataPacket & {
  id: string;
  scope: string;
  setting_key: string;
  setting_value_json: string;
  created_at: Date;
  updated_at: Date;
};

type ServerPresetRow = RowDataPacket & {
  id: string;
  key: string;
  name: string;
  hoster: 'GENERIC' | 'GPORTAL' | 'NITRADO' | 'SHOCKBYTE' | 'APEX' | 'BISECT' | 'HOSTHAVOC' | 'SURVIVAL_SERVERS';
  protocol: 'TCP' | 'UDP';
  query_port_mode: 'SAME_AS_GAME' | 'MANUAL_OPTIONAL' | 'DISABLED';
  prefer_a2s: number;
  is_system: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

const parseJsonValue = (value: string | null): unknown => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const parseJsonObject = (value: string | null): Record<string, unknown> | null => {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
};

const parseJsonArray = (value: string | null): string[] => {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is string => typeof item === 'string');
};

const toIso = (value: Date | null): string | null => value?.toISOString() ?? null;

export type ListPanelsFilters = {
  is_enabled?: boolean;
};

export type CreatePanelInput = {
  name: string;
  base_url: string;
  api_key: string;
  is_enabled?: boolean;
  import_mode?: 'ALL' | 'WHITELIST';
  import_filter?: Record<string, unknown> | null;
};

export type UpdatePanelInput = Partial<CreatePanelInput>;

export type ListNodesFilters = {
  panel_id?: string;
  is_enabled?: boolean;
};

export type CreateNodeInput = {
  panel_id: string;
  ptero_node_id: string;
  name: string;
  fqdn_or_ip?: string | null;
  location?: string | null;
  is_enabled?: boolean;
};

export type UpdateNodeInput = Partial<CreateNodeInput>;

export type CreateEndpointInput = {
  label: string;
  host: string;
  port: number;
  protocol: 'TCP' | 'UDP' | 'HTTP' | 'HTTPS';
  purpose: 'GAME' | 'QUERY' | 'HTTP' | 'RCON' | 'OTHER';
  is_primary?: boolean;
  is_enabled?: boolean;
  meta?: Record<string, unknown> | null;
};

export type UpdateEndpointInput = Partial<CreateEndpointInput>;

export type TimeRange = {
  from?: Date;
  to?: Date;
};

export type CreateCheckProfileInput = {
  name: string;
  description?: string | null;
  rules: Record<string, unknown>;
};

export type UpdateCheckProfileInput = Partial<CreateCheckProfileInput>;

export type CreateAlertChannelInput = {
  type: 'DISCORD_WEBHOOK' | 'EMAIL_SMTP';
  name: string;
  config_enc: string;
  config_kid?: string;
  is_enabled?: boolean;
};

export type UpdateAlertChannelInput = Partial<CreateAlertChannelInput>;

export type CreateAlertPolicyInput = {
  name: string;
  cooldown_seconds?: number;
  notify_on?: Record<string, unknown>;
  roles_to_notify?: string[];
  channel_ids: string[];
  is_enabled?: boolean;
};

export type UpdateAlertPolicyInput = Partial<CreateAlertPolicyInput>;

export type ListAlertEventsFilters = {
  server_id?: string;
  policy_id?: string;
  channel_id?: string;
  event_type?: 'STATE_CHANGE_OFFLINE' | 'STATE_CHANGE_ONLINE';
  suppressed_reason?: string;
  from?: Date;
  to?: Date;
  limit?: number;
};

export type CreateUserInput = {
  username: string;
  email: string;
  password_hash: string;
  is_enabled?: boolean;
  role_keys?: string[];
};

export type UpdateUserInput = {
  username?: string;
  email?: string;
  is_enabled?: boolean;
};

export type CreateGameLabelInput = {
  name: string;
  is_enabled?: boolean;
  settings?: Record<string, unknown> | null;
};

export type UpdateGameLabelInput = Partial<CreateGameLabelInput>;

export type CreateServerPresetInput = {
  key: string;
  name: string;
  hoster: 'GENERIC' | 'GPORTAL' | 'NITRADO' | 'SHOCKBYTE' | 'APEX' | 'BISECT' | 'HOSTHAVOC' | 'SURVIVAL_SERVERS';
  protocol: 'TCP' | 'UDP';
  query_port_mode: 'SAME_AS_GAME' | 'MANUAL_OPTIONAL' | 'DISABLED';
  prefer_a2s?: boolean;
  notes?: string | null;
};

export type UpdateServerPresetInput = Partial<CreateServerPresetInput>;

const mapPanel = (row: PanelRow) => ({
  id: row.id,
  name: row.name,
  base_url: row.base_url,
  is_enabled: row.is_enabled === 1,
  import_mode: row.import_mode,
  import_filter: parseJsonObject(row.import_filter),
  last_sync_at: toIso(row.last_sync_at),
  sync_status: row.sync_status,
  sync_error_code: row.sync_error_code,
  sync_error_detail: row.sync_error_detail,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString()
});

const mapNode = (row: NodeRow) => ({
  id: row.id,
  panel_id: row.panel_id,
  ptero_node_id: row.ptero_node_id,
  name: row.name,
  fqdn_or_ip: row.fqdn_or_ip,
  location: row.location,
  is_enabled: row.is_enabled === 1,
  last_seen_at: toIso(row.last_seen_at),
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString()
});

const mapEndpoint = (row: EndpointRow) => ({
  id: row.id,
  server_id: row.server_id,
  source: row.source,
  label: row.label,
  host: row.host,
  port: row.port,
  protocol: row.protocol,
  purpose: row.purpose,
  is_primary: row.is_primary === 1,
  is_enabled: row.is_enabled === 1,
  meta: parseJsonObject(row.meta),
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString()
});

export const listPanels = async (filters?: ListPanelsFilters): Promise<ReturnType<typeof mapPanel>[]> => {
  const pool = getPool();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (typeof filters?.is_enabled === 'boolean') {
    clauses.push('is_enabled = ?');
    params.push(filters.is_enabled ? 1 : 0);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await pool.query<PanelRow[]>(
    `
      SELECT id, name, base_url, is_enabled, import_mode, import_filter, last_sync_at, sync_status, sync_error_code, sync_error_detail, created_at, updated_at
      FROM panels
      ${whereSql}
      ORDER BY name ASC, id ASC
    `,
    params
  );

  return rows.map(mapPanel);
};

export const findPanelById = async (panelId: string): Promise<ReturnType<typeof mapPanel> | null> => {
  const pool = getPool();
  const [rows] = await pool.query<PanelRow[]>(
    `
      SELECT id, name, base_url, is_enabled, import_mode, import_filter, last_sync_at, sync_status, sync_error_code, sync_error_detail, created_at, updated_at
      FROM panels
      WHERE id = ?
      LIMIT 1
    `,
    [panelId]
  );

  const row = rows[0];
  return row ? mapPanel(row) : null;
};

export const createPanel = async (input: CreatePanelInput): Promise<ReturnType<typeof mapPanel>> => {
  const pool = getPool();
  const now = new Date();
  const panelId = randomUUID();

  await pool.query(
    `
      INSERT INTO panels (
        id, name, base_url, api_key_enc, api_key_kid, is_enabled, import_mode, import_filter,
        last_sync_at, sync_status, sync_error_code, sync_error_detail, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'OK', NULL, NULL, ?, ?)
    `,
    [
      panelId,
      input.name,
      input.base_url,
      input.api_key,
      'plain-v1',
      input.is_enabled === false ? 0 : 1,
      input.import_mode ?? 'ALL',
      input.import_filter ? JSON.stringify(input.import_filter) : null,
      now,
      now
    ]
  );

  const created = await findPanelById(panelId);
  if (!created) {
    throw new Error('panel create failed');
  }

  return created;
};

export const updatePanel = async (panelId: string, input: UpdatePanelInput): Promise<ReturnType<typeof mapPanel> | null> => {
  const pool = getPool();
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (typeof input.name === 'string') {
    assignments.push('name = ?');
    params.push(input.name);
  }

  if (typeof input.base_url === 'string') {
    assignments.push('base_url = ?');
    params.push(input.base_url);
  }

  if (typeof input.api_key === 'string' && input.api_key.length > 0) {
    assignments.push('api_key_enc = ?');
    params.push(input.api_key);
  }

  if (typeof input.is_enabled === 'boolean') {
    assignments.push('is_enabled = ?');
    params.push(input.is_enabled ? 1 : 0);
  }

  if (typeof input.import_mode === 'string') {
    assignments.push('import_mode = ?');
    params.push(input.import_mode);
  }

  if (input.import_filter !== undefined) {
    assignments.push('import_filter = ?');
    params.push(input.import_filter ? JSON.stringify(input.import_filter) : null);
  }

  if (assignments.length === 0) {
    return findPanelById(panelId);
  }

  assignments.push('updated_at = ?');
  params.push(new Date());
  params.push(panelId);

  await pool.query(
    `
      UPDATE panels
      SET ${assignments.join(', ')}
      WHERE id = ?
    `,
    params
  );

  return findPanelById(panelId);
};

export const deletePanel = async (panelId: string): Promise<boolean> => {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query('DELETE FROM servers WHERE panel_id = ?', [panelId]);
    const [result] = await connection.query('DELETE FROM panels WHERE id = ?', [panelId]);

    await connection.commit();
    return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const markPanelSyncQueued = async (panelId: string): Promise<boolean> => {
  const pool = getPool();
  const [result] = await pool.query(
    `
      UPDATE panels
      SET updated_at = ?
      WHERE id = ?
    `,
    [new Date(), panelId]
  );

  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
};

export const listNodes = async (filters?: ListNodesFilters): Promise<ReturnType<typeof mapNode>[]> => {
  const pool = getPool();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (typeof filters?.panel_id === 'string') {
    clauses.push('panel_id = ?');
    params.push(filters.panel_id);
  }

  if (typeof filters?.is_enabled === 'boolean') {
    clauses.push('is_enabled = ?');
    params.push(filters.is_enabled ? 1 : 0);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await pool.query<NodeRow[]>(
    `
      SELECT id, panel_id, ptero_node_id, name, fqdn_or_ip, location, is_enabled, last_seen_at, created_at, updated_at
      FROM nodes
      ${whereSql}
      ORDER BY name ASC, id ASC
    `,
    params
  );

  return rows.map(mapNode);
};

export const findNodeById = async (nodeId: string): Promise<ReturnType<typeof mapNode> | null> => {
  const pool = getPool();
  const [rows] = await pool.query<NodeRow[]>(
    `
      SELECT id, panel_id, ptero_node_id, name, fqdn_or_ip, location, is_enabled, last_seen_at, created_at, updated_at
      FROM nodes
      WHERE id = ?
      LIMIT 1
    `,
    [nodeId]
  );

  const row = rows[0];
  return row ? mapNode(row) : null;
};

export const createNode = async (input: CreateNodeInput): Promise<ReturnType<typeof mapNode>> => {
  const pool = getPool();
  const now = new Date();
  const nodeId = randomUUID();

  await pool.query(
    `
      INSERT INTO nodes (
        id,
        panel_id,
        ptero_node_id,
        name,
        fqdn_or_ip,
        location,
        is_enabled,
        last_seen_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `,
    [
      nodeId,
      input.panel_id,
      input.ptero_node_id,
      input.name,
      input.fqdn_or_ip ?? null,
      input.location ?? null,
      input.is_enabled === false ? 0 : 1,
      now,
      now
    ]
  );

  const created = await findNodeById(nodeId);
  if (!created) {
    throw new Error('node create failed');
  }

  return created;
};

export const updateNode = async (
  nodeId: string,
  input: UpdateNodeInput
): Promise<ReturnType<typeof mapNode> | null> => {
  const pool = getPool();
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (typeof input.panel_id === 'string') {
    assignments.push('panel_id = ?');
    params.push(input.panel_id);
  }

  if (typeof input.ptero_node_id === 'string') {
    assignments.push('ptero_node_id = ?');
    params.push(input.ptero_node_id);
  }

  if (typeof input.name === 'string') {
    assignments.push('name = ?');
    params.push(input.name);
  }

  if (input.fqdn_or_ip !== undefined) {
    assignments.push('fqdn_or_ip = ?');
    params.push(input.fqdn_or_ip ?? null);
  }

  if (input.location !== undefined) {
    assignments.push('location = ?');
    params.push(input.location ?? null);
  }

  if (typeof input.is_enabled === 'boolean') {
    assignments.push('is_enabled = ?');
    params.push(input.is_enabled ? 1 : 0);
  }

  if (assignments.length === 0) {
    return findNodeById(nodeId);
  }

  assignments.push('updated_at = ?');
  params.push(new Date());
  params.push(nodeId);

  await pool.query(
    `
      UPDATE nodes
      SET ${assignments.join(', ')}
      WHERE id = ?
    `,
    params
  );

  return findNodeById(nodeId);
};

export const deleteNode = async (nodeId: string): Promise<boolean> => {
  const pool = getPool();
  const [result] = await pool.query('DELETE FROM nodes WHERE id = ?', [nodeId]);
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
};

export const listServerEndpoints = async (serverId: string): Promise<ReturnType<typeof mapEndpoint>[]> => {
  const pool = getPool();
  const [rows] = await pool.query<EndpointRow[]>(
    `
      SELECT id, server_id, source, label, host, port, protocol, purpose, is_primary, is_enabled, meta, created_at, updated_at
      FROM endpoints
      WHERE server_id = ?
      ORDER BY is_primary DESC, label ASC, id ASC
    `,
    [serverId]
  );

  return rows.map(mapEndpoint);
};

export const createServerEndpoint = async (
  serverId: string,
  input: CreateEndpointInput
): Promise<ReturnType<typeof mapEndpoint>> => {
  const pool = getPool();
  const now = new Date();
  const endpointId = randomUUID();

  await pool.query(
    `
      INSERT INTO endpoints (
        id, server_id, source, label, host, port, protocol, purpose, is_primary, is_enabled, meta, created_at, updated_at
      ) VALUES (?, ?, 'MANUAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      endpointId,
      serverId,
      input.label,
      input.host,
      input.port,
      input.protocol,
      input.purpose,
      input.is_primary ? 1 : 0,
      input.is_enabled === false ? 0 : 1,
      input.meta ? JSON.stringify(input.meta) : null,
      now,
      now
    ]
  );

  const [rows] = await pool.query<EndpointRow[]>(
    `
      SELECT id, server_id, source, label, host, port, protocol, purpose, is_primary, is_enabled, meta, created_at, updated_at
      FROM endpoints
      WHERE id = ?
      LIMIT 1
    `,
    [endpointId]
  );

  return mapEndpoint(rows[0]);
};

export const updateEndpoint = async (
  endpointId: string,
  input: UpdateEndpointInput
): Promise<ReturnType<typeof mapEndpoint> | null> => {
  const pool = getPool();
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (typeof input.label === 'string') {
    assignments.push('label = ?');
    params.push(input.label);
  }
  if (typeof input.host === 'string') {
    assignments.push('host = ?');
    params.push(input.host);
  }
  if (typeof input.port === 'number') {
    assignments.push('port = ?');
    params.push(input.port);
  }
  if (typeof input.protocol === 'string') {
    assignments.push('protocol = ?');
    params.push(input.protocol);
  }
  if (typeof input.purpose === 'string') {
    assignments.push('purpose = ?');
    params.push(input.purpose);
  }
  if (typeof input.is_primary === 'boolean') {
    assignments.push('is_primary = ?');
    params.push(input.is_primary ? 1 : 0);
  }
  if (typeof input.is_enabled === 'boolean') {
    assignments.push('is_enabled = ?');
    params.push(input.is_enabled ? 1 : 0);
  }
  if (input.meta !== undefined) {
    assignments.push('meta = ?');
    params.push(input.meta ? JSON.stringify(input.meta) : null);
  }

  if (assignments.length === 0) {
    const [rows] = await pool.query<EndpointRow[]>(
      `
        SELECT id, server_id, source, label, host, port, protocol, purpose, is_primary, is_enabled, meta, created_at, updated_at
        FROM endpoints
        WHERE id = ?
        LIMIT 1
      `,
      [endpointId]
    );
    return rows[0] ? mapEndpoint(rows[0]) : null;
  }

  assignments.push('updated_at = ?');
  params.push(new Date());
  params.push(endpointId);

  await pool.query(
    `
      UPDATE endpoints
      SET ${assignments.join(', ')}
      WHERE id = ?
    `,
    params
  );

  const [rows] = await pool.query<EndpointRow[]>(
    `
      SELECT id, server_id, source, label, host, port, protocol, purpose, is_primary, is_enabled, meta, created_at, updated_at
      FROM endpoints
      WHERE id = ?
      LIMIT 1
    `,
    [endpointId]
  );

  return rows[0] ? mapEndpoint(rows[0]) : null;
};

export const deleteEndpoint = async (endpointId: string): Promise<boolean> => {
  const pool = getPool();
  const [result] = await pool.query('DELETE FROM endpoints WHERE id = ?', [endpointId]);
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
};

export const listServerHistory = async (serverId: string, range?: TimeRange): Promise<Record<string, unknown>[]> => {
  const pool = getPool();
  const clauses: string[] = ['server_id = ?'];
  const params: unknown[] = [serverId];

  if (range?.from) {
    clauses.push('bucket_start >= ?');
    params.push(range.from);
  }
  if (range?.to) {
    clauses.push('bucket_start <= ?');
    params.push(range.to);
  }

  const [rows] = await pool.query<HistoryRow[]>(
    `
      SELECT id, server_id, bucket_start, total_checks, ok_checks, fail_checks, uptime_ratio, rtt_avg_ms, rtt_max_ms, players_avg, players_max, max_players_last, version_last, server_name_last, meta_last, created_at
      FROM server_checks_1m
      WHERE ${clauses.join(' AND ')}
      ORDER BY bucket_start ASC
      LIMIT 2000
    `,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    server_id: row.server_id,
    bucket_start: row.bucket_start.toISOString(),
    total_checks: row.total_checks,
    ok_checks: row.ok_checks,
    fail_checks: row.fail_checks,
    uptime_ratio: Number(row.uptime_ratio),
    rtt_avg_ms: row.rtt_avg_ms,
    rtt_max_ms: row.rtt_max_ms,
    players_avg: row.players_avg === null ? null : Number(row.players_avg),
    players_max: row.players_max,
    max_players_last: row.max_players_last,
    version_last: row.version_last,
    server_name_last: row.server_name_last,
    meta_last: parseJsonObject(row.meta_last),
    created_at: row.created_at.toISOString()
  }));
};

const mapIncident = (row: IncidentRow) => ({
  id: row.id,
  server_id: row.server_id,
  started_at: row.started_at.toISOString(),
  ended_at: toIso(row.ended_at),
  duration_seconds: row.duration_seconds,
  start_status: row.start_status,
  end_status: row.end_status,
  reason_code: row.reason_code,
  reason_source: row.reason_source,
  reason_meta: parseJsonObject(row.reason_meta),
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString()
});

export const listServerIncidents = async (serverId: string, range?: TimeRange): Promise<ReturnType<typeof mapIncident>[]> => {
  const pool = getPool();
  const clauses: string[] = ['server_id = ?'];
  const params: unknown[] = [serverId];

  if (range?.from) {
    clauses.push('started_at >= ?');
    params.push(range.from);
  }

  if (range?.to) {
    clauses.push('started_at <= ?');
    params.push(range.to);
  }

  const [rows] = await pool.query<IncidentRow[]>(
    `
      SELECT id, server_id, started_at, ended_at, duration_seconds, start_status, end_status, reason_code, reason_source, reason_meta, created_at, updated_at
      FROM incidents
      WHERE ${clauses.join(' AND ')}
      ORDER BY started_at DESC, id DESC
      LIMIT 500
    `,
    params
  );

  return rows.map(mapIncident);
};

export const findIncidentById = async (incidentId: string): Promise<ReturnType<typeof mapIncident> | null> => {
  const pool = getPool();
  const [rows] = await pool.query<IncidentRow[]>(
    `
      SELECT id, server_id, started_at, ended_at, duration_seconds, start_status, end_status, reason_code, reason_source, reason_meta, created_at, updated_at
      FROM incidents
      WHERE id = ?
      LIMIT 1
    `,
    [incidentId]
  );

  const row = rows[0];
  return row ? mapIncident(row) : null;
};

export const listAdapters = async (): Promise<Record<string, unknown>[]> => {
  const pool = getPool();
  const [rows] = await pool.query<AdapterRow[]>(
    `
            SELECT id, 
              \`key\`,
             name,
             description,
             category,
             capabilities,
             endpoint_requirements,
             config_schema,
             is_enabled,
             created_at,
             updated_at
      FROM check_adapters
      ORDER BY name ASC, id ASC
    `
  );

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    category: row.category,
    capabilities: parseJsonObject(row.capabilities),
    endpoint_requirements: parseJsonObject(row.endpoint_requirements),
    config_schema: parseJsonObject(row.config_schema),
    is_enabled: row.is_enabled === 1,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  }));
};

const mapCheckProfile = (row: CheckProfileRow) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  rules: parseJsonObject(row.rules) ?? {},
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString()
});

export const listCheckProfiles = async (): Promise<ReturnType<typeof mapCheckProfile>[]> => {
  const pool = getPool();
  const [rows] = await pool.query<CheckProfileRow[]>(
    `
      SELECT id, name, description, rules, created_at, updated_at
      FROM check_profiles
      ORDER BY name ASC, id ASC
    `
  );

  return rows.map(mapCheckProfile);
};

export const createCheckProfile = async (input: CreateCheckProfileInput): Promise<ReturnType<typeof mapCheckProfile>> => {
  const pool = getPool();
  const now = new Date();
  const id = randomUUID();

  await pool.query(
    `
      INSERT INTO check_profiles (id, name, description, rules, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [id, input.name, input.description ?? null, JSON.stringify(input.rules), now, now]
  );

  const [rows] = await pool.query<CheckProfileRow[]>(
    'SELECT id, name, description, rules, created_at, updated_at FROM check_profiles WHERE id = ? LIMIT 1',
    [id]
  );

  return mapCheckProfile(rows[0]);
};

export const updateCheckProfile = async (
  profileId: string,
  input: UpdateCheckProfileInput
): Promise<ReturnType<typeof mapCheckProfile> | null> => {
  const pool = getPool();
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (typeof input.name === 'string') {
    assignments.push('name = ?');
    params.push(input.name);
  }
  if (input.description !== undefined) {
    assignments.push('description = ?');
    params.push(input.description ?? null);
  }
  if (input.rules !== undefined) {
    assignments.push('rules = ?');
    params.push(JSON.stringify(input.rules));
  }

  if (assignments.length === 0) {
    const [rows] = await pool.query<CheckProfileRow[]>(
      'SELECT id, name, description, rules, created_at, updated_at FROM check_profiles WHERE id = ? LIMIT 1',
      [profileId]
    );
    return rows[0] ? mapCheckProfile(rows[0]) : null;
  }

  assignments.push('updated_at = ?');
  params.push(new Date());
  params.push(profileId);

  await pool.query(
    `UPDATE check_profiles SET ${assignments.join(', ')} WHERE id = ?`,
    params
  );

  const [rows] = await pool.query<CheckProfileRow[]>(
    'SELECT id, name, description, rules, created_at, updated_at FROM check_profiles WHERE id = ? LIMIT 1',
    [profileId]
  );

  return rows[0] ? mapCheckProfile(rows[0]) : null;
};

const mapAlertChannel = (row: AlertChannelRow) => ({
  id: row.id,
  type: row.type,
  name: row.name,
  config_kid: row.config_kid,
  is_enabled: row.is_enabled === 1,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString()
});

export const listAlertChannels = async (): Promise<ReturnType<typeof mapAlertChannel>[]> => {
  const pool = getPool();
  const [rows] = await pool.query<AlertChannelRow[]>(
    `
      SELECT id, type, name, config_kid, is_enabled, created_at, updated_at
      FROM alert_channels
      ORDER BY name ASC, id ASC
    `
  );

  return rows.map(mapAlertChannel);
};

export const createAlertChannel = async (input: CreateAlertChannelInput): Promise<ReturnType<typeof mapAlertChannel>> => {
  const pool = getPool();
  const now = new Date();
  const id = randomUUID();

  await pool.query(
    `
      INSERT INTO alert_channels (id, type, name, config_enc, config_kid, is_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      input.type,
      input.name,
      input.config_enc,
      input.config_kid ?? 'plain-v1',
      input.is_enabled === false ? 0 : 1,
      now,
      now
    ]
  );

  const [rows] = await pool.query<AlertChannelRow[]>(
    'SELECT id, type, name, config_kid, is_enabled, created_at, updated_at FROM alert_channels WHERE id = ? LIMIT 1',
    [id]
  );

  return mapAlertChannel(rows[0]);
};

export const updateAlertChannel = async (
  channelId: string,
  input: UpdateAlertChannelInput
): Promise<ReturnType<typeof mapAlertChannel> | null> => {
  const pool = getPool();
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (typeof input.type === 'string') {
    assignments.push('type = ?');
    params.push(input.type);
  }
  if (typeof input.name === 'string') {
    assignments.push('name = ?');
    params.push(input.name);
  }
  if (typeof input.config_enc === 'string' && input.config_enc.length > 0) {
    assignments.push('config_enc = ?');
    params.push(input.config_enc);
  }
  if (typeof input.config_kid === 'string') {
    assignments.push('config_kid = ?');
    params.push(input.config_kid);
  }
  if (typeof input.is_enabled === 'boolean') {
    assignments.push('is_enabled = ?');
    params.push(input.is_enabled ? 1 : 0);
  }

  if (assignments.length === 0) {
    const [rows] = await pool.query<AlertChannelRow[]>(
      'SELECT id, type, name, config_kid, is_enabled, created_at, updated_at FROM alert_channels WHERE id = ? LIMIT 1',
      [channelId]
    );
    return rows[0] ? mapAlertChannel(rows[0]) : null;
  }

  assignments.push('updated_at = ?');
  params.push(new Date());
  params.push(channelId);

  await pool.query(`UPDATE alert_channels SET ${assignments.join(', ')} WHERE id = ?`, params);

  const [rows] = await pool.query<AlertChannelRow[]>(
    'SELECT id, type, name, config_kid, is_enabled, created_at, updated_at FROM alert_channels WHERE id = ? LIMIT 1',
    [channelId]
  );

  return rows[0] ? mapAlertChannel(rows[0]) : null;
};

const mapAlertPolicy = (row: AlertPolicyRow) => ({
  id: row.id,
  name: row.name,
  cooldown_seconds: row.cooldown_seconds,
  notify_on: parseJsonObject(row.notify_on) ?? {},
  roles_to_notify: parseJsonArray(row.roles_to_notify),
  channel_ids: parseJsonArray(row.channel_ids),
  is_enabled: row.is_enabled === 1,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString()
});

export const listAlertPolicies = async (): Promise<ReturnType<typeof mapAlertPolicy>[]> => {
  const pool = getPool();
  const [rows] = await pool.query<AlertPolicyRow[]>(
    `
      SELECT id, name, cooldown_seconds, notify_on, roles_to_notify, channel_ids, is_enabled, created_at, updated_at
      FROM alert_policies
      ORDER BY name ASC, id ASC
    `
  );

  return rows.map(mapAlertPolicy);
};

export const createAlertPolicy = async (input: CreateAlertPolicyInput): Promise<ReturnType<typeof mapAlertPolicy>> => {
  const pool = getPool();
  const now = new Date();
  const id = randomUUID();

  await pool.query(
    `
      INSERT INTO alert_policies (
        id, name, cooldown_seconds, notify_on, roles_to_notify, channel_ids, is_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      input.name,
      input.cooldown_seconds ?? 300,
      JSON.stringify(input.notify_on ?? { STATE_CHANGE_OFFLINE: true, STATE_CHANGE_ONLINE: true }),
      JSON.stringify(input.roles_to_notify ?? []),
      JSON.stringify(input.channel_ids),
      input.is_enabled === false ? 0 : 1,
      now,
      now
    ]
  );

  const [rows] = await pool.query<AlertPolicyRow[]>(
    `
      SELECT id, name, cooldown_seconds, notify_on, roles_to_notify, channel_ids, is_enabled, created_at, updated_at
      FROM alert_policies
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );

  return mapAlertPolicy(rows[0]);
};

export const updateAlertPolicy = async (
  policyId: string,
  input: UpdateAlertPolicyInput
): Promise<ReturnType<typeof mapAlertPolicy> | null> => {
  const pool = getPool();
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (typeof input.name === 'string') {
    assignments.push('name = ?');
    params.push(input.name);
  }
  if (typeof input.cooldown_seconds === 'number') {
    assignments.push('cooldown_seconds = ?');
    params.push(input.cooldown_seconds);
  }
  if (input.notify_on !== undefined) {
    assignments.push('notify_on = ?');
    params.push(JSON.stringify(input.notify_on ?? {}));
  }
  if (input.roles_to_notify !== undefined) {
    assignments.push('roles_to_notify = ?');
    params.push(JSON.stringify(input.roles_to_notify ?? []));
  }
  if (input.channel_ids !== undefined) {
    assignments.push('channel_ids = ?');
    params.push(JSON.stringify(input.channel_ids ?? []));
  }
  if (typeof input.is_enabled === 'boolean') {
    assignments.push('is_enabled = ?');
    params.push(input.is_enabled ? 1 : 0);
  }

  if (assignments.length === 0) {
    const [rows] = await pool.query<AlertPolicyRow[]>(
      `
        SELECT id, name, cooldown_seconds, notify_on, roles_to_notify, channel_ids, is_enabled, created_at, updated_at
        FROM alert_policies
        WHERE id = ?
        LIMIT 1
      `,
      [policyId]
    );

    return rows[0] ? mapAlertPolicy(rows[0]) : null;
  }

  assignments.push('updated_at = ?');
  params.push(new Date());
  params.push(policyId);

  await pool.query(`UPDATE alert_policies SET ${assignments.join(', ')} WHERE id = ?`, params);

  const [rows] = await pool.query<AlertPolicyRow[]>(
    `
      SELECT id, name, cooldown_seconds, notify_on, roles_to_notify, channel_ids, is_enabled, created_at, updated_at
      FROM alert_policies
      WHERE id = ?
      LIMIT 1
    `,
    [policyId]
  );

  return rows[0] ? mapAlertPolicy(rows[0]) : null;
};

export const listAlertEvents = async (filters?: ListAlertEventsFilters): Promise<Record<string, unknown>[]> => {
  const pool = getPool();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters?.server_id) {
    clauses.push('server_id = ?');
    params.push(filters.server_id);
  }
  if (filters?.policy_id) {
    clauses.push('policy_id = ?');
    params.push(filters.policy_id);
  }
  if (filters?.channel_id) {
    clauses.push('channel_id = ?');
    params.push(filters.channel_id);
  }
  if (filters?.event_type) {
    clauses.push('event_type = ?');
    params.push(filters.event_type);
  }
  if (filters?.suppressed_reason) {
    clauses.push('suppressed_reason = ?');
    params.push(filters.suppressed_reason);
  }
  if (filters?.from) {
    clauses.push('created_at >= ?');
    params.push(filters.from);
  }
  if (filters?.to) {
    clauses.push('created_at <= ?');
    params.push(filters.to);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(200, Math.max(1, filters?.limit ?? 50));
  params.push(limit);

  const [rows] = await pool.query<AlertEventRow[]>(
    `
      SELECT id, idempotency_key, server_id, incident_id, policy_id, channel_id, event_type, status_from, status_to,
             reason_code, reason_source, suppressed_reason, payload_summary, attempt_count, last_error_code,
             last_error_detail, was_sent, sent_at, created_at
      FROM alert_events
      ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    idempotency_key: row.idempotency_key,
    server_id: row.server_id,
    incident_id: row.incident_id,
    policy_id: row.policy_id,
    channel_id: row.channel_id,
    event_type: row.event_type,
    status_from: row.status_from,
    status_to: row.status_to,
    reason_code: row.reason_code,
    reason_source: row.reason_source,
    suppressed_reason: row.suppressed_reason,
    payload_summary: parseJsonObject(row.payload_summary),
    attempt_count: row.attempt_count,
    last_error_code: row.last_error_code,
    last_error_detail: row.last_error_detail,
    was_sent: row.was_sent === 1,
    sent_at: toIso(row.sent_at),
    created_at: row.created_at.toISOString()
  }));
};

export const listRoles = async (): Promise<Array<{ id: string; key: string; name: string }>> => {
  const pool = getPool();
  const [rows] = await pool.query<RoleRow[]>(
    `
      SELECT id, \`key\`, name
      FROM roles
      ORDER BY \`key\` ASC
    `
  );

  return rows.map((row) => ({ id: row.id, key: row.key, name: row.name }));
};

export type CreateRoleInput = {
  key: string;
  name: string;
};

export type UpdateRoleInput = {
  key?: string;
  name?: string;
};

export const findRoleById = async (roleId: string): Promise<{ id: string; key: string; name: string } | null> => {
  const pool = getPool();
  const [rows] = await pool.query<RoleRow[]>(
    `
      SELECT id, \`key\`, name
      FROM roles
      WHERE id = ?
      LIMIT 1
    `,
    [roleId]
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    key: row.key,
    name: row.name
  };
};

export const createRole = async (input: CreateRoleInput): Promise<{ id: string; key: string; name: string }> => {
  const pool = getPool();
  const now = new Date();
  const roleId = randomUUID();

  await pool.query(
    `
      INSERT INTO roles (id, \`key\`, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    [roleId, input.key, input.name, now, now]
  );

  const created = await findRoleById(roleId);
  if (!created) {
    throw new Error('role create failed');
  }

  return created;
};

export const updateRole = async (
  roleId: string,
  input: UpdateRoleInput
): Promise<{ id: string; key: string; name: string } | null> => {
  const pool = getPool();
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (typeof input.key === 'string') {
    assignments.push('`key` = ?');
    params.push(input.key);
  }

  if (typeof input.name === 'string') {
    assignments.push('name = ?');
    params.push(input.name);
  }

  if (assignments.length > 0) {
    assignments.push('updated_at = ?');
    params.push(new Date());
    params.push(roleId);

    await pool.query(
      `
        UPDATE roles
        SET ${assignments.join(', ')}
        WHERE id = ?
      `,
      params
    );
  }

  return findRoleById(roleId);
};

export const deleteRole = async (roleId: string): Promise<boolean> => {
  const pool = getPool();
  const [result] = await pool.query('DELETE FROM roles WHERE id = ?', [roleId]);
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
};

const mapUsersWithRoles = (
  users: UserRow[],
  rolesByUserId: Map<string, string[]>
): Array<{
  id: string;
  username: string;
  email: string;
  is_enabled: boolean;
  roles: string[];
  last_login_at: string | null;
  updated_at: string;
}> => {
  return users.map((user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    is_enabled: user.is_enabled === 1,
    roles: rolesByUserId.get(user.id) ?? [],
    last_login_at: user.last_login_at?.toISOString() ?? null,
    updated_at: user.updated_at.toISOString()
  }));
};

const getRolesByUserIds = async (userIds: string[]): Promise<Map<string, string[]>> => {
  const result = new Map<string, string[]>();
  if (userIds.length === 0) {
    return result;
  }

  const pool = getPool();
  const placeholders = userIds.map(() => '?').join(', ');
  const [roleRows] = await pool.query<UserRoleRow[]>(
    `
      SELECT ur.user_id, r.\`key\` AS role_key
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id IN (${placeholders})
      ORDER BY r.\`key\` ASC
    `,
    userIds
  );

  for (const row of roleRows) {
    const existing = result.get(row.user_id) ?? [];
    existing.push(row.role_key);
    result.set(row.user_id, existing);
  }

  return result;
};

export const listUsers = async (): Promise<
  Array<{
    id: string;
    username: string;
    email: string;
    is_enabled: boolean;
    roles: string[];
    last_login_at: string | null;
    updated_at: string;
  }>
> => {
  const pool = getPool();
  const [users] = await pool.query<UserRow[]>(
    `
      SELECT id, username, email, is_enabled, last_login_at, updated_at
      FROM users
      ORDER BY created_at ASC, id ASC
    `
  );

  const rolesByUserId = await getRolesByUserIds(users.map((user) => user.id));
  return mapUsersWithRoles(users, rolesByUserId);
};

export const createUser = async (
  input: CreateUserInput
): Promise<{
  id: string;
  username: string;
  email: string;
  is_enabled: boolean;
  roles: string[];
  last_login_at: string | null;
  updated_at: string;
}> => {
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
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
    `,
    [
      userId,
      input.username,
      input.email,
      input.password_hash,
      input.is_enabled === false ? 0 : 1,
      now,
      now
    ]
  );

  const roleKeys = Array.isArray(input.role_keys) && input.role_keys.length > 0 ? input.role_keys : ['USER'];
  await setUserRoles(userId, roleKeys);

  const created = await findUserById(userId);
  if (!created) {
    throw new Error('user create failed');
  }

  return created;
};

export const findUserById = async (
  userId: string
): Promise<{
  id: string;
  username: string;
  email: string;
  is_enabled: boolean;
  roles: string[];
  last_login_at: string | null;
  updated_at: string;
} | null> => {
  const pool = getPool();
  const [users] = await pool.query<UserRow[]>(
    `
      SELECT id, username, email, is_enabled, last_login_at, updated_at
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

  const rolesByUserId = await getRolesByUserIds([user.id]);
  return mapUsersWithRoles([user], rolesByUserId)[0] ?? null;
};

export const updateUser = async (
  userId: string,
  input: UpdateUserInput
): Promise<{
  id: string;
  username: string;
  email: string;
  is_enabled: boolean;
  roles: string[];
  last_login_at: string | null;
  updated_at: string;
} | null> => {
  const pool = getPool();
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (typeof input.username === 'string') {
    assignments.push('username = ?');
    params.push(input.username);
  }

  if (typeof input.email === 'string') {
    assignments.push('email = ?');
    params.push(input.email);
  }

  if (typeof input.is_enabled === 'boolean') {
    assignments.push('is_enabled = ?');
    params.push(input.is_enabled ? 1 : 0);
  }

  if (assignments.length > 0) {
    assignments.push('updated_at = ?');
    params.push(new Date());
    params.push(userId);

    await pool.query(
      `
        UPDATE users
        SET ${assignments.join(', ')}
        WHERE id = ?
      `,
      params
    );
  }

  return findUserById(userId);
};

export const deleteUser = async (userId: string): Promise<boolean> => {
  const pool = getPool();
  const [result] = await pool.query('DELETE FROM users WHERE id = ?', [userId]);
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
};

export const setUserRoles = async (userId: string, roleKeys: string[]): Promise<void> => {
  const pool = getPool();
  const filteredKeys = Array.from(new Set(roleKeys.filter((key) => typeof key === 'string' && key.trim().length > 0)));

  const keysToApply = filteredKeys.length > 0 ? filteredKeys : ['USER'];
  const placeholders = keysToApply.map(() => '?').join(', ');
  const [roles] = await pool.query<RoleRow[]>(
    `
      SELECT id, \`key\`, name
      FROM roles
      WHERE \`key\` IN (${placeholders})
    `,
    keysToApply
  );

  if (roles.length === 0) {
    throw new Error('role assignment failed: unknown roles');
  }

  await pool.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);

  for (const role of roles) {
    await pool.query(
      `
        INSERT INTO user_roles (user_id, role_id)
        VALUES (?, ?)
      `,
      [userId, role.id]
    );
  }
};

const mapGameLabel = (row: GameLabelRow) => ({
  id: row.id,
  name: row.name,
  is_enabled: row.is_enabled === 1,
  settings: parseJsonObject(row.settings),
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString()
});

export const listGameLabels = async (): Promise<ReturnType<typeof mapGameLabel>[]> => {
  const pool = getPool();
  const [rows] = await pool.query<GameLabelRow[]>(
    `
      SELECT id, name, is_enabled, settings, created_at, updated_at
      FROM game_labels
      ORDER BY name ASC, id ASC
    `
  );

  return rows.map(mapGameLabel);
};

export const findGameLabelById = async (id: string): Promise<ReturnType<typeof mapGameLabel> | null> => {
  const pool = getPool();
  const [rows] = await pool.query<GameLabelRow[]>(
    `
      SELECT id, name, is_enabled, settings, created_at, updated_at
      FROM game_labels
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows[0] ? mapGameLabel(rows[0]) : null;
};

export const createGameLabel = async (input: CreateGameLabelInput): Promise<ReturnType<typeof mapGameLabel>> => {
  const pool = getPool();
  const id = randomUUID();
  const now = new Date();
  await pool.query(
    `
      INSERT INTO game_labels (id, name, is_enabled, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [id, input.name, input.is_enabled === false ? 0 : 1, input.settings ? JSON.stringify(input.settings) : null, now, now]
  );

  const created = await findGameLabelById(id);
  if (!created) {
    throw new Error('game label create failed');
  }
  return created;
};

export const updateGameLabel = async (
  id: string,
  input: UpdateGameLabelInput
): Promise<ReturnType<typeof mapGameLabel> | null> => {
  const pool = getPool();
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (typeof input.name === 'string') {
    assignments.push('name = ?');
    params.push(input.name);
  }
  if (typeof input.is_enabled === 'boolean') {
    assignments.push('is_enabled = ?');
    params.push(input.is_enabled ? 1 : 0);
  }
  if (input.settings !== undefined) {
    assignments.push('settings = ?');
    params.push(input.settings ? JSON.stringify(input.settings) : null);
  }

  if (assignments.length === 0) {
    return findGameLabelById(id);
  }

  assignments.push('updated_at = ?');
  params.push(new Date());
  params.push(id);

  await pool.query(
    `
      UPDATE game_labels
      SET ${assignments.join(', ')}
      WHERE id = ?
    `,
    params
  );

  return findGameLabelById(id);
};

export const deleteGameLabel = async (id: string): Promise<boolean> => {
  const pool = getPool();
  const [result] = await pool.query('DELETE FROM game_labels WHERE id = ?', [id]);
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
};

const mapServerPreset = (row: ServerPresetRow) => ({
  id: row.id,
  key: row.key,
  name: row.name,
  hoster: row.hoster,
  protocol: row.protocol,
  query_port_mode: row.query_port_mode,
  prefer_a2s: row.prefer_a2s === 1,
  is_system: row.is_system === 1,
  notes: row.notes,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString()
});

export const listServerPresets = async (): Promise<ReturnType<typeof mapServerPreset>[]> => {
  const pool = getPool();
  const [rows] = await pool.query<ServerPresetRow[]>(
    `
      SELECT id, \`key\`, name, hoster, protocol, query_port_mode, prefer_a2s, is_system, notes, created_at, updated_at
      FROM server_hoster_presets
      ORDER BY is_system DESC, name ASC, id ASC
    `
  );

  return rows.map(mapServerPreset);
};

export const findServerPresetById = async (presetId: string): Promise<ReturnType<typeof mapServerPreset> | null> => {
  const pool = getPool();
  const [rows] = await pool.query<ServerPresetRow[]>(
    `
      SELECT id, \`key\`, name, hoster, protocol, query_port_mode, prefer_a2s, is_system, notes, created_at, updated_at
      FROM server_hoster_presets
      WHERE id = ?
      LIMIT 1
    `,
    [presetId]
  );

  return rows[0] ? mapServerPreset(rows[0]) : null;
};

export const createServerPreset = async (input: CreateServerPresetInput): Promise<ReturnType<typeof mapServerPreset>> => {
  const pool = getPool();
  const presetId = randomUUID();
  const now = new Date();

  await pool.query(
    `
      INSERT INTO server_hoster_presets (
        id, \`key\`, name, hoster, protocol, query_port_mode, prefer_a2s, is_system, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `,
    [
      presetId,
      input.key,
      input.name,
      input.hoster,
      input.protocol,
      input.query_port_mode,
      input.prefer_a2s === true ? 1 : 0,
      input.notes ?? null,
      now,
      now
    ]
  );

  const created = await findServerPresetById(presetId);
  if (!created) {
    throw new Error('server preset create failed');
  }

  return created;
};

export const updateServerPreset = async (
  presetId: string,
  input: UpdateServerPresetInput
): Promise<ReturnType<typeof mapServerPreset> | null> => {
  const pool = getPool();
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (typeof input.key === 'string') {
    assignments.push('`key` = ?');
    params.push(input.key);
  }
  if (typeof input.name === 'string') {
    assignments.push('name = ?');
    params.push(input.name);
  }
  if (typeof input.hoster === 'string') {
    assignments.push('hoster = ?');
    params.push(input.hoster);
  }
  if (typeof input.protocol === 'string') {
    assignments.push('protocol = ?');
    params.push(input.protocol);
  }
  if (typeof input.query_port_mode === 'string') {
    assignments.push('query_port_mode = ?');
    params.push(input.query_port_mode);
  }
  if (typeof input.prefer_a2s === 'boolean') {
    assignments.push('prefer_a2s = ?');
    params.push(input.prefer_a2s ? 1 : 0);
  }
  if (input.notes !== undefined) {
    assignments.push('notes = ?');
    params.push(input.notes ?? null);
  }

  if (assignments.length === 0) {
    return findServerPresetById(presetId);
  }

  assignments.push('updated_at = ?');
  params.push(new Date());
  params.push(presetId);

  await pool.query(
    `
      UPDATE server_hoster_presets
      SET ${assignments.join(', ')}
      WHERE id = ?
    `,
    params
  );

  return findServerPresetById(presetId);
};

export const deleteServerPreset = async (presetId: string): Promise<boolean> => {
  const pool = getPool();
  const [result] = await pool.query(
    'DELETE FROM server_hoster_presets WHERE id = ? AND is_system = 0',
    [presetId]
  );

  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
};

export const getAppSettingsByScope = async (scope: string): Promise<Record<string, string | boolean>> => {
  const pool = getPool();
  const [rows] = await pool.query<AppSettingRow[]>(
    `
      SELECT id, scope, setting_key, setting_value_json, created_at, updated_at
      FROM app_settings
      WHERE scope = ?
      ORDER BY setting_key ASC
    `,
    [scope]
  );

  const settings: Record<string, string | boolean> = {};
  for (const row of rows) {
    const parsed = parseJsonValue(row.setting_value_json);
    if (typeof parsed === 'string' || typeof parsed === 'boolean') {
      settings[row.setting_key] = parsed;
    } else if (typeof parsed === 'number') {
      settings[row.setting_key] = String(parsed);
    }
  }

  return settings;
};

export const upsertAppSettingsByScope = async (
  scope: string,
  input: Record<string, string | boolean>
): Promise<Record<string, string | boolean>> => {
  const pool = getPool();
  const now = new Date();

  for (const [settingKey, value] of Object.entries(input)) {
    await pool.query(
      `
        INSERT INTO app_settings (id, scope, setting_key, setting_value_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          setting_value_json = VALUES(setting_value_json),
          updated_at = VALUES(updated_at)
      `,
      [randomUUID(), scope, settingKey, JSON.stringify(value), now, now]
    );
  }

  return getAppSettingsByScope(scope);
};