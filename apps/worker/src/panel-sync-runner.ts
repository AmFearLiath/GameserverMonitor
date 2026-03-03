import { randomUUID } from 'node:crypto';
import { config } from '@gm/config';
import { getPool } from '@gm/db';
import { createLogger } from '@gm/logger';

type Logger = ReturnType<typeof createLogger>;

type RuntimePanelRow = {
  id: string;
  name: string;
  base_url: string;
  api_key_enc: string;
};

type RuntimeNodeRow = {
  id: string;
  ptero_node_id: string;
};

type RuntimeCheckProfileRow = {
  id: string;
};

type RuntimeStatus = 'ONLINE' | 'OFFLINE' | 'TRANSITION' | 'MAINTENANCE';

type EndpointProtocol = 'TCP' | 'UDP';
type EndpointPurpose = 'GAME' | 'QUERY';

type PteroListResponse<T> = {
  object?: string;
  data?: T[];
  meta?: {
    pagination?: {
      current_page?: number;
      total_pages?: number;
    };
  };
};

type PteroNodeEntry = {
  object?: string;
  attributes?: {
    id?: number;
    name?: string;
    fqdn?: string | null;
    location_id?: number | null;
    maintenance_mode?: boolean;
  };
};

type PteroAllocationEntry = {
  object?: string;
  attributes?: {
    id?: number;
    ip?: string;
    ip_alias?: string | null;
    alias?: string | null;
    port?: number;
    is_default?: boolean;
    assigned?: boolean;
  };
};

type PteroServerEntry = {
  object?: string;
  attributes?: {
    id?: number;
    external_id?: string | null;
    uuid?: string;
    identifier?: string;
    name?: string;
    node?: number;
    status?: string | null;
    suspended?: boolean;
    relationships?: {
      allocations?: {
        data?: PteroAllocationEntry[];
      };
    };
  };
  relationships?: {
    allocations?: {
      data?: PteroAllocationEntry[];
    };
  };
};

type PteroServerDetailPayload = {
  attributes?: {
    id?: number;
    relationships?: {
      allocations?: {
        data?: PteroAllocationEntry[];
      };
    };
  };
  relationships?: {
    allocations?: {
      data?: PteroAllocationEntry[];
    };
  };
};

const normalizePanelBaseUrl = (value: string): string => value.trim().replace(/\/+$/, '');

const safeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const safeInteger = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null;
  }

  return value;
};

const mapPteroRuntimeState = (
  rawStatus: string,
  isEnabled: boolean
): { normalizedStatus: RuntimeStatus; reasonCode: string } => {
  if (!isEnabled) {
    return { normalizedStatus: 'OFFLINE', reasonCode: 'STATUS_PTERO_SUSPENDED' };
  }

  const normalizedRaw = rawStatus.trim().toLowerCase();

  if (normalizedRaw === 'running') {
    return { normalizedStatus: 'ONLINE', reasonCode: 'STATUS_PTERO_RUNNING' };
  }

  if (normalizedRaw === 'offline') {
    return { normalizedStatus: 'OFFLINE', reasonCode: 'STATUS_PTERO_OFFLINE' };
  }

  if (normalizedRaw === 'starting' || normalizedRaw === 'stopping' || normalizedRaw === 'installing') {
    return { normalizedStatus: 'TRANSITION', reasonCode: 'STATUS_PTERO_TRANSITION' };
  }

  return { normalizedStatus: 'TRANSITION', reasonCode: 'STATUS_PTERO_IMPORTED' };
};

const isWildcardHost = (value: string | null): boolean => {
  if (!value) {
    return false;
  }

  return value === '0.0.0.0' || value === '::' || value === '::0';
};

const apiFetch = async <T>(url: string, apiKey: string): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, config.PTERO_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`PTERO_HTTP_${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchPteroPaginated = async <T>(baseUrl: string, path: string, apiKey: string): Promise<T[]> => {
  const items: T[] = [];
  let currentPage = 1;

  while (true) {
    const separator = path.includes('?') ? '&' : '?';
    const url = `${baseUrl}${path}${separator}page=${currentPage}`;
    const payload = await apiFetch<PteroListResponse<T>>(url, apiKey);
    const pageItems = Array.isArray(payload.data) ? payload.data : [];
    items.push(...pageItems);

    const totalPages = payload.meta?.pagination?.total_pages ?? currentPage;
    if (currentPage >= totalPages) {
      break;
    }

    currentPage += 1;
  }

  return items;
};

const getSyncPanels = async (): Promise<RuntimePanelRow[]> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT id, name, base_url, api_key_enc
      FROM panels
      WHERE is_enabled = 1
      ORDER BY id ASC
    `
  );

  return rows as RuntimePanelRow[];
};

