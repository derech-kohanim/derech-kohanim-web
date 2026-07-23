import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import styles from './ui.module.css';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: the control has no visible text. */
  label: string;
  variant?: 'plain' | 'solid' | 'primary';
  size?: 'medium' | 'large';
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'plain', size = 'medium', icon, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        styles.iconButton,
        variant !== 'plain' && styles[`iconButton--${variant}`],
        size === 'large' && styles['iconButton--large'],
        className,
      )}
    >
      {icon}
    </button>
  );
});
