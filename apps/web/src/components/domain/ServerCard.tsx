import { useTranslation } from 'react-i18next';
import type { DashboardServer } from '../../types.js';
import { Card } from '../primitives/Card.js';
import { Button } from '../primitives/Button.js';
import { StatusBadge } from './StatusBadge.js';

type ServerCardProps = {
  server: DashboardServer;
  onOpen: (serverId: string) => void;
};

export const ServerCard = ({ server, onOpen }: ServerCardProps): JSX.Element => {
  const { t } = useTranslation();

  return (
    <Card className="server-card">
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
      <div className="server-card-line">{t('ui.server_card.players', { current: server.players_current, max: server.players_max })}</div>
      <div className="server-card-line">{t('ui.server_card.rtt', { value: server.rtt_ms ? `${server.rtt_ms} ms` : '-' })}</div>
      <div className="server-card-line">{t('ui.server_card.last_check', { minutes: server.last_check_minutes_ago })}</div>
      <div className="server-card-footer">
        <Button
          variant="ghost"
          onClick={() => {
            onOpen(server.id);
          }}
        >
          {t('ui.server_card.details')}
        </Button>
      </div>
    </Card>
  );
};
