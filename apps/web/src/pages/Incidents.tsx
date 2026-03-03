import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../components/primitives/Badge.js';
import { Button } from '../components/primitives/Button.js';
import { Card } from '../components/primitives/Card.js';
import { Select } from '../components/primitives/Select.js';
import { Table } from '../components/primitives/Table.js';
import { fetchAlertEventsApi, fetchServerIncidentsApi, fetchServers } from '../api.js';
import type { AlertLogRow, IncidentRow, ServerStatus, ServerSummary } from '../types.js';

type IncidentsProps = {
  globalSearch: string;
  onOpenServer: (serverId: string) => void;
};

type EventsTab = 'incidents' | 'alerts';
type AlertSeverityFilter = 'ALL' | AlertLogRow['severity'];
type AlertSuppressionCode =
  | 'ALERT_SUPPRESSION_SERVER_DISABLED'
  | 'ALERT_SUPPRESSION_POLICY_DISABLED'
  | 'ALERT_SUPPRESSION_CHANNEL_DISABLED'
  | 'ALERT_SUPPRESSION_MAINTENANCE_MODE'
  | 'ALERT_SUPPRESSION_PTERO_SERVER_OFFLINE'
  | 'ALERT_SUPPRESSION_POLICY_FILTERED'
  | 'ALERT_SUPPRESSION_COOLDOWN'
  | 'ALERT_SUPPRESSION_DUPLICATE'
  | 'ALERT_SUPPRESSION_DISPATCH_ERROR'
  | 'ALERT_SUPPRESSION_RATE_LIMITED';
type AlertSuppressionFilter = 'ALL' | 'NONE' | AlertSuppressionCode;
const INCIDENTS_POLL_INTERVAL_MS = 15_000;

const severityBadgeClass: Record<AlertLogRow['severity'], string> = {
  INFO: 'events-severity-info',
  WARN: 'events-severity-warn',
  ERROR: 'events-severity-error'
};

