import { useEffect, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/primitives/Button.js';
import { Card } from '../components/primitives/Card.js';
import { Input } from '../components/primitives/Input.js';
import { Select } from '../components/primitives/Select.js';
import {
  controlServerPowerApi,
  deleteServerApi,
  fetchServerLogsApi,
  fetchGameLabelsApi,
  fetchServerDetail,
  fetchServerHistoryApi,
  fetchServerIncidentsApi,
  fetchServers,
  setServerPauseApi,
  type ServerIncidentDto,
  updateServerMetadataApi
} from '../api.js';
import { confirmDelete } from '../services/confirmDelete.js';
import type { ServerDetail as ServerDetailDto, ServerSummary } from '../types.js';

type ServerDetailProps = {
  serverId: string;
  onBack: () => void;
  isAdmin: boolean;
  onOpenServer?: (serverId: string) => void;
};

type MetricPoint = {
  ts: number;
  value: number;
};

type AvailabilityPoint = {
  ts: number;
  uptimeRatio: number;
};

type ChartRangeValue = '30m' | '2h' | '6h' | '24h';
type RelatedSortMode = 'online' | 'offline' | 'rtt' | 'player';
type ChartValueTick = { value: number; position: number };
type ChartTimeTick = { label: string; position: number };
type ChartCoord = { x: number; y: number };
type ServerHoster = 'GENERIC' | 'GPORTAL' | 'NITRADO' | 'SHOCKBYTE' | 'APEX' | 'BISECT' | 'HOSTHAVOC' | 'SURVIVAL_SERVERS';
type ServerSourceKind = 'PTERODACTYL_PANEL' | 'EXTERNAL_HOSTER';
type EditMaintenanceMode = 'NORMAL' | 'MAINTENANCE';
const DETAIL_REFRESH_MS = 15_000;
const HISTORY_BUCKET_MS = 5 * 60 * 1000;
type TooltipClassName =
  | 'server-detail-chart-tooltip tooltip-h-center tooltip-v-top'
  | 'server-detail-chart-tooltip tooltip-h-left tooltip-v-top'
  | 'server-detail-chart-tooltip tooltip-h-right tooltip-v-top'
  | 'server-detail-chart-tooltip tooltip-h-center tooltip-v-bottom'
  | 'server-detail-chart-tooltip tooltip-h-left tooltip-v-bottom'
  | 'server-detail-chart-tooltip tooltip-h-right tooltip-v-bottom';

const chartRangeToMinutes: Record<ChartRangeValue, number> = {
  '30m': 30,
  '2h': 120,
  '6h': 360,
  '24h': 24 * 60
};

const toChartCoords = (points: MetricPoint[]): ChartCoord[] => {
  if (points.length === 0) {
    return [];
  }

  const maxValue = Math.max(...points.map((point) => point.value), 1);
  return points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * 100;
    const y = 100 - (point.value / maxValue) * 92;
    return { x, y };
  });
};

const toChartCoordinates = (points: MetricPoint[]): { line: string; area: string } => {
  if (points.length === 0) {
    return { line: '', area: '' };
  }

  const coords = toChartCoords(points);

  const line = coords.map((coord) => `${coord.x},${coord.y}`).join(' ');
  const area = `${coords.map((coord) => `${coord.x},${coord.y}`).join(' ')} 100,100 0,100`;
  return { line, area };
};

const buildValueTicks = (points: MetricPoint[], count = 5): ChartValueTick[] => {
  if (count < 2) {
    return [{ value: 0, position: 100 }];
  }

  const maxValue = Math.max(...points.map((point) => point.value), 1);
  return Array.from({ length: count }, (_, index) => {
    const ratio = (count - 1 - index) / (count - 1);
    return {
      value: maxValue * ratio,
      position: (index / (count - 1)) * 100
    };
  });
};

const buildIntegerValueTicks = (points: MetricPoint[], count = 5): ChartValueTick[] => {
  if (count < 2) {
    return [{ value: 0, position: 100 }];
  }

  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const maxInteger = Math.max(1, Math.ceil(maxValue));
  const desired = Math.max(2, Math.min(count, maxInteger + 1));
  const values = Array.from({ length: desired }, (_, index) => {
    const ratio = (desired - 1 - index) / (desired - 1);
    return Math.round(maxInteger * ratio);
  });

  const uniqueValues = Array.from(new Set(values));
  return uniqueValues.map((value) => ({
    value,
    position: 100 - (value / maxInteger) * 100
  }));
};

const buildTimeTicks = (points: MetricPoint[], count = 6): ChartTimeTick[] => {
  if (points.length === 0) {
    return [];
  }

  const desired = Math.min(count, points.length);
  const rawIndexes = Array.from({ length: desired }, (_, index) => {
    if (desired === 1) {
      return 0;
    }
    return Math.round((index * (points.length - 1)) / (desired - 1));
  });

  const uniqueIndexes = Array.from(new Set(rawIndexes));
  return uniqueIndexes.map((pointIndex) => ({
    label: new Date(points[pointIndex].ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    position: points.length === 1 ? 0 : (pointIndex / (points.length - 1)) * 100
  }));
};

const formatAxisValue = (value: number): string => {
  if (value >= 100) {
    return String(Math.round(value));
  }
  if (value >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
};

const toFixed = (value: number, digits = 2): string => value.toFixed(digits);

const getServerPanelOrHosterLabel = (server: { panel_name: string | null; hoster: string | null; panel_id: string | null }): string =>
  server.panel_name ?? server.hoster ?? server.panel_id ?? '-';

const resolveHoverIndex = (event: MouseEvent<SVGSVGElement>, pointCount: number): number | null => {
  if (pointCount <= 0) {
    return null;
  }

  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0) {
    return null;
  }

  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  return Math.round(ratio * (pointCount - 1));
};

const getTooltipClassName = (coord: ChartCoord): TooltipClassName => {
  const horizontal = coord.x < 12 ? 'tooltip-h-right' : coord.x > 88 ? 'tooltip-h-left' : 'tooltip-h-center';
  const vertical = coord.y < 18 ? 'tooltip-v-bottom' : 'tooltip-v-top';
  return `server-detail-chart-tooltip ${horizontal} ${vertical}` as TooltipClassName;
};

const getMinutesSince = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
};

