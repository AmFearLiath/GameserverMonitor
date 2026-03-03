import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchServerHistoryApi, fetchServers, type ServerHistoryDto } from '../api.js';
import { Login } from './Login.js';
import { ServerDetail } from './ServerDetail.js';
import { Card } from '../components/primitives/Card.js';
import { Input } from '../components/primitives/Input.js';
import { Button } from '../components/primitives/Button.js';
import { Toggle } from '../components/primitives/Toggle.js';
import { Table } from '../components/primitives/Table.js';
import { StatusBadge } from '../components/domain/StatusBadge.js';
import type { ServerSummary, ServerStatus } from '../types.js';
import brandIcon from '../theme/logo_bw.png';

type PublicHomeProps = {
  onLogin: (username: string, password: string, rememberMe: boolean) => Promise<void>;
  onRegister: (username: string, email: string, password: string) => Promise<void>;
  onDiscordLogin: (rememberMe: boolean) => Promise<void>;
  locale: string;
  onLocaleToggle: () => void;
  isAuthenticated?: boolean;
  isAdmin?: boolean;
  onBackToAdmin?: () => void;
};

type ViewMode = 'list' | 'cards';
type PublicSortMode = 'online' | 'offline' | 'rtt' | 'player';

type ChartPoint = {
  label: string;
  value: number;
};

type ServerSeries = {
  rtt: ChartPoint[];
  players: ChartPoint[];
};

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const PUBLIC_REFRESH_MS = 15_000;
const PUBLIC_HOME_VIEW_MODE_KEY = 'public-home:view-mode';

const getLast24HourRange = (): { fromIso: string; toIso: string } => {
  const to = new Date();
  const from = new Date(to.getTime() - TWENTY_FOUR_HOURS_MS);
  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString()
  };
};

const downsamplePoints = (points: ChartPoint[], maxPoints: number): ChartPoint[] => {
  if (points.length <= maxPoints) {
    return points;
  }

  const step = Math.ceil(points.length / maxPoints);
  const reduced: ChartPoint[] = [];

  for (let index = 0; index < points.length; index += step) {
    reduced.push(points[index]);
  }

  const last = points[points.length - 1];
  if (reduced[reduced.length - 1] !== last) {
    reduced.push(last);
  }

  return reduced;
};

const buildSeries = (
  history: ServerHistoryDto[],
  selector: (entry: ServerHistoryDto) => number | null,
  fromMs: number,
  toMs: number
): ChartPoint[] => {
  const bucketValues = new Map<number, number>();

  for (const entry of history) {
    const timestamp = new Date(entry.bucket_start).getTime();
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const bucketStart = Math.floor(timestamp / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
    const rawValue = selector(entry);
    if (rawValue === null || !Number.isFinite(rawValue)) {
      continue;
    }

    bucketValues.set(bucketStart, rawValue);
  }

  const points: ChartPoint[] = [];
  let carry = 0;

  for (let tick = fromMs; tick <= toMs; tick += FIVE_MINUTES_MS) {
    const next = bucketValues.get(tick);
    if (typeof next === 'number') {
      carry = next;
    }

    const date = new Date(tick);
    const label = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    points.push({ label, value: Math.max(0, Math.round(carry)) });
  }

  return points;
};

const toChartCoordinates = (points: ChartPoint[]): { line: string; area: string } => {
  if (points.length === 0) {
    return { line: '', area: '' };
  }

  const max = Math.max(...points.map((point) => point.value), 1);
  const coords = points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * 100;
    const y = 96 - (point.value / max) * 88;
    return { x, y };
  });

  return {
    line: coords.map((point) => `${point.x},${point.y}`).join(' '),
    area: `${coords.map((point) => `${point.x},${point.y}`).join(' ')} 100,100 0,100`
  };
};

const buildLabelTicks = (points: ChartPoint[], count: number): Array<{ label: string; position: number }> => {
  if (points.length === 0) {
    return [];
  }

  const desired = Math.min(count, points.length);
  const rawIndexes = Array.from({ length: desired }, (_value, index) => {
    if (desired === 1) {
      return 0;
    }

    return Math.round((index * (points.length - 1)) / (desired - 1));
  });

  const uniqueIndexes = Array.from(new Set(rawIndexes));
  return uniqueIndexes.map((pointIndex) => ({
    label: points[pointIndex].label,
    position: points.length === 1 ? 0 : (pointIndex / (points.length - 1)) * 100
  }));
};

