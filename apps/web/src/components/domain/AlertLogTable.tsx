import { useTranslation } from 'react-i18next';
import type { AlertLogRow } from '../../types.js';
import { Table } from '../primitives/Table.js';

type AlertLogTableProps = {
  rows: AlertLogRow[];
};

export const AlertLogTable = ({ rows }: AlertLogTableProps): JSX.Element => {
  const { t } = useTranslation();

  return (
    <Table
      headers={[t('ui.alert_log.time'), t('ui.alert_log.server'), t('ui.alert_log.message')]}
      rows={rows.map((row) => [row.time, row.server_name, row.message])}
    />
  );
};
