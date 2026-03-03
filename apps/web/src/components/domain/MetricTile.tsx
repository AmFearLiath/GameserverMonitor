import type { ReactNode } from 'react';
import { Card } from '../primitives/Card.js';

type MetricTileProps = {
  label: string;
  value: ReactNode;
  tone: 'online' | 'offline' | 'transition' | 'maintenance';
};

export const MetricTile = ({ label, value, tone }: MetricTileProps): JSX.Element => {
  return (
    <Card className={`metric-tile metric-${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </Card>
  );
};
