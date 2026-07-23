import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/cn';

import styles from './ui.module.css';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  label?: string;
  hint?: string;
  options: SelectOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
}

function SelectInner<T extends string>(
  { label, hint, options, value, onValueChange, className, id, ...rest }: SelectProps<T>,
  ref: React.Ref<HTMLSelectElement>,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={cn(styles.field, className)}>
      {label && (
        <label className={styles.label} htmlFor={selectId}>
          {label}
        </label>
      )}
      <div className={styles.control}>
        <select
          {...rest}
          ref={ref}
          id={selectId}
          className={styles.select}
          value={value}
          onChange={(event) => onValueChange(event.target.value as T)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={18} className={styles.selectChevron} aria-hidden />
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

export const Select = forwardRef(SelectInner) as <T extends string>(
  props: SelectProps<T> & { ref?: React.Ref<HTMLSelectElement> },
) => React.ReactElement;
