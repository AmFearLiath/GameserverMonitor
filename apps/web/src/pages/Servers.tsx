import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ServerCard } from '../components/domain/ServerCard.js';
import { StatusBadge } from '../components/domain/StatusBadge.js';
import { Badge } from '../components/primitives/Badge.js';
import { Card } from '../components/primitives/Card.js';
import { Select } from '../components/primitives/Select.js';
import { Table } from '../components/primitives/Table.js';
import { Toggle } from '../components/primitives/Toggle.js';
import { fetchServers } from '../api.js';
import type { DashboardServer, ServerStatus, ServerSummary } from '../types.js';

type ServersProps = {
  globalSearch: string;
  onOpenServer: (serverId: string) => void;
  isAdmin: boolean;
  profileId: string;
};

type ViewMode = 'list' | 'grid';
const SERVERS_POLL_INTERVAL_MS = 15_000;

const calculateLastCheckMinutes = (value: string | null): number => {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  const diffMs = Date.now() - timestamp;
  return Math.max(0, Math.floor(diffMs / 60000));
};

const toDashboardServer = (server: ServerSummary): DashboardServer => ({
  id: server.id,
  name: server.name,
  game_icon_url: server.game_icon_url,
  normalized_status: server.normalized_status,
  players_current: server.players_current ?? 0,
  players_max: server.players_max ?? 0,
  rtt_ms: server.rtt_ms,
  last_check_minutes_ago: calculateLastCheckMinutes(server.last_check_at),
  tags: server.tags,
  panel_id: server.panel_id ?? ''
});

const hasNumericValue = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const getReasonBadge = (
  server: ServerSummary,
  t: (key: string, options?: Record<string, unknown>) => string
): { label: string; className: string } => {
  const reasonCode = server.last_reason_code ?? '';

  if (server.normalized_status === 'OFFLINE') {
    return { label: t('status.offline'), className: 'status-badge status-badge-offline' };
  }

  if (server.normalized_status === 'ONLINE') {
    return { label: t('status.online'), className: 'status-badge status-badge-online' };
  }

  if (reasonCode === 'ADAPTER_OK') {
    return { label: t('status.online'), className: 'status-badge status-badge-online' };
  }

  if (reasonCode.includes('TIMEOUT')) {
    return { label: t('ui.servers.reason_badges.timeout'), className: 'status-badge reason-badge-timeout' };
  }

  if (reasonCode.includes('UNSUPPORTED')) {
    return { label: t('ui.servers.reason_badges.unsupported'), className: 'status-badge reason-badge-transition' };
  }

  if (server.last_reason_source === 'PTERO' && (reasonCode.includes('SYNC') || reasonCode.includes('IMPORTED'))) {
    return { label: t('ui.servers.reason_badges.panel_sync'), className: 'status-badge reason-badge-ptero' };
  }

  return {
    label: reasonCode || t('ui.servers.reason_badges.unknown'),
    className: 'status-badge reason-badge-transition'
  };
};

