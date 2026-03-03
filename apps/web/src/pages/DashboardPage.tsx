import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchServers } from '../api.js';
import type { ServerSummary } from '../types.js';
type DashboardPageProps = {
  onSelectServer: (serverId: string) => void;
};


const POLL_INTERVAL_MS = 10000;

const statusKeyByValue: Record<ServerSummary['normalized_status'], string> = {
  ONLINE: 'status.online',
  OFFLINE: 'status.offline',
  TRANSITION: 'status.transition',
  MAINTENANCE: 'status.maintenance'
};

const statusBadgeClassByValue: Record<ServerSummary['normalized_status'], string> = {
  ONLINE: 'status-badge status-badge-online',
  OFFLINE: 'status-badge status-badge-offline',
  TRANSITION: 'status-badge status-badge-transition',
  MAINTENANCE: 'status-badge status-badge-maintenance'
};

export const DashboardPage = ({ onSelectServer }: DashboardPageProps): JSX.Element => {
  const { t } = useTranslation();
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let disposed = false;

    const loadServers = async (): Promise<void> => {
      try {
        const data = await fetchServers();
        if (disposed) {
          return;
        }

        setServers(data);
        setLoadError(false);
        setLastUpdated(new Date());
      } catch {
        if (disposed) {
          return;
        }
        setLoadError(true);
      }
    };

    void loadServers();
    const intervalId = setInterval(() => {
      void loadServers();
    }, POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(intervalId);
    };
  }, []);

  const formattedUpdated = useMemo(() => {
    if (!lastUpdated) {
      return '-';
    }
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(lastUpdated);
  }, [lastUpdated]);

  return (
    <section className="card stack-md">
      <h2 className="page-title">{t('ui.dashboard.title')}</h2>
      <p className="text-muted">{t('ui.dashboard.last_updated', { time: formattedUpdated })}</p>
      {loadError ? <p className="text-danger">{t('error.load_servers_failed')}</p> : null}

      {servers.length === 0 ? (
        <p className="text-muted">{t('ui.dashboard.empty')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t('ui.table.name')}</th>
              <th>{t('ui.table.game')}</th>
              <th>{t('ui.table.status')}</th>
              <th>{t('ui.table.reason')}</th>
              <th>{t('ui.table.tags')}</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <tr
                key={server.id}
                className="table-row-clickable"
                onClick={() => {
                  onSelectServer(server.id);
                }}
              >
                <td>{server.name}</td>
                <td>{server.game_label ?? '-'}</td>
                <td>
                  <span className={statusBadgeClassByValue[server.normalized_status]}>
                    {t(statusKeyByValue[server.normalized_status])}
                  </span>
                </td>
                <td>{server.last_reason_code ?? t('reason.unknown')}</td>
                <td>{server.tags.length > 0 ? server.tags.join(', ') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};