const Chart = ({
  points,
  label,
  compact = false,
  variant = 'players'
}: {
  points: ChartPoint[];
  label: string;
  compact?: boolean;
  variant?: 'players' | 'rtt';
}): JSX.Element => {
  const renderPoints = downsamplePoints(points, compact ? 96 : 240);
  const chartCoordinates = toChartCoordinates(renderPoints);
  const labelTicks = buildLabelTicks(renderPoints, compact ? 4 : 6);
  const variantClass = `line-chart-variant-${variant}`;

  return (
    <div className={`line-chart line-chart-detail ${variantClass} ${compact ? 'line-chart-compact' : ''}`.trim()} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="line-chart-svg">
        {[0, 25, 50, 75, 100].map((position) => (
          <line key={`grid-h-${position}`} x1="0" y1={position} x2="100" y2={position} className="line-chart-grid" />
        ))}
        {labelTicks.map((tick, index) => (
          <line key={`grid-v-${index}`} x1={tick.position} y1="0" x2={tick.position} y2="100" className="line-chart-grid" />
        ))}
        {chartCoordinates.area ? <polygon points={chartCoordinates.area} className="line-chart-area-public" /> : null}
        {chartCoordinates.line ? <polyline points={chartCoordinates.line} className="line-chart-stroke line-chart-stroke-public line-chart-stroke-detail" /> : null}
      </svg>
      <div className="line-chart-labels">
        {labelTicks.map((tick, index) => (
          <span key={`${tick.label}-${index}`}>{tick.label}</span>
        ))}
      </div>
    </div>
  );
};

const mapStatusCounts = (servers: ServerSummary[]): Record<ServerStatus, number> => {
  const counts: Record<ServerStatus, number> = {
    ONLINE: 0,
    OFFLINE: 0,
    TRANSITION: 0,
    MAINTENANCE: 0
  };

  for (const server of servers) {
    counts[server.normalized_status] += 1;
  }

  return counts;
};