export const ServerDetail = ({ serverId, onBack, isAdmin, onOpenServer }: ServerDetailProps): JSX.Element => {
  const { t } = useTranslation();
  const [gameLabelOptions, setGameLabelOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [editServerName, setEditServerName] = useState('');
  const [editGameLabel, setEditGameLabel] = useState('');
  const [editGameIconUrl, setEditGameIconUrl] = useState('');
  const [editGameIconFileName, setEditGameIconFileName] = useState('');
  const [editSourceKind, setEditSourceKind] = useState<ServerSourceKind>('EXTERNAL_HOSTER');
  const [editHoster, setEditHoster] = useState<ServerHoster>('GENERIC');
  const [editMaintenanceMode, setEditMaintenanceMode] = useState<EditMaintenanceMode>('NORMAL');
  const [chartRange, setChartRange] = useState<ChartRangeValue>('2h');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessageKey, setSaveMessageKey] = useState<string | null>(null);
  const [saveErrorKey, setSaveErrorKey] = useState<string | null>(null);
  const [relatedServers, setRelatedServers] = useState<ServerSummary[]>([]);
  const [relatedSortMode, setRelatedSortMode] = useState<RelatedSortMode>('online');
  const [refreshCountdownSec, setRefreshCountdownSec] = useState<number>(Math.floor(DETAIL_REFRESH_MS / 1000));
  const [isIpCopied, setIsIpCopied] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<ServerIncidentDto | null>(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isLogLoading, setIsLogLoading] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logErrorKey, setLogErrorKey] = useState<string | null>(null);
  const [availabilityHoverIndex, setAvailabilityHoverIndex] = useState<number | null>(null);
  const [playersHoverIndex, setPlayersHoverIndex] = useState<number | null>(null);
  const [rttHoverIndex, setRttHoverIndex] = useState<number | null>(null);
  const [detail, setDetail] = useState<{
    id: string;
    name: string;
    panel_id: string | null;
    panel_name: string | null;
    hoster: string | null;
    source_kind: 'PTERODACTYL_PANEL' | 'EXTERNAL_HOSTER' | null;
    ptero_raw_state: string;
    game_label: string | null;
    game_icon_url: string | null;
    normalized_status: ServerDetailDto['normalized_status'];
    rtt_ms: number | null;
    players_current: number | null;
    players_max: number | null;
    last_check_at: string | null;
    check_interval_sec: number;
    availabilityTimeline: AvailabilityPoint[];
    incidents: ServerIncidentDto[];
    rttTimeline: MetricPoint[];
    playerTimeline: MetricPoint[];
    endpoints: ServerDetailDto['endpoints'];
  } | null>(null);

  useEffect(() => {
    let disposed = false;
    let isLoading = false;

    const load = async (): Promise<void> => {
      if (isLoading) {
        return;
      }

      isLoading = true;

      try {
        const [server, history, incidents, gameLabels, allServers] = await Promise.all([
          fetchServerDetail(serverId),
          fetchServerHistoryApi(serverId),
          fetchServerIncidentsApi(serverId),
          isAdmin ? fetchGameLabelsApi() : Promise.resolve([]),
          fetchServers()
        ]);

        const sameGameServers = allServers
          .filter((item) => item.id !== server.id)
          .filter((item) => {
            if (server.game_label && item.game_label) {
              return item.game_label === server.game_label;
            }
            return false;
          })
          .sort((left, right) => left.name.localeCompare(right.name));

        if (!disposed) {
          setGameLabelOptions([
            { value: '', label: t('ui.server_detail.edit.no_game_label') },
            ...gameLabels
              .filter((item) => item.is_enabled)
              .map((item) => ({ value: item.name, label: item.name }))
          ]);
          if (!isEditOpen) {
            setEditServerName(server.name);
            setEditGameLabel(server.game_label ?? '');
            setEditGameIconUrl(server.game_icon_url ?? '');
            setEditSourceKind(server.source_kind ?? (server.panel_id ? 'PTERODACTYL_PANEL' : 'EXTERNAL_HOSTER'));
            setEditHoster((server.hoster as ServerHoster | null) ?? 'GENERIC');
            setEditMaintenanceMode(server.normalized_status === 'MAINTENANCE' ? 'MAINTENANCE' : 'NORMAL');
          }
          setRelatedServers(sameGameServers);
          setDetail({
            id: server.id,
            name: server.name,
            panel_id: server.panel_id,
            panel_name: server.panel_name,
            hoster: server.hoster,
            source_kind: server.source_kind,
            ptero_raw_state: server.ptero_raw_state,
            game_label: server.game_label,
            game_icon_url: server.game_icon_url,
            normalized_status: server.normalized_status,
            rtt_ms: server.rtt_ms,
            players_current: server.players_current,
            players_max: server.players_max,
            last_check_at: server.last_check_at,
            check_interval_sec: 20,
            availabilityTimeline: history.map((entry) => ({
              ts: new Date(entry.bucket_start).getTime(),
              uptimeRatio: entry.uptime_ratio ?? 0
            })),
            incidents,
            rttTimeline: history.map((entry) => ({
              ts: new Date(entry.bucket_start).getTime(),
              value: entry.rtt_avg_ms ?? 0
            })),
            playerTimeline: history.map((entry) => ({
              ts: new Date(entry.bucket_start).getTime(),
              value: entry.players_avg ?? 0
            })),
            endpoints: server.endpoints,
          });
          setRefreshCountdownSec(Math.floor(DETAIL_REFRESH_MS / 1000));
        }
      } finally {
        isLoading = false;
      }
    };

    void load();
    const intervalId = window.setInterval(() => {
      void load();
    }, DETAIL_REFRESH_MS);
    const countdownId = window.setInterval(() => {
      setRefreshCountdownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.clearInterval(countdownId);
    };
  }, [isAdmin, isEditOpen, serverId, t]);

  useEffect(() => {
    if (!isIpCopied) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsIpCopied(false);
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isIpCopied]);

  if (!detail) {
    return <Card>{t('ui.server_detail.loading')}</Card>;
  }

  const endpoint =
    detail.endpoints.find((entry) => entry.is_primary && entry.is_enabled) ??
    detail.endpoints.find((entry) => entry.purpose === 'GAME' && entry.is_enabled) ??
    detail.endpoints.find((entry) => entry.is_enabled) ??
    null;

  const now = Date.now();
  const timelineBars = detail.availabilityTimeline.slice(-42);
  const availabilityHoverPoint =
    availabilityHoverIndex !== null && availabilityHoverIndex >= 0 && availabilityHoverIndex < timelineBars.length
      ? timelineBars[availabilityHoverIndex]
      : null;

  const endpointTarget = endpoint ? `${endpoint.host}:${endpoint.port}` : null;

  const copyEndpointTarget = async (): Promise<void> => {
    if (!endpointTarget) {
      return;
    }

    try {
      await navigator.clipboard.writeText(endpointTarget);
      setIsIpCopied(true);
    } catch {
      const tempInput = document.createElement('input');
      tempInput.value = endpointTarget;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      setIsIpCopied(true);
    }
  };

  const openIncidentForTimestamp = (timestamp: number): void => {
    const incident = detail.incidents.find((item) => {
      const startedAt = new Date(item.started_at).getTime();
      if (!Number.isFinite(startedAt)) {
        return false;
      }

      const endedAt = item.ended_at ? new Date(item.ended_at).getTime() : Date.now();
      const bucketEnd = timestamp + HISTORY_BUCKET_MS;
      return startedAt <= bucketEnd && endedAt >= timestamp;
    });

    if (incident) {
      setSelectedIncident(incident);
    }
  };

  const last24hAvailability = (() => {
    const threshold = now - 24 * 60 * 60 * 1000;
    const points = detail.availabilityTimeline.filter((point) => point.ts >= threshold);
    if (points.length === 0) {
      return 0;
    }

    const ratio = points.reduce((sum, point) => sum + point.uptimeRatio, 0) / points.length;
    return ratio * 100;
  })();

  const last30dAvailability = (() => {
    const threshold = now - 30 * 24 * 60 * 60 * 1000;
    const points = detail.availabilityTimeline.filter((point) => point.ts >= threshold);
    if (points.length === 0) {
      return 0;
    }

    const ratio = points.reduce((sum, point) => sum + point.uptimeRatio, 0) / points.length;
    return ratio * 100;
  })();

  const avg24hPing = (() => {
    const threshold = now - 24 * 60 * 60 * 1000;
    const values = detail.rttTimeline.filter((point) => point.ts >= threshold && point.value > 0).map((point) => point.value);
    if (values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  })();

  const rttChartWindow = (() => {
    const threshold = now - chartRangeToMinutes[chartRange] * 60 * 1000;
    const data = detail.rttTimeline.filter((point) => point.ts >= threshold);
    return data.length > 0 ? data : detail.rttTimeline.slice(-60);
  })();

  const playersChartWindow = (() => {
    const threshold = now - chartRangeToMinutes[chartRange] * 60 * 1000;
    const data = detail.playerTimeline.filter((point) => point.ts >= threshold);
    return data.length > 0 ? data : detail.playerTimeline.slice(-60);
  })();

  const playersChartCoords = toChartCoordinates(playersChartWindow);
  const rttChartCoords = toChartCoordinates(rttChartWindow);
  const playersCoords = toChartCoords(playersChartWindow);
  const rttCoords = toChartCoords(rttChartWindow);
  const playersValueTicks = buildIntegerValueTicks(playersChartWindow, 5);
  const rttValueTicks = buildValueTicks(rttChartWindow, 5);
  const playersTimeTicks = buildTimeTicks(playersChartWindow, 7);
  const rttTimeTicks = buildTimeTicks(rttChartWindow, 7);
  const playersHoverPoint =
    playersHoverIndex !== null && playersHoverIndex >= 0 && playersHoverIndex < playersChartWindow.length
      ? playersChartWindow[playersHoverIndex]
      : null;
  const playersHoverCoord =
    playersHoverIndex !== null && playersHoverIndex >= 0 && playersHoverIndex < playersCoords.length ? playersCoords[playersHoverIndex] : null;
  const rttHoverPoint =
    rttHoverIndex !== null && rttHoverIndex >= 0 && rttHoverIndex < rttChartWindow.length ? rttChartWindow[rttHoverIndex] : null;
  const rttHoverCoord = rttHoverIndex !== null && rttHoverIndex >= 0 && rttHoverIndex < rttCoords.length ? rttCoords[rttHoverIndex] : null;

  const rangeOptions = [
    { value: '30m', label: t('ui.server_detail.range.last_30m') },
    { value: '2h', label: t('ui.server_detail.range.last_2h') },
    { value: '6h', label: t('ui.server_detail.range.last_6h') },
    { value: '24h', label: t('ui.server_detail.range.last_24h') }
  ];

  const sortedRelatedServers = (() => {
    const list = [...relatedServers];

    const onlineScore = (status: ServerSummary['normalized_status']): number => (status === 'ONLINE' ? 1 : 0);
    const offlineScore = (status: ServerSummary['normalized_status']): number => (status === 'OFFLINE' ? 1 : 0);

    list.sort((left, right) => {
      if (relatedSortMode === 'online') {
        const byStatus = onlineScore(right.normalized_status) - onlineScore(left.normalized_status);
        if (byStatus !== 0) {
          return byStatus;
        }
      }

      if (relatedSortMode === 'offline') {
        const byStatus = offlineScore(right.normalized_status) - offlineScore(left.normalized_status);
        if (byStatus !== 0) {
          return byStatus;
        }
      }

      if (relatedSortMode === 'rtt') {
        const leftRtt = left.rtt_ms ?? Number.POSITIVE_INFINITY;
        const rightRtt = right.rtt_ms ?? Number.POSITIVE_INFINITY;
        const byRtt = leftRtt - rightRtt;
        if (byRtt !== 0) {
          return byRtt;
        }
      }

      if (relatedSortMode === 'player') {
        const leftPlayers = left.players_current ?? -1;
        const rightPlayers = right.players_current ?? -1;
        const byPlayers = rightPlayers - leftPlayers;
        if (byPlayers !== 0) {
          return byPlayers;
        }
      }

      return left.name.localeCompare(right.name);
    });

    return list;
  })();

  const canUsePowerControls = isAdmin && !isSaving && Boolean(detail.panel_id);
  const pteroRawState = String(detail.ptero_raw_state ?? '').trim().toLowerCase();
  const isPteroTransition = pteroRawState === 'starting' || pteroRawState === 'stopping' || pteroRawState === 'installing';
  const isTransition = detail.normalized_status === 'TRANSITION' || isPteroTransition;
  const isOnline = pteroRawState === 'running' || detail.normalized_status === 'ONLINE';
  const isOffline = pteroRawState === 'offline' || pteroRawState === 'stopped' || detail.normalized_status === 'OFFLINE';
  const isMaintenance = detail.normalized_status === 'MAINTENANCE';

  const canStart = canUsePowerControls && !isTransition && (isOffline || (!isOnline && !isMaintenance));
  const canStop = canUsePowerControls && !isTransition && isOnline;
  const canRestart = canUsePowerControls && !isTransition && isOnline;

  const powerControlsBaseDisabledReason = (() => {
    if (!isAdmin) {
      return t('ui.server_detail.actions.disabled.no_permission');
    }

    if (isSaving) {
      return t('ui.server_detail.actions.disabled.pending_save');
    }

    if (!detail.panel_id) {
      return t('ui.server_detail.actions.disabled.no_panel_link');
    }

    return null;
  })();

  const startDisabledReason = (() => {
    if (powerControlsBaseDisabledReason) {
      return powerControlsBaseDisabledReason;
    }
    if (isTransition) {
      return t('ui.server_detail.actions.disabled.in_transition');
    }
    if (isOnline) {
      return t('ui.server_detail.actions.disabled.already_online');
    }
    if (isMaintenance) {
      return t('ui.server_detail.actions.disabled.maintenance_mode');
    }
    return t('ui.server_detail.actions.disabled.not_available');
  })();

  const stopDisabledReason = (() => {
    if (powerControlsBaseDisabledReason) {
      return powerControlsBaseDisabledReason;
    }
    if (isTransition) {
      return t('ui.server_detail.actions.disabled.in_transition');
    }
    if (isOffline) {
      return t('ui.server_detail.actions.disabled.already_offline');
    }
    return t('ui.server_detail.actions.disabled.not_available');
  })();

  const restartDisabledReason = (() => {
    if (powerControlsBaseDisabledReason) {
      return powerControlsBaseDisabledReason;
    }
    if (isTransition) {
      return t('ui.server_detail.actions.disabled.in_transition');
    }
    if (isOffline) {
      return t('ui.server_detail.actions.disabled.requires_online');
    }
    return t('ui.server_detail.actions.disabled.not_available');
  })();

  const openLogsModal = async (): Promise<void> => {
    if (!isAdmin) {
      return;
    }

    setIsLogOpen(true);
    setIsLogLoading(true);
    setLogErrorKey(null);

    try {
      const lines = await fetchServerLogsApi(serverId, 160);
      setLogLines(lines);
    } catch (error) {
      const messageKey = error instanceof Error ? error.message : 'error.api_internal_error';
      setLogErrorKey(messageKey);
      setLogLines([]);
    } finally {
      setIsLogLoading(false);
    }
  };

  return (
    <div className="server-detail-layout">
      <Card className="server-detail-related-card">
        <div className="server-detail-related-head">
          <h3 className="section-title">{t('ui.server_detail.related.title')}</h3>
          <p className="text-muted server-detail-related-subtitle">{detail.game_label ?? t('ui.server_detail.related.no_game')}</p>
        </div>
        <div className="server-detail-related-toolbar">
          <button
            type="button"
            className={`server-detail-related-sort ${relatedSortMode === 'online' ? 'is-active' : ''}`.trim()}
            onClick={() => setRelatedSortMode('online')}
          >
            {t('ui.server_detail.related.sort.online')}
          </button>
          <button
            type="button"
            className={`server-detail-related-sort ${relatedSortMode === 'offline' ? 'is-active' : ''}`.trim()}
            onClick={() => setRelatedSortMode('offline')}
          >
            {t('ui.server_detail.related.sort.offline')}
          </button>
          <button
            type="button"
            className={`server-detail-related-sort ${relatedSortMode === 'rtt' ? 'is-active' : ''}`.trim()}
            onClick={() => setRelatedSortMode('rtt')}
          >
            {t('ui.server_detail.related.sort.rtt')}
          </button>
          <button
            type="button"
            className={`server-detail-related-sort ${relatedSortMode === 'player' ? 'is-active' : ''}`.trim()}
            onClick={() => setRelatedSortMode('player')}
          >
            {t('ui.server_detail.related.sort.player')}
          </button>
        </div>
        <div className="server-detail-related-list">
          {relatedServers.length === 0 ? (
            <p className="text-muted">{t('ui.server_detail.related.empty')}</p>
          ) : (
            sortedRelatedServers.map((server) => (
              <button
                key={server.id}
                type="button"
                className="server-detail-related-item"
                onClick={() => {
                  onOpenServer?.(server.id);
                }}
              >
                <div className="server-detail-related-row">
                  <span
                    className={`server-detail-related-status ${server.normalized_status === 'ONLINE' ? 'is-online' : 'is-offline'}`.trim()}
                    aria-hidden="true"
                  />
                  {server.game_icon_url ? <img className="server-detail-related-icon" src={server.game_icon_url} alt="" aria-hidden="true" /> : null}
                  <span className="server-detail-related-name" title={server.name}>{server.name}</span>
                </div>
                <div className="server-detail-related-meta text-muted">
                  <span>
                    {t('ui.server_detail.related.players', {
                      current: server.players_current ?? 0,
                      max: server.players_max ?? 0
                    })}
                  </span>
                  <span>{server.rtt_ms !== null ? t('ui.server_detail.related.rtt', { value: toFixed(server.rtt_ms, 0) }) : '-'}</span>
                </div>
                <div className="server-detail-related-meta text-muted">
                  <span>{getServerPanelOrHosterLabel(server)}</span>
                  <span>
                    {t('ui.server_detail.related.last_check', {
                      minutes: getMinutesSince(server.last_check_at) ?? 0
                    })}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </Card>

      <div className="page-stack server-detail-page">
      <Card className="server-detail-hero-card">
        <div className="server-detail-hero-top">
          <Button variant="secondary" onClick={onBack}>
            {t('ui.server_detail.back')}
          </Button>
          <div className="server-detail-panel-meta">
            <span className="server-detail-panel-name text-muted">{getServerPanelOrHosterLabel(detail) || t('ui.server_detail.hero.no_panel')}</span>
            <p className="text-muted server-detail-refresh-inline">{t('ui.server_detail.hero.next_refresh', { seconds: refreshCountdownSec })}</p>
          </div>
        </div>

        <div className="server-detail-hero-main">
          <div className="server-detail-hero-left">
            <div className="server-detail-title-wrap">
              {detail.game_icon_url ? <img className="server-detail-hero-icon" src={detail.game_icon_url} alt={detail.name} /> : null}
              <div>
                <h2 className="server-detail-title">{detail.name}</h2>
              </div>
            </div>

            <div className="server-detail-hero-meta-row">
              {detail.game_label ? <span className="server-detail-game-chip">{detail.game_label}</span> : null}
              {endpointTarget ? (
                <button className="server-detail-endpoint-line server-detail-endpoint-copy" type="button" onClick={() => void copyEndpointTarget()}>
                  {t('ui.server_detail.hero.endpoint', {
                    protocol: endpoint?.protocol ?? t('ui.server_detail.hero.default_protocol'),
                    target: endpointTarget
                  })}
                </button>
              ) : (
                <p className="server-detail-endpoint-line">
                  {t('ui.server_detail.hero.endpoint', {
                    protocol: endpoint?.protocol ?? t('ui.server_detail.hero.default_protocol'),
                    target: '-'
                  })}
                </p>
              )}
              {isIpCopied ? <span className="server-detail-copy-feedback">{t('ui.server_detail.hero.copied')}</span> : null}
            </div>

            <div className="server-detail-hero-availability">
              <div className="server-detail-activity-row">
                <div className="server-detail-activity-bars">
                  {timelineBars.map((point, index) => (
                    <span
                      key={`timeline-${point.ts}-${index}`}
                      className="server-detail-activity-slot"
                      onMouseEnter={() => {
                        setAvailabilityHoverIndex(index);
                      }}
                      onMouseLeave={() => {
                        setAvailabilityHoverIndex((prev) => (prev === index ? null : prev));
                      }}
                    >
                      {point.uptimeRatio <= 0 ? <span className="server-detail-offline-marker" /> : null}
                      <span
                        className={`server-detail-activity-bar ${point.uptimeRatio > 0 ? 'is-online' : 'is-offline'}`.trim()}
                        style={{ height: `${Math.max(35, Math.round(point.uptimeRatio * 100))}%` }}
                        onClick={() => {
                          openIncidentForTimestamp(point.ts);
                        }}
                      />
                      {availabilityHoverIndex === index && availabilityHoverPoint ? (
                        <span className="server-detail-availability-tooltip" role="tooltip">
                          <span>{t('ui.server_detail.activity.tooltip.time', { value: new Date(availabilityHoverPoint.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</span>
                          <span>
                            {availabilityHoverPoint.uptimeRatio > 0
                              ? t('ui.server_detail.activity.tooltip.online')
                              : t('ui.server_detail.activity.tooltip.offline')}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  ))}
                </div>
                <div className="server-detail-availability-actions">
                  {isAdmin ? (
                    <>
                      <Button
                        variant="secondary"
                        className="server-detail-action server-detail-action-icon"
                        disabled={!canStart}
                        aria-label={t('ui.server_detail.actions.start')}
                        title={canStart ? t('ui.server_detail.actions.start') : `${t('ui.server_detail.actions.start')} • ${startDisabledReason}`}
                        onClick={async () => {
                          setIsSaving(true);
                          setSaveErrorKey(null);
                          setSaveMessageKey(null);

                          try {
                            await controlServerPowerApi(serverId, 'start');
                            setDetail((prev) => (prev ? { ...prev, normalized_status: 'TRANSITION' } : prev));
                            setSaveMessageKey('ui.server_detail.edit.saved');
                          } catch (error) {
                            const messageKey = error instanceof Error ? error.message : 'error.api_internal_error';
                            setSaveErrorKey(messageKey);
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                      >
                        ▶
                      </Button>
                      <Button
                        variant="secondary"
                        className="server-detail-action server-detail-action-icon"
                        disabled={!canStop}
                        aria-label={t('ui.server_detail.actions.stop')}
                        title={canStop ? t('ui.server_detail.actions.stop') : `${t('ui.server_detail.actions.stop')} • ${stopDisabledReason}`}
                        onClick={async () => {
                          setIsSaving(true);
                          setSaveErrorKey(null);
                          setSaveMessageKey(null);

                          try {
                            await controlServerPowerApi(serverId, 'stop');
                            setDetail((prev) => (prev ? { ...prev, normalized_status: 'TRANSITION' } : prev));
                            setSaveMessageKey('ui.server_detail.edit.saved');
                          } catch (error) {
                            const messageKey = error instanceof Error ? error.message : 'error.api_internal_error';
                            setSaveErrorKey(messageKey);
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                      >
                        ■
                      </Button>
                      <Button
                        variant="secondary"
                        className="server-detail-action server-detail-action-icon"
                        disabled={!canRestart}
                        aria-label={t('ui.server_detail.actions.restart')}
                        title={canRestart ? t('ui.server_detail.actions.restart') : `${t('ui.server_detail.actions.restart')} • ${restartDisabledReason}`}
                        onClick={async () => {
                          setIsSaving(true);
                          setSaveErrorKey(null);
                          setSaveMessageKey(null);

                          try {
                            await controlServerPowerApi(serverId, 'restart');
                            setDetail((prev) => (prev ? { ...prev, normalized_status: 'TRANSITION' } : prev));
                            setSaveMessageKey('ui.server_detail.edit.saved');
                          } catch (error) {
                            const messageKey = error instanceof Error ? error.message : 'error.api_internal_error';
                            setSaveErrorKey(messageKey);
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                      >
                        ↻
                      </Button>
                      <Button
                        variant="secondary"
                        className="server-detail-action server-detail-action-icon"
                        disabled={isSaving}
                        aria-label={t('ui.server_detail.actions.edit')}
                        title={t('ui.server_detail.actions.edit')}
                        onClick={() => {
                          setIsEditOpen((prev) => !prev);
                        }}
                      >
                        ✎
                      </Button>
                      <Button
                        variant="secondary"
                        className="server-detail-action server-detail-action-icon"
                        disabled={isSaving}
                        aria-label={t('ui.server_detail.actions.logs')}
                        title={t('ui.server_detail.actions.logs')}
                        onClick={() => {
                          void openLogsModal();
                        }}
                      >
                        ≡
                      </Button>
                      <Button
                        variant="secondary"
                        className="server-detail-action server-detail-action-danger server-detail-action-icon"
                        disabled={isSaving}
                        aria-label={t('ui.server_detail.actions.delete')}
                        title={t('ui.server_detail.actions.delete')}
                        onClick={async () => {
                          const confirmed = confirmDelete(t('ui.server_detail.actions.delete_confirm', { name: detail.name }));
                          if (!confirmed) {
                            return;
                          }

                          setIsSaving(true);
                          setSaveErrorKey(null);
                          setSaveMessageKey(null);

                          try {
                            await deleteServerApi(serverId);
                            onBack();
                          } catch (error) {
                            const messageKey = error instanceof Error ? error.message : 'error.api_internal_error';
                            setSaveErrorKey(messageKey);
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                      >
                        🗑
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {isAdmin && isEditOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('ui.server_detail.edit.title')}>
          <Card className="modal-card modal-card-server-detail-edit stack-md">
            <div className="header-actions">
              <h3 className="section-title">{t('ui.server_detail.edit.title')}</h3>
              <Button variant="ghost" className="events-close-icon" onClick={() => setIsEditOpen(false)} aria-label={t('ui.server_detail.edit.cancel')}>
                ×
              </Button>
            </div>
            <div className="form-grid server-add-section-fields">
              <Input
                id="server-edit-name"
                label={t('ui.server_detail.edit.server_name')}
                value={editServerName}
                onChange={(event) => {
                  setEditServerName(event.target.value);
                }}
              />
              <Select
                id="server-edit-source"
                label={t('ui.server_detail.edit.source')}
                value={editSourceKind}
                options={[
                  { value: 'PTERODACTYL_PANEL', label: t('ui.server_detail.edit.source_ptero') },
                  { value: 'EXTERNAL_HOSTER', label: t('ui.server_detail.edit.source_external') }
                ]}
                disabled={Boolean(detail.panel_id)}
                onChange={(event) => {
                  setEditSourceKind(event.target.value as ServerSourceKind);
                }}
              />
              {editSourceKind === 'EXTERNAL_HOSTER' ? (
                <Select
                  id="server-edit-hoster"
                  label={t('ui.server_detail.edit.hoster')}
                  value={editHoster}
                  options={[
                    { value: 'GENERIC', label: t('ui.admin.external_server.hosters.generic') },
                    { value: 'GPORTAL', label: t('ui.admin.external_server.hosters.gportal') },
                    { value: 'NITRADO', label: t('ui.admin.external_server.hosters.nitrado') },
                    { value: 'SHOCKBYTE', label: t('ui.admin.external_server.hosters.shockbyte') },
                    { value: 'APEX', label: t('ui.admin.external_server.hosters.apex') },
                    { value: 'BISECT', label: t('ui.admin.external_server.hosters.bisect') },
                    { value: 'HOSTHAVOC', label: t('ui.admin.external_server.hosters.hosthavoc') },
                    { value: 'SURVIVAL_SERVERS', label: t('ui.admin.external_server.hosters.survival_servers') }
                  ]}
                  onChange={(event) => {
                    setEditHoster(event.target.value as ServerHoster);
                  }}
                />
              ) : null}
              <Select
                id="server-edit-game-label"
                label={t('ui.server_detail.edit.game_preset')}
                value={editGameLabel}
                options={gameLabelOptions}
                onChange={(event) => {
                  setEditGameLabel(event.target.value);
                }}
              />
              <Select
                id="server-edit-maintenance"
                label={t('ui.server_detail.edit.maintenance_mode')}
                value={editMaintenanceMode}
                options={[
                  { value: 'NORMAL', label: t('ui.server_detail.edit.maintenance_normal') },
                  { value: 'MAINTENANCE', label: t('ui.server_detail.edit.maintenance_maintenance') }
                ]}
                onChange={(event) => {
                  setEditMaintenanceMode(event.target.value as EditMaintenanceMode);
                }}
              />
              <Input
                id="server-edit-game-icon-url"
                label={t('ui.server_detail.edit.game_icon_url')}
                value={editGameIconUrl}
                onChange={(event) => {
                  setEditGameIconUrl(event.target.value);
                }}
              />
              <Input
                id="server-edit-game-icon-upload"
                label={t('ui.server_detail.edit.game_icon_upload')}
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    setEditGameIconFileName('');
                    return;
                  }

                  setEditGameIconFileName(file.name);
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === 'string') {
                      setEditGameIconUrl(reader.result);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </div>
            {editGameIconFileName ? <p className="text-muted">{editGameIconFileName}</p> : null}
            {saveErrorKey ? <p className="text-danger">{t(saveErrorKey)}</p> : null}
            {saveMessageKey ? <p className="text-muted">{t(saveMessageKey)}</p> : null}
            <div className="header-actions">
              <Button
                variant="primary"
                disabled={isSaving}
                onClick={async () => {
                  setIsSaving(true);
                  setSaveErrorKey(null);
                  setSaveMessageKey(null);

                  try {
                    if (!editServerName.trim()) {
                      throw new Error('error.api_validation_error');
                    }

                    const metadataUpdated = await updateServerMetadataApi(serverId, {
                      name: editServerName.trim(),
                      game_label: editGameLabel || null,
                      game_icon_url: editGameIconUrl.trim() || null,
                      hoster: editSourceKind === 'EXTERNAL_HOSTER' ? editHoster : null,
                      source_kind: editSourceKind
                    });

                    const shouldSetMaintenance = editMaintenanceMode === 'MAINTENANCE';
                    const isCurrentlyMaintenance = detail.normalized_status === 'MAINTENANCE';
                    const finalServer =
                      shouldSetMaintenance === isCurrentlyMaintenance
                        ? metadataUpdated
                        : await setServerPauseApi(serverId, shouldSetMaintenance);

                    setDetail((prev) => {
                      if (!prev) {
                        return prev;
                      }

                      return {
                        ...prev,
                        name: finalServer.name,
                        game_label: finalServer.game_label,
                        game_icon_url: finalServer.game_icon_url,
                        normalized_status: finalServer.normalized_status,
                        panel_id: finalServer.panel_id,
                        panel_name: finalServer.panel_name,
                        hoster: finalServer.hoster,
                        source_kind: finalServer.source_kind,
                        ptero_raw_state: finalServer.ptero_raw_state
                      };
                    });

                    setIsEditOpen(false);
                    setSaveMessageKey('ui.server_detail.edit.saved');
                  } catch (error) {
                    const messageKey = error instanceof Error ? error.message : 'error.api_internal_error';
                    setSaveErrorKey(messageKey);
                  } finally {
                    setIsSaving(false);
                  }
                }}
              >
                {t('ui.server_detail.edit.save')}
              </Button>
              <Button variant="secondary" onClick={() => setIsEditOpen(false)}>
                {t('ui.server_detail.edit.cancel')}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <Card className="server-detail-kpi-card">
        <div className="server-detail-kpi-grid">
          <div className="server-detail-kpi-item">
            <p className="server-detail-kpi-label"><span className="server-detail-kpi-icon" aria-hidden="true">●</span>{t('ui.server_detail.kpi.ping_current')}</p>
            <p className="text-muted server-detail-kpi-sub">{t('ui.server_detail.kpi.current')}</p>
            <p className="server-detail-kpi-value">{t('ui.server_detail.kpi.ms_value', { value: toFixed(detail.rtt_ms ?? 0, 2) })}</p>
          </div>
          <div className="server-detail-kpi-item">
            <p className="server-detail-kpi-label"><span className="server-detail-kpi-icon" aria-hidden="true">◉</span>{t('ui.server_detail.kpi.ping_avg')}</p>
            <p className="text-muted server-detail-kpi-sub">{t('ui.server_detail.kpi.last_24h')}</p>
            <p className="server-detail-kpi-value">{t('ui.server_detail.kpi.ms_value', { value: toFixed(avg24hPing, 0) })}</p>
          </div>
          <div className="server-detail-kpi-item">
            <p className="server-detail-kpi-label"><span className="server-detail-kpi-icon" aria-hidden="true">◔</span>{t('ui.server_detail.kpi.availability')}</p>
            <p className="text-muted server-detail-kpi-sub">{t('ui.server_detail.kpi.last_24h')}</p>
            <p className="server-detail-kpi-value">{t('ui.server_detail.kpi.percent_value', { value: toFixed(last24hAvailability, 2) })}</p>
          </div>
          <div className="server-detail-kpi-item">
            <p className="server-detail-kpi-label"><span className="server-detail-kpi-icon" aria-hidden="true">◕</span>{t('ui.server_detail.kpi.availability')}</p>
            <p className="text-muted server-detail-kpi-sub">{t('ui.server_detail.kpi.last_30d')}</p>
            <p className="server-detail-kpi-value">{t('ui.server_detail.kpi.percent_value', { value: toFixed(last30dAvailability, 2) })}</p>
          </div>
        </div>
      </Card>

      <Card className="server-detail-main-chart-card">
        <div className="server-detail-main-chart-header">
          <h3 className="section-title">{t('ui.server_detail.chart.players_title')}</h3>
          <Select
            id="server-detail-chart-range"
            options={rangeOptions}
            value={chartRange}
            className="server-detail-range-select"
            onChange={(event) => {
              const nextValue = event.target.value as ChartRangeValue;
              setChartRange(nextValue);
            }}
          />
        </div>
        <div className="server-detail-main-chart-wrap">
          <div className="server-detail-main-chart-body">
            <div className="server-detail-y-axis" aria-hidden="true">
              {playersValueTicks.map((tick, index) => (
                <span key={`players-axis-${index}`} className="text-muted server-detail-y-axis-label">
                  {formatAxisValue(tick.value)}
                </span>
              ))}
            </div>
            <div className="server-detail-main-chart-canvas">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="server-detail-main-chart-svg"
              aria-hidden="true"
              onMouseMove={(event) => {
                setPlayersHoverIndex(resolveHoverIndex(event, playersChartWindow.length));
              }}
              onMouseLeave={() => {
                setPlayersHoverIndex(null);
              }}
            >
              {playersValueTicks.map((tick, index) => (
                <line key={`players-grid-h-${index}`} x1="0" y1={tick.position} x2="100" y2={tick.position} className="server-detail-main-chart-grid" />
              ))}
              {playersTimeTicks.map((tick, index) => (
                <line key={`players-grid-v-${index}`} x1={tick.position} y1="0" x2={tick.position} y2="100" className="server-detail-main-chart-grid" />
              ))}
              {playersChartCoords.area ? <polygon points={playersChartCoords.area} className="server-detail-main-chart-area" /> : null}
              {playersChartCoords.line ? <polyline points={playersChartCoords.line} className="server-detail-main-chart-line" /> : null}
              {playersHoverCoord ? <circle cx={playersHoverCoord.x} cy={playersHoverCoord.y} r="1.4" className="server-detail-main-chart-hover-dot" /> : null}
            </svg>
            {playersHoverCoord && playersHoverPoint ? (
              <div className={getTooltipClassName(playersHoverCoord)} style={{ left: `${playersHoverCoord.x}%`, top: `${playersHoverCoord.y}%` }}>
                <p>{t('ui.server_detail.chart.tooltip.time', { value: new Date(playersHoverPoint.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</p>
                <p>{t('ui.server_detail.chart.tooltip.players', { value: toFixed(playersHoverPoint.value, 0) })}</p>
              </div>
            ) : null}
            </div>
          </div>
          <div className="server-detail-main-chart-labels">
            {playersTimeTicks.length > 0 ? (
              playersTimeTicks.map((tick, index) => (
                <span key={`players-time-${index}`} className="text-muted" style={{ left: `${tick.position}%` }}>
                  {tick.label}
                </span>
              ))
            ) : (
              <span className="text-muted">{t('ui.server_detail.activity.now')}</span>
            )}
          </div>
          <p className="server-detail-chart-current text-muted">
            {t('ui.server_detail.chart.players_current', {
              current: detail.players_current ?? 0,
              max: detail.players_max ?? 0
            })}
          </p>
        </div>
      </Card>

      <Card className="server-detail-main-chart-card">
        <div className="server-detail-main-chart-header">
          <h3 className="section-title">{t('ui.server_detail.chart.rtt_title')}</h3>
          <Select
            id="server-detail-rtt-chart-range"
            options={rangeOptions}
            value={chartRange}
            className="server-detail-range-select"
            onChange={(event) => {
              const nextValue = event.target.value as ChartRangeValue;
              setChartRange(nextValue);
            }}
          />
        </div>
        <div className="server-detail-main-chart-wrap">
          <div className="server-detail-main-chart-body">
            <div className="server-detail-y-axis" aria-hidden="true">
              {rttValueTicks.map((tick, index) => (
                <span key={`rtt-axis-${index}`} className="text-muted server-detail-y-axis-label">
                  {formatAxisValue(tick.value)}
                </span>
              ))}
            </div>
            <div className="server-detail-main-chart-canvas">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="server-detail-main-chart-svg"
              aria-hidden="true"
              onMouseMove={(event) => {
                setRttHoverIndex(resolveHoverIndex(event, rttChartWindow.length));
              }}
              onMouseLeave={() => {
                setRttHoverIndex(null);
              }}
            >
              {rttValueTicks.map((tick, index) => (
                <line key={`rtt-grid-h-${index}`} x1="0" y1={tick.position} x2="100" y2={tick.position} className="server-detail-main-chart-grid" />
              ))}
              {rttTimeTicks.map((tick, index) => (
                <line key={`rtt-grid-v-${index}`} x1={tick.position} y1="0" x2={tick.position} y2="100" className="server-detail-main-chart-grid" />
              ))}
              {rttChartCoords.area ? <polygon points={rttChartCoords.area} className="server-detail-main-chart-area" /> : null}
              {rttChartCoords.line ? <polyline points={rttChartCoords.line} className="server-detail-main-chart-line" /> : null}
              {rttHoverCoord ? <circle cx={rttHoverCoord.x} cy={rttHoverCoord.y} r="1.4" className="server-detail-main-chart-hover-dot" /> : null}
            </svg>
            {rttHoverCoord && rttHoverPoint ? (
              <div className={getTooltipClassName(rttHoverCoord)} style={{ left: `${rttHoverCoord.x}%`, top: `${rttHoverCoord.y}%` }}>
                <p>{t('ui.server_detail.chart.tooltip.time', { value: new Date(rttHoverPoint.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</p>
                <p>{t('ui.server_detail.chart.tooltip.rtt', { value: toFixed(rttHoverPoint.value, 1) })}</p>
              </div>
            ) : null}
            </div>
          </div>
          <div className="server-detail-main-chart-labels">
            {rttTimeTicks.length > 0 ? (
              rttTimeTicks.map((tick, index) => (
                <span key={`rtt-time-${index}`} className="text-muted" style={{ left: `${tick.position}%` }}>
                  {tick.label}
                </span>
              ))
            ) : (
              <span className="text-muted">{t('ui.server_detail.activity.now')}</span>
            )}
          </div>
        </div>
      </Card>

      {selectedIncident ? (
        <div className="modal-backdrop" onClick={() => setSelectedIncident(null)}>
          <div role="presentation" onClick={(event) => event.stopPropagation()}>
          <Card className="modal-card server-detail-incident-modal">
            <div className="row-between">
              <h3 className="section-title">{t('ui.server_detail.incident_modal.title')}</h3>
              <Button variant="secondary" onClick={() => setSelectedIncident(null)}>
                {t('ui.server_detail.incident_modal.close')}
              </Button>
            </div>
            <div className="server-detail-incident-grid">
              <p><strong>{t('ui.server_detail.incident_modal.reason')}</strong> {selectedIncident.reason_code}</p>
              <p><strong>{t('ui.server_detail.incident_modal.source')}</strong> {selectedIncident.reason_source ?? '-'}</p>
              <p><strong>{t('ui.server_detail.incident_modal.started')}</strong> {new Date(selectedIncident.started_at).toLocaleString()}</p>
              <p><strong>{t('ui.server_detail.incident_modal.ended')}</strong> {selectedIncident.ended_at ? new Date(selectedIncident.ended_at).toLocaleString() : '-'}</p>
              <p><strong>{t('ui.server_detail.incident_modal.status')}</strong> {selectedIncident.start_status} → {selectedIncident.end_status ?? '-'}</p>
              <p>
                <strong>{t('ui.server_detail.incident_modal.duration')}</strong>{' '}
                {selectedIncident.duration_seconds !== null
                  ? t('ui.server_detail.incident_modal.duration_value', { minutes: Math.max(0, Math.round(selectedIncident.duration_seconds / 60)) })
                  : '-'}
              </p>
            </div>
          </Card>
          </div>
        </div>
      ) : null}

      {isLogOpen ? (
        <div className="modal-backdrop" onClick={() => setIsLogOpen(false)}>
          <div role="presentation" onClick={(event) => event.stopPropagation()}>
            <Card className="modal-card server-detail-log-modal">
              <div className="row-between">
                <h3 className="section-title">{t('ui.server_detail.log_modal.title')}</h3>
                <Button variant="secondary" onClick={() => setIsLogOpen(false)}>
                  {t('ui.server_detail.log_modal.close')}
                </Button>
              </div>
              {isLogLoading ? <p className="text-muted">{t('ui.server_detail.log_modal.loading')}</p> : null}
              {logErrorKey ? <p className="text-danger">{t(logErrorKey)}</p> : null}
              {!isLogLoading && !logErrorKey ? (
                <pre className="server-detail-log-pre">{logLines.length > 0 ? logLines.join('\n') : t('ui.server_detail.log_modal.empty')}</pre>
              ) : null}
            </Card>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
};
