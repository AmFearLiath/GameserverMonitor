import type { RowDataPacket } from 'mysql2';
import type { ServerDetail, ServerEndpoint, ServerStatus, ServerSummary, UpdateServerMetadataInput } from '@gm/shared';
import { randomUUID } from 'node:crypto';
import { getPool } from './client.js';

export type ListServersFilters = {
  q?: string;
  status?: ServerStatus;
  tag?: string;
};

type ServerRow = RowDataPacket & {
  id: string;
  name: string;
  game_label: string | null;
  game_icon_url: string | null;
  panel_id: string | null;
  panel_name: string | null;
  hoster: string | null;
  source_kind: 'PTERODACTYL_PANEL' | 'EXTERNAL_HOSTER' | null;
  node_id: string | null;
  normalized_status: 'ONLINE' | 'OFFLINE' | 'TRANSITION' | 'MAINTENANCE';
  ptero_raw_state: string;
  last_reason_code: string | null;
  last_reason_source: 'PTERO' | 'QUERY' | 'ADAPTER' | 'SYSTEM' | null;
  last_reason_meta: string | null;
  players_current: number | null;
  players_max: number | null;
  rtt_ms: number | null;
  last_check_at: Date | null;
  last_status_change_at: Date | null;
  tags_csv: string | null;
};

type EndpointRow = RowDataPacket & {
  id: string;
  label: string;
  host: string;
  port: number;
  protocol: 'TCP' | 'UDP' | 'HTTP' | 'HTTPS';
  purpose: 'GAME' | 'QUERY' | 'HTTP' | 'RCON' | 'OTHER';
  is_primary: number;
  is_enabled: number;
  meta: string | null;
};

const parseJsonObject = (value: string | null): Record<string, unknown> | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    return null;
  } catch {
    return null;
  }
};

const resolveGameLabelMetadata = async (
  gameLabel: string | null | undefined
): Promise<{ name: string | null; iconUrl: string | null }> => {
  if (typeof gameLabel !== 'string') {
    return { name: null, iconUrl: null };
  }

  const trimmed = gameLabel.trim();
  if (!trimmed) {
    return { name: null, iconUrl: null };
  }

  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        name,
        COALESCE(
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(settings, '$.game_icon_url')), ''),
          CASE
            WHEN JSON_UNQUOTE(JSON_EXTRACT(settings, '$.game_icon_upload')) LIKE 'http%'
              OR JSON_UNQUOTE(JSON_EXTRACT(settings, '$.game_icon_upload')) LIKE 'data:%'
              OR JSON_UNQUOTE(JSON_EXTRACT(settings, '$.game_icon_upload')) LIKE '/%'
            THEN JSON_UNQUOTE(JSON_EXTRACT(settings, '$.game_icon_upload'))
            ELSE NULL
          END
        ) AS icon_url
      FROM game_labels
      WHERE LOWER(name) = LOWER(?)
      LIMIT 1
    `,
    [trimmed]
  );

  const row = rows[0] as { name?: string; icon_url?: string | null } | undefined;
  if (!row?.name) {
    return { name: trimmed, iconUrl: null };
  }

  return {
    name: row.name,
    iconUrl: typeof row.icon_url === 'string' && row.icon_url.trim().length > 0 ? row.icon_url : null
  };
};

const findFirstAvailableProfileIdByNames = async (names: string[]): Promise<string | null> => {
  if (names.length === 0) {
    return null;
  }

  const pool = getPool();
  const placeholders = names.map(() => '?').join(', ');
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id, name
      FROM check_profiles
      WHERE name IN (${placeholders})
    `,
    names
  );

  for (const name of names) {
    const matched = rows.find((row) => row.name === name);
    if (matched?.id) {
      return matched.id as string;
    }
  }

  return null;
};