export const PublicHome = ({
  onLogin,
  onRegister,
  onDiscordLogin,
  locale,
  onLocaleToggle,
  isAuthenticated = false,
  isAdmin = false,
  onBackToAdmin
}: PublicHomeProps): JSX.Element => {
  const { t } = useTranslation();
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [serverSeries, setServerSeries] = useState<Record<string, ServerSeries>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSeriesLoading, setIsSeriesLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') {
      return 'list';
    }

    const storedValue = window.localStorage.getItem(PUBLIC_HOME_VIEW_MODE_KEY);
    return storedValue === 'cards' || storedValue === 'list' ? storedValue : 'list';
  });
  const [sortMode, setSortMode] = useState<PublicSortMode>('online');
  const [hideOfflineServers, setHideOfflineServers] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [refreshCountdownSec, setRefreshCountdownSec] = useState<number>(Math.floor(PUBLIC_REFRESH_MS / 1000));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PUBLIC_HOME_VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    let disposed = false;
    let loading = false;

    const loadServers = async (): Promise<void> => {
      if (loading) {
        return;
      }

      loading = true;
      setIsLoading(true);

      try {
        const data = await fetchServers();
        if (!disposed) {
          setServers(data);
          setRefreshCountdownSec(Math.floor(PUBLIC_REFRESH_MS / 1000));
        }
      } finally {
        loading = false;
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void loadServers();

    const refreshIntervalId = window.setInterval(() => {
      void loadServers();
    }, PUBLIC_REFRESH_MS);

    const countdownIntervalId = window.setInterval(() => {
      setRefreshCountdownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(refreshIntervalId);
      window.clearInterval(countdownIntervalId);
    };
  }, []);

  useEffect(() => {
    if (servers.length === 0) {
      setServerSeries({});
      return;
    }

    let disposed = false;
    setIsSeriesLoading(true);

    const loadSeries = async (): Promise<void> => {
      const range = getLast24HourRange();
      const fromMs = Math.floor(new Date(range.fromIso).getTime() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
      const toMs = Math.floor(new Date(range.toIso).getTime() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;

      const entries = await Promise.all(
        servers.map(async (server) => {
          try {
            const history = await fetchServerHistoryApi(server.id, { from: range.fromIso, to: range.toIso });
            const rtt = buildSeries(history, (item) => item.rtt_avg_ms ?? null, fromMs, toMs);
            const players = buildSeries(history, (item) => item.players_avg ?? null, fromMs, toMs);
            return [server.id, { rtt, players }] as const;
          } catch {
            const rtt = buildSeries([], () => null, fromMs, toMs);
            const players = buildSeries([], () => null, fromMs, toMs);
            return [server.id, { rtt, players }] as const;
          }
        })
      );

      if (disposed) {
        return;
      }

      setServerSeries(Object.fromEntries(entries));
      setIsSeriesLoading(false);
    };

    void loadSeries().catch(() => {
      if (disposed) {
        return;
      }
      const range = getLast24HourRange();
      const fromMs = Math.floor(new Date(range.fromIso).getTime() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
      const toMs = Math.floor(new Date(range.toIso).getTime() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
      const fallbackEntries = servers.map((server) => [
        server.id,
        {
          rtt: buildSeries([], () => null, fromMs, toMs),
          players: buildSeries([], () => null, fromMs, toMs)
        }
      ] as const);
      setServerSeries(Object.fromEntries(fallbackEntries));
      setIsSeriesLoading(false);
    });

    return () => {
      disposed = true;
    };
  }, [servers]);

  const filteredServers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return servers;
    }

    return servers.filter((server) => {
      return (
        server.name.toLowerCase().includes(normalizedQuery) ||
        String(server.game_label ?? '').toLowerCase().includes(normalizedQuery) ||
        String(server.panel_name ?? server.hoster ?? server.panel_id ?? '').toLowerCase().includes(normalizedQuery)
      );
    });
  }, [query, servers]);

  const statusCounts = useMemo(() => mapStatusCounts(filteredServers), [filteredServers]);

  const listServers = useMemo(() => {
    if (!hideOfflineServers) {
      return filteredServers;
    }

    return filteredServers.filter((server) => server.normalized_status !== 'OFFLINE');
  }, [filteredServers, hideOfflineServers]);

  const sortedServers = useMemo(() => {
    const list = [...listServers];

    const onlineScore = (status: ServerSummary['normalized_status']): number => (status === 'ONLINE' ? 1 : 0);
    const offlineScore = (status: ServerSummary['normalized_status']): number => (status === 'OFFLINE' ? 1 : 0);

    list.sort((left, right) => {
      if (sortMode === 'online') {
        const byStatus = onlineScore(right.normalized_status) - onlineScore(left.normalized_status);
        if (byStatus !== 0) {
          return byStatus;
        }
      }

      if (sortMode === 'offline') {
        const byStatus = offlineScore(right.normalized_status) - offlineScore(left.normalized_status);
        if (byStatus !== 0) {
          return byStatus;
        }
      }

      if (sortMode === 'rtt') {
        const leftRtt = left.rtt_ms ?? Number.POSITIVE_INFINITY;
        const rightRtt = right.rtt_ms ?? Number.POSITIVE_INFINITY;
        const byRtt = leftRtt - rightRtt;
        if (byRtt !== 0) {
          return byRtt;
        }
      }

      if (sortMode === 'player') {
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
  }, [listServers, sortMode]);

  const playerNow = useMemo(
    () => filteredServers.reduce((sum, server) => sum + (server.players_current ?? 0), 0),
    [filteredServers]
  );

  const avgRtt = useMemo(() => {
    const samples = filteredServers
      .map((server) => server.rtt_ms)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    if (samples.length === 0) {
      return null;
    }

    return Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
  }, [filteredServers]);

  const rttChartPoints = useMemo<ChartPoint[]>(() => {
    return filteredServers.slice(0, 12).map((server, index) => ({
      label: `${index + 1}`,
      value: server.rtt_ms ?? 0
    }));
  }, [filteredServers]);

  const playerChartPoints = useMemo<ChartPoint[]>(() => {
    return filteredServers.slice(0, 12).map((server, index) => ({
      label: `${index + 1}`,
      value: server.players_current ?? 0
    }));
  }, [filteredServers]);

  if (selectedServerId) {
    return (
      <main className="app-shell">
        <header className="header public-header">
          <div className="header-row">
            <div className="header-brand">
              <img className="header-logo" src={brandIcon} alt={t('ui.header.brand_name')} />
            </div>
            <div className="header-right">
              <Button variant="secondary" onClick={() => {
                setSelectedServerId(null);
              }}>
                {t('ui.server_detail.back')}
              </Button>
              {isAuthenticated && onBackToAdmin ? (
                <Button variant="primary" onClick={onBackToAdmin}>
                  {t('ui.public_home.back_to_admin')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => {
                    setIsLoginModalOpen(true);
                  }}
                >
                  {t('ui.public_home.login_button')}
                </Button>
              )}
            </div>
          </div>
        </header>
        <section className="app-body public-home-body">
          <section className="content-shell public-content-shell">
            <section className="content-area">
              <ServerDetail
                serverId={selectedServerId}
                isAdmin={isAdmin}
                onOpenServer={(nextServerId) => {
                  setSelectedServerId(nextServerId);
                }}
                onBack={() => {
                  setSelectedServerId(null);
                }}
              />
            </section>
          </section>
        </section>
        {!isAuthenticated && isLoginModalOpen ? (
          <div className="modal-backdrop">
            <Login
              embedded
              onClose={() => {
                setIsLoginModalOpen(false);
              }}
              onLogin={onLogin}
              onRegister={onRegister}
              onDiscordLogin={onDiscordLogin}
            />
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="header public-header">
        <div className="header-row">
          <div className="header-brand">
            <img className="header-logo" src={brandIcon} alt={t('ui.header.brand_name')} />
          </div>
          <div className="header-right">
            <Input
              id="public-search"
              placeholder={t('ui.public_home.search_placeholder')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
            <button className="sidebar-language" type="button" onClick={onLocaleToggle}>
              <span className={locale === 'en' ? 'is-active' : ''}>{t('ui.sidebar.locale_en')}</span>
              <span>/</span>
              <span className={locale === 'de' ? 'is-active' : ''}>{t('ui.sidebar.locale_de')}</span>
            </button>
            {isAuthenticated && onBackToAdmin ? (
              <Button variant="primary" onClick={onBackToAdmin}>
                {t('ui.public_home.back_to_admin')}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  setIsLoginModalOpen(true);
                }}
              >
                {t('ui.public_home.login_button')}
              </Button>
            )}
          </div>
        </div>
      </header>

      <section className="app-body public-home-body">
        <section className="content-shell public-content-shell">
          <section className="content-area">
            <div className="page-stack">
              <Card className="public-hero-card">
                <section className="public-home-hero-content">
                  <div className="public-home-left">
                    <div className="public-home-left-metrics">
                      <Card className="metric-tile metric-maintenance public-metric-tile public-hero-card-item">
                        <p className="metric-label">{t('ui.public_home.metrics.players_now')}</p>
                        <p className="metric-value">{playerNow}</p>
                      </Card>
                      <Card className="metric-tile metric-transition public-metric-tile public-hero-card-item">
                        <p className="metric-label">{t('ui.public_home.metrics.avg_rtt')}</p>
                        <p className="metric-value">{avgRtt === null ? '-' : `${avgRtt} ms`}</p>
                      </Card>
                    </div>
                    <div className="public-server-summary-badges public-server-summary-badges-hero">
                      <span className="public-server-summary-badge is-online">{t('status.online')}: {statusCounts.ONLINE}</span>
                      <span className="public-server-summary-badge is-offline">{t('status.offline')}: {statusCounts.OFFLINE}</span>
                      <span className="public-server-summary-badge is-total">{t('ui.public_home.total_servers')}: {sortedServers.length}</span>
                    </div>
                  </div>
                  <div className="public-home-right">
                    <Card className="public-trend-card public-hero-card-item">
                      <h3 className="section-title">{t('ui.public_home.charts.players')}</h3>
                      <Chart points={playerChartPoints} label={t('ui.public_home.charts.players_aria')} variant="players" />
                    </Card>
                    <Card className="public-trend-card public-hero-card-item">
                      <h3 className="section-title">{t('ui.public_home.charts.rtt')}</h3>
                      <Chart points={rttChartPoints} label={t('ui.public_home.charts.rtt_aria')} variant="rtt" />
                    </Card>
                  </div>
                </section>
              </Card>

              <Card className="public-server-list-shell public-server-list-shell-full">
                  <div className="row-between">
                    <div className="public-server-list-head-left">
                      <div className="public-server-list-sortbar">
                        <button
                          type="button"
                          className={`public-server-list-sort ${sortMode === 'online' ? 'is-active' : ''}`.trim()}
                          onClick={() => setSortMode('online')}
                        >
                          {t('status.online')}
                        </button>
                        <button
                          type="button"
                          className={`public-server-list-sort ${sortMode === 'offline' ? 'is-active' : ''}`.trim()}
                          onClick={() => setSortMode('offline')}
                        >
                          {t('status.offline')}
                        </button>
                        <button
                          type="button"
                          className={`public-server-list-sort ${sortMode === 'rtt' ? 'is-active' : ''}`.trim()}
                          onClick={() => setSortMode('rtt')}
                        >
                          {t('ui.server_card.rtt_short')}
                        </button>
                        <button
                          type="button"
                          className={`public-server-list-sort ${sortMode === 'player' ? 'is-active' : ''}`.trim()}
                          onClick={() => setSortMode('player')}
                        >
                          {t('ui.server_detail.related.sort.player')}
                        </button>
                      </div>
                    </div>
                    <div className="public-server-list-head-right">
                      <Toggle
                        id="public-view-toggle"
                        label={t('ui.public_home.view_toggle')}
                        checked={viewMode === 'list'}
                        onChange={(next) => {
                          setViewMode(next ? 'list' : 'cards');
                        }}
                      />
                      <Toggle
                        id="public-hide-offline-toggle"
                        label={t('ui.public_home.hide_offline')}
                        checked={hideOfflineServers}
                        onChange={setHideOfflineServers}
                      />
                      <p className="text-muted server-detail-refresh-inline">{t('ui.public_home.next_refresh', { seconds: refreshCountdownSec })}</p>
                    </div>
                  </div>

                  {viewMode === 'cards' ? (
                    <section className="public-server-list-cards">
                      {sortedServers.map((server) => (
                        <button
                          key={server.id}
                          type="button"
                          className="public-server-list-item"
                          onClick={() => {
                            setSelectedServerId(server.id);
                          }}
                        >
                          <div className="server-card-head">
                            <h3 className="server-card-title">
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
                            </h3>
                            <StatusBadge status={server.normalized_status} />
                          </div>
                          <div className="public-server-list-meta text-muted">
                            <span>{server.game_label ?? '-'}</span>
                            <span>{server.panel_name ?? server.hoster ?? server.panel_id ?? '-'}</span>
                          </div>
                          <div className="public-server-list-meta text-muted">
                            <span>{t('ui.server_card.players', { current: server.players_current ?? 0, max: server.players_max ?? 0 })}</span>
                            <span>{t('ui.server_card.rtt', { value: server.rtt_ms ? `${server.rtt_ms} ms` : '-' })}</span>
                          </div>
                        </button>
                      ))}
                      {!isLoading && sortedServers.length === 0 ? <Card>{t('ui.public_home.empty')}</Card> : null}
                    </section>
                  ) : (
                    <div className="public-server-list-table">
                      <Table
                        headers={[
                          t('ui.table.name'),
                          t('ui.table.status'),
                          t('ui.server_card.players_short'),
                          t('ui.server_card.rtt_short'),
                          t('ui.table.actions')
                        ]}
                        rows={
                          sortedServers.length > 0
                            ? sortedServers.map((server) => [
                                <button
                                  key={`${server.id}-name`}
                                  type="button"
                                  className="link-button public-server-name-link"
                                  onClick={() => {
                                    setSelectedServerId(server.id);
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
                                <div key={`${server.id}-players-cell`} className="public-list-chart-cell">
                                  <Chart
                                    compact
                                    variant="players"
                                    points={serverSeries[server.id]?.players ?? []}
                                    label={t('ui.public_home.charts.server_players_aria', { server: server.name })}
                                  />
                                  <span className="public-list-chart-value text-muted">
                                    {t('ui.server_card.players', { current: server.players_current ?? 0, max: server.players_max ?? 0 })}
                                  </span>
                                </div>,
                                <div key={`${server.id}-rtt-cell`} className="public-list-chart-cell">
                                  <Chart
                                    compact
                                    variant="rtt"
                                    points={serverSeries[server.id]?.rtt ?? []}
                                    label={t('ui.public_home.charts.server_rtt_aria', { server: server.name })}
                                  />
                                  <span className="public-list-chart-value text-muted">
                                    {t('ui.server_card.rtt', { value: server.rtt_ms ? `${server.rtt_ms} ms` : '-' })}
                                  </span>
                                </div>,
                                <Button
                                  key={`${server.id}-detail`}
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedServerId(server.id);
                                  }}
                                >
                                  {t('ui.public_home.details_button')}
                                </Button>
                              ])
                            : [[t('ui.public_home.empty'), '', '', '', '']]
                        }
                      />
                    </div>
                  )}

                  {isSeriesLoading ? <p className="text-muted">{t('ui.public_home.loading_trends')}</p> : null}
              </Card>
            </div>
          </section>
        </section>
      </section>

      {!isAuthenticated && isLoginModalOpen ? (
        <div className="modal-backdrop">
          <Login
            embedded
            onClose={() => {
              setIsLoginModalOpen(false);
            }}
            onLogin={onLogin}
            onRegister={onRegister}
            onDiscordLogin={onDiscordLogin}
          />
        </div>
      ) : null}
    </main>
  );
};
