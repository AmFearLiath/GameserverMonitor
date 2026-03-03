import { useTranslation } from 'react-i18next';
import type { IncidentRow } from '../../types.js';
import { Table } from '../primitives/Table.js';
import { StatusBadge } from './StatusBadge.js';

type IncidentTableProps = {
  rows: IncidentRow[];
};

export const IncidentTable = ({ rows }: IncidentTableProps): JSX.Element => {
  const { t } = useTranslation();

  return (
    <Table
      headers={[t('ui.incidents.server'), t('ui.incidents.status'), t('ui.incidents.started')]}
      rows={rows.map((row) => [row.server_name, <StatusBadge key={`${row.id}-status`} status={row.status} />, row.started_at])}
    />
  );
};
