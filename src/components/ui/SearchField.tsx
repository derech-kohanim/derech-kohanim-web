import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';

import { IconButton } from './IconButton';
import { Spinner } from './Spinner';
import styles from './searchField.module.css';

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> {
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  loading?: boolean;
  /** Replaces the leading magnifier, e.g. with a back arrow. */
  leading?: ReactNode;
  trailing?: ReactNode;
  size?: 'medium' | 'large';
}

/**
 * The bare field. Suggestion behaviour lives in DestinationSearch, so this stays reusable
 * for any other search surface.
 */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  {
    value,
    onValueChange,
    onClear,
    loading = false,
    leading,
    trailing,
    size = 'medium',
    className,
    ...rest
  },
  ref,
) {
  const { t } = useTranslation();

  return (
    <div className={cn(styles.field, size === 'large' && styles['field--large'], className)}>
      <span className={styles.leading}>{leading ?? <Search size={20} aria-hidden />}</span>
      <input
        {...rest}
        ref={ref}
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={styles.input}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {loading && <Spinner size="small" label={t('search.loading')} />}
      {value.length > 0 && (
        <IconButton
          label={t('search.clear')}
          icon={<X size={18} />}
          className={styles.clear}
          onClick={() => {
            onValueChange('');
            onClear?.();
          }}
        />
      )}
      {trailing}
    </div>
  );
});
