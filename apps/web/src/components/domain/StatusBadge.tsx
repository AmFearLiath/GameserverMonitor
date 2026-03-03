import { useTranslation } from 'react-i18next';
import type { ServerStatus } from '../../types.js';
import { Badge } from '../primitives/Badge.js';

type StatusBadgeProps = {
  status: ServerStatus;
};

const statusKeyByValue: Record<ServerStatus, string> = {
  ONLINE: 'status.online',
  OFFLINE: 'status.offline',
  TRANSITION: 'status.transition',
  MAINTENANCE: 'status.maintenance'
};

const statusClassByValue: Record<ServerStatus, string> = {
  ONLINE: 'status-badge status-badge-online',
  OFFLINE: 'status-badge status-badge-offline',
  TRANSITION: 'status-badge status-badge-transition',
  MAINTENANCE: 'status-badge status-badge-maintenance'
};

export const StatusBadge = ({ status }: StatusBadgeProps): JSX.Element => {
  const { t } = useTranslation();
  return <Badge className={statusClassByValue[status]}>{t(statusKeyByValue[status])}</Badge>;
};
