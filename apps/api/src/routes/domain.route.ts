import { Router, type Request, type Router as RouterType } from 'express';
import {
  createRole,
  createServerPreset,
  createUser,
    deleteRole,
    deleteUser,
    findUserById,
    findRoleById,
    findServerPresetById,
    listRoles,
    listServerPresets,
    listUsers,
    setUserRoles,
    updateRole,
    updateServerPreset,
    updateUser,
    listGameLabels,
    createGameLabel,
    updateGameLabel,
    deleteGameLabel,
    getAppSettingsByScope,
    upsertAppSettingsByScope,
  createAlertChannel,
  createAlertPolicy,
  createCheckProfile,
  createNode,
  createPanel,
  createServerEndpoint,
  deletePanel,
  deleteNode,
  deleteEndpoint,
  findIncidentById,
  findNodeById,
  findPanelById,
  listAdapters,
  listAlertChannels,
  listAlertEvents,
  listAlertPolicies,
  listCheckProfiles,
  listNodes,
  listPanels,
  listServerEndpoints,
  listServerHistory,
  listServerIncidents,
  markPanelSyncQueued,
  updateAlertChannel,
  updateAlertPolicy,
  updateCheckProfile,
  updateNode,
  updateEndpoint,
  updatePanel,
  getPool,
  type CreateAlertChannelInput,
  type CreateAlertPolicyInput,
  type CreateCheckProfileInput,
  type CreateNodeInput,
  type CreateEndpointInput,
  type CreatePanelInput,
  type UpdateAlertChannelInput,
  type UpdateAlertPolicyInput,
  type UpdateCheckProfileInput,
  type UpdateNodeInput,
  type UpdateEndpointInput,
  type UpdatePanelInput,
  type CreateGameLabelInput,
  type UpdateGameLabelInput
  ,
  type CreateServerPresetInput,
  type UpdateServerPresetInput,
  deleteServerPreset
} from '@gm/db';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import bcrypt from 'bcryptjs';
import { config } from '@gm/config';
import { randomUUID } from 'node:crypto';
import {
  decryptAlertConfig,
  encryptAlertConfig,
  normalizeAlertConfigInput,
  parseAlertMasterKeyring
} from '@gm/shared';

type PanelAuthRow = {
  id: string;
  base_url: string;
  api_key_enc: string;
  is_enabled: number;
};

type PteroNodeEntry = {
  attributes?: {
    id?: number;
    name?: string;
    fqdn?: string | null;
    location_id?: number | null;
    maintenance_mode?: boolean;
  };
};

type PteroNodeListPayload = {
  data?: PteroNodeEntry[];
  meta?: {
    pagination?: {
      current_page?: number;
      total_pages?: number;
    };
  };
};

type PteroNodeDetailPayload = {
  attributes?: {
    id?: number;
    name?: string;
    fqdn?: string | null;
  };
};

type RuntimeNodeRow = {
  id: string;
  ptero_node_id: string;
};

type RuntimeCheckProfileRow = {
  id: string;
};

type AlertChannelSecretRow = {
  id: string;
  type: 'DISCORD_WEBHOOK' | 'EMAIL_SMTP';
  name: string;
  config_enc: string;
  config_kid: string;
  is_enabled: number;
};

type EndpointProtocol = 'TCP' | 'UDP';
type EndpointPurpose = 'GAME' | 'QUERY';

type PteroAllocationEntry = {
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

type NodeIdentifierKey = 'ptero_node_id' | 'name' | 'fqdn';

type RuntimeStatus = 'ONLINE' | 'OFFLINE' | 'TRANSITION' | 'MAINTENANCE';

const ROLE_PERMISSIONS_SETTING_PREFIX = 'role_permissions__';

export const domainRoute: RouterType = Router();

const parseSingleQueryParam = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseBooleanQueryParam = (value: unknown): boolean | undefined => {
  const parsed = parseSingleQueryParam(value);
  if (!parsed) {
    return undefined;
  }

  if (parsed === 'true' || parsed === '1') {
    return true;
  }

  if (parsed === 'false' || parsed === '0') {
    return false;
  }

  return undefined;
};

const parseIsoDateQueryParam = (value: unknown): Date | undefined => {
  const parsed = parseSingleQueryParam(value);
  if (!parsed) {
    return undefined;
  }

  const date = new Date(parsed);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const parsePositiveInteger = (value: unknown): number | undefined => {
  const parsed = parseSingleQueryParam(value);
  if (!parsed) {
    return undefined;
  }

  const numeric = Number(parsed);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return undefined;
  }

  return numeric;
};

const isDuplicateEntryError = (error: unknown): boolean => {
  const dbError = error as { code?: string; message?: string };
  if (dbError?.code === 'ER_DUP_ENTRY') {
    return true;
  }

  return typeof dbError?.message === 'string' && dbError.message.includes('Duplicate entry');
};

const ensureObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

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

const parsePermissionList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  ).sort((left, right) => left.localeCompare(right));
};

const parseRolePermissionsSetting = (value: string | boolean | undefined): string[] => {
  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsePermissionList(parsed);
  } catch {
    return [];
  }
};

const getRolePermissionsMap = async (): Promise<Map<string, string[]>> => {
  const settings = await getAppSettingsByScope('roles');
  const map = new Map<string, string[]>();

  for (const [settingKey, settingValue] of Object.entries(settings)) {
    if (!settingKey.startsWith(ROLE_PERMISSIONS_SETTING_PREFIX)) {
      continue;
    }

    const roleKey = settingKey.slice(ROLE_PERMISSIONS_SETTING_PREFIX.length).trim().toUpperCase();
    if (!roleKey) {
      continue;
    }

    map.set(roleKey, parseRolePermissionsSetting(settingValue));
  }

  return map;
};