const updatePanelSyncStatus = async (
  panelId: string,
  status: 'OK' | 'DEGRADED' | 'ERROR',
  errorCode: string | null,
  errorDetail: string | null
): Promise<void> => {
  const pool = getPool();
  const now = new Date();
  await pool.query(
    `
      UPDATE panels
      SET
        last_sync_at = ?,
        sync_status = ?,
        sync_error_code = ?,
        sync_error_detail = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [now, status, errorCode, errorDetail, now, panelId]
  );
};

const getDefaultCheckProfileId = async (): Promise<string | null> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT id
      FROM check_profiles
      WHERE name IN ('default-a2s', 'default-tcp')
      ORDER BY CASE name WHEN 'default-tcp' THEN 0 ELSE 1 END
      LIMIT 1
    `
  );

  return (rows as RuntimeCheckProfileRow[])[0]?.id ?? null;
};

const upsertNode = async (panelId: string, node: PteroNodeEntry): Promise<void> => {
  const attrs = node.attributes;
  const pteroNodeIdInt = safeInteger(attrs?.id);
  const nodeName = safeString(attrs?.name);

  if (pteroNodeIdInt === null || nodeName === null) {
    return;
  }

  const pool = getPool();
  const now = new Date();
  const pteroNodeId = String(pteroNodeIdInt);
  const fqdn = safeString(attrs?.fqdn);
  const location = attrs?.location_id === undefined || attrs.location_id === null ? null : String(attrs.location_id);
  const isEnabled = attrs?.maintenance_mode === true ? 0 : 1;

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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        fqdn_or_ip = VALUES(fqdn_or_ip),
        location = VALUES(location),
        is_enabled = VALUES(is_enabled),
        last_seen_at = VALUES(last_seen_at),
        updated_at = VALUES(updated_at)
    `,
    [randomUUID(), panelId, pteroNodeId, nodeName, fqdn, location, isEnabled, now, now, now]
  );
};

const getPanelNodeMap = async (panelId: string): Promise<Map<string, string>> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT id, ptero_node_id
      FROM nodes
      WHERE panel_id = ?
    `,
    [panelId]
  );

  return new Map((rows as RuntimeNodeRow[]).map((row) => [row.ptero_node_id, row.id]));
};

