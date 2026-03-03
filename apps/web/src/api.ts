import type { ServerDetail, ServerSummary } from './types.js';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const AUTH_TOKEN_STORAGE_KEY = 'gm.auth.access_token';

const getStoredAccessToken = (): string | null => {
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string | null;
  expires_in: number;
  user: {
    id: string;
    username: string;
    roles: string[];
  };
};

export type RegisterResponse = LoginResponse;

export type DiscordStartResponse = {
  authorize_url: string;
};

export type AuthMeResponse = {
  id: string;
  username: string;
  roles: string[];
};

type ApiErrorResponse = {
  error?: {
    code?: string;
    message_key?: string;
  };
};

const getAuthHeaders = (): HeadersInit => {
  const accessToken = getStoredAccessToken();
  return accessToken
    ? {
        Authorization: `Bearer ${accessToken}`
      }
    : {};
};

export type PanelDto = {
  id: string;
  name: string;
  base_url: string;
  is_enabled: boolean;
  import_mode: 'ALL' | 'WHITELIST';
  import_filter: Record<string, unknown> | null;
  last_sync_at: string | null;
  sync_status: 'OK' | 'DEGRADED' | 'ERROR';
  sync_error_code: string | null;
  sync_error_detail: string | null;
  created_at: string;
  updated_at: string;
};

