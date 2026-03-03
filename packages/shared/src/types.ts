export type ServerStatus = 'ONLINE' | 'OFFLINE' | 'TRANSITION' | 'MAINTENANCE';

export type ServerSummary = {
  id: string;
  name: string;
  game_label: string | null;
  game_icon_url: string | null;
  panel_id: string | null;
  panel_name: string | null;
  hoster: string | null;
  source_kind: 'PTERODACTYL_PANEL' | 'EXTERNAL_HOSTER' | null;
  node_id: string | null;
  normalized_status: ServerStatus;
  ptero_raw_state: string;
  last_reason_code: string | null;
  last_reason_source: 'PTERO' | 'QUERY' | 'ADAPTER' | 'SYSTEM' | null;
  players_current: number | null;
  players_max: number | null;
  rtt_ms: number | null;
  last_check_at: string | null;
  last_status_change_at: string | null;
  tags: string[];
};

export type UpdateServerMetadataInput = {
  name?: string | null;
  game_label?: string | null;
  game_icon_url?: string | null;
  hoster?: 'GENERIC' | 'GPORTAL' | 'NITRADO' | 'SHOCKBYTE' | 'APEX' | 'BISECT' | 'HOSTHAVOC' | 'SURVIVAL_SERVERS' | null;
  source_kind?: 'PTERODACTYL_PANEL' | 'EXTERNAL_HOSTER' | null;
};

export type ServerEndpoint = {
  id: string;
  label: string;
  host: string;
  port: number;
  protocol: 'TCP' | 'UDP' | 'HTTP' | 'HTTPS';
  purpose: 'GAME' | 'QUERY' | 'HTTP' | 'RCON' | 'OTHER';
  is_primary: boolean;
  is_enabled: boolean;
  meta: Record<string, unknown> | null;
};

export type ServerDetail = ServerSummary & {
  last_reason_meta: Record<string, unknown> | null;
  endpoints: ServerEndpoint[];
  last_observations: Record<string, unknown> | null;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message_key: string;
    message_params: Record<string, unknown>;
    message?: string;
    details?: unknown;
    request_id: string;
  };
};