const upsertServer = async (
  panelId: string,
  server: PteroServerEntry,
  nodeMap: Map<string, string>,
  defaultCheckProfileId: string | null
): Promise<string | null> => {
  const attrs = server.attributes;
  const pteroServerIdInt = safeInteger(attrs?.id);
  const serverName = safeString(attrs?.name);

  if (pteroServerIdInt === null || serverName === null) {
    return null;
  }

  const pteroServerId = String(pteroServerIdInt);
  const identifier = safeString(attrs?.identifier);
  const nodeRef = attrs?.node === undefined || attrs.node === null ? null : nodeMap.get(String(attrs.node)) ?? null;
  const rawStatus = safeString(attrs?.status) ?? 'unknown';
  const isEnabled = attrs?.suspended === true ? 0 : 1;
  const mappedState = mapPteroRuntimeState(rawStatus, isEnabled === 1);

  const pool = getPool();
  const now = new Date();
  const onlineAt = mappedState.normalizedStatus === 'ONLINE' ? now : null;
  const offlineAt = mappedState.normalizedStatus === 'OFFLINE' ? now : null;

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
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, 0, NULL, ?, ?, ?, 'PTERO', NULL, ?, ?, ?, ?, ?, ?, NULL)
      ON DUPLICATE KEY UPDATE
        node_id = VALUES(node_id),
        identifier = VALUES(identifier),
        is_enabled = VALUES(is_enabled),
        ptero_raw_state = VALUES(ptero_raw_state),
        normalized_status = CASE
          WHEN servers.check_profile_id IS NULL OR servers.last_reason_source = 'PTERO'
            THEN VALUES(normalized_status)
          ELSE servers.normalized_status
        END,
        last_reason_code = CASE
          WHEN servers.check_profile_id IS NULL OR servers.last_reason_source = 'PTERO'
            THEN VALUES(last_reason_code)
          ELSE servers.last_reason_code
        END,
        last_reason_source = CASE
          WHEN servers.check_profile_id IS NULL OR servers.last_reason_source = 'PTERO'
            THEN VALUES(last_reason_source)
          ELSE servers.last_reason_source
        END,
        last_check_at = CASE
          WHEN servers.check_profile_id IS NULL OR servers.last_reason_source = 'PTERO'
            THEN VALUES(last_check_at)
          ELSE servers.last_check_at
        END,
        last_status_change_at = CASE
          WHEN (servers.check_profile_id IS NULL OR servers.last_reason_source = 'PTERO')
            AND servers.normalized_status <> VALUES(normalized_status)
            THEN VALUES(last_check_at)
          ELSE servers.last_status_change_at
        END,
        last_online_at = CASE
          WHEN (servers.check_profile_id IS NULL OR servers.last_reason_source = 'PTERO')
            AND VALUES(normalized_status) = 'ONLINE'
            THEN VALUES(last_check_at)
          ELSE servers.last_online_at
        END,
        last_offline_at = CASE
          WHEN (servers.check_profile_id IS NULL OR servers.last_reason_source = 'PTERO')
            AND VALUES(normalized_status) = 'OFFLINE'
            THEN VALUES(last_check_at)
          ELSE servers.last_offline_at
        END,
        updated_at = VALUES(updated_at),
        check_profile_id = COALESCE(servers.check_profile_id, VALUES(check_profile_id))
    `,
    [
      randomUUID(),
      panelId,
      nodeRef,
      pteroServerId,
      identifier,
      serverName,
      defaultCheckProfileId,
      isEnabled,
      rawStatus,
      mappedState.normalizedStatus,
      mappedState.reasonCode,
      now,
      onlineAt,
      offlineAt,
      now,
      now,
      now
    ]
  );

  const [rows] = await pool.query(
    `
      SELECT id
      FROM servers
      WHERE panel_id = ?
        AND ptero_server_id = ?
      LIMIT 1
    `,
    [panelId, pteroServerId]
  );

  return (rows as Array<{ id: string }>)[0]?.id ?? null;
};

const upsertPteroEndpoint = async (
  serverId: string,
  panelId: string,
  allocation: PteroAllocationEntry,
  nodeHostFallback: string | null,
  protocol: EndpointProtocol,
  purpose: EndpointPurpose
): Promise<void> => {
  const attrs = allocation.attributes;
  const port = safeInteger(attrs?.port);
  const ip = safeString(attrs?.ip);

  if (port === null || ip === null) {
    return;
  }

  const directHost = safeString(attrs?.ip_alias) ?? safeString(attrs?.alias) ?? ip;
  const host = isWildcardHost(directHost) && nodeHostFallback ? nodeHostFallback : directHost;
  const allocationId = attrs?.id === undefined || attrs.id === null ? null : String(attrs.id);
  const isPrimary = attrs?.is_default === true || (attrs?.is_default === undefined && attrs?.assigned === true);
  const now = new Date();
  const pool = getPool();

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
      ) VALUES (?, ?, 'PTERO_ALLOCATION', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        label = VALUES(label),
        is_primary = VALUES(is_primary),
        is_enabled = VALUES(is_enabled),
        meta = VALUES(meta),
        updated_at = VALUES(updated_at)
    `,
    [
      randomUUID(),
      serverId,
      isPrimary ? `Primary ${purpose} Allocation` : `${purpose} Allocation ${port}`,
      host,
      port,
      protocol,
      purpose,
      isPrimary ? 1 : 0,
      JSON.stringify({
        source: 'pterodactyl',
        panel_id: panelId,
        allocation_id: allocationId,
        ip,
        ip_alias: safeString(attrs?.ip_alias),
        alias: safeString(attrs?.alias),
        assigned: attrs?.assigned === true,
        host_fallback_used: isWildcardHost(directHost) && Boolean(nodeHostFallback)
      }),
      now,
      now
    ]
  );
};

const getNodeHostByPteroNodeId = (nodes: PteroNodeEntry[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const node of nodes) {
    const nodeId = safeInteger(node.attributes?.id);
    const fqdn = safeString(node.attributes?.fqdn);
    if (nodeId === null || !fqdn) {
      continue;
    }

    map.set(String(nodeId), fqdn);
  }

  return map;
};