export type NodeDto = {
  id: string;
  panel_id: string;
  ptero_node_id: string;
  name: string;
  fqdn_or_ip: string | null;
  location: string | null;
  is_enabled: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RoleDto = {
  id: string;
  key: string;
  name: string;
  permissions?: string[];
};

export type ServerPresetDto = {
  id: string;
  key: string;
  name: string;
  hoster: 'GENERIC' | 'GPORTAL' | 'NITRADO' | 'SHOCKBYTE' | 'APEX' | 'BISECT' | 'HOSTHAVOC' | 'SURVIVAL_SERVERS';
  protocol: 'TCP' | 'UDP';
  query_port_mode: 'SAME_AS_GAME' | 'MANUAL_OPTIONAL' | 'DISABLED';
  prefer_a2s: boolean;
  is_system: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type UserDto = {
  id: string;
  username: string;
  email: string;
  is_enabled: boolean;
  roles: string[];
  last_login_at: string | null;
  updated_at: string;
};

export type UserProfileDto = {
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

export type AlertChannelDto = {
  id: string;
  type: 'DISCORD_WEBHOOK' | 'EMAIL_SMTP';
  name: string;
  config_kid: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AlertPolicyDto = {
  id: string;
  name: string;
  cooldown_seconds: number;
  notify_on: Record<string, unknown>;
  roles_to_notify: string[];
  channel_ids: string[];
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type GameLabelDto = {
  id: string;
  name: string;
  is_enabled: boolean;
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ServerHistoryDto = {
  id: string;
  server_id: string;
  bucket_start: string;
  total_checks: number;
  ok_checks: number;
  fail_checks: number;
  uptime_ratio: number;
  rtt_avg_ms: number | null;
  rtt_max_ms: number | null;
  players_avg: number | null;
  players_max: number | null;
  max_players_last: number | null;
  version_last: string | null;
  server_name_last: string | null;
  meta_last: Record<string, unknown> | null;
  created_at: string;
};

export type ServerIncidentDto = {
  id: string;
  server_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  start_status: 'ONLINE' | 'OFFLINE' | 'TRANSITION' | 'MAINTENANCE';
  end_status: 'ONLINE' | 'OFFLINE' | 'TRANSITION' | 'MAINTENANCE' | null;
  reason_code: string;
  reason_source: 'PTERO' | 'QUERY' | 'ADAPTER' | 'SYSTEM' | null;
  reason_meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type AlertEventDto = {
  id: string;
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
  payload_summary: Record<string, unknown> | null;
  attempt_count: number;
  last_error_code: string | null;
  last_error_detail: string | null;
  was_sent: boolean;
  sent_at: string | null;
  created_at: string;
};

export type FetchAlertEventsFilters = Partial<{
  limit: number;
  event_type: 'STATE_CHANGE_OFFLINE' | 'STATE_CHANGE_ONLINE';
  suppressed_reason: string;
  from: string;
  to: string;
}>;

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    const messageKey = payload.error?.message_key ?? 'error.api_internal_error';
    throw new Error(messageKey);
  }

  return (await response.json()) as LoginResponse;
};

export const register = async (username: string, email: string, password: string): Promise<RegisterResponse> => {
  const response = await fetch(`${apiBaseUrl}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, email, password })
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    const messageKey = payload.error?.message_key ?? 'error.api_internal_error';
    throw new Error(messageKey);
  }

  return (await response.json()) as RegisterResponse;
};

export const fetchDiscordAuthorizeUrl = async (rememberMe = true): Promise<DiscordStartResponse> => {
  const response = await fetch(`${apiBaseUrl}/auth/discord/start?remember=${rememberMe ? '1' : '0'}`, {
    method: 'GET'
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    const messageKey = payload.error?.message_key ?? 'error.api_internal_error';
    throw new Error(messageKey);
  }

  return (await response.json()) as DiscordStartResponse;
};

export const fetchAuthMe = async (accessToken: string): Promise<AuthMeResponse> => {
  const response = await fetch(`${apiBaseUrl}/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    const messageKey = payload.error?.message_key ?? 'error.api_internal_error';
    throw new Error(messageKey);
  }

  return (await response.json()) as AuthMeResponse;
};

export const fetchUserProfileApi = async (): Promise<UserProfileDto> => {
  const response = await fetch(`${apiBaseUrl}/auth/profile`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    const messageKey = payload.error?.message_key ?? 'error.api_internal_error';
    throw new Error(messageKey);
  }

  const payload = (await response.json()) as { data: UserProfileDto };
  return payload.data;
};

export const updateUserProfileApi = async (
  input: Partial<{
    display_name: string | null;
    avatar_url: string | null;
    timezone: string | null;
    locale: string | null;
    ptero_client_api_key: string | null;
    settings: Record<string, string | boolean>;
  }>
): Promise<UserProfileDto> => {
  const response = await fetch(`${apiBaseUrl}/auth/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    const messageKey = payload.error?.message_key ?? 'error.api_internal_error';
    throw new Error(messageKey);
  }

  const payload = (await response.json()) as { data: UserProfileDto };
  return payload.data;
};

export const fetchServers = async (): Promise<ServerSummary[]> => {
  const response = await fetch(`${apiBaseUrl}/servers`);
  if (!response.ok) {
    throw new Error('API_LOAD_SERVERS_FAILED');
  }

  const payload = (await response.json()) as { data: ServerSummary[] };
  return payload.data;
};

export const fetchServerDetail = async (serverId: string): Promise<ServerDetail> => {
  const response = await fetch(`${apiBaseUrl}/servers/${serverId}`);
  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    const messageKey = payload.error?.message_key ?? 'error.api_internal_error';
    throw new Error(messageKey);
  }

  const payload = (await response.json()) as { data: ServerDetail };
  return payload.data;
};

export const updateServerMetadataApi = async (
  serverId: string,
  input: Partial<{
    name: string | null;
    game_label: string | null;
    game_icon_url: string | null;
    hoster: 'GENERIC' | 'GPORTAL' | 'NITRADO' | 'SHOCKBYTE' | 'APEX' | 'BISECT' | 'HOSTHAVOC' | 'SURVIVAL_SERVERS' | null;
    source_kind: 'PTERODACTYL_PANEL' | 'EXTERNAL_HOSTER' | null;
  }>
): Promise<ServerDetail> => {
  const response = await fetch(`${apiBaseUrl}/servers/${serverId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: ServerDetail };
  return payload.data;
};

export const controlServerPowerApi = async (
  serverId: string,
  action: 'start' | 'stop' | 'restart'
): Promise<{ server_id: string; action: 'start' | 'stop' | 'restart'; accepted: boolean }> => {
  const response = await fetch(`${apiBaseUrl}/servers/${serverId}/power`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ action })
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as {
    data: { server_id: string; action: 'start' | 'stop' | 'restart'; accepted: boolean };
  };
  return payload.data;
};

export const fetchServerLogsApi = async (serverId: string, limit = 120): Promise<string[]> => {
  const response = await fetch(`${apiBaseUrl}/servers/${serverId}/logs?limit=${encodeURIComponent(String(limit))}`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: { server_id: string; lines: string[] } };
  return Array.isArray(payload.data.lines) ? payload.data.lines : [];
};

export const fetchServerHistoryApi = async (
  serverId: string,
  range?: Partial<{ from: string; to: string }>
): Promise<ServerHistoryDto[]> => {
  const params = new URLSearchParams();
  if (range?.from) {
    params.set('from', range.from);
  }

  if (range?.to) {
    params.set('to', range.to);
  }

  const query = params.toString();
  const url = `${apiBaseUrl}/servers/${serverId}/history${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: ServerHistoryDto[] };
  return payload.data;
};

export const fetchServerIncidentsApi = async (serverId: string): Promise<ServerIncidentDto[]> => {
  const response = await fetch(`${apiBaseUrl}/servers/${serverId}/incidents`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: ServerIncidentDto[] };
  return payload.data;
};

export const fetchAlertEventsApi = async (input: number | FetchAlertEventsFilters = 100): Promise<AlertEventDto[]> => {
  const filters: FetchAlertEventsFilters =
    typeof input === 'number'
      ? { limit: input }
      : input;

  const params = new URLSearchParams();
  if (typeof filters.limit === 'number') {
    params.set('limit', String(filters.limit));
  }

  if (filters.event_type) {
    params.set('event_type', filters.event_type);
  }

  if (filters.suppressed_reason) {
    params.set('suppressed_reason', filters.suppressed_reason);
  }

  if (filters.from) {
    params.set('from', filters.from);
  }

  if (filters.to) {
    params.set('to', filters.to);
  }

  const response = await fetch(`${apiBaseUrl}/alert-events?${params.toString()}`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: AlertEventDto[] };
  return payload.data;
};

export const fetchPanels = async (): Promise<PanelDto[]> => {
  const response = await fetch(`${apiBaseUrl}/panels`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: PanelDto[] };
  return payload.data;
};

export const createPanelApi = async (input: {
  name: string;
  base_url: string;
  api_key: string;
  is_enabled: boolean;
}): Promise<PanelDto> => {
  const response = await fetch(`${apiBaseUrl}/panels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: PanelDto };
  return payload.data;
};

export const updatePanelApi = async (
  panelId: string,
  input: Partial<{ name: string; base_url: string; api_key: string; is_enabled: boolean }>
): Promise<PanelDto> => {
  const response = await fetch(`${apiBaseUrl}/panels/${panelId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: PanelDto };
  return payload.data;
};

export const deletePanelApi = async (panelId: string): Promise<void> => {
  const response = await fetch(`${apiBaseUrl}/panels/${panelId}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }
};

export const syncPanelApi = async (
  panelId: string
): Promise<{ queued: boolean; synced_nodes?: number; synced_servers?: number; synced_endpoints?: number }> => {
  const response = await fetch(`${apiBaseUrl}/panels/${panelId}/sync`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  return (await response.json()) as {
    queued: boolean;
    synced_nodes?: number;
    synced_servers?: number;
    synced_endpoints?: number;
  };
};

export const validatePanelConfigApi = async (input: {
  panel_id?: string;
  base_url?: string;
  api_key?: string;
}): Promise<{ ok: boolean; node_count_hint: number }> => {
  const response = await fetch(`${apiBaseUrl}/panels/validate-config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: { ok: boolean; node_count_hint: number } };
  return payload.data;
};

export const validateNodeConfigApi = async (input: {
  panel_id: string;
  ptero_node_id?: string;
  identifier_key?: 'ptero_node_id' | 'name' | 'fqdn';
  identifier_value?: string;
}): Promise<{ ok: boolean; node_id: string; matched_by: 'ptero_node_id' | 'name' | 'fqdn' }> => {
  const response = await fetch(`${apiBaseUrl}/nodes/validate-config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as {
    data: { ok: boolean; node_id: string; matched_by: 'ptero_node_id' | 'name' | 'fqdn' };
  };
  return payload.data;
};

export const fetchNodes = async (): Promise<NodeDto[]> => {
  const response = await fetch(`${apiBaseUrl}/nodes`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: NodeDto[] };
  return payload.data;
};

export const createNodeApi = async (input: {
  panel_id: string;
  ptero_node_id: string;
  name: string;
  fqdn_or_ip?: string | null;
  location?: string | null;
  is_enabled: boolean;
  identifier_key?: 'ptero_node_id' | 'name' | 'fqdn';
  identifier_value?: string;
}): Promise<NodeDto> => {
  const response = await fetch(`${apiBaseUrl}/nodes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: NodeDto };
  return payload.data;
};

export const updateNodeApi = async (
  nodeId: string,
  input: Partial<{
    panel_id: string;
    ptero_node_id: string;
    name: string;
    fqdn_or_ip: string | null;
    location: string | null;
    is_enabled: boolean;
    identifier_key: 'ptero_node_id' | 'name' | 'fqdn';
    identifier_value: string;
  }>
): Promise<NodeDto> => {
  const response = await fetch(`${apiBaseUrl}/nodes/${nodeId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: NodeDto };
  return payload.data;
};

export const deleteNodeApi = async (nodeId: string): Promise<void> => {
  const response = await fetch(`${apiBaseUrl}/nodes/${nodeId}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }
};

export const fetchAlertChannelsApi = async (): Promise<AlertChannelDto[]> => {
  const response = await fetch(`${apiBaseUrl}/alert-channels`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: AlertChannelDto[] };
  return payload.data;
};

export const createAlertChannelApi = async (input: {
  type: 'DISCORD_WEBHOOK' | 'EMAIL_SMTP';
  name: string;
  config_enc: string;
  is_enabled: boolean;
}): Promise<AlertChannelDto> => {
  const response = await fetch(`${apiBaseUrl}/alert-channels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: AlertChannelDto };
  return payload.data;
};

export const updateAlertChannelApi = async (
  channelId: string,
  input: Partial<{ name: string; is_enabled: boolean; config_enc: string }>
): Promise<AlertChannelDto> => {
  const response = await fetch(`${apiBaseUrl}/alert-channels/${channelId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: AlertChannelDto };
  return payload.data;
};

export const sendAlertChannelTestApi = async (
  channelId: string,
  input?: { message?: string }
): Promise<{ channel_id: string; channel_name: string; sent: boolean; dispatched_at: string }> => {
  const response = await fetch(`${apiBaseUrl}/alert-channels/${channelId}/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input ?? {})
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as {
    data: { channel_id: string; channel_name: string; sent: boolean; dispatched_at: string };
  };
  return payload.data;
};

export const fetchAlertPoliciesApi = async (): Promise<AlertPolicyDto[]> => {
  const response = await fetch(`${apiBaseUrl}/alert-policies`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: AlertPolicyDto[] };
  return payload.data;
};

export const createAlertPolicyApi = async (input: {
  name: string;
  channel_ids: string[];
  cooldown_seconds: number;
  is_enabled: boolean;
}): Promise<AlertPolicyDto> => {
  const response = await fetch(`${apiBaseUrl}/alert-policies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: AlertPolicyDto };
  return payload.data;
};

export const updateAlertPolicyApi = async (
  policyId: string,
  input: Partial<{ name: string; channel_ids: string[]; cooldown_seconds: number; is_enabled: boolean }>
): Promise<AlertPolicyDto> => {
  const response = await fetch(`${apiBaseUrl}/alert-policies/${policyId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: AlertPolicyDto };
  return payload.data;
};

export const fetchGameLabelsApi = async (): Promise<GameLabelDto[]> => {
  const response = await fetch(`${apiBaseUrl}/game-labels`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: GameLabelDto[] };
  return payload.data;
};

export const createGameLabelApi = async (input: {
  name: string;
  is_enabled: boolean;
  settings?: Record<string, unknown>;
}): Promise<GameLabelDto> => {
  const response = await fetch(`${apiBaseUrl}/game-labels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: GameLabelDto };
  return payload.data;
};

export const updateGameLabelApi = async (
  labelId: string,
  input: Partial<{ name: string; is_enabled: boolean; settings: Record<string, unknown> }>
): Promise<GameLabelDto> => {
  const response = await fetch(`${apiBaseUrl}/game-labels/${labelId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: GameLabelDto };
  return payload.data;
};

export const deleteGameLabelApi = async (labelId: string): Promise<void> => {
  const response = await fetch(`${apiBaseUrl}/game-labels/${labelId}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }
};

export const fetchAppSettingsScopeApi = async (scope: string): Promise<Record<string, string | boolean>> => {
  const response = await fetch(`${apiBaseUrl}/app-settings/${encodeURIComponent(scope)}`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: Record<string, string | boolean> };
  return payload.data;
};

export const saveAppSettingsScopeApi = async (
  scope: string,
  settings: Record<string, string | boolean>
): Promise<Record<string, string | boolean>> => {
  const response = await fetch(`${apiBaseUrl}/app-settings/${encodeURIComponent(scope)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(settings)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: Record<string, string | boolean> };
  return payload.data;
};

export const fetchRolesApi = async (): Promise<RoleDto[]> => {
  const response = await fetch(`${apiBaseUrl}/roles`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: RoleDto[] };
  return payload.data;
};

export const fetchServerPresetsApi = async (): Promise<ServerPresetDto[]> => {
  const response = await fetch(`${apiBaseUrl}/server-presets`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: ServerPresetDto[] };
  return payload.data;
};

export const createServerPresetApi = async (input: {
  key?: string;
  name: string;
  hoster: ServerPresetDto['hoster'];
  protocol: 'TCP' | 'UDP';
  query_port_mode: ServerPresetDto['query_port_mode'];
  prefer_a2s?: boolean;
  notes?: string | null;
}): Promise<ServerPresetDto> => {
  const response = await fetch(`${apiBaseUrl}/server-presets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: ServerPresetDto };
  return payload.data;
};

export const updateServerPresetApi = async (
  presetId: string,
  input: Partial<{
    key: string;
    name: string;
    hoster: ServerPresetDto['hoster'];
    protocol: 'TCP' | 'UDP';
    query_port_mode: ServerPresetDto['query_port_mode'];
    prefer_a2s: boolean;
    notes: string | null;
  }>
): Promise<ServerPresetDto> => {
  const response = await fetch(`${apiBaseUrl}/server-presets/${presetId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: ServerPresetDto };
  return payload.data;
};

export const deleteServerPresetApi = async (presetId: string): Promise<void> => {
  const response = await fetch(`${apiBaseUrl}/server-presets/${presetId}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }
};

export const createRoleApi = async (input: { key?: string; name: string; permissions?: string[] }): Promise<RoleDto> => {
  const response = await fetch(`${apiBaseUrl}/roles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: RoleDto };
  return payload.data;
};

export const updateRoleApi = async (
  roleId: string,
  input: Partial<{ key: string; name: string; permissions: string[] }>
): Promise<RoleDto> => {
  const response = await fetch(`${apiBaseUrl}/roles/${roleId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: RoleDto };
  return payload.data;
};

export const deleteRoleApi = async (roleId: string): Promise<void> => {
  const response = await fetch(`${apiBaseUrl}/roles/${roleId}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }
};

export const createExternalServerApi = async (input: {
  name: string;
  host: string;
  game_port: number;
  query_port?: number;
  protocol?: 'TCP' | 'UDP';
  hoster?: 'GENERIC' | 'GPORTAL' | 'NITRADO' | 'SHOCKBYTE' | 'APEX' | 'BISECT' | 'HOSTHAVOC' | 'SURVIVAL_SERVERS';
  game_label?: string | null;
}): Promise<ServerDetail> => {
  const response = await fetch(`${apiBaseUrl}/servers/external`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: ServerDetail };
  return payload.data;
};

export const setServerPauseApi = async (serverId: string, paused: boolean): Promise<ServerDetail> => {
  const response = await fetch(`${apiBaseUrl}/servers/${serverId}/pause`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ paused })
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: ServerDetail };
  return payload.data;
};

export const deleteServerApi = async (serverId: string): Promise<void> => {
  const response = await fetch(`${apiBaseUrl}/servers/${serverId}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }
};

export const fetchUsersApi = async (): Promise<UserDto[]> => {
  const response = await fetch(`${apiBaseUrl}/users`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: UserDto[] };
  return payload.data;
};

export const createUserApi = async (input: {
  username: string;
  email: string;
  password: string;
  is_enabled: boolean;
  roles: string[];
}): Promise<UserDto> => {
  const response = await fetch(`${apiBaseUrl}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: UserDto };
  return payload.data;
};

export const updateUserApi = async (
  userId: string,
  input: Partial<{ username: string; email: string; is_enabled: boolean }>
): Promise<UserDto> => {
  const response = await fetch(`${apiBaseUrl}/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: UserDto };
  return payload.data;
};

export const updateUserRolesApi = async (userId: string, roles: string[]): Promise<UserDto> => {
  const response = await fetch(`${apiBaseUrl}/users/${userId}/roles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ roles })
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }

  const payload = (await response.json()) as { data: UserDto };
  return payload.data;
};

export const deleteUserApi = async (userId: string): Promise<void> => {
  const response = await fetch(`${apiBaseUrl}/users/${userId}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorResponse;
    throw new Error(payload.error?.message_key ?? 'error.api_internal_error');
  }
};
