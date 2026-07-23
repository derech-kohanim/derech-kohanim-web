import { useId } from 'react';

import { cn } from '@/lib/cn';

import styles from './ui.module.css';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
}: SwitchProps) {
  const labelId = useId();
  const descriptionId = `${labelId}-description`;

  return (
    <div className={cn(styles.switchRow, className)}>
      <span className={styles.switchText}>
        <span className={styles.switchLabel} id={labelId}>
          {label}
        </span>
        {description && (
          <span className={styles.switchDescription} id={descriptionId}>
            {description}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        data-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={styles.switch}
      >
        <span className={styles.switchThumb} />
      </button>
    </div>
  );
}
