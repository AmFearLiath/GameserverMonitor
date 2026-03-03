import type { ReactNode } from 'react';

type BadgeProps = {
  children: ReactNode;
  className?: string;
};

export const Badge = ({ children, className = '' }: BadgeProps): JSX.Element => {
  return <span className={`badge ${className}`.trim()}>{children}</span>;
};