export const listServers = async (filters?: ListServersFilters): Promise<ServerSummary[]> => {
  const pool = getPool();
  const whereClauses: string[] = ['s.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters?.q) {
    whereClauses.push('(s.name LIKE ? OR s.game_label LIKE ?)');
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }

  if (filters?.status) {
    whereClauses.push('s.normalized_status = ?');
    params.push(filters.status);
  }

  if (filters?.tag) {
    whereClauses.push(
      'EXISTS (SELECT 1 FROM server_tags st2 INNER JOIN tags t2 ON t2.id = st2.tag_id WHERE st2.server_id = s.id AND t2.key = ?)'
    );
    params.push(filters.tag);
  }

  const whereSql = whereClauses.join(' AND ');
  const [rows] = await pool.query<ServerRow[]>(
    `
      SELECT
        s.id,
        s.name,
        s.game_label,
        COALESCE(
          NULLIF(s.game_icon_url, ''),
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(gl.settings, '$.game_icon_url')), ''),
          CASE
            WHEN JSON_UNQUOTE(JSON_EXTRACT(gl.settings, '$.game_icon_upload')) LIKE 'http%'
              OR JSON_UNQUOTE(JSON_EXTRACT(gl.settings, '$.game_icon_upload')) LIKE 'data:%'
              OR JSON_UNQUOTE(JSON_EXTRACT(gl.settings, '$.game_icon_upload')) LIKE '/%'
            THEN JSON_UNQUOTE(JSON_EXTRACT(gl.settings, '$.game_icon_upload'))
            ELSE NULL
          END
        ) AS game_icon_url,
        s.panel_id,
        p.name AS panel_name,
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.last_reason_meta, '$.hoster')), '') AS hoster,
        CASE
          WHEN s.panel_id IS NOT NULL THEN 'PTERODACTYL_PANEL'
          ELSE COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.last_reason_meta, '$.source_kind')), ''), 'EXTERNAL_HOSTER')
        END AS source_kind,
        s.node_id,
        s.normalized_status,
        s.ptero_raw_state,
        s.last_reason_code,
        s.last_reason_source,
        s.last_reason_meta,
        latest.players_avg AS players_current,
        latest.max_players_last AS players_max,
        latest.rtt_avg_ms AS rtt_ms,
        s.last_check_at,
        s.last_status_change_at,
        GROUP_CONCAT(t.key ORDER BY t.key SEPARATOR ',') AS tags_csv
      FROM servers s
      LEFT JOIN (
        SELECT c1.server_id, c1.players_avg, c1.max_players_last, c1.rtt_avg_ms
        FROM server_checks_1m c1
        INNER JOIN (
          SELECT server_id, MAX(bucket_start) AS bucket_start
          FROM server_checks_1m
          GROUP BY server_id
        ) c2
          ON c2.server_id = c1.server_id
         AND c2.bucket_start = c1.bucket_start
      ) latest ON latest.server_id = s.id
      LEFT JOIN panels p ON p.id = s.panel_id
      LEFT JOIN game_labels gl ON gl.name = s.game_label
      LEFT JOIN server_tags st ON st.server_id = s.id
      LEFT JOIN tags t ON t.id = st.tag_id
      WHERE ${whereSql}
      GROUP BY
        s.id,
        s.name,
        s.game_label,
        s.game_icon_url,
        s.panel_id,
        p.name,
        s.node_id,
        s.normalized_status,
        s.ptero_raw_state,
        s.last_reason_code,
        s.last_reason_source,
        s.last_reason_meta,
        latest.players_avg,
        latest.max_players_last,
        latest.rtt_avg_ms,
        s.last_check_at,
        s.last_status_change_at
      ORDER BY s.name ASC, s.id ASC
    `,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    game_label: row.game_label,
    game_icon_url: row.game_icon_url,
    panel_id: row.panel_id,
    panel_name: row.panel_name,
    hoster: row.hoster,
    source_kind: row.source_kind,
    node_id: row.node_id,
    normalized_status: row.normalized_status,
    ptero_raw_state: row.ptero_raw_state,
    last_reason_code: row.last_reason_code,
    last_reason_source: row.last_reason_source,
    players_current: row.players_current === null ? null : Number(row.players_current),
    players_max: row.players_max,
    rtt_ms: row.rtt_ms,
    last_check_at: row.last_check_at?.toISOString() ?? null,
    last_status_change_at: row.last_status_change_at?.toISOString() ?? null,
    tags: row.tags_csv ? row.tags_csv.split(',') : []
  }));
};

