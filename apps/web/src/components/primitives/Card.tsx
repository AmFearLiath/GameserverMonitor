import type { ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
};

export const Card = ({ children, className = '' }: CardProps): JSX.Element => {
  return <section className={`card ${className}`.trim()}>{children}</section>;
};
