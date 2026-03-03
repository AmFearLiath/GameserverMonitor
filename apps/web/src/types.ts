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

export type DashboardServer = {
  id: string;
  name: string;
  game_icon_url: string | null;
  normalized_status: ServerStatus;
  players_current: number;
  players_max: number;
  rtt_ms: number | null;
  last_check_minutes_ago: number;
  tags: string[];
  panel_id: string;
};

export type IncidentRow = {
  id: string;
  server_name: string;
  status: ServerStatus;
  started_at: string;
  reason?: string;
  impact?: string;
  duration_minutes?: number;
};

export type AlertLogRow = {
  id: string;
  time: string;
  server_name: string;
  message: string;
  severity: 'INFO' | 'WARN' | 'ERROR';
  suppressed_reason?: string | null;
  channel?: string;
  policy?: string;
};

export type ChartPoint = {
  label: string;
  value: number;
};

export type DashboardSummary = {
  counts: Record<ServerStatus, number>;
  servers: DashboardServer[];
  incidents: IncidentRow[];
  alert_log: AlertLogRow[];
  performance: ChartPoint[];
  available_tags: string[];
  available_panels: string[];
};

export type DetailMetric = {
  label_key: string;
  value: string;
};

export type ServerDetailView = {
  id: string;
  name: string;
  normalized_status: ServerStatus;
  metrics: DetailMetric[];
  uptime: ChartPoint[];
  rtt: ChartPoint[];
  players: ChartPoint[];
  endpoints: ServerEndpoint[];
  incidents: IncidentRow[];
  raw_state: string;
};

export type AdminSection = 'panels' | 'game_labels' | 'nodes' | 'servers' | 'profiles' | 'a2s' | 'channels' | 'policies' | 'roles' | 'users';

export type AdminEntityRow = {
  id: string;
  name: string;
  status: string;
  settings?: Record<string, string | boolean>;
  permissions?: string[];
  updated_at: string;
};
