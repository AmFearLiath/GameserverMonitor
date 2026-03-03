import type { InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  id: string;
};

export const Input = ({ label, id, className = '', ...props }: InputProps): JSX.Element => {
  return (
    <label className="field" htmlFor={id}>
      {label ? <span className="field-label">{label}</span> : null}
      <input id={id} className={`input ${className}`.trim()} {...props} />
    </label>
  );
};
