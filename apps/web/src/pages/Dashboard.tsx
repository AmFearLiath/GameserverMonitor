import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertLogTable } from '../components/domain/AlertLogTable.js';
import { IncidentTable } from '../components/domain/IncidentTable.js';
import { MetricTile } from '../components/domain/MetricTile.js';
import { Card } from '../components/primitives/Card.js';
import { Select } from '../components/primitives/Select.js';
import { fetchAlertEventsApi, fetchServerIncidentsApi, fetchServers, type AlertEventDto } from '../api.js';
import type { AlertLogRow, ChartPoint, IncidentRow, ServerStatus, ServerSummary } from '../types.js';

type DashboardProps = {
  globalSearch: string;
};

type DashboardData = {
  counts: Record<ServerStatus, number>;
  incidents: IncidentRow[];
  alertLog: (AlertLogRow & {
    event_type: AlertEventDto['event_type'];
    suppressed_reason: string | null;
    was_sent: boolean;
    created_at: string;
    reason_code: string | null;
  })[];
  performance: ChartPoint[];
};
const DASHBOARD_POLL_INTERVAL_MS = 15_000;

type AlertDeliveryFilter = 'ALL' | 'ONLY_SENT' | 'ONLY_SUPPRESSED';
type AlertTimeWindowFilter = '24H' | '7D' | '30D';

type ChartProps = {
  points: { label: string; value: number }[];
};

const LineChart = ({ points }: ChartProps): JSX.Element => {
  const max = Math.max(...points.map((point) => point.value), 1);
  const path = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 100;
      const y = 100 - (point.value / max) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="line-chart" role="img" aria-label="Performance chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="line-chart-svg">
        <polyline points={path} className="line-chart-stroke" />
      </svg>
      <div className="line-chart-labels">
        {points.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
    </div>
  );
};