export const findServerById = async (serverId: string): Promise<ServerDetail | null> => {
  const pool = getPool();
  const [serverRows] = await pool.query<ServerRow[]>(
    `
      SELECT
        s.id,
        s.name,
        s.game_label,
        COALESCE(
          NULLIF(s.game_icon_url, ''),
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(gl.settings, '$.game_icon_url')), ''),
          CASE
            WHEN JSON_UNQUOTE(JSON_EXTRACT(gl.settings, '$.game_icon_upload')) LIKE 'http%'
              OR JSON_UNQUOTE(JSON_EXTRACT(gl.settings, '$.game_icon_upload')) LIKE 'data:%'
              OR JSON_UNQUOTE(JSON_EXTRACT(gl.settings, '$.game_icon_upload')) LIKE '/%'
            THEN JSON_UNQUOTE(JSON_EXTRACT(gl.settings, '$.game_icon_upload'))
            ELSE NULL
          END
        ) AS game_icon_url,
        s.panel_id,
        p.name AS panel_name,
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.last_reason_meta, '$.hoster')), '') AS hoster,
        CASE
          WHEN s.panel_id IS NOT NULL THEN 'PTERODACTYL_PANEL'
          ELSE COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.last_reason_meta, '$.source_kind')), ''), 'EXTERNAL_HOSTER')
        END AS source_kind,
        s.node_id,
        s.normalized_status,
        s.ptero_raw_state,
        s.last_reason_code,
        s.last_reason_source,
        s.last_reason_meta,
        latest.players_avg AS players_current,
        latest.max_players_last AS players_max,
        latest.rtt_avg_ms AS rtt_ms,
        s.last_check_at,
        s.last_status_change_at,
        GROUP_CONCAT(t.key ORDER BY t.key SEPARATOR ',') AS tags_csv
      FROM servers s
      LEFT JOIN (
        SELECT c1.server_id, c1.players_avg, c1.max_players_last, c1.rtt_avg_ms
        FROM server_checks_1m c1
        INNER JOIN (
          SELECT server_id, MAX(bucket_start) AS bucket_start
          FROM server_checks_1m
          GROUP BY server_id
        ) c2
          ON c2.server_id = c1.server_id
         AND c2.bucket_start = c1.bucket_start
      ) latest ON latest.server_id = s.id
      LEFT JOIN panels p ON p.id = s.panel_id
      LEFT JOIN game_labels gl ON gl.name = s.game_label
      LEFT JOIN server_tags st ON st.server_id = s.id
      LEFT JOIN tags t ON t.id = st.tag_id
      WHERE s.id = ? AND s.deleted_at IS NULL
      GROUP BY
        s.id,
        s.name,
        s.game_label,
        s.game_icon_url,
        s.panel_id,
        p.name,
        s.node_id,
        s.normalized_status,
        s.ptero_raw_state,
        s.last_reason_code,
        s.last_reason_source,
        s.last_reason_meta,
        latest.players_avg,
        latest.max_players_last,
        latest.rtt_avg_ms,
        s.last_check_at,
        s.last_status_change_at
      LIMIT 1
    `,
    [serverId]
  );

  const server = serverRows[0];
  if (!server) {
    return null;
  }

  const [endpointRows] = await pool.query<EndpointRow[]>(
    `
      SELECT
        id,
        label,
        host,
        port,
        protocol,
        purpose,
        is_primary,
        is_enabled,
        meta
      FROM endpoints
      WHERE server_id = ?
      ORDER BY is_primary DESC, label ASC, id ASC
    `,
    [serverId]
  );

  const endpoints: ServerEndpoint[] = endpointRows.map((endpoint) => ({
    id: endpoint.id,
    label: endpoint.label,
    host: endpoint.host,
    port: endpoint.port,
    protocol: endpoint.protocol,
    purpose: endpoint.purpose,
    is_primary: endpoint.is_primary === 1,
    is_enabled: endpoint.is_enabled === 1,
    meta: parseJsonObject(endpoint.meta)
  }));

  return {
    id: server.id,
    name: server.name,
    game_label: server.game_label,
    game_icon_url: server.game_icon_url,
    panel_id: server.panel_id,
    panel_name: server.panel_name,
    hoster: server.hoster,
    source_kind: server.source_kind,
    node_id: server.node_id,
    normalized_status: server.normalized_status,
    ptero_raw_state: server.ptero_raw_state,
    last_reason_code: server.last_reason_code,
    last_reason_source: server.last_reason_source,
    players_current: server.players_current === null ? null : Number(server.players_current),
    players_max: server.players_max,
    rtt_ms: server.rtt_ms,
    last_reason_meta: parseJsonObject(server.last_reason_meta),
    last_check_at: server.last_check_at?.toISOString() ?? null,
    last_status_change_at: server.last_status_change_at?.toISOString() ?? null,
    tags: server.tags_csv ? server.tags_csv.split(',') : [],
    endpoints,
    last_observations: null
  };
};