const upsertRolePermissionsByKey = async (roleKey: string, permissions: string[]): Promise<void> => {
  const normalizedRoleKey = roleKey.trim().toUpperCase();
  if (!normalizedRoleKey) {
    return;
  }

  await upsertAppSettingsByScope('roles', {
    [`${ROLE_PERMISSIONS_SETTING_PREFIX}${normalizedRoleKey}`]: JSON.stringify(parsePermissionList(permissions))
  });
};

const listRolesWithPermissions = async (): Promise<Array<{ id: string; key: string; name: string; permissions: string[] }>> => {
  const [roles, permissionsMap] = await Promise.all([listRoles(), getRolePermissionsMap()]);

  return roles.map((role) => ({
    ...role,
    permissions: permissionsMap.get(role.key) ?? []
  }));
};

const isWildcardHost = (value: string | null): boolean => {
  if (!value) {
    return false;
  }

  return value === '0.0.0.0' || value === '::' || value === '::0';
};

const alertKeyring = parseAlertMasterKeyring(config.ALERT_CHANNEL_MASTER_KEYS);

const ensureAlertActiveKey = (): { kid: string; key: string } | null => {
  const kid = config.ALERT_CHANNEL_ACTIVE_KID;
  const key = alertKeyring[kid];
  if (!key) {
    return null;
  }

  return { kid, key };
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

const normalizePanelBaseUrl = (value: string): string => value.trim().replace(/\/+$/, '');

const getPanelAuthById = async (panelId: string): Promise<PanelAuthRow | null> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `
      SELECT id, base_url, api_key_enc, is_enabled
      FROM panels
      WHERE id = ?
      LIMIT 1
    `,
    [panelId]
  );

  const first = (rows as PanelAuthRow[])[0];
  return first ?? null;
};

