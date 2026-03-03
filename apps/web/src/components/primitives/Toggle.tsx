type ToggleProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
};

export const Toggle = ({ id, label, checked, onChange }: ToggleProps): JSX.Element => {
  return (
    <label className="toggle" htmlFor={id}>
      <span className="toggle-label">{label}</span>
      <button
        id={id}
        className={`toggle-control ${checked ? 'is-on' : ''}`.trim()}
        role="switch"
        aria-checked={checked}
        type="button"
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-thumb" />
      </button>
    </label>
  );
};