export const updateServerMetadata = async (
  serverId: string,
  input: UpdateServerMetadataInput
): Promise<ServerDetail | null> => {
  const updates: string[] = [];
  const params: unknown[] = [];

  const gameLabelProvided = Object.prototype.hasOwnProperty.call(input, 'game_label');
  const gameIconProvided = Object.prototype.hasOwnProperty.call(input, 'game_icon_url');
  const resolvedGameLabel = gameLabelProvided
    ? await resolveGameLabelMetadata(input.game_label ?? null)
    : { name: null, iconUrl: null };

  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    updates.push('name = ?');
    params.push(input.name ?? null);
  }

  if (gameLabelProvided) {
    updates.push('game_label = ?');
    params.push(resolvedGameLabel.name);
  }

  if (gameIconProvided) {
    updates.push('game_icon_url = ?');
    params.push(input.game_icon_url ?? null);
  } else if (gameLabelProvided && resolvedGameLabel.name) {
    updates.push('game_icon_url = ?');
    params.push(resolvedGameLabel.iconUrl);
  } else if (gameLabelProvided && !resolvedGameLabel.name) {
    updates.push('game_icon_url = ?');
    params.push(null);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'hoster')) {
    if (input.hoster === null) {
      updates.push("last_reason_meta = JSON_REMOVE(COALESCE(last_reason_meta, JSON_OBJECT()), '$.hoster')");
    } else {
      updates.push("last_reason_meta = JSON_SET(COALESCE(last_reason_meta, JSON_OBJECT()), '$.hoster', ?)");
      params.push(input.hoster);
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'source_kind')) {
    if (input.source_kind === null) {
      updates.push("last_reason_meta = JSON_REMOVE(COALESCE(last_reason_meta, JSON_OBJECT()), '$.source_kind')");
    } else {
      updates.push("last_reason_meta = JSON_SET(COALESCE(last_reason_meta, JSON_OBJECT()), '$.source_kind', ?)");
      params.push(input.source_kind);
    }
  }

  if (updates.length === 0) {
    return findServerById(serverId);
  }

  updates.push('updated_at = ?');
  params.push(new Date());
  params.push(serverId);

  const pool = getPool();
  const [result] = await pool.query(
    `
      UPDATE servers
      SET ${updates.join(', ')}
      WHERE id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `,
    params
  );

  const affectedRows = Number((result as { affectedRows?: number }).affectedRows ?? 0);
  if (affectedRows === 0) {
    return null;
  }

  return findServerById(serverId);
};

export type CreateExternalServerInput = {
  name: string;
  host: string;
  game_port: number;
  query_port?: number;
  protocol?: 'TCP' | 'UDP';
  hoster?: 'GENERIC' | 'GPORTAL' | 'NITRADO' | 'SHOCKBYTE' | 'APEX' | 'BISECT' | 'HOSTHAVOC' | 'SURVIVAL_SERVERS';
  game_label?: string | null;
};

const getDefaultProfileIdForExternalServer = async (
  preferA2s: boolean,
  hoster: 'GENERIC' | 'GPORTAL' | 'NITRADO' | 'SHOCKBYTE' | 'APEX' | 'BISECT' | 'HOSTHAVOC' | 'SURVIVAL_SERVERS'
): Promise<string | null> => {
  if (hoster === 'GPORTAL' || hoster === 'NITRADO') {
    return findFirstAvailableProfileIdByNames(['default-a2s', 'default-tcp']);
  }

  if (preferA2s) {
    return findFirstAvailableProfileIdByNames(['default-a2s', 'default-tcp']);
  }

  return findFirstAvailableProfileIdByNames(['default-tcp', 'default-a2s']);
};