const fetchPtero = async (baseUrl: string, apiKey: string, path: string): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, config.PTERO_API_TIMEOUT_MS);

  try {
    const response = await fetch(`${normalizePanelBaseUrl(baseUrl)}${path}`, {
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

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const fetchPteroPaginated = async <T>(baseUrl: string, apiKey: string, path: string): Promise<T[]> => {
  const items: T[] = [];
  let currentPage = 1;

  while (true) {
    const separator = path.includes('?') ? '&' : '?';
    const payload = (await fetchPtero(
      baseUrl,
      apiKey,
      `${path}${separator}page=${currentPage}`
    )) as PteroNodeListPayload & { data?: T[] };

    const entries = Array.isArray(payload.data) ? payload.data : [];
    items.push(...entries);

    const totalPages = payload.meta?.pagination?.total_pages ?? currentPage;
    if (currentPage >= totalPages) {
      break;
    }

    currentPage += 1;
  }

  return items;
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

const upsertServerFromPtero = async (
  panelId: string,
  server: PteroServerEntry,
  nodeMap: Map<string, string>,
  defaultCheckProfileId: string | null
): Promise<string | null> => {
  const attrs = server.attributes;
  const pteroServerId = typeof attrs?.id === 'number' ? String(attrs.id) : '';
  const serverName = typeof attrs?.name === 'string' ? attrs.name.trim() : '';

  if (!pteroServerId || !serverName) {
    return null;
  }

  const pool = getPool();
  const now = new Date();
  const identifier = typeof attrs?.identifier === 'string' && attrs.identifier.trim() ? attrs.identifier.trim() : null;
  const nodeRef = attrs?.node === undefined || attrs.node === null ? null : nodeMap.get(String(attrs.node)) ?? null;
  const rawStatus = typeof attrs?.status === 'string' && attrs.status.trim() ? attrs.status.trim() : 'unknown';
  const isEnabled = attrs?.suspended === true ? 0 : 1;
  const mappedState = mapPteroRuntimeState(rawStatus, isEnabled === 1);
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
        name = VALUES(name),
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

  const detail = (await fetchPtero(
    baseUrl,
    apiKey,
    `/api/application/servers/${serverId}?include=allocations`
  )) as PteroServerDetailPayload;

  const detailFromRoot = Array.isArray(detail.relationships?.allocations?.data)
    ? detail.relationships.allocations.data
    : [];
  const detailFromAttributes = Array.isArray(detail.attributes?.relationships?.allocations?.data)
    ? detail.attributes.relationships.allocations.data
    : [];

  return detailFromRoot.length > 0 ? detailFromRoot : detailFromAttributes;
};

const resolvePanelValidationInput = async (body: Record<string, unknown>): Promise<{ panelId?: string; baseUrl: string; apiKey: string }> => {
  const panelId = typeof body.panel_id === 'string' ? body.panel_id : undefined;
  const panel = panelId ? await getPanelAuthById(panelId) : null;

  if (panelId && !panel) {
    throw { code: 'API_NOT_FOUND', status: 404, message: 'Panel not found' };
  }

  const baseUrlDraft = typeof body.base_url === 'string' ? body.base_url.trim() : '';
  const apiKeyDraft = typeof body.api_key === 'string' ? body.api_key.trim() : '';
  const baseUrl = baseUrlDraft || panel?.base_url || '';
  const apiKey = apiKeyDraft || panel?.api_key_enc || '';

  if (!baseUrl || !apiKey) {
    throw { code: 'API_VALIDATION_ERROR', status: 400, message: 'Missing panel base_url or api_key' };
  }

  return { panelId, baseUrl, apiKey };
};

const classifyPanelValidationError = (error: unknown): { code: string; status: number; message: string } => {
  const rawMessage = String(error);
  const normalized = rawMessage.toUpperCase();

  if (normalized.includes('PTERO_HTTP_401')) {
    return {
      code: 'API_UPSTREAM_UNAUTHORIZED',
      status: 412,
      message: `Panel validation failed (unauthorized): ${rawMessage}`
    };
  }

  if (normalized.includes('PTERO_HTTP_403')) {
    return {
      code: 'API_UPSTREAM_FORBIDDEN',
      status: 412,
      message: `Panel validation failed (forbidden): ${rawMessage}`
    };
  }

  if (normalized.includes('ABORTERROR') || normalized.includes('TIMEOUT')) {
    return {
      code: 'API_UPSTREAM_TIMEOUT',
      status: 412,
      message: `Panel validation failed (timeout): ${rawMessage}`
    };
  }

  if (
    normalized.includes('FETCH FAILED') ||
    normalized.includes('ECONNREFUSED') ||
    normalized.includes('ENOTFOUND') ||
    normalized.includes('EHOSTUNREACH') ||
    normalized.includes('ETIMEDOUT')
  ) {
    return {
      code: 'API_UPSTREAM_UNREACHABLE',
      status: 412,
      message: `Panel validation failed (unreachable): ${rawMessage}`
    };
  }

  return {
    code: 'API_PRECONDITION_FAILED',
    status: 412,
    message: `Panel validation failed: ${rawMessage}`
  };
};

const normalizeIdentifier = (value: string): string => value.trim().toLowerCase();

const toHostCandidate = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return normalizeIdentifier(trimmed.replace(/\/+$/, ''));
  }
};

const matchNodeByIdentifier = (
  attrs: PteroNodeDetailPayload['attributes'],
  identifierKey: NodeIdentifierKey,
  identifierValue: string
): boolean => {
  if (!attrs) {
    return false;
  }

  if (identifierKey === 'ptero_node_id') {
    return String(attrs.id ?? '') === identifierValue;
  }

  if (identifierKey === 'name') {
    return normalizeIdentifier(String(attrs.name ?? '')) === normalizeIdentifier(identifierValue);
  }

  return toHostCandidate(String(attrs.fqdn ?? '')) === toHostCandidate(identifierValue);
};

const resolveNodeValidationInput = async (
  body: Record<string, unknown>
): Promise<{ panelId: string; resolvedNodeId: string; matchedBy: NodeIdentifierKey }> => {
  const existingNodeId = typeof body.node_id === 'string' ? body.node_id : '';
  const existingNode = existingNodeId ? await findNodeById(existingNodeId) : null;

  const panelIdFromBody = typeof body.panel_id === 'string' ? body.panel_id.trim() : '';
  const panelId = panelIdFromBody || existingNode?.panel_id || '';

  const identifierKeyRaw = typeof body.identifier_key === 'string' ? body.identifier_key : '';
  const identifierKey: NodeIdentifierKey =
    identifierKeyRaw === 'name' || identifierKeyRaw === 'fqdn' || identifierKeyRaw === 'ptero_node_id'
      ? identifierKeyRaw
      : 'ptero_node_id';

  const identifierValueFromBody = typeof body.identifier_value === 'string' ? body.identifier_value.trim() : '';
  const pteroNodeIdFromBody = typeof body.ptero_node_id === 'string' ? body.ptero_node_id.trim() : '';
  const identifierValue = identifierValueFromBody || pteroNodeIdFromBody || existingNode?.ptero_node_id || '';

  if (!panelId || !identifierValue) {
    throw { code: 'API_VALIDATION_ERROR', status: 400, message: 'Missing panel_id or node identifier' };
  }

  const panelInput = await resolvePanelValidationInput({ panel_id: panelId });

  if (identifierKey === 'ptero_node_id') {
    try {
      const nodePayload = (await fetchPtero(
        panelInput.baseUrl,
        panelInput.apiKey,
        `/api/application/nodes/${encodeURIComponent(identifierValue)}`
      )) as PteroNodeDetailPayload;

      if (nodePayload.attributes?.id) {
        return {
          panelId,
          resolvedNodeId: String(nodePayload.attributes.id),
          matchedBy: 'ptero_node_id'
        };
      }
    } catch {
    }
  }

  let currentPage = 1;
  while (true) {
    const payload = (await fetchPtero(
      panelInput.baseUrl,
      panelInput.apiKey,
      `/api/application/nodes?per_page=100&page=${currentPage}`
    )) as PteroNodeListPayload;

    const entries = Array.isArray(payload.data) ? payload.data : [];
    const matched = entries.find((entry) => matchNodeByIdentifier(entry.attributes, identifierKey, identifierValue));
    const matchedId = matched?.attributes?.id;

    if (typeof matchedId === 'number') {
      return {
        panelId,
        resolvedNodeId: String(matchedId),
        matchedBy: identifierKey
      };
    }

    const totalPages = payload.meta?.pagination?.total_pages ?? currentPage;
    if (currentPage >= totalPages) {
      break;
    }

    currentPage += 1;
  }

  throw { code: 'API_PRECONDITION_FAILED', status: 412, message: 'Node is not reachable on panel' };
};

const markNodeReachableNow = async (nodeId: string): Promise<void> => {
  const pool = getPool();
  const now = new Date();
  await pool.query(
    `
      UPDATE nodes
      SET last_seen_at = ?, updated_at = ?
      WHERE id = ?
    `,
    [now, now, nodeId]
  );
};

const syncNodesForPanel = async (
  panelId: string,
  baseUrl: string,
  apiKey: string
): Promise<{ importedNodes: number; importedServers: number; importedEndpoints: number }> => {
  const pool = getPool();
  let currentPage = 1;
  let importedNodes = 0;
  const importedNodeEntries: PteroNodeEntry[] = [];

  while (true) {
    const payload = (await fetchPtero(
      baseUrl,
      apiKey,
      `/api/application/nodes?per_page=100&page=${currentPage}`
    )) as PteroNodeListPayload;

    const entries = Array.isArray(payload.data) ? payload.data : [];
    importedNodeEntries.push(...entries);
    const now = new Date();

    for (const entry of entries) {
      const attrs = entry.attributes;
      const pteroNodeId = typeof attrs?.id === 'number' ? String(attrs.id) : '';
      const name = typeof attrs?.name === 'string' ? attrs.name.trim() : '';
      if (!pteroNodeId || !name) {
        continue;
      }

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
        [
          randomUUID(),
          panelId,
          pteroNodeId,
          name,
          typeof attrs?.fqdn === 'string' ? attrs.fqdn : null,
          attrs?.location_id === undefined || attrs.location_id === null ? null : String(attrs.location_id),
          attrs?.maintenance_mode === true ? 0 : 1,
          now,
          now,
          now
        ]
      );

      importedNodes += 1;
    }

    const totalPages = payload.meta?.pagination?.total_pages ?? currentPage;
    if (currentPage >= totalPages) {
      break;
    }

    currentPage += 1;
  }

  const nodeHostByPteroNodeId = getNodeHostByPteroNodeId(importedNodeEntries);

  const nodeMap = await getPanelNodeMap(panelId);
  const defaultCheckProfileId = await getDefaultCheckProfileId();
  const servers = await fetchPteroPaginated<PteroServerEntry>(
    baseUrl,
    apiKey,
    '/api/application/servers?include=allocations&per_page=100'
  );

  let importedServers = 0;
  let importedEndpoints = 0;

  for (const server of servers) {
    const localServerId = await upsertServerFromPtero(panelId, server, nodeMap, defaultCheckProfileId);
    if (!localServerId) {
      continue;
    }

    importedServers += 1;

    const allocations = await fetchServerAllocations(baseUrl, apiKey, server);
    const serverNodeId = safeInteger(server.attributes?.node);
    const nodeHostFallback = serverNodeId === null ? null : nodeHostByPteroNodeId.get(String(serverNodeId)) ?? null;

    for (const allocation of allocations) {
      await upsertPteroEndpoint(localServerId, panelId, allocation, nodeHostFallback, 'TCP', 'GAME');
      importedEndpoints += 1;
      await upsertPteroEndpoint(localServerId, panelId, allocation, nodeHostFallback, 'UDP', 'QUERY');
      importedEndpoints += 1;
    }
  }

  return { importedNodes, importedServers, importedEndpoints };
};

const requireAdmin = [authMiddleware, requireRole('ADMIN')] as const;
const requireUser = [authMiddleware] as const;

domainRoute.get('/panels', ...requireUser, async (req, res, next) => {
  try {
    const isEnabled = parseBooleanQueryParam(req.query.is_enabled);
    const data = await listPanels({ is_enabled: isEnabled });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/panels', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as Partial<CreatePanelInput> | null;
    if (!body || typeof body.name !== 'string' || typeof body.base_url !== 'string' || typeof body.api_key !== 'string') {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid panel payload' });
      return;
    }

    await resolvePanelValidationInput({
      base_url: body.base_url,
      api_key: body.api_key
    });

    const data = await createPanel({
      name: body.name,
      base_url: body.base_url,
      api_key: body.api_key,
      is_enabled: typeof body.is_enabled === 'boolean' ? body.is_enabled : true,
      import_mode: body.import_mode === 'WHITELIST' ? 'WHITELIST' : 'ALL',
      import_filter: body.import_filter && typeof body.import_filter === 'object' ? body.import_filter : null
    });

    try {
      await syncNodesForPanel(data.id, data.base_url, body.api_key);
    } catch {
    }

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/panels/:panelId', ...requireUser, async (req, res, next) => {
  try {
    const data = await findPanelById(req.params.panelId);
    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Panel not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.patch('/panels/:panelId', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as UpdatePanelInput | null;
    if (!body) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid panel payload' });
      return;
    }

    await resolvePanelValidationInput({
      panel_id: req.params.panelId,
      base_url: body.base_url,
      api_key: body.api_key
    });

    const data = await updatePanel(req.params.panelId, body);
    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Panel not found' });
      return;
    }

    try {
      const panelAuth = await resolvePanelValidationInput({ panel_id: data.id });
      await syncNodesForPanel(data.id, panelAuth.baseUrl, panelAuth.apiKey);
    } catch {
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.delete('/panels/:panelId', ...requireAdmin, async (req, res, next) => {
  try {
    const ok = await deletePanel(req.params.panelId);
    if (!ok) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Panel not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/panels/:panelId/sync', ...requireAdmin, async (req, res, next) => {
  try {
    const ok = await markPanelSyncQueued(req.params.panelId);
    if (!ok) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Panel not found' });
      return;
    }

    const panelInput = await resolvePanelValidationInput({ panel_id: req.params.panelId });
    const syncResult = await syncNodesForPanel(req.params.panelId, panelInput.baseUrl, panelInput.apiKey);

    res.status(202).json({
      queued: true,
      synced_nodes: syncResult.importedNodes,
      synced_servers: syncResult.importedServers,
      synced_endpoints: syncResult.importedEndpoints
    });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/panels/validate-config', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body);
    if (!body) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid panel validation payload' });
      return;
    }

    const panelInput = await resolvePanelValidationInput(body);
    const payload = (await fetchPtero(
      panelInput.baseUrl,
      panelInput.apiKey,
      '/api/application/nodes?per_page=1&page=1'
    )) as PteroNodeListPayload;

    res.json({
      data: {
        ok: true,
        node_count_hint: Array.isArray(payload.data) ? payload.data.length : 0
      }
    });
  } catch (error) {
    next(classifyPanelValidationError(error));
  }
});

domainRoute.post('/nodes/validate-config', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body);
    if (!body) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid node validation payload' });
      return;
    }

    const resolved = await resolveNodeValidationInput(body);

    res.json({ data: { ok: true, node_id: resolved.resolvedNodeId, matched_by: resolved.matchedBy } });
  } catch (error) {
    next({
      code: 'API_PRECONDITION_FAILED',
      status: 412,
      message: `Node validation failed: ${String(error)}`
    });
  }
});

