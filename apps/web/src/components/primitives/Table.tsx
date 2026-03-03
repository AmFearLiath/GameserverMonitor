import type { ReactNode } from 'react';

type TableProps = {
  headers: string[];
  rows: ReactNode[][];
  className?: string;
};

export const Table = ({ headers, rows, className = '' }: TableProps): JSX.Element => {
  return (
    <div className="table-wrapper">
      <table className={`table ${className}`.trim()}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