export const Servers = ({ globalSearch, onOpenServer, isAdmin, profileId }: ServersProps): JSX.Element => {
  const { t } = useTranslation();
  const canManageServers = isAdmin;
  const [statusFilter, setStatusFilter] = useState<'ALL' | ServerStatus>('ALL');
  const [tagFilter, setTagFilter] = useState<'ALL' | string>('ALL');
  const [panelFilter, setPanelFilter] = useState<'ALL' | string>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const key = `gm.profile.${profileId}.servers.view_mode`;
    const stored = window.localStorage.getItem(key);
    if (stored === 'list' || stored === 'grid') {
      setViewMode(stored);
      return;
    }

    setViewMode('list');
  }, [profileId]);

  useEffect(() => {
    const key = `gm.profile.${profileId}.servers.view_mode`;
    window.localStorage.setItem(key, viewMode);
  }, [profileId, viewMode]);

  useEffect(() => {
    let disposed = false;

    const loadServers = async (): Promise<void> => {
      setIsLoading(true);
      try {
        const data = await fetchServers();
        if (disposed) {
          return;
        }

        setServers(data);
        setLoadError(null);
      } catch {
        if (disposed) {
          return;
        }

        setLoadError('error.load_servers_failed');
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void loadServers();
    const intervalId = window.setInterval(() => {
      void loadServers();
    }, SERVERS_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const statusOptions = useMemo(
    () => [
      { value: 'ALL', label: t('ui.filters.all_statuses') },
      { value: 'ONLINE', label: t('status.online') },
      { value: 'OFFLINE', label: t('status.offline') },
      { value: 'TRANSITION', label: t('status.transition') },
      { value: 'MAINTENANCE', label: t('status.maintenance') }
    ],
    [t]
  );

  const filteredServers = useMemo(() => {
    const normalizedQuery = globalSearch.trim().toLowerCase();

    return servers.filter((server) => {
      if (statusFilter !== 'ALL' && server.normalized_status !== statusFilter) {
        return false;
      }

      if (tagFilter !== 'ALL' && !server.tags.includes(tagFilter)) {
        return false;
      }

      if (panelFilter !== 'ALL' && (server.panel_id ?? '') !== panelFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = `${server.name} ${server.game_label ?? ''} ${server.panel_name ?? ''} ${server.hoster ?? ''} ${server.panel_id ?? ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [globalSearch, panelFilter, servers, statusFilter, tagFilter]);

  const availableTags = useMemo(() => {
    const unique = new Set<string>();
    for (const server of servers) {
      for (const tag of server.tags) {
        unique.add(tag);
      }
    }

    return Array.from(unique).sort((left, right) => left.localeCompare(right));
  }, [servers]);

  const availablePanels = useMemo(() => {
    const unique = new Map<string, string>();
    for (const server of servers) {
      if (server.panel_id) {
        unique.set(server.panel_id, server.panel_name ?? server.panel_id);
      }
    }

    return Array.from(unique.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [servers]);

  if (isLoading) {
    return <Card>{t('ui.dashboard.loading')}</Card>;
  }

  return (
    <div className="page-stack">
      <Card className="servers-toolbar">
        <div className="servers-toolbar-left">
          <Select
            id="servers-status"
            value={statusFilter}
            options={statusOptions}
            onChange={(event) => {
              setStatusFilter(event.target.value as 'ALL' | ServerStatus);
            }}
          />
          <Select
            id="servers-tag"
            value={tagFilter}
            options={[{ value: 'ALL', label: t('ui.filters.all_tags') }, ...availableTags.map((tag) => ({ value: tag, label: tag }))]}
            onChange={(event) => {
              setTagFilter(event.target.value);
            }}
          />
          <Select
            id="servers-panel"
            value={panelFilter}
            options={[
              { value: 'ALL', label: t('ui.filters.all_panels') },
              ...availablePanels.map((panel) => ({ value: panel.id, label: panel.name }))
            ]}
            onChange={(event) => {
              setPanelFilter(event.target.value);
            }}
          />
          <Toggle
            id="servers-view-toggle"
            label={t('ui.filters.grid_list_toggle')}
            checked={viewMode === 'grid'}
            onChange={(next) => {
              setViewMode(next ? 'grid' : 'list');
            }}
          />
        </div>
        <div className="servers-toolbar-right" data-admin={canManageServers ? '1' : '0'} />
      </Card>

      {loadError ? <Card><p className="text-danger">{t(loadError)}</p></Card> : null}

      {viewMode === 'grid' ? (
        <section className="server-grid">
          {filteredServers.map((server) => (
            <ServerCard key={server.id} server={toDashboardServer(server)} onOpen={onOpenServer} />
          ))}
        </section>
      ) : (
        <Card>
          <Table
            headers={[
              t('ui.table.name'),
              t('ui.table.status'),
              t('ui.table.reason'),
              t('ui.server_card.players_short'),
              t('ui.server_card.rtt_short'),
              t('ui.servers.modal.game_label'),
              t('ui.servers.modal.panel'),
              t('ui.server_card.last_check_short')
            ]}
            rows={filteredServers.map((server) => {
              const reasonBadge = getReasonBadge(server, t);

              return [
              <button
                key={`${server.id}-open`}
                className="link-button"
                type="button"
                onClick={() => {
                  onOpenServer(server.id);
                }}
              >
                <span className="server-list-name">
                  {server.game_icon_url ? (
                    <img className="server-list-icon" src={server.game_icon_url} alt="" aria-hidden="true" />
                  ) : (
                    <span className="server-list-icon-fallback" aria-hidden="true">
                      {server.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span>{server.name}</span>
                </span>
              </button>,
              <StatusBadge key={`${server.id}-status`} status={server.normalized_status} />,
              <Badge key={`${server.id}-reason`} className={reasonBadge.className}>
                {reasonBadge.label}
              </Badge>,
              hasNumericValue(server.players_current) && hasNumericValue(server.players_max)
                ? `${server.players_current}/${server.players_max}`
                : '-',
              hasNumericValue(server.rtt_ms) ? `${server.rtt_ms} ms` : '-',
              server.game_label ?? '-',
              server.panel_name ?? server.hoster ?? server.panel_id ?? '-',
              server.last_check_at
                ? t('ui.server_card.last_check', { minutes: calculateLastCheckMinutes(server.last_check_at) })
                : '-'
            ];
            })}
          />
        </Card>
      )}
    </div>
  );
};