domainRoute.get('/nodes', ...requireUser, async (req, res, next) => {
  try {
    const panelId = parseSingleQueryParam(req.query.panel_id);
    const isEnabled = parseBooleanQueryParam(req.query.is_enabled);
    const data = await listNodes({ panel_id: panelId, is_enabled: isEnabled });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/nodes/:nodeId', ...requireUser, async (req, res, next) => {
  try {
    const data = await findNodeById(req.params.nodeId);
    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Node not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/nodes', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as (Partial<CreateNodeInput> & { identifier_key?: string; identifier_value?: string }) | null;
    if (!body || typeof body.panel_id !== 'string' || typeof body.ptero_node_id !== 'string' || typeof body.name !== 'string') {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid node payload' });
      return;
    }

    const resolved = await resolveNodeValidationInput({
      panel_id: body.panel_id,
      ptero_node_id: body.ptero_node_id,
      identifier_key: body.identifier_key,
      identifier_value: body.identifier_value
    });

    const data = await createNode({
      panel_id: resolved.panelId,
      ptero_node_id: resolved.resolvedNodeId,
      name: body.name,
      fqdn_or_ip: typeof body.fqdn_or_ip === 'string' ? body.fqdn_or_ip : null,
      location: typeof body.location === 'string' ? body.location : null,
      is_enabled: typeof body.is_enabled === 'boolean' ? body.is_enabled : true
    });

    await markNodeReachableNow(data.id);

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.patch('/nodes/:nodeId', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as (UpdateNodeInput & { identifier_key?: string; identifier_value?: string }) | null;
    if (!body) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid node payload' });
      return;
    }

    const resolved = await resolveNodeValidationInput({
      node_id: req.params.nodeId,
      panel_id: body.panel_id,
      ptero_node_id: body.ptero_node_id,
      identifier_key: body.identifier_key,
      identifier_value: body.identifier_value
    });

    const updateInput: UpdateNodeInput = {
      panel_id: resolved.panelId,
      ptero_node_id: resolved.resolvedNodeId,
      name: typeof body.name === 'string' ? body.name : undefined,
      fqdn_or_ip:
        typeof body.fqdn_or_ip === 'string' || body.fqdn_or_ip === null
          ? body.fqdn_or_ip
          : undefined,
      location:
        typeof body.location === 'string' || body.location === null
          ? body.location
          : undefined,
      is_enabled: typeof body.is_enabled === 'boolean' ? body.is_enabled : undefined
    };

    const data = await updateNode(req.params.nodeId, updateInput);
    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Node not found' });
      return;
    }

    await markNodeReachableNow(data.id);

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.delete('/nodes/:nodeId', ...requireAdmin, async (req, res, next) => {
  try {
    const deleted = await deleteNode(req.params.nodeId);
    if (!deleted) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Node not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/servers/:serverId/endpoints', async (req, res, next) => {
  try {
    const data = await listServerEndpoints(req.params.serverId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/servers/:serverId/endpoints', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as Partial<CreateEndpointInput> | null;
    if (!body || typeof body.label !== 'string' || typeof body.host !== 'string' || typeof body.port !== 'number') {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid endpoint payload' });
      return;
    }

    const protocol =
      body.protocol === 'TCP' || body.protocol === 'UDP' || body.protocol === 'HTTP' || body.protocol === 'HTTPS'
        ? body.protocol
        : undefined;
    const purpose =
      body.purpose === 'GAME' ||
      body.purpose === 'QUERY' ||
      body.purpose === 'HTTP' ||
      body.purpose === 'RCON' ||
      body.purpose === 'OTHER'
        ? body.purpose
        : undefined;

    if (!protocol || !purpose) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid protocol or purpose' });
      return;
    }

    const data = await createServerEndpoint(req.params.serverId, {
      label: body.label,
      host: body.host,
      port: body.port,
      protocol,
      purpose,
      is_primary: body.is_primary,
      is_enabled: body.is_enabled,
      meta: ensureObject(body.meta)
    });

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.patch('/endpoints/:endpointId', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as UpdateEndpointInput | null;
    if (!body) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid endpoint payload' });
      return;
    }

    const data = await updateEndpoint(req.params.endpointId, body);
    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Endpoint not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.delete('/endpoints/:endpointId', ...requireAdmin, async (req, res, next) => {
  try {
    const deleted = await deleteEndpoint(req.params.endpointId);
    if (!deleted) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Endpoint not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/servers/:serverId/history', async (req, res, next) => {
  try {
    const from = parseIsoDateQueryParam(req.query.from);
    const to = parseIsoDateQueryParam(req.query.to);
    const data = await listServerHistory(req.params.serverId, { from, to });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/servers/:serverId/incidents', async (req, res, next) => {
  try {
    const from = parseIsoDateQueryParam(req.query.from);
    const to = parseIsoDateQueryParam(req.query.to);
    const data = await listServerIncidents(req.params.serverId, { from, to });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/incidents/:incidentId', ...requireUser, async (req, res, next) => {
  try {
    const data = await findIncidentById(req.params.incidentId);
    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Incident not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/adapters', ...requireUser, async (_req, res, next) => {
  try {
    const data = await listAdapters();
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/check-profiles', ...requireUser, async (_req, res, next) => {
  try {
    const data = await listCheckProfiles();
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/check-profiles', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as Partial<CreateCheckProfileInput> | null;
    if (!body || typeof body.name !== 'string' || !ensureObject(body.rules)) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid check-profile payload' });
      return;
    }

    const data = await createCheckProfile({
      name: body.name,
      description: typeof body.description === 'string' ? body.description : null,
      rules: ensureObject(body.rules) ?? {}
    });

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.patch('/check-profiles/:profileId', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as UpdateCheckProfileInput | null;
    if (!body) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid check-profile payload' });
      return;
    }

    const data = await updateCheckProfile(req.params.profileId, {
      ...body,
      rules: body.rules ? ensureObject(body.rules) ?? {} : undefined
    });

    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Check profile not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/alert-channels', ...requireUser, async (_req, res, next) => {
  try {
    const data = await listAlertChannels();
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/alert-channels', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as Partial<CreateAlertChannelInput> | null;
    if (!body || typeof body.type !== 'string' || typeof body.name !== 'string' || typeof body.config_enc !== 'string') {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid alert-channel payload' });
      return;
    }

    if (!['DISCORD_WEBHOOK', 'EMAIL_SMTP'].includes(body.type)) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid channel type' });
      return;
    }

    const activeSecret = ensureAlertActiveKey();
    if (!activeSecret) {
      next({ code: 'API_PRECONDITION_FAILED', status: 412, message: 'Alert secret keyring is not configured' });
      return;
    }

    const normalizedConfig = normalizeAlertConfigInput(body.config_enc);
    if (!normalizedConfig) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid alert channel config' });
      return;
    }

    const data = await createAlertChannel({
      type: body.type,
      name: body.name,
      config_enc: encryptAlertConfig(normalizedConfig, activeSecret.kid, activeSecret.key),
      config_kid: activeSecret.kid,
      is_enabled: body.is_enabled
    });

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.patch('/alert-channels/:channelId', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as UpdateAlertChannelInput | null;
    if (!body) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid alert-channel payload' });
      return;
    }

    const activeSecret = ensureAlertActiveKey();
    if (!activeSecret) {
      next({ code: 'API_PRECONDITION_FAILED', status: 412, message: 'Alert secret keyring is not configured' });
      return;
    }

    const updateInput: UpdateAlertChannelInput = { ...body };
    if (typeof body.config_enc === 'string') {
      const normalizedConfig = normalizeAlertConfigInput(body.config_enc);
      if (!normalizedConfig) {
        next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid alert channel config' });
        return;
      }

      updateInput.config_enc = encryptAlertConfig(normalizedConfig, activeSecret.kid, activeSecret.key);
      updateInput.config_kid = activeSecret.kid;
    }

    const data = await updateAlertChannel(req.params.channelId, updateInput);
    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Alert channel not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/alert-channels/rotate-secrets', ...requireAdmin, async (_req, res, next) => {
  try {
    const activeSecret = ensureAlertActiveKey();
    if (!activeSecret) {
      next({ code: 'API_PRECONDITION_FAILED', status: 412, message: 'Alert secret keyring is not configured' });
      return;
    }

    const pool = getPool();
    const [rowsRaw] = await pool.query(
      `
        SELECT id, config_enc, config_kid
        FROM alert_channels
        ORDER BY id ASC
      `
    );
    const rows = rowsRaw as Array<{ id: string; config_enc: string; config_kid: string }>;

    let rotatedCount = 0;

    for (const row of rows) {
      const decrypted = decryptAlertConfig(row.config_enc, row.config_kid, alertKeyring);
      if (!decrypted) {
        continue;
      }

      const shouldRotate = row.config_kid !== activeSecret.kid || !row.config_enc.startsWith('gmse:v1:');
      if (!shouldRotate) {
        continue;
      }

      await updateAlertChannel(row.id, {
        config_enc: encryptAlertConfig(decrypted, activeSecret.kid, activeSecret.key),
        config_kid: activeSecret.kid
      });

      rotatedCount += 1;
    }

    res.json({
      data: {
        scanned: rows.length,
        rotated: rotatedCount,
        active_kid: activeSecret.kid
      }
    });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/alert-channels/:channelId/test', ...requireAdmin, async (req, res, next) => {
  try {
    const settings = await getAppSettingsByScope('alerts');
    if (settings.test_message_enabled !== true) {
      next({ code: 'API_PRECONDITION_FAILED', status: 412, message: 'Test messages are disabled in alert settings' });
      return;
    }

    const pool = getPool();
    const [rowsRaw] = await pool.query(
      `
        SELECT id, type, name, config_enc, config_kid, is_enabled
        FROM alert_channels
        WHERE id = ?
        LIMIT 1
      `,
      [req.params.channelId]
    );
    const rows = rowsRaw as AlertChannelSecretRow[];
    const channel = rows[0];

    if (!channel) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Alert channel not found' });
      return;
    }

    if (channel.is_enabled !== 1) {
      next({ code: 'API_PRECONDITION_FAILED', status: 412, message: 'Alert channel is disabled' });
      return;
    }

    if (channel.type !== 'DISCORD_WEBHOOK') {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Only DISCORD_WEBHOOK test dispatch is supported' });
      return;
    }

    const decrypted = decryptAlertConfig(channel.config_enc ?? '', channel.config_kid ?? '', alertKeyring);
    if (!decrypted) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid alert channel config' });
      return;
    }

    const webhookCandidate =
      (typeof decrypted.webhook_url === 'string' && decrypted.webhook_url) ||
      (typeof decrypted.url === 'string' && decrypted.url) ||
      (typeof decrypted.webhookUrl === 'string' && decrypted.webhookUrl) ||
      '';
    const webhookUrl = webhookCandidate.trim();

    if (!/^https?:\/\//i.test(webhookUrl)) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Alert channel webhook URL is missing or invalid' });
      return;
    }

    const body = ensureObject(req.body) as { message?: unknown } | null;
    const customMessage = body && typeof body.message === 'string' ? body.message.trim() : '';
    const message =
      customMessage.length > 0
        ? customMessage
        : [
            '# Beispielserver Online',
            '```diff',
            '+ Online',
            '```',
            '"STATUS_ADAPTER_OK (ADAPTER)"',
            '',
            '# Beispielserver Offline',
            '```diff',
            '- Offline',
            '```',
            '"ADAPTER_TIMEOUT (ADAPTER)"'
          ].join('\n');

    const dispatchResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content: message })
    });

    if (!dispatchResponse.ok) {
      const detail = (await dispatchResponse.text()).slice(0, 500);
      next({
        code: 'API_BAD_GATEWAY',
        status: 502,
        message: `Discord webhook test failed with HTTP ${dispatchResponse.status}${detail ? `: ${detail}` : ''}`
      });
      return;
    }

    res.json({
      data: {
        channel_id: channel.id,
        channel_name: channel.name,
        sent: true,
        dispatched_at: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/alert-policies', ...requireUser, async (_req, res, next) => {
  try {
    const data = await listAlertPolicies();
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/alert-policies', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as Partial<CreateAlertPolicyInput> | null;
    if (!body || typeof body.name !== 'string' || !Array.isArray(body.channel_ids)) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid alert-policy payload' });
      return;
    }

    const data = await createAlertPolicy({
      name: body.name,
      cooldown_seconds: typeof body.cooldown_seconds === 'number' ? body.cooldown_seconds : undefined,
      notify_on: ensureObject(body.notify_on) ?? undefined,
      roles_to_notify: Array.isArray(body.roles_to_notify)
        ? body.roles_to_notify.filter((item): item is string => typeof item === 'string')
        : undefined,
      channel_ids: body.channel_ids.filter((item): item is string => typeof item === 'string'),
      is_enabled: typeof body.is_enabled === 'boolean' ? body.is_enabled : true
    });

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.patch('/alert-policies/:policyId', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as UpdateAlertPolicyInput | null;
    if (!body) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid alert-policy payload' });
      return;
    }

    const data = await updateAlertPolicy(req.params.policyId, {
      ...body,
      notify_on: body.notify_on ? ensureObject(body.notify_on) ?? {} : undefined,
      roles_to_notify: Array.isArray(body.roles_to_notify)
        ? body.roles_to_notify.filter((item): item is string => typeof item === 'string')
        : body.roles_to_notify,
      channel_ids: Array.isArray(body.channel_ids)
        ? body.channel_ids.filter((item): item is string => typeof item === 'string')
        : body.channel_ids
    });

    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Alert policy not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/alert-events', ...requireUser, async (req: Request, res, next) => {
  try {
    const from = parseIsoDateQueryParam(req.query.from);
    const to = parseIsoDateQueryParam(req.query.to);
    const limit = parsePositiveInteger(req.query.limit);
    const eventType = parseSingleQueryParam(req.query.event_type);
    const data = await listAlertEvents({
      server_id: parseSingleQueryParam(req.query.server_id),
      policy_id: parseSingleQueryParam(req.query.policy_id),
      channel_id: parseSingleQueryParam(req.query.channel_id),
      event_type: eventType === 'STATE_CHANGE_OFFLINE' || eventType === 'STATE_CHANGE_ONLINE' ? eventType : undefined,
      suppressed_reason: parseSingleQueryParam(req.query.suppressed_reason),
      from,
      to,
      limit
    });

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/roles', ...requireUser, async (_req, res, next) => {
  try {
    const data = await listRolesWithPermissions();
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/roles', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const permissions = parsePermissionList(body?.permissions);
    const keyRaw = typeof body?.key === 'string' ? body.key : name;
    const key = keyRaw
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!name || !key) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid role payload' });
      return;
    }

    const data = await createRole({ key, name });
    await upsertRolePermissionsByKey(data.key, permissions);
    res.status(201).json({ data });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      next({ code: 'API_CONFLICT', status: 409, message: 'Role key already exists' });
      return;
    }

    next(error);
  }
});

domainRoute.patch('/roles/:roleId', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body);
    if (!body) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid role payload' });
      return;
    }

    const existingRole = await findRoleById(req.params.roleId);
    if (!existingRole) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Role not found' });
      return;
    }

    const key =
      typeof body.key === 'string'
        ? body.key
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
        : undefined;

        const permissionsProvided = Array.isArray(body.permissions);
        const permissions = permissionsProvided ? parsePermissionList(body.permissions) : null;

    const data = await updateRole(req.params.roleId, {
      name: typeof body.name === 'string' ? body.name.trim() : undefined,
      key
    });

    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Role not found' });
      return;
    }

    if (permissionsProvided && permissions) {
      await upsertRolePermissionsByKey(data.key, permissions);
    } else if (existingRole.key !== data.key) {
      const permissionsMap = await getRolePermissionsMap();
      await upsertRolePermissionsByKey(data.key, permissionsMap.get(existingRole.key) ?? []);
    }

    res.json({ data });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      next({ code: 'API_CONFLICT', status: 409, message: 'Role key already exists' });
      return;
    }

    next(error);
  }
});

domainRoute.delete('/roles/:roleId', ...requireAdmin, async (req, res, next) => {
  try {
    const role = await findRoleById(req.params.roleId);
    if (!role) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Role not found' });
      return;
    }

    if (role.key === 'ADMIN' || role.key === 'USER') {
      next({ code: 'API_PRECONDITION_FAILED', status: 412, message: 'System role cannot be deleted' });
      return;
    }

    const deleted = await deleteRole(req.params.roleId);
    if (!deleted) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Role not found' });
      return;
    }

    await upsertRolePermissionsByKey(role.key, []);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/game-labels', ...requireUser, async (_req, res, next) => {
  try {
    const data = await listGameLabels();
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/game-labels', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as Partial<CreateGameLabelInput> | null;
    if (!body || typeof body.name !== 'string') {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid game-label payload' });
      return;
    }

    const data = await createGameLabel({
      name: body.name,
      is_enabled: typeof body.is_enabled === 'boolean' ? body.is_enabled : true,
      settings: body.settings && typeof body.settings === 'object' ? body.settings : null
    });

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.patch('/game-labels/:labelId', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as UpdateGameLabelInput | null;
    if (!body) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid game-label payload' });
      return;
    }

    const data = await updateGameLabel(req.params.labelId, {
      name: typeof body.name === 'string' ? body.name : undefined,
      is_enabled: typeof body.is_enabled === 'boolean' ? body.is_enabled : undefined,
      settings: body.settings !== undefined && body.settings !== null && typeof body.settings === 'object' ? body.settings : undefined
    });

    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Game label not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.delete('/game-labels/:labelId', ...requireAdmin, async (req, res, next) => {
  try {
    const deleted = await deleteGameLabel(req.params.labelId);
    if (!deleted) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Game label not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/app-settings/:scope', ...requireUser, async (req, res, next) => {
  try {
    const scope = req.params.scope;
    const data = await getAppSettingsByScope(scope);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/app-settings/:scope', ...requireAdmin, async (req, res, next) => {
  try {
    const scope = req.params.scope;
    const body = ensureObject(req.body);
    if (!body) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid app-settings payload' });
      return;
    }

    const settings: Record<string, string | boolean> = {};
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string' || typeof value === 'boolean') {
        settings[key] = value;
      }
    }

    const data = await upsertAppSettingsByScope(scope, settings);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/users', ...requireUser, async (_req, res, next) => {
  try {
    const data = await listUsers();
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/users', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body);
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const roleKeys = Array.isArray(body?.roles)
      ? body.roles.filter((entry): entry is string => typeof entry === 'string')
      : [];

    if (!username || !email || password.length < 8) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid user payload' });
      return;
    }

    const data = await createUser({
      username,
      email,
      password_hash: await bcrypt.hash(password, 10),
      is_enabled: body?.is_enabled === false ? false : true,
      role_keys: roleKeys
    });

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.patch('/users/:userId', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body);
    if (!body) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid user payload' });
      return;
    }

    const data = await updateUser(req.params.userId, {
      username: typeof body.username === 'string' ? body.username.trim() : undefined,
      email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined,
      is_enabled: typeof body.is_enabled === 'boolean' ? body.is_enabled : undefined
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

domainRoute.post('/users/:userId/roles', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body);
    const roleKeys = Array.isArray(body?.roles)
      ? body.roles.filter((entry): entry is string => typeof entry === 'string')
      : [];

    await setUserRoles(req.params.userId, roleKeys);
    const data = await findUserById(req.params.userId);

    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'User not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.delete('/users/:userId', ...requireAdmin, async (req, res, next) => {
  try {
    const deleted = await deleteUser(req.params.userId);
    if (!deleted) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'User not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

domainRoute.get('/server-presets', ...requireUser, async (_req, res, next) => {
  try {
    const data = await listServerPresets();
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

domainRoute.post('/server-presets', ...requireAdmin, async (req, res, next) => {
  try {
    const body = ensureObject(req.body) as Partial<CreateServerPresetInput> | null;
    if (!body || typeof body.name !== 'string') {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid server-preset payload' });
      return;
    }

    const keyRaw = typeof body.key === 'string' ? body.key : body.name;
    const key = keyRaw
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const hoster =
      body.hoster === 'GPORTAL' ||
      body.hoster === 'NITRADO' ||
      body.hoster === 'SHOCKBYTE' ||
      body.hoster === 'APEX' ||
      body.hoster === 'BISECT' ||
      body.hoster === 'HOSTHAVOC' ||
      body.hoster === 'SURVIVAL_SERVERS'
        ? body.hoster
        : 'GENERIC';

    const protocol = body.protocol === 'TCP' ? 'TCP' : 'UDP';
    const queryPortMode =
      body.query_port_mode === 'DISABLED' || body.query_port_mode === 'MANUAL_OPTIONAL'
        ? body.query_port_mode
        : 'SAME_AS_GAME';

    const data = await createServerPreset({
      key,
      name: body.name.trim(),
      hoster,
      protocol,
      query_port_mode: queryPortMode,
      prefer_a2s: body.prefer_a2s === true,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null
    });

    res.status(201).json({ data });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      next({ code: 'API_CONFLICT', status: 409, message: 'Server preset key already exists' });
      return;
    }

    next(error);
  }
});

domainRoute.patch('/server-presets/:presetId', ...requireAdmin, async (req, res, next) => {
  try {
    const existing = await findServerPresetById(req.params.presetId);
    if (!existing) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Server preset not found' });
      return;
    }

    if (existing.is_system) {
      next({ code: 'API_PRECONDITION_FAILED', status: 412, message: 'System preset cannot be modified' });
      return;
    }

    const body = ensureObject(req.body) as UpdateServerPresetInput | null;
    if (!body) {
      next({ code: 'API_VALIDATION_ERROR', status: 400, message: 'Invalid server-preset payload' });
      return;
    }

    const key =
      typeof body.key === 'string'
        ? body.key
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
        : undefined;

    const hoster =
      body.hoster === 'GENERIC' ||
      body.hoster === 'GPORTAL' ||
      body.hoster === 'NITRADO' ||
      body.hoster === 'SHOCKBYTE' ||
      body.hoster === 'APEX' ||
      body.hoster === 'BISECT' ||
      body.hoster === 'HOSTHAVOC' ||
      body.hoster === 'SURVIVAL_SERVERS'
        ? body.hoster
        : undefined;

    const queryPortMode =
      body.query_port_mode === 'SAME_AS_GAME' ||
      body.query_port_mode === 'MANUAL_OPTIONAL' ||
      body.query_port_mode === 'DISABLED'
        ? body.query_port_mode
        : undefined;

    const data = await updateServerPreset(req.params.presetId, {
      key,
      name: typeof body.name === 'string' ? body.name.trim() : undefined,
      hoster,
      protocol: body.protocol === 'TCP' || body.protocol === 'UDP' ? body.protocol : undefined,
      query_port_mode: queryPortMode,
      prefer_a2s: typeof body.prefer_a2s === 'boolean' ? body.prefer_a2s : undefined,
      notes: body.notes === null ? null : typeof body.notes === 'string' ? body.notes.trim() || null : undefined
    });

    if (!data) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Server preset not found' });
      return;
    }

    res.json({ data });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      next({ code: 'API_CONFLICT', status: 409, message: 'Server preset key already exists' });
      return;
    }

    next(error);
  }
});

domainRoute.delete('/server-presets/:presetId', ...requireAdmin, async (req, res, next) => {
  try {
    const deleted = await deleteServerPreset(req.params.presetId);
    if (!deleted) {
      next({ code: 'API_NOT_FOUND', status: 404, message: 'Server preset not found or protected' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});