export const createExternalServer = async (input: CreateExternalServerInput): Promise<ServerDetail> => {
  const pool = getPool();
  const now = new Date();
  const serverId = randomUUID();
  const gameEndpointId = randomUUID();
  const queryEndpointId = randomUUID();
  const normalizedProtocol = input.protocol === 'TCP' ? 'TCP' : 'UDP';
  const hoster = input.hoster ?? 'GENERIC';
  const effectiveQueryPort =
    typeof input.query_port === 'number' && input.query_port > 0
      ? input.query_port
      : normalizedProtocol === 'UDP'
        ? input.game_port
        : undefined;
  const hasQueryPort = typeof effectiveQueryPort === 'number' && effectiveQueryPort > 0;
  const gameEndpointProtocol =
    hasQueryPort && effectiveQueryPort === input.game_port && normalizedProtocol === 'UDP'
      ? 'TCP'
      : normalizedProtocol;
  const defaultProfileId = await getDefaultProfileIdForExternalServer(hasQueryPort, hoster);
  const externalRef = `external:${input.host}:${input.game_port}`;
  const resolvedGameLabel = await resolveGameLabelMetadata(input.game_label ?? null);

  await pool.query(
    `
      INSERT INTO servers (
        id,
        panel_id,
        node_id,
        ptero_server_id,
        identifier,
        name,
        description,
        game_label,
        game_icon_url,
        check_profile_id,
        is_enabled,
        maintenance_mode,
        maintenance_note,
        ptero_raw_state,
        normalized_status,
        last_reason_code,
        last_reason_source,
        last_reason_meta,
        last_status_change_at,
        last_online_at,
        last_offline_at,
        last_check_at,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (?, NULL, NULL, ?, ?, ?, NULL, ?, ?, ?, 1, 0, NULL, 'external', 'TRANSITION', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)
    `,
    [
      serverId,
      externalRef,
      externalRef,
      input.name,
      resolvedGameLabel.name,
      resolvedGameLabel.iconUrl,
      defaultProfileId,
      now,
      now
    ]
  );

  await pool.query(
    `
      INSERT INTO endpoints (
        id,
        server_id,
        source,
        label,
        host,
        port,
        protocol,
        purpose,
        is_primary,
        is_enabled,
        meta,
        created_at,
        updated_at
      ) VALUES (?, ?, 'MANUAL', 'Game Endpoint', ?, ?, ?, 'GAME', 1, 1, ?, ?, ?)
    `,
    [
      gameEndpointId,
      serverId,
      input.host,
      input.game_port,
      gameEndpointProtocol,
      JSON.stringify({ source: 'external', hoster }),
      now,
      now
    ]
  );

  if (hasQueryPort) {
    await pool.query(
      `
        INSERT INTO endpoints (
          id,
          server_id,
          source,
          label,
          host,
          port,
          protocol,
          purpose,
          is_primary,
          is_enabled,
          meta,
          created_at,
          updated_at
        ) VALUES (?, ?, 'MANUAL', 'Query Endpoint', ?, ?, 'UDP', 'QUERY', 0, 1, ?, ?, ?)
      `,
      [
        queryEndpointId,
        serverId,
        input.host,
        effectiveQueryPort,
        JSON.stringify({ source: 'external', hoster }),
        now,
        now
      ]
    );
  }

  const created = await findServerById(serverId);
  if (!created) {
    throw new Error('external server create failed');
  }

  return created;
};

export const deleteServerSoft = async (serverId: string): Promise<boolean> => {
  const pool = getPool();
  const now = new Date();
  const [result] = await pool.query(
    `
      UPDATE servers
      SET deleted_at = ?, updated_at = ?
      WHERE id = ?
        AND deleted_at IS NULL
    `,
    [now, now, serverId]
  );

  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
};

export const setServerMaintenanceMode = async (serverId: string, paused: boolean): Promise<ServerDetail | null> => {
  const pool = getPool();
  const now = new Date();
  const [result] = await pool.query(
    `
      UPDATE servers
      SET
        maintenance_mode = ?,
        normalized_status = ?,
        last_reason_code = ?,
        last_reason_source = 'SYSTEM',
        last_status_change_at = ?,
        updated_at = ?
      WHERE id = ?
        AND deleted_at IS NULL
    `,
    [
      paused ? 1 : 0,
      paused ? 'MAINTENANCE' : 'TRANSITION',
      paused ? 'STATUS_MAINTENANCE_MODE' : 'STATUS_PTERO_TRANSITION',
      now,
      now,
      serverId
    ]
  );

  if (Number((result as { affectedRows?: number }).affectedRows ?? 0) === 0) {
    return null;
  }

  return findServerById(serverId);
};