const fetchServerAllocations = async (
  baseUrl: string,
  apiKey: string,
  server: PteroServerEntry
): Promise<PteroAllocationEntry[]> => {
  const fromRoot = Array.isArray(server.relationships?.allocations?.data)
    ? server.relationships.allocations.data
    : [];
  const fromAttributes = Array.isArray(server.attributes?.relationships?.allocations?.data)
    ? server.attributes.relationships.allocations.data
    : [];
  const existing = fromRoot.length > 0 ? fromRoot : fromAttributes;

  if (existing.length > 0) {
    return existing;
  }

  const serverId = safeInteger(server.attributes?.id);
  if (serverId === null) {
    return [];
  }

  const detail = await apiFetch<PteroServerDetailPayload>(
    `${baseUrl}/api/application/servers/${serverId}?include=allocations`,
    apiKey
  );

  const detailFromRoot = Array.isArray(detail.relationships?.allocations?.data)
    ? detail.relationships.allocations.data
    : [];
  const detailFromAttributes = Array.isArray(detail.attributes?.relationships?.allocations?.data)
    ? detail.attributes.relationships.allocations.data
    : [];

  return detailFromRoot.length > 0 ? detailFromRoot : detailFromAttributes;
};

const syncSinglePanel = async (
  panel: RuntimePanelRow,
  logger: Logger,
  runId: string,
  defaultCheckProfileId: string | null
): Promise<void> => {
  const baseUrl = normalizePanelBaseUrl(panel.base_url);
  const apiKey = panel.api_key_enc.trim();

  if (!baseUrl || !apiKey) {
    await updatePanelSyncStatus(panel.id, 'ERROR', 'PTERO_SYNC_MISSING_CONFIG', 'Panel URL or API key is missing');
    return;
  }

  try {
    const nodes = await fetchPteroPaginated<PteroNodeEntry>(baseUrl, '/api/application/nodes?per_page=100', apiKey);
    for (const node of nodes) {
      await upsertNode(panel.id, node);
    }
    const nodeHostByPteroNodeId = getNodeHostByPteroNodeId(nodes);

    const nodeMap = await getPanelNodeMap(panel.id);
    const servers = await fetchPteroPaginated<PteroServerEntry>(
      baseUrl,
      '/api/application/servers?include=allocations&per_page=100',
      apiKey
    );

    let importedServers = 0;
    let importedEndpoints = 0;

    for (const server of servers) {
      const localServerId = await upsertServer(panel.id, server, nodeMap, defaultCheckProfileId);
      if (!localServerId) {
        continue;
      }

      importedServers += 1;

      const allocations = await fetchServerAllocations(baseUrl, apiKey, server);
      const serverNodeId = safeInteger(server.attributes?.node);
      const nodeHostFallback = serverNodeId === null ? null : nodeHostByPteroNodeId.get(String(serverNodeId)) ?? null;

      for (const allocation of allocations) {
        await upsertPteroEndpoint(localServerId, panel.id, allocation, nodeHostFallback, 'TCP', 'GAME');
        importedEndpoints += 1;
        await upsertPteroEndpoint(localServerId, panel.id, allocation, nodeHostFallback, 'UDP', 'QUERY');
        importedEndpoints += 1;
      }
    }

    await updatePanelSyncStatus(panel.id, 'OK', null, null);

    logger.info('pterodactyl panel sync completed', { job_id: runId }, {
      panel_id: panel.id,
      panel_name: panel.name,
      imported_nodes: nodes.length,
      imported_servers: importedServers,
      imported_endpoints: importedEndpoints
    });
  } catch (error) {
    const detail = String(error);
    await updatePanelSyncStatus(panel.id, 'ERROR', 'PTERO_SYNC_FAILED', detail);
    logger.warn('pterodactyl panel sync failed', { job_id: runId }, {
      panel_id: panel.id,
      panel_name: panel.name,
      error: detail
    });
  }
};

export class PanelSyncRunner {
  private readonly logger: Logger;
  private lastRunAtMs = 0;

  public constructor(
    private readonly workerLogger: Logger,
    private readonly jobId: string
  ) {
    this.logger = createLogger('worker.panel-sync-runner');
  }

  public async runIfDue(): Promise<void> {
    const nowMs = Date.now();
    if (nowMs - this.lastRunAtMs < config.WORKER_PANEL_SYNC_INTERVAL_MS) {
      return;
    }

    this.lastRunAtMs = nowMs;
    await this.runOnce();
  }

  public async runOnce(): Promise<void> {
    const runId = randomUUID();
    const panels = await getSyncPanels();
    const defaultCheckProfileId = await getDefaultCheckProfileId();

    this.logger.info('panel sync run started', { job_id: this.jobId }, { run_id: runId, panel_count: panels.length });

    for (const panel of panels) {
      await syncSinglePanel(panel, this.workerLogger, runId, defaultCheckProfileId);
    }

    this.logger.info('panel sync run finished', { job_id: this.jobId }, { run_id: runId, panel_count: panels.length });
  }
}