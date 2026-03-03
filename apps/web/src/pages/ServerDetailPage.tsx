import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchServerDetail } from '../api.js';
import type { ServerDetail } from '../types.js';

type ServerDetailPageProps = {
  serverId: string;
  onBack: () => void;
};

const statusKeyByValue: Record<ServerDetail['normalized_status'], string> = {
  ONLINE: 'status.online',
  OFFLINE: 'status.offline',
  TRANSITION: 'status.transition',
  MAINTENANCE: 'status.maintenance'
};

const statusBadgeClassByValue: Record<ServerDetail['normalized_status'], string> = {
  ONLINE: 'status-badge status-badge-online',
  OFFLINE: 'status-badge status-badge-offline',
  TRANSITION: 'status-badge status-badge-transition',
  MAINTENANCE: 'status-badge status-badge-maintenance'
};

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
};

export const ServerDetailPage = ({ serverId, onBack }: ServerDetailPageProps): JSX.Element => {
  const { t } = useTranslation();
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    setIsLoading(true);
    setLoadError(null);

    void fetchServerDetail(serverId)
      .then((data) => {
        if (disposed) {
          return;
        }
        setServer(data);
      })
      .catch((error: unknown) => {
        if (disposed) {
          return;
        }

        const messageKey = error instanceof Error ? error.message : 'error.api_internal_error';
        setLoadError(messageKey);
      })
      .finally(() => {
        if (disposed) {
          return;
        }
        setIsLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [serverId]);

  const reasonMeta = useMemo(() => {
    if (!server?.last_reason_meta) {
      return '-';
    }

    return JSON.stringify(server.last_reason_meta, null, 2);
  }, [server?.last_reason_meta]);

  return (
    <section className="card stack-md">
      <div className="header-actions">
        <button className="btn btn-secondary" type="button" onClick={onBack}>
          {t('ui.server_detail.back')}
        </button>
      </div>

      {isLoading ? <p className="text-muted">{t('ui.server_detail.loading')}</p> : null}
      {loadError ? <p className="text-danger">{t(loadError)}</p> : null}

      {!isLoading && !loadError && server ? (
        <>
          <h2 className="page-title">{t('ui.server_detail.title', { name: server.name })}</h2>
          <table className="table">
            <tbody>
              <tr>
                <th>{t('ui.server_detail.fields.status')}</th>
                <td>
                  <span className={statusBadgeClassByValue[server.normalized_status]}>
                    {t(statusKeyByValue[server.normalized_status])}
                  </span>
                </td>
              </tr>
              <tr>
                <th>{t('ui.server_detail.fields.raw_state')}</th>
                <td>{server.ptero_raw_state}</td>
              </tr>
              <tr>
                <th>{t('ui.server_detail.fields.last_check_at')}</th>
                <td>{formatTimestamp(server.last_check_at)}</td>
              </tr>
              <tr>
                <th>{t('ui.server_detail.fields.last_status_change_at')}</th>
                <td>{formatTimestamp(server.last_status_change_at)}</td>
              </tr>
              <tr>
                <th>{t('ui.server_detail.fields.last_reason_code')}</th>
                <td>{server.last_reason_code ?? '-'}</td>
              </tr>
              <tr>
                <th>{t('ui.server_detail.fields.last_reason_source')}</th>
                <td>{server.last_reason_source ?? '-'}</td>
              </tr>
              <tr>
                <th>{t('ui.server_detail.fields.panel_id')}</th>
                <td>{server.panel_id ?? '-'}</td>
              </tr>
              <tr>
                <th>{t('ui.server_detail.fields.node_id')}</th>
                <td>{server.node_id ?? '-'}</td>
              </tr>
            </tbody>
          </table>

          <h3>{t('ui.server_detail.endpoints_title')}</h3>
          {server.endpoints.length === 0 ? (
            <p className="text-muted">{t('ui.server_detail.no_endpoints')}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('ui.server_detail.endpoint_fields.label')}</th>
                  <th>{t('ui.server_detail.endpoint_fields.target')}</th>
                  <th>{t('ui.server_detail.endpoint_fields.protocol')}</th>
                  <th>{t('ui.server_detail.endpoint_fields.purpose')}</th>
                  <th>{t('ui.server_detail.endpoint_fields.primary')}</th>
                  <th>{t('ui.server_detail.endpoint_fields.enabled')}</th>
                </tr>
              </thead>
              <tbody>
                {server.endpoints.map((endpoint) => (
                  <tr key={endpoint.id}>
                    <td>{endpoint.label}</td>
                    <td>{`${endpoint.host}:${endpoint.port}`}</td>
                    <td>{endpoint.protocol}</td>
                    <td>{endpoint.purpose}</td>
                    <td>{endpoint.is_primary ? t('ui.server_detail.yes') : t('ui.server_detail.no')}</td>
                    <td>{endpoint.is_enabled ? t('ui.server_detail.yes') : t('ui.server_detail.no')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>{t('ui.server_detail.reason_meta_title')}</h3>
          <pre>{reasonMeta}</pre>
        </>
      ) : null}
    </section>
  );
};