export const Incidents = ({ globalSearch, onOpenServer }: IncidentsProps): JSX.Element => {
  const { t } = useTranslation();
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [alertLog, setAlertLog] = useState<AlertLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EventsTab>('incidents');
  const [incidentStatusFilter, setIncidentStatusFilter] = useState<'ALL' | ServerStatus>('ALL');
  const [alertSeverityFilter, setAlertSeverityFilter] = useState<AlertSeverityFilter>('ALL');
  const [alertSuppressionFilter, setAlertSuppressionFilter] = useState<AlertSuppressionFilter>('ALL');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedIncidentId) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setSelectedIncidentId(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedIncidentId]);

  useEffect(() => {
    let disposed = false;

    const load = async (): Promise<void> => {
      setIsLoading(true);
      try {
        const serverData = await fetchServers();
        const serverById = new Map<string, ServerSummary>(serverData.map((server) => [server.id, server]));

        const incidentRowsNested = await Promise.all(
          serverData.map(async (server) => {
            const serverIncidents = await fetchServerIncidentsApi(server.id);
            return serverIncidents.map((incident) => ({
              id: incident.id,
              server_name: server.name,
              status: (incident.end_status ?? incident.start_status) as ServerStatus,
              started_at: new Date(incident.started_at).toLocaleString(),
              reason: incident.reason_code,
              impact: incident.reason_source ?? undefined,
              duration_minutes: incident.duration_seconds ? Math.floor(incident.duration_seconds / 60) : undefined
            }));
          })
        );

        const alertEvents = await fetchAlertEventsApi(150);
        const alertRows: AlertLogRow[] = alertEvents.map((event) => {
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
            suppressed_reason: event.suppressed_reason,
            channel: event.channel_id,
            policy: event.policy_id
          };
        });

        if (!disposed) {
          setServers(serverData);
          setIncidents(incidentRowsNested.flat());
          setAlertLog(alertRows);
          setLoadError(null);
        }
      } catch {
        if (!disposed) {
          setLoadError('error.api_internal_error');
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void load();

    const intervalId = window.setInterval(() => {
      void load();
    }, INCIDENTS_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [globalSearch]);

  const filteredIncidents = useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    return incidents.filter((incident) => {
      if (incidentStatusFilter !== 'ALL' && incident.status !== incidentStatusFilter) {
        return false;
      }

      if (query.length === 0) {
        return true;
      }

      return (
        incident.server_name.toLowerCase().includes(query) ||
        (incident.reason ?? '').toLowerCase().includes(query) ||
        (incident.impact ?? '').toLowerCase().includes(query)
      );
    });
  }, [globalSearch, incidentStatusFilter, incidents]);

  const filteredAlerts = useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    return alertLog.filter((alert) => {
      if (alertSeverityFilter !== 'ALL' && alert.severity !== alertSeverityFilter) {
        return false;
      }

      if (alertSuppressionFilter === 'NONE' && alert.suppressed_reason) {
        return false;
      }

      if (alertSuppressionFilter !== 'ALL' && alertSuppressionFilter !== 'NONE' && alert.suppressed_reason !== alertSuppressionFilter) {
        return false;
      }

      if (query.length === 0) {
        return true;
      }

      return (
        alert.server_name.toLowerCase().includes(query) ||
        alert.message.toLowerCase().includes(query) ||
        (alert.suppressed_reason ?? '').toLowerCase().includes(query) ||
        (alert.channel ?? '').toLowerCase().includes(query) ||
        (alert.policy ?? '').toLowerCase().includes(query)
      );
    });
  }, [alertSeverityFilter, alertSuppressionFilter, alertLog, globalSearch]);

  const getServerIdByName = (serverName: string): string | null => {
    const found = servers.find((server) => server.name === serverName);
    return found?.id ?? null;
  };

  if (isLoading) {
    return <Card>{t('ui.dashboard.loading')}</Card>;
  }

  if (loadError) {
    return <Card><p className="text-danger">{t(loadError)}</p></Card>;
  }

  const openIncidentsCount = incidents.length;
  const criticalIncidentsCount = incidents.filter((incident) => incident.status === 'OFFLINE').length;
  const totalAlertsCount = alertLog.length;
  const errorAlertsCount = alertLog.filter((alert) => alert.severity === 'ERROR').length;

  const selectedIncident = selectedIncidentId
    ? incidents.find((incident) => incident.id === selectedIncidentId) ?? null
    : null;

  const relatedAlerts = selectedIncident
    ? alertLog.filter((alert) => alert.server_name === selectedIncident.server_name)
    : [];

  const relatedErrorAlerts = relatedAlerts.filter((alert) => alert.severity === 'ERROR').length;
  const relatedChannels = Array.from(new Set(relatedAlerts.map((alert) => alert.channel).filter(Boolean))).join(', ');
  const relatedPolicies = Array.from(new Set(relatedAlerts.map((alert) => alert.policy).filter(Boolean))).join(', ');

  const recommendationByStatus: Record<ServerStatus, string> = {
    ONLINE: t('ui.events.recommendation.online'),
    OFFLINE: t('ui.events.recommendation.offline'),
    TRANSITION: t('ui.events.recommendation.transition'),
    MAINTENANCE: t('ui.events.recommendation.maintenance')
  };

  const incidentRows = filteredIncidents.map((incident: IncidentRow) => {
    const serverId = getServerIdByName(incident.server_name);

    return [
      incident.server_name,
      <span key={`${incident.id}-status`} className={`status-badge status-badge-${incident.status.toLowerCase()}`}>
        {t(`status.${incident.status.toLowerCase()}`)}
      </span>,
      incident.started_at,
      incident.duration_minutes ? `${incident.duration_minutes} min` : t('ui.events.not_available'),
      <div key={`${incident.id}-actions`} className="events-row-actions">
        <Button
          variant="secondary"
          onClick={() => {
            setSelectedIncidentId(incident.id);
          }}
        >
          {t('ui.events.actions.open_incident')}
        </Button>
        <Button
          variant="ghost"
          disabled={!serverId}
          onClick={() => {
            if (serverId) {
              onOpenServer(serverId);
            }
          }}
        >
          {t('ui.events.actions.server_detail')}
        </Button>
      </div>
    ];
  });

  const alertRows = filteredAlerts.map((alert: AlertLogRow) => {
    const serverId = getServerIdByName(alert.server_name);
    const suppressionLabelMap: Record<AlertSuppressionCode, string> = {
      ALERT_SUPPRESSION_SERVER_DISABLED: t('ui.events.suppression.server_disabled'),
      ALERT_SUPPRESSION_POLICY_DISABLED: t('ui.events.suppression.policy_disabled'),
      ALERT_SUPPRESSION_CHANNEL_DISABLED: t('ui.events.suppression.channel_disabled'),
      ALERT_SUPPRESSION_MAINTENANCE_MODE: t('ui.events.suppression.maintenance_mode'),
      ALERT_SUPPRESSION_PTERO_SERVER_OFFLINE: t('ui.events.suppression.ptero_server_offline'),
      ALERT_SUPPRESSION_POLICY_FILTERED: t('ui.events.suppression.policy_filtered'),
      ALERT_SUPPRESSION_COOLDOWN: t('ui.events.suppression.cooldown'),
      ALERT_SUPPRESSION_DUPLICATE: t('ui.events.suppression.duplicate'),
      ALERT_SUPPRESSION_DISPATCH_ERROR: t('ui.events.suppression.dispatch_error'),
      ALERT_SUPPRESSION_RATE_LIMITED: t('ui.events.suppression.rate_limited')
    };
    const suppressionCode = alert.suppressed_reason as AlertSuppressionCode | null | undefined;
    const suppressionLabel = suppressionCode ? suppressionLabelMap[suppressionCode] ?? suppressionCode : t('ui.events.suppression.none');

    return [
      alert.time,
      <Badge key={`${alert.id}-severity`} className={`events-severity-badge ${severityBadgeClass[alert.severity]}`}>
        {alert.severity}
      </Badge>,
      alert.server_name,
      alert.message,
      suppressionLabel,
      alert.channel ?? t('ui.events.not_available'),
      alert.policy ?? t('ui.events.not_available'),
      <div key={`${alert.id}-actions`} className="events-row-actions">
        <Button
          variant="ghost"
          disabled={!serverId}
          onClick={() => {
            if (serverId) {
              onOpenServer(serverId);
            }
          }}
        >
          {t('ui.events.actions.server_detail')}
        </Button>
      </div>
    ];
  });

  return (
    <div className="page-stack">
      <Card className="events-tabs">
        <button
          type="button"
          className={`admin-tab ${activeTab === 'incidents' ? 'is-active' : ''}`.trim()}
          onClick={() => {
            setActiveTab('incidents');
          }}
        >
          {t('ui.events.tabs.incidents')}
        </button>
        <button
          type="button"
          className={`admin-tab ${activeTab === 'alerts' ? 'is-active' : ''}`.trim()}
          onClick={() => {
            setActiveTab('alerts');
          }}
        >
          {t('ui.events.tabs.alerts')}
        </button>
      </Card>

      <div className="events-metrics-grid">
        <Card className="admin-metric-card">
          <p className="text-muted admin-metric-label">{t('ui.events.metrics.open_incidents')}</p>
          <p className="admin-metric-value">{openIncidentsCount}</p>
        </Card>
        <Card className="admin-metric-card">
          <p className="text-muted admin-metric-label">{t('ui.events.metrics.critical_incidents')}</p>
          <p className="admin-metric-value">{criticalIncidentsCount}</p>
        </Card>
        <Card className="admin-metric-card">
          <p className="text-muted admin-metric-label">{t('ui.events.metrics.total_alerts')}</p>
          <p className="admin-metric-value">{totalAlertsCount}</p>
        </Card>
        <Card className="admin-metric-card">
          <p className="text-muted admin-metric-label">{t('ui.events.metrics.error_alerts')}</p>
          <p className="admin-metric-value">{errorAlertsCount}</p>
        </Card>
      </div>

      <Card className="events-content-card">
        <div className="events-toolbar">
          {activeTab === 'incidents' ? (
            <Select
              id="incidents-status-filter"
              label={t('ui.events.filters.incident_status')}
              value={incidentStatusFilter}
              options={[
                { value: 'ALL', label: t('ui.events.filters.all_statuses') },
                { value: 'ONLINE', label: t('status.online') },
                { value: 'OFFLINE', label: t('status.offline') },
                { value: 'TRANSITION', label: t('status.transition') },
                { value: 'MAINTENANCE', label: t('status.maintenance') }
              ]}
              onChange={(event) => {
                setIncidentStatusFilter(event.target.value as 'ALL' | ServerStatus);
              }}
            />
          ) : (
            <>
              <Select
                id="alerts-severity-filter"
                label={t('ui.events.filters.alert_severity')}
                value={alertSeverityFilter}
                options={[
                  { value: 'ALL', label: t('ui.events.filters.all_severities') },
                  { value: 'INFO', label: t('ui.events.severity.info') },
                  { value: 'WARN', label: t('ui.events.severity.warn') },
                  { value: 'ERROR', label: t('ui.events.severity.error') }
                ]}
                onChange={(event) => {
                  setAlertSeverityFilter(event.target.value as AlertSeverityFilter);
                }}
              />
              <Select
                id="alerts-suppression-filter"
                label={t('ui.events.filters.alert_suppression')}
                value={alertSuppressionFilter}
                options={[
                  { value: 'ALL', label: t('ui.events.filters.all_suppressions') },
                  { value: 'NONE', label: t('ui.events.filters.no_suppression') },
                  { value: 'ALERT_SUPPRESSION_SERVER_DISABLED', label: t('ui.events.filters.suppression_server_disabled') },
                  { value: 'ALERT_SUPPRESSION_POLICY_DISABLED', label: t('ui.events.filters.suppression_policy_disabled') },
                  { value: 'ALERT_SUPPRESSION_CHANNEL_DISABLED', label: t('ui.events.filters.suppression_channel_disabled') },
                  { value: 'ALERT_SUPPRESSION_MAINTENANCE_MODE', label: t('ui.events.filters.suppression_maintenance_mode') },
                  { value: 'ALERT_SUPPRESSION_PTERO_SERVER_OFFLINE', label: t('ui.events.filters.suppression_ptero_offline') },
                  { value: 'ALERT_SUPPRESSION_POLICY_FILTERED', label: t('ui.events.filters.suppression_policy_filtered') },
                  { value: 'ALERT_SUPPRESSION_COOLDOWN', label: t('ui.events.filters.suppression_cooldown') },
                  { value: 'ALERT_SUPPRESSION_DUPLICATE', label: t('ui.events.filters.suppression_duplicate') },
                  { value: 'ALERT_SUPPRESSION_DISPATCH_ERROR', label: t('ui.events.filters.suppression_dispatch_error') },
                  { value: 'ALERT_SUPPRESSION_RATE_LIMITED', label: t('ui.events.filters.suppression_rate_limited') }
                ]}
                onChange={(event) => {
                  setAlertSuppressionFilter(event.target.value as AlertSuppressionFilter);
                }}
              />
            </>
          )}

          <p className="text-muted events-toolbar-note">{t('ui.events.global_search_hint')}</p>
        </div>

        {activeTab === 'incidents' ? (
          <Table
            headers={[
              t('ui.incidents.server'),
              t('ui.incidents.status'),
              t('ui.incidents.started'),
              t('ui.events.columns.duration'),
              t('ui.events.columns.actions')
            ]}
            rows={incidentRows.length > 0 ? incidentRows : [[t('ui.events.empty.incidents'), '', '', '', '']]}
          />
        ) : (
          <Table
            headers={[
              t('ui.alert_log.time'),
              t('ui.events.columns.severity'),
              t('ui.alert_log.server'),
              t('ui.alert_log.message'),
              t('ui.events.columns.suppression'),
              t('ui.events.columns.channel'),
              t('ui.events.columns.policy'),
              t('ui.events.columns.actions')
            ]}
            rows={alertRows.length > 0 ? alertRows : [[t('ui.events.empty.alerts'), '', '', '', '', '', '', '']]}
          />
        )}
      </Card>

      {activeTab === 'incidents' && selectedIncident ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={t('ui.events.incident_detail.title')}
          onClick={() => {
            setSelectedIncidentId(null);
          }}
        >
          <div
            className="events-modal-wrap"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <Card className="modal-card modal-card-events-detail">
            <div className="row-between">
              <h3 className="section-title">{t('ui.events.incident_detail.title')}</h3>
              <Button
                variant="ghost"
                className="events-close-icon"
                aria-label={t('ui.events.actions.close_icon_aria')}
                onClick={() => {
                  setSelectedIncidentId(null);
                }}
              >
                ×
              </Button>
            </div>

            <div className="events-detail-sections">
              <section className="server-add-section">
                <h4 className="server-add-section-title">{t('ui.events.incident_detail.sections.overview')}</h4>
                <div className="events-incident-detail-grid">
                  <p>
                    <strong>{t('ui.events.incident_detail.id')}:</strong> {selectedIncident.id}
                  </p>
                  <p>
                    <strong>{t('ui.events.incident_detail.server')}:</strong> {selectedIncident.server_name}
                  </p>
                  <p>
                    <strong>{t('ui.events.incident_detail.status')}:</strong> {t(`status.${selectedIncident.status.toLowerCase()}`)}
                  </p>
                  <p>
                    <strong>{t('ui.events.incident_detail.started')}:</strong> {selectedIncident.started_at}
                  </p>
                  <p>
                    <strong>{t('ui.events.incident_detail.duration')}:</strong>{' '}
                    {selectedIncident.duration_minutes ? `${selectedIncident.duration_minutes} min` : t('ui.events.not_available')}
                  </p>
                </div>
              </section>

              <section className="server-add-section">
                <h4 className="server-add-section-title">{t('ui.events.incident_detail.sections.analysis')}</h4>
                <div className="events-incident-detail-grid">
                  <p>
                    <strong>{t('ui.events.incident_detail.reason')}:</strong> {selectedIncident.reason ?? t('ui.events.not_available')}
                  </p>
                  <p>
                    <strong>{t('ui.events.incident_detail.impact')}:</strong> {selectedIncident.impact ?? t('ui.events.not_available')}
                  </p>
                  <p>
                    <strong>{t('ui.events.incident_detail.alerts_count')}:</strong> {relatedAlerts.length}
                  </p>
                  <p>
                    <strong>{t('ui.events.incident_detail.error_alerts')}:</strong> {relatedErrorAlerts}
                  </p>
                  <p>
                    <strong>{t('ui.events.incident_detail.channels')}:</strong> {relatedChannels || t('ui.events.not_available')}
                  </p>
                  <p>
                    <strong>{t('ui.events.incident_detail.policies')}:</strong> {relatedPolicies || t('ui.events.not_available')}
                  </p>
                  <p className="events-incident-detail-wide">
                    <strong>{t('ui.events.incident_detail.recommendation')}:</strong> {recommendationByStatus[selectedIncident.status]}
                  </p>
                </div>
              </section>

              <section className="server-add-section events-detail-full">
                <h4 className="server-add-section-title">{t('ui.events.incident_detail.sections.alert_history')}</h4>
                <Table
                  headers={[
                    t('ui.alert_log.time'),
                    t('ui.events.columns.severity'),
                    t('ui.alert_log.message'),
                    t('ui.events.columns.channel'),
                    t('ui.events.columns.policy')
                  ]}
                  rows={
                    relatedAlerts.length > 0
                      ? relatedAlerts.map((alert) => [
                          alert.time,
                          <Badge key={`${alert.id}-detail-severity`} className={`events-severity-badge ${severityBadgeClass[alert.severity]}`}>
                            {alert.severity}
                          </Badge>,
                          alert.message,
                          alert.channel ?? t('ui.events.not_available'),
                          alert.policy ?? t('ui.events.not_available')
                        ])
                      : [[t('ui.events.incident_detail.related_alerts_empty'), '', '', '', '']]
                  }
                />
              </section>
            </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
};