export const Dashboard = ({ globalSearch }: DashboardProps): JSX.Element => {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState<'ALL' | AlertEventDto['event_type']>('ALL');
  const [deliveryFilter, setDeliveryFilter] = useState<AlertDeliveryFilter>('ALL');
  const [timeWindow, setTimeWindow] = useState<AlertTimeWindowFilter>('24H');

  const resolveFromTimestamp = (windowValue: AlertTimeWindowFilter): string => {
    const now = Date.now();
    const deltaMs = windowValue === '24H' ? 24 * 60 * 60 * 1000 : windowValue === '7D' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    return new Date(now - deltaMs).toISOString();
  };

  useEffect(() => {
    let disposed = false;

    const load = async (): Promise<void> => {
      try {
        const servers = await fetchServers();
        const serverById = new Map<string, ServerSummary>(servers.map((server) => [server.id, server]));

        const counts: Record<ServerStatus, number> = {
          ONLINE: 0,
          OFFLINE: 0,
          TRANSITION: 0,
          MAINTENANCE: 0
        };

        for (const server of servers) {
          counts[server.normalized_status] += 1;
        }

        const incidentsPerServer = await Promise.all(
          servers.map(async (server) => {
            const incidents = await fetchServerIncidentsApi(server.id);
            return incidents.map((incident) => ({ server, incident }));
          })
        );

        const incidents = incidentsPerServer
          .flat()
          .map(({ server, incident }) => ({
            id: incident.id,
            server_name: server.name,
            status: (incident.end_status ?? incident.start_status) as ServerStatus,
            started_at: new Date(incident.started_at).toLocaleString(),
            reason: incident.reason_code,
            duration_minutes: incident.duration_seconds ? Math.floor(incident.duration_seconds / 60) : undefined
          }))
          .sort((left, right) => right.started_at.localeCompare(left.started_at))
          .slice(0, 8);

        const alertEvents = await fetchAlertEventsApi({
          limit: 200,
          event_type: eventTypeFilter === 'ALL' ? undefined : eventTypeFilter,
          from: resolveFromTimestamp(timeWindow)
        });
        const alertLog = alertEvents.map((event) => {
          const statusTo = event.status_to ?? 'TRANSITION';
          const severity: AlertLogRow['severity'] =
            statusTo === 'OFFLINE' ? 'ERROR' : statusTo === 'TRANSITION' ? 'WARN' : 'INFO';

          const summaryText =
            (event.payload_summary?.summary as string | undefined) ??
            event.reason_code ??
            event.event_type;

          return {
            id: event.id,
            time: new Date(event.created_at).toLocaleString(),
            server_name: serverById.get(event.server_id)?.name ?? event.server_id,
            message: summaryText,
            severity,
            channel: event.channel_id,
            policy: event.policy_id,
            event_type: event.event_type,
            suppressed_reason: event.suppressed_reason,
            was_sent: event.was_sent,
            created_at: event.created_at,
            reason_code: event.reason_code
          };
        });

        const performance: ChartPoint[] = [
          { label: t('ui.dashboard.performance_short.online'), value: counts.ONLINE },
          { label: t('ui.dashboard.performance_short.offline'), value: counts.OFFLINE },
          { label: t('ui.dashboard.performance_short.transition'), value: counts.TRANSITION },
          { label: t('ui.dashboard.performance_short.maintenance'), value: counts.MAINTENANCE }
        ];

        if (!disposed) {
          setData({ counts, incidents, alertLog, performance });
          setLoadError(null);
        }
      } catch {
        if (!disposed) {
          setLoadError('error.api_internal_error');
        }
      }
    };

    void load();

    const intervalId = window.setInterval(() => {
      void load();
    }, DASHBOARD_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [eventTypeFilter, globalSearch, t, timeWindow]);

  const normalizedSearch = globalSearch.trim().toLowerCase();
  const filteredAlertLog = (data?.alertLog ?? []).filter((row) => {
    if (deliveryFilter === 'ONLY_SENT' && !row.was_sent) {
      return false;
    }

    if (deliveryFilter === 'ONLY_SUPPRESSED' && row.was_sent) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const haystack = [
      row.server_name,
      row.message,
      row.channel ?? '',
      row.policy ?? '',
      row.reason_code ?? '',
      row.suppressed_reason ?? ''
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });

  if (!data) {
    if (loadError) {
      return <Card><p className="text-danger">{t(loadError)}</p></Card>;
    }
    return <Card>{t('ui.dashboard.loading')}</Card>;
  }

  return (
    <div className="page-stack">
      <section className="status-row">
        <MetricTile tone="online" label={t('status.online')} value={data.counts.ONLINE} />
        <MetricTile tone="offline" label={t('status.offline')} value={data.counts.OFFLINE} />
        <MetricTile tone="transition" label={t('status.transition')} value={data.counts.TRANSITION} />
        <MetricTile tone="maintenance" label={t('status.maintenance')} value={data.counts.MAINTENANCE} />
      </section>

      <section className="dashboard-bottom-grid">
        <Card>
          <h3 className="section-title">{t('ui.incidents.title')}</h3>
          <IncidentTable rows={data.incidents} />
        </Card>
        <Card>
          <h3 className="section-title">{t('ui.performance.title')}</h3>
          <LineChart points={data.performance} />
        </Card>
      </section>

      <Card>
        <h3 className="section-title">{t('ui.alert_log.title')}</h3>
        <div className="filter-bar">
          <Select
            id="dashboard-alert-event-type"
            label={t('ui.alert_log.filters.event_type')}
            value={eventTypeFilter}
            options={[
              { value: 'ALL', label: t('ui.alert_log.filters.all_event_types') },
              { value: 'STATE_CHANGE_OFFLINE', label: 'STATE_CHANGE_OFFLINE' },
              { value: 'STATE_CHANGE_ONLINE', label: 'STATE_CHANGE_ONLINE' }
            ]}
            onChange={(event) => {
              setEventTypeFilter(event.target.value as 'ALL' | AlertEventDto['event_type']);
            }}
          />
          <Select
            id="dashboard-alert-delivery"
            label={t('ui.alert_log.filters.delivery')}
            value={deliveryFilter}
            options={[
              { value: 'ALL', label: t('ui.alert_log.filters.all_delivery') },
              { value: 'ONLY_SENT', label: t('ui.alert_log.filters.only_sent') },
              { value: 'ONLY_SUPPRESSED', label: t('ui.alert_log.filters.only_suppressed') }
            ]}
            onChange={(event) => {
              setDeliveryFilter(event.target.value as AlertDeliveryFilter);
            }}
          />
          <Select
            id="dashboard-alert-window"
            label={t('ui.alert_log.filters.time_window')}
            value={timeWindow}
            options={[
              { value: '24H', label: t('ui.alert_log.filters.last_24h') },
              { value: '7D', label: t('ui.alert_log.filters.last_7d') },
              { value: '30D', label: t('ui.alert_log.filters.last_30d') }
            ]}
            onChange={(event) => {
              setTimeWindow(event.target.value as AlertTimeWindowFilter);
            }}
          />
        </div>
        <AlertLogTable rows={filteredAlertLog} />
      </Card>
    </div>
  );
};
