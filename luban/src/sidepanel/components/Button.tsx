interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
}

export function Button({ label, onClick, variant = 'ghost', disabled }: ButtonProps) {
  return (
    <button class={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}